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

Membuat dashboard all-in-one ala CasaOS yang bisa jalan di
**postmarketOS (Alpine Linux) di HP bekas RAM 4 GB+**, bukan cuma di
Debian/RHEL — dan **tanpa backend panel hosting**. Fitur hosting
upstream (sites, WordPress, Git deploy, mail, DNS, CDN, reseller,
WHMCS, migrasi) bukan disembunyikan dari UI saja: backend-nya dihapus
di R1–R7 (lihat status di bawah), sehingga yang tersisa adalah inti
CasaOS: Dashboard, Docker Apps/Stacks, Databases, Terminal, Monitoring,
Backup Manager (database/volume), Settings, Notifications, dan My
Account.

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

- **Redesain total frontend (2026-10-25, belum di-push).** Keputusan
  pengguna: tampilan bawaan DockPanel diganti total, bukan dipertahankan
  demi rebase upstream. `panel/frontend/src/index.css`: tema dasar
  Terminal diganti — font UI Inter (JetBrains Mono hanya untuk kode),
  radius 12–28px (dulu 0px), tanpa scanline CRT, bayangan lembut. Ramp
  `dark-*` dibalik (950 = permukaan paling terang) supaya semua halaman
  yang memakai utilitas `bg-dark-*`/`text-dark-*` mewarisi tampilan baru
  tanpa ditulis ulang satu per satu. Tema default baru: `lite-mix`
  (terang hangat, aksen amber). Tiga tema lain yang bisa dipilih:
  `lite-warm` (arang hangat + amber), `lite-clean` (putih + biru),
  `lite-midnight` (navy + teal/violet). Pemetaan ID lama ke lite ada di
  `theme-init.js`, `main.tsx`, dan `useLayoutState.ts` (terminal/tanpa
  nilai → lite-mix; dark/nexus-dark → lite-midnight; light/nexus →
  lite-clean); pemilih tema di `Settings.tsx` menaruh keempat tema lite
  di urutan pertama, entri upstream lama tetap ada di bawahnya untuk
  kompatibilitas tapi tidak lagi disiklus. Chrome bersama: sidebar
  `CommandLayout` (nav aktif membulat, indikator kursor `_` dihapus),
  gaya kartu/tombol/input/tabel umum di `index.css`. Dashboard
  (`pages/Dashboard.tsx`) direstruktur ke layout prototipe v3: baris
  hitungan (Sites, Databases, Applications, Docker), kartu Status
  dengan 4 gauge SVG (Load, CPU, Memory, Disk), kartu Monitoring dengan
  tab Network / Disk I/O (grafik area dari sampel sisi klien atas data
  yang sudah dipoll halaman ini — tidak ada endpoint baru), kolom kanan
  System Information dan daftar Application (Open + Stop/Start/Restart
  lewat route `/apps/{id}/{action}` yang sama dengan halaman Apps).
  Filter lite M3 tidak berubah: sidebar dan Ctrl+K tetap menyaring
  lewat `isNavVisible`; di mode non-lite menu hosting kembali, dengan
  tampilan sistem desain baru. Yang sengaja tidak ada di Dashboard baru:
  hitungan Cron/Backup (tidak ada field-nya di API Dashboard),
  baris Architecture/IP di System Information (bukan field
  `SystemInfo`), dan logo brand aplikasi (tidak tersedia di codebase —
  dipakai ubin huruf awal bergradasi).

