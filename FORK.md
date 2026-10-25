# Fork ini: DockPanel Lite untuk postmarketOS

**Repo ini adalah fork, bukan proyek baru.**

- **Upstream:** `ovexro/dockpanel` — panel server modern berbasis Rust + React
  (sites, database, Docker apps, Git deploy, mail, DNS, monitoring, backup,
  security — semua dalam satu panel).
- **Fork oleh:** `latifangren/dockpanel`
- **Branch kerja fork ini:** `dev-muse-alpine` (branch `main` di fork ini
  dibiarkan mengikuti upstream, jangan dipakai untuk modifikasi lite).
- **Titik awal fork:** commit upstream `514d9ea4`
  ("fix: stack-owned databases had zero backup coverage") — saat fork dibuat,
  fork ini identik dengan upstream di commit tersebut, belum ada perubahan kode.
- **Lisensi:** tetap AGPLv3, sama seperti upstream (`LICENSE`). Kalau fork ini
  ditawarkan sebagai layanan lewat jaringan ke orang lain, source modifikasinya
  wajib tersedia untuk mereka (ketentuan AGPL).

## Tujuan fork ini

Membuat dashboard all-in-one ala CasaOS, tapi dengan fitur panel hosting
langsung di dalamnya — dan yang bisa jalan di **postmarketOS (Alpine Linux)
di HP bekas RAM 4 GB+**, bukan cuma di Debian/RHEL.

Kenapa tidak pakai CasaOS mentah: installer dan dukungannya menarget
Debian/Ubuntu/Raspberry Pi OS; Alpine tercatat belum teruji penuh.
Kenapa tidak pakai 1Panel sebagai base: fitur setara Pro-nya (multi-node,
white-label, WAF lanjutan, uptime monitoring) tertutup lisensi dan tidak ikut
ter-fork, sementara DockPanel menyatakan tidak ada premium tier.

## Yang diubah (dan yang belum)

**Sudah ada di branch ini (M1–M3, belum diuji di HP — lihat batas di bawah):**

- **M1 — installer apk.** `scripts/install.sh` mendeteksi `apk`
  (`apk add --no-cache`); `scripts/setup.sh` menambah cabang apk di
  `detect_pkg_manager` / `pkg_install` / `pkg_update`, melewati EPEL/CRB,
  memakai nama paket Alpine untuk paket dasar
  (`curl openssl ca-certificates openssh-client gnupg`), Docker via apk
  (`docker` + `docker-cli-compose`, `rc-update`/`rc-service` — **tidak
  pernah** `get.docker.com` di Alpine), Node via apk (`nodejs npm`,
  hanya untuk `BUILD_FROM_SOURCE=1`; mode release tetap melewati Node),
  firewall `FW_MGR=none` di Alpine (UFW bukan paket Alpine), SELinux
  tetap no-op, dan direktori khusus Debian (`/var/lib/dpkg`,
  `/var/cache/apt`) dijaga di balik cabang apt. Mode lite
  (`DOCKPANEL_LITE=1`) melewati `install_php` dan layanan host mail/DNS
  di `install_recommended_services`; `install_php` sendiri juga menolak
  berjalan di apk dengan pesan jelas. Certbot di apk memakai
  `certbot certbot-nginx` (bukan nama Debian `python3-certbot-nginx`);
  timer renewal systemd tidak ada di OpenRC — operator menambahkan
  entri cron sendiri untuk `certbot renew`.
