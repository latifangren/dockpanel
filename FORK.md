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

**Sudah ada di branch ini (dokumen saja):**

- `docs/lite-pmos-blueprint.md` — blueprint lengkap DockPanel Lite
  (installer apk, service OpenRC, mode lite, katalog template allowlist,
  anggaran RAM, milestone M0–M5, checklist uji).
- `FORK.md` (file ini) — pernyataan fork, tujuan, dan daftar dokumen terkait.

**Belum diubah (kode upstream masih utuh):**

- Belum ada perubahan ke `scripts/install.sh`, `scripts/setup.sh`,
  unit systemd, maupun frontend. Jadi branch ini saat ini **belum bisa
  diinstal di postmarketOS** — itu pekerjaan milestone M1 di blueprint.
- Jangan menganggap branch ini sudah jadi hanya karena dokumennya ada.

**Rencana modifikasi (dari blueprint, urut):**

1. Installer: cabang `apk` di `scripts/install.sh` + `scripts/setup.sh`
   (saat ini hanya apt/dnf/yum).
2. Service: skrip OpenRC untuk `dockpanel-agent` dan `dockpanel-api`
   (saat ini hanya unit systemd), plus deteksi init systemd vs OpenRC.
3. Nginx Alpine: deteksi direktori `http.d` dan grup `nginx`.
4. Mode lite: flag `DOCKPANEL_LITE=1` + `liteVisible` di
   `panel/frontend/src/data/navItems.ts`; sembunyikan Sites, Mail, DNS,
   Reseller, WP Toolkit, dan menu hosting berat lainnya dari nav.
5. Dashboard: seksi "Aplikasi saya" di `panel/frontend/src/pages/Dashboard.tsx`.
6. Katalog: field `lite` di `panel/agent/src/services/docker_apps.rs`
   + allowlist template arm64 yang sudah lolos uji.

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
- Docker harus sudah bisa jalan di perangkat (`apk add docker
  docker-cli-compose`, `rc-service docker start`) sebelum installer lite
  dijalankan.

## Sync dengan upstream

Remote `upstream` menunjuk ke `ovexro/dockpanel` (hanya konfigurasi git lokal,
bukan bagian dari commit). Untuk menarik update upstream ke branch ini,
rebase patch lite di atas tag upstream terbaru — jangan merge main fork ke
dalam branch lite secara sembarangan, supaya patch lite tetap terpisah dan
mudah dibaca (lihat struktur commit di blueprint §9).