- **Fase 1 — fix installer + keamanan (2026-11-01, issue #1).**
  Review 4 commit Hermes menemukan installer menginstall binary upstream,
  endpoint monitoring tanpa auth, sandbox agent dimatikan, dan AList tidak
  pernah diinstall. Yang diperbaiki di sini:
  - **B1/B2 — rilis fork, bukan upstream.** `scripts/setup.sh` mengambil
    binary + tarball frontend dari rilis fork ini secara default
    (`GITHUB_REPO`/`DOCKPANEL_RELEASE_REPO`, default `latifangren/dockpanel`;
    override eksplisit ke `ovexro/dockpanel` berarti sadar memakai binary
    upstream tanpa field backend fork). `DOCKPANEL_VERSION` adalah ref clone
    (branch/versi), bukan tag rilis: pin branch memakai rilis terbaru,
    hanya pin berbentuk versi yang menjadi tag; `DOCKPANEL_RELEASE_TAG`
    selalu menang bila diset. Tidak ada rilis di fork = gagal tertutup
    dengan petunjuk perbaikan, bukan fallback diam-diam ke upstream.
    Bila `USE_LOCAL_FRONTEND=1` dan `dist/` belum ada, installer membangun
    frontend dari source clone (node/npm sudah ada di HP) alih-alih gagal.
    **Cara menerbitkan rilis fork:** tambah entri `CHANGELOG.md` untuk
    versinya, lalu push tag `v*` — `.github/workflows/release.yml`
    membangun binary musl statis (amd64/arm64) + tarball frontend dan
    menerbitkan rilisnya (termasuk `checksums.txt`).
  - **B3 — endpoint monitoring ber-auth.** `configure_nginx()` tidak lagi
    menyajikan `/api/hardware` dan `/api/docker-stats` sebagai alias tanpa
    auth: keduanya kini melewati `auth_request /_panel_auth`, yang
    menanyakan `GET /api/auth/me` ke API dengan cookie sesi HttpOnly panel
    (fetch Dashboard yang same-origin membawa cookie itu). Tanpa sesi
    panel yang valid, endpoint mengembalikan 401/403.
  - **B4 — sandbox agent dikembalikan.** `panel/agent/dockpanel-agent.service`:
    13 directive hardening kembali `yes` (sebelumnya dibalik ke `no`
    tanpa catatan directive mana yang dibutuhkan terminal). Bila terminal
    rusak lagi, lakukan bisect satu directive per satu dan catat
    hasilnya di komentar file itu — jangan balik satu blok.
  - **B5 — AList diinstall installer.** `install_alist()` di `setup.sh`:
    binary AList `v3.66.0` musl ter-pin dengan verifikasi SHA-256 dari
    digest aset rilis GitHub, service di kedua init
    (`scripts/systemd/alist.service`, `scripts/openrc/alist`), password
    admin dibuat sekali dan disimpan mode 600 di
    `/etc/dockpanel/alist-admin.txt` (tidak pernah dicetak), dan storage
    lokal di-bootstrap oleh `scripts/alist-bootstrap.py` (stdlib saja,
    idempotent). Root storage default `/` (`ALIST_ROOT`, bisa di-override)
    — asumsi Fase 1 yang belum dijawab eksplisit pemilik, mengikuti
    default `AllowedDirs` panel lama dan ekspektasi file manager ala
    CasaOS. `python3` kini dependensi yang dideklarasikan (B7, ditarik
    maju karena bootstrap membutuhkannya).

- **Fase 2 — monitoring + Dashboard + route yatim (2026-11-01, issue #1, B6/B8/B9).**
  - **B6 — monitoring di kedua init.** `install_monitoring_scripts()` di `setup.sh` memasang kedua skrip Python di jalur systemd DAN OpenRC (sebelumnya hanya systemd); unit systemd mendapat `RuntimeDirectory=dockpanel` (direktori dibuat sebelum poll pertama) dan peringatan bila service gagal start; init script OpenRC baru `scripts/openrc/dockpanel-docker-monitor` (supervise-daemon, log ke `/var/log/dockpanel-docker-monitor.log`); `dockpanel-docker-monitor.py` kini polling 6 detik (dari 3), mencatat error ke stderr dengan backoff eksponensial sampai 60 detik, dan membuat `/run/dockpanel` sebelum panggilan Docker pertama — tidak ada lagi `except: pass`. `hwinfo` hanya di-refresh saat agent (re)start (model/SoC statis), dengan penulisan atomik tmp+rename di unit systemd maupun `start_pre` OpenRC, agar boot yang gagal tidak mengosongkan `hardware.json` yang bagus. Penyimpangan sadar dari rencana: unit monitor TIDAK memakai `User=` khusus — soket Docker grupnya bervariasi per distro, dan proses yang bisa bicara ke soket Docker sudah setara root; user khusus tidak memberi isolasi nyata dan berisiko mematahkan monitor. Jalur OpenRC belum pernah diuji di perangkat (image HP tidak punya `rc-service`).
  - **B8 — Dashboard dibersihkan.** Tombol "Add Site", langkah onboarding site/domain, widget Sites Grid, fetch `/databases` + `/mail/queue` yang mati, dan state `dbCount`/`mailQueue`/`sitesList` dihapus; fetch `/sites` dipertahankan karena kondisi alert masih membaca `sites.total` (koreksi terhadap rencana, yang menyebut fetch itu mati). Kartu App Store menampilkan hitungan katalog nyata dari `/apps/templates` (admin-only), bukan `148+` hardcode (fixture berisi 147 template). Kartu Storage: angka besar kini ruang KOSONG, subteksnya pemakaian — sebelumnya angka besar adalah pemakaian dengan subteks "free". Grid Installed Apps kembali memakai daftar `/apps` (bukan feed monitor): hanya admin, menghormati toggle widget `apps_list`, empty state, dan tombol Open/Stop/Start/Restart — container infra tidak lagi tampil untuk semua role.
  - **B9 — tidak ada lagi route yatim.** `/logs`, `/security`, `/system`, `/users`, `/telemetry` kembali ke nav (grup Management, `adminOnly`, `liteVisible`) karena masing-masing memegang kontrol tanpa rumah lain; `/integrations` (Webhooks/Extensions/WHMCS/Migrations) di-redirect ke `/` seperti halaman hosting lainnya, dan alias `/extensions`/`/webhooks` kini menunjuk langsung ke `/`. `/secrets` tidak diubah: ia sudah terjangkau lewat command palette.

- **Fase 3 — kebersihan + dokumentasi (2026-11-01, issue #1, B10/B12).**
  - **B10 — selalu-lite dinyatakan; `USE_LOCAL_FRONTEND` eksplisit.** Fork ini selalu-lite di UI (lihat pernyataan di bawah); flag `DOCKPANEL_LITE` dipertahankan untuk kompatibilitas dan sebagai profil resource installer saja. `USE_LOCAL_FRONTEND` default kembali `0` (sebelumnya `1` diam-diam di `setup.sh`/`install.sh`): memakai `dist/` lokal kini eksplisit saja, dan `dist/` hanya dipakai bila file provenance-nya (`.dockpanel-build.json`, ditulis `build_frontend` saat build sukses) menyebut commit tree yang sedang diinstall — bila basi atau tanpa provenance, installer membangun ulang dari source atau memakai tarball rilis, tidak pernah memakai `dist/` basi diam-diam.
  - **B12 — fail2ban jujur; artefak; klaim README.** Kegagalan enable/start fail2ban kini memberi peringatan keras + `svc_fail`, bukan `|| true` diam-diam — termasuk di Alpine, di mana paket `fail2ban-systemd` tidak ada di repo (terverifikasi di HP). `panel/frontend/tsconfig.tsbuildinfo` masuk `.gitignore`; salinan yang sudah ter-track hanya bisa dihapus lewat `git rm --cached` dari checkout berkredensial (jalur snapshot-push tidak bisa menghapus file ter-track). Klaim README diperbaiki sampai sesuai bukti saat itu: fitur AList yang belum diuji ditandai belum diuji, WebDAV `/dav` yang terverifikasi disebut, dukungan OpenRC dinyatakan belum teruji di perangkat, dan header `install.sh` menunjuk URL installer fork, bukan `dockpanel.dev`. (Kalimat README saat itu bahwa "backend hosting masih ada, baru UI-nya yang dihapus" sudah tidak berlaku lagi sejak R1–R7 di bawah — backend-nya kini dihapus.)

- **Penghapusan backend hosting R1–R7 + CLI (2026-11-02, issue #1, di-push di HEAD `4fcec629`).**
  R1 fondasi bersama → R2 CDN/reseller/WHMCS → R3 sites/WordPress/staging/deploy/SSL-site/crons/PHP → R4 mail/DNS → R5 git-deploy/migrasi → R6 agent (PHP/WordPress/CMS/nginx-site/SSL-site/backup-site/service-installer hosting) → R7 migrasi terminal (35 file migrasi hosting dihapus + `20260909000001_drop_hosting_schema.sql`, tabel `sites`/`mail_domains`/`dns_zones`/`git_deploys`/`backup_schedules`/dll. di-drop, kolom `site_id` dicabut setelah backfill owner `databases`) → perbaikan CLI (hanya `sites list` lokal, `ssl status`, backup database/volume yang tersisa; `sites create/info/delete`, `ssl provision`, backup site, dan `php` dihapus). Yang dipertahankan: ACME panel (`/api/ssl/*`), registry `tls_certificates`/traefik panel, SMTP notifikasi (`services/email.rs`, bukan endpoint `/api/mail`), `app_migrations`, backup volume/DB + orkestrator, dan kunci settings `smtp_*`. Kunci `pdns_*` masih ada di settings tanpa pembaca kode — nasibnya diputuskan di R8 (lihat CHANGELOG `[Unreleased]`). Detail per irisan: dokumen audit `dockpanel-backend-hosting-removal-audit.md` (di luar repo).
- **R8 — frontend mati + docs + tes (selesai di HEAD).** Halaman frontend mati dihapus, `install_php` dicabut dari `setup.sh`, dokumentasi diperbarui, self-update diarahkan ke repository fork, dan rilis tag pertama `v2.242.1-lite.1` dipublikasikan.
- **Tahap 5–7 — Fitur Edge CasaOS & Hotfix Perangkat (selesai):**
  - **Tahap 5 (App Launcher & Shortcuts):** Menambahkan Custom Web Shortcuts di grid launcher CasaOS Dashboard (disimpan di `localStorage`, dilengkapi tombol Add, Open new tab, dan Delete).
  - **Tahap 6 (Kurasi ARM64):** Menambahkan field `arm64_supported` di katalog template agent (`docker_apps.rs`), filter `ARM64 Only`, search bar, category pills, serta badge visual di `Apps.tsx`.
  - **Tahap 7 (Monitor Smartphone & Multi-Disk):** Membaca status baterai, charger, dan suhu `/sys/class/power_supply/` Linux serta daftar seluruh partisi mountpoint aktif (MicroSD/USB OTG) di `system.rs` dan Dashboard.
  - **Hotfix Nginx & AList (Deployment whyred):** Mengaktifkan listen port 80 HTTP, mengizinkan embedding iframe AList di `/files` via `SAMEORIGIN` / `frame-ancestors 'self'`, serta mematikan buffer disk Nginx (`proxy_buffering off`) untuk mencegah keausan flash eMMC dan error izin `/var/lib/nginx/tmp`.

**Fork ini selalu-lite di UI (B10).** Setelah prune, perbedaan lite/non-lite di UI praktis hilang: semua 14 item nav membawa `liteVisible`, halaman hosting di-redirect di semua mode, dan mode non-lite tidak lagi dipertahankan sebagai tampilan terpisah — pernyataan lama di dokumen ini bahwa "di mode non-lite menu hosting kembali" sudah tidak berlaku. Flag `DOCKPANEL_LITE` dipertahankan untuk kompatibilitas dan sebagai profil resource installer (cap Postgres 256 MiB + lewati PHP host); backend tetap menyalurkannya di `/api/branding` tanpa penegakan. Percabangan lite yang mati akan dihapus bertahap, bukan dalam satu fase.

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

- Binary panel tetap pakai release musl statis
  (`aarch64-unknown-linux-musl`) — tidak di-build ulang di HP. Sejak Fase 1,
  rilis yang dipakai adalah **rilis fork ini** (lihat B1 di atas), bukan
  rilis upstream.
- Socket agent dan port panel (8443) tetap sama. Skema database berubah
  di R7: tabel hosting di-drop dan kolom `site_id` dicabut (lihat status
  R1–R7 di atas) — instalasi lama harus lewat migrasi terminal, instalasi
  bersih tidak terpengaruh.
- Installer tidak lagi memasang layanan host PHP-FPM, mail, dan PowerDNS
  — dan sejak R4/R6 installer/pemanggil backend-nya dihapus, bukan cuma
  dilewati di mode lite (`install_php` sudah dihapus dari `setup.sh` di
  working tree R8).

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