- **M2 — OpenRC + nginx Alpine.** Skrip init baru di `scripts/openrc/`
  untuk `dockpanel-agent` (`need docker net`, `use nginx`, grup socket
  diperbaiki di `start_post`) dan `dockpanel-api` (`need docker net
  dockpanel-agent`, env di-`source` dari `/etc/dockpanel/api.env` di
  `start_pre` karena OpenRC tidak punya EnvironmentFile).
  `create_services_openrc()` memasang skrip itu + `rc-update add`;
  `detect_init_system()` memilih systemd bila `/run/systemd/system` +
  `systemctl` ada, selain itu OpenRC; `create_services()` mendispatch
  ke keduanya dan jalur systemd lama tidak diubah. `configure_nginx()`
  mengutamakan `/etc/nginx/http.d/` di Alpine (dan `main()` menghapus
  `http.d/default.conf`), lalu `sites-enabled`, lalu `conf.d`;
  fallback grup `www-data` -> `nginx` dipertahankan; `nginx -t` selalu
  jalan sebelum restart. Postgres tetap container `postgres:16-alpine`,
  ditambah `--memory=256m --memory-swap=512m` pada mode lite.
- **M3 — flag lite UI.** Backend: `DOCKPANEL_LITE=1` dibaca di
  `panel/backend/src/config.rs` (`Config.lite`) dan disalurkan ke
  frontend sebagai `lite:true` di `GET /api/branding`
  (`panel/backend/src/routes/settings.rs`, kedua cabang return).
  `setup.sh` menulis `DOCKPANEL_LITE` ke `/etc/dockpanel/api.env` di
  kedua jalur (systemd dan OpenRC) supaya backend benar-benar melihatnya.
  Frontend: `panel/frontend/src/data/navItems.ts` menambah
  `liteVisible` di `NavItem`; `isNavVisible(item, role, lite)` menyaring
  dulu pada mode lite (hanya baris berflag yang tampil, lalu aturan role
  biasa tetap berlaku), sehingga **sidebar (semua layout, lewat
  `visibleGroups` di `useLayoutState.ts`) dan palette Ctrl+K
  (`CommandPalette.tsx`)** menyembunyikan item non-lite yang sama —
  plus tautan rekomendasi di `Dashboard.tsx` yang memakai predikat yang
  sama. Terlihat di lite: Dashboard, Docker Apps, Databases, Terminal,
  Monitoring, Backup Manager, Settings, Notifications, dan My Account.
  Tersembunyi di lite: Sites, WP Toolkit, Git Deploy, Migration,
  Reseller/Resellers, DNS, CDN, Mail, dan semua baris admin lain yang
  tidak berflag (Servers, Users, Logs, …). Files tidak punya baris nav
  (dijangkau lewat route detail site), jadi tidak ada yang disembunyikan
  — konsisten dengan prinsip di bawah.

**Lite adalah profil UX, bukan batas keamanan.** Route tetap bisa
dijangkau langsung lewat URL, dan backend tidak menegakkan apa pun
berdasarkan flag ini — halaman yang dibuka langsung tetap menjalankan
otorisasi rolenya sendiri seperti biasa. Jangan mengandalkan lite
untuk menyembunyikan kemampuan dari operator yang tahu URL-nya.

**Belum diubah / batas yang diketahui (jujur, bukan TODO diam-diam):**

- **Belum diuji di HP maupun di container Alpine.** VM ini tidak punya
  Docker, jadi tidak ada uji runtime sama sekali; yang terverifikasi
  hanya `bash -n` semua skrip, `tsc --strict` + uji logika filter untuk
  `navItems.ts`, dan pemeriksaan nama paket lewat referensi Alpine
  (lihat catatan nama paket di bawah). Jangan klaim instalasi Alpine
  sudah jalan sebelum uji perangkat M0 selesai.
- Dashboard seksi "Aplikasi saya" dan field allowlist template
  (milestone berikutnya) **sengaja belum dikerjakan** supaya kiriman
  M1–M3 tetap bisa direview.
- **Agent tidak mengenal apk.** `panel/agent/src/services/pkg.rs`
  hanya tahu dpkg/rpm; di Alpine, halaman Services panel akan
  melaporkan paket sebagai tidak terinstal (Unknown) meskipun sudah
  terinstal. Ini di luar M1–M3 dan perlu patch agent tersendiri.
