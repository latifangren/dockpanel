# DockPanel Lite (CasaOS-inspired Edge & Mobile Dashboard)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Platform: postmarketOS / Alpine Linux](https://img.shields.io/badge/Platform-postmarketOS%20%7C%20Alpine-blue)](https://postmarketos.org/)
[![Arch: ARM64 / x86_64](https://img.shields.io/badge/Arch-ARM64%20%7C%20x86__64-brightgreen)](#)

**DockPanel Lite** adalah dashboard server dan homelab *all-in-one* yang terinspirasi oleh **CasaOS**, dirancang khusus untuk berjalan ringan di **ponsel bekas (seperti Xiaomi Redmi Note 5 / whyred), Single Board Computer (SBC), dan server mini** yang menjalankan **postmarketOS (Alpine Linux)** serta distro Linux lainnya.

Proyek ini merupakan fork dari `ovexro/dockpanel` yang dirombak total: membuang seluruh *bloatware* panel hosting web tradisional (cPanel/CyberPanel, WordPress toolkit, reseller tier, mail server, DNS zone, git deploy) dan memfokuskan antarmuka murni menjadi **Personal Cloud & Docker App Management Dashboard** yang elegan dan hemat RAM.

---

## 🌟 Fitur Utama

### 1. Dashboard Ala CasaOS
- **Live Clock Widget**: Penunjuk jam digital real-time dan tanggal di bagian atas dashboard.
- **Card Status Komprehensif**:
  - Lingkaran metrik (Load, CPU, RAM, Disk) dengan rincian live.
  - **Indikator Suhu CPU**: Pembacaan suhu prosesor real-time (misal: `53°C`) langsung di dalam lingkaran gauge CPU.
  - **Tab Metrik Kontainer Docker**: Tab switcher `[ CPU ]` dan `[ RAM ]` yang menampilkan daftar kontainer aktif diurutkan berdasarkan konsumsi resource tertinggi.
- **Deteksi Hardware Dinamis**: Otomatis mendeteksi tipe perangkat dari Device Tree Linux (`Xiaomi Redmi Note 5 Pro`) dan prosesor SoC (`Snapdragon SDM636 (Kryo-V2)`), tanpa hardcoding.
- **App Launcher Grid**: Daftar aplikasi terpasang disajikan dalam bentuk grid ikon kotak rounded dengan status dot aktif dan tombol cepat `+ Add App` menuju App Store.

### 2. File Manager (AList)
- Terintegrasi langsung di menu utama **`/files`** tanpa perlu membuka aplikasi terpisah; AList diinstall oleh installer (binary ter-pin + service + password admin), bukan sekadar proxy.
- **WebDAV**: aktif di subpath `/dav` (terverifikasi di HP referensi) dan dapat di-mount sebagai Network Drive.
- Fitur editor/preview AList (Markdown, syntax highlighting, media player, PDF viewer) belum diverifikasi di perangkat ini — dianggap belum diuji sampai ada bukti di HP.

### 3. Manajemen Kontainer Docker Universal
- Menampilkan seluruh kontainer Docker yang ada di host secara transparan (bukan hanya yang dipasang lewat panel).
- Katalog template aplikasi siap pasang (jumlah terkini tampil di Dashboard, dari endpoint katalog — jangan percaya angka lama di dokumen ini).
- Start, Stop, Restart, Shell, dan Log stream kontainer.

### 4. Web Terminal Host
- Terminal berbasis browser yang terhubung langsung ke sistem host. Agent berjalan dengan sandbox systemd yang dikembalikan (Fase 1); operasi istimewa memakai jalur `systemd-run` yang disediakan agent, bukan dengan mematikan sandbox.

### 5. Dirancang Hemat Resource
- Layanan host (PHP-FPM, Postfix, PowerDNS) tidak diinstall dalam mode lite. Jujur dicatat: **kode backend hosting masih ada** di rilis ini (yang dihapus baru UI-nya); penghapusannya direncanakan bertahap (R1–R8, lihat issue #1). Postgres tetap berjalan sebagai container (cap 256 MiB).
- Sangat ramah untuk perangkat dengan RAM 3 GB – 4 GB.

---

## 🚀 Instalasi Cepat

### Persyaratan Sistem
- **Sistem Operasi**: postmarketOS / Alpine Linux, Debian, Ubuntu, atau distro Linux lainnya. `systemd` terverifikasi di HP referensi (Xiaomi Redmi Note 5 Pro, postmarketOS Nura edge); layanan `OpenRC` ditulis tetapi **belum pernah diuji di perangkat** (image HP tidak menyediakan `rc-service`).
- **Arsitektur**: ARM64 (`aarch64`) atau x86_64 (`amd64`).
- **Dependensi Dasar**: `docker`, `curl`, `bash`.

### Langkah Pemasangan

Cara utama — installer fork (clone repo, unduh binary rilis fork, jalankan setup; butuh root):

```bash
curl -sL https://raw.githubusercontent.com/latifangren/dockpanel/dev-muse-alpine/scripts/install.sh | sudo bash
```

Jangan pakai URL instalasi upstream (`dockpanel.dev/install.sh`) — URL itu menginstall panel upstream, bukan fork ini.

Alternatif — dari clone, build dari source (butuh Rust + Node.js, RAM ~3 GB):

```bash
# 1. Clone repositori branch dev-muse-alpine
git clone -b dev-muse-alpine https://github.com/latifangren/dockpanel.git /opt/dockpanel

# 2. Masuk ke direktori dan jalankan skrip instalasi
cd /opt/dockpanel
sudo bash scripts/setup.sh
```

Menjalankan `scripts/setup.sh` langsung memakai jalur build dari source secara default; set `INSTALL_FROM_RELEASE=1` untuk mengunduh binary pre-built sebagai gantinya. `install.sh` di atas sudah mengatur mode rilis untukmu.

Setelah instalasi selesai:
- Buka browser dan akses: **`http://IP_SERVER_ANDA`** atau **`https://IP_SERVER_ANDA:8443`**
- Ikuti petunjuk di layar untuk membuat akun admin perdana.

---

## 🏗 Arsitektur Sistem

```text
Browser Client
     │
     ▼ (Port 80 / 8443)
   Nginx (Reverse Proxy + Static SPA)
     ├── /fs/*          ──► AList File Manager (Native Go, Port 5244)
     ├── /api/*         ──► DockPanel API (Port 3080)
     ├── /api/hardware  ──► Generator Info Hardware Dinamis (/run/dockpanel/hardware.json)
     ├── /api/docker-*  ──► Monitor Kontainer Docker Host (/run/dockpanel/docker-stats.json)
     └── /*             ──► Frontend UI (React 19 + Tailwind 4)
```

---

## 📄 Lisensi

Proyek ini berlisensi di bawah **GNU Affero General Public License v3.0 (AGPLv3)** — lihat file [LICENSE](LICENSE) untuk rincian lengkap.