- **OpenRC tidak punya padanan MemoryMax.** Unit systemd API membatasi
  1G; skrip OpenRC tidak memasang batas memori apa pun (tidak ada
  `ulimit -v` palsu — itu bukan padanan cgroup dan bisa merusak Rust).
  Cerita memori lite di OpenRC saat ini hanya cap container Postgres.
- **Nama paket yang belum terverifikasi langsung ke indeks Alpine:**
  `sshpass` (dipakai best-effort — gagal instal hanya memberi warning,
  SFTP password-auth tidak jalan, key auth tidak terpengaruh),
  `fail2ban`, dan nama paket build-source apk (`build-base cmake
  openssl-dev pkgconf`). Nama yang sudah terverifikasi lewat referensi
  Alpine: `docker`, `docker-cli-compose`, `nginx`, `certbot`,
  `certbot-nginx`, `nodejs`, `npm`, `curl`, `openssl`,
  `ca-certificates`, `openssh-client`, `gnupg`.
- `/account` (My Account) sengaja **tetap terlihat** di lite meskipun
  tidak ada di daftar lite-visible blueprint: itu satu-satunya pintu
  untuk ganti password/2FA/passkey, dan banner 2FA menunjuk ke sana.
  Menyembunyikannya akan merusak akses akun non-admin.

**Rencana modifikasi berikutnya (dari blueprint, urut):**

1. Dashboard: seksi "Aplikasi saya" di `panel/frontend/src/pages/Dashboard.tsx`.
2. Katalog: field `lite` di `panel/agent/src/services/docker_apps.rs`
   + allowlist template arm64 yang sudah lolos uji.
3. Patch agent `pkg.rs` untuk apk (lihat batas di atas).
4. Uji perangkat M0 + instalasi lite penuh di HP target.

**Yang sengaja TIDAK diubah:**

- Binary panel tetap pakai release musl statis upstream
  (`aarch64-unknown-linux-musl`) — tidak di-build ulang di HP.
- Skema database, socket agent, dan port panel (8443) tetap sama.
- Tidak menginstal host PHP-FPM, mail, dan PowerDNS di mode lite.

## Dokumen terkait (tercantum di sini supaya tidak hilang)

| Dokumen | Isi |
|---|---|
| `FORK.md` (file ini) | Pernyataan fork, tujuan, status modifikasi |
| `docs/lite-pmos-blueprint.md` | Blueprint teknis lengkap DockPanel Lite untuk postmarketOS |
| `README.md` (upstream) | Dokumentasi asli DockPanel — baca ini untuk fitur panel secara umum |
| `docs/getting-started.md` (upstream) | Cara instal upstream (Debian/RHEL) — **belum berlaku untuk postmarketOS** |
| `COMPARISON.md` (upstream) | Perbandingan upstream dengan panel lain |
| `FEATURES.md` (upstream) | Daftar fitur upstream, termasuk catatan kejujuran soal fitur yang belum sempurna |

Catatan: dokumen upstream di atas menggambarkan DockPanel asli, bukan
versi lite. Kalau ada yang bertentangan dengan blueprint lite, yang berlaku
untuk fork ini adalah blueprint lite.

## Target perangkat

- OS: postmarketOS (Alpine), varian OpenRC sebagai default; varian
  postmarketOS-systemd opsional belakangan.
- Arsitektur: `aarch64` saja. `armv7` 32-bit tidak didukung binary upstream.
- RAM: 4 GB+. Panel + OS ditargetkan ~450–650 MB idle, sisanya untuk aplikasi.
- Docker diinstal installer lite bila belum ada (`apk add docker
  docker-cli-compose`, `rc-service docker start`); bila sudah jalan,
  installer memakainya apa adanya.

## Sync dengan upstream

Remote `upstream` menunjuk ke `ovexro/dockpanel` (hanya konfigurasi git lokal,
bukan bagian dari commit). Untuk menarik update upstream ke branch ini,
rebase patch lite di atas tag upstream terbaru — jangan merge main fork ke
dalam branch lite secara sembarangan, supaya patch lite tetap terpisah dan
mudah dibaca (lihat struktur commit di blueprint §9).
