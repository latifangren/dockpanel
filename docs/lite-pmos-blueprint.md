# Blueprint Fork: DockPanel Lite untuk postmarketOS (HP bekas, RAM 4 GB+)

**Keputusan:** base fork = `ovexro/dockpanel` (bukan 1Panel), mode lite khusus HP.
**Target:** postmarketOS berbasis Alpine, `aarch64` saja, Docker jalan, RAM 4 GB+.
**Prinsip:** jangan port seluruh panel hosting 1:1. Port installer + supervisi saja,
lalu sembunyikan fitur hosting berat. Binary panelnya sudah paling mudah dipindah.

> Dicek langsung dari clone upstream (25 Okt 2026): `scripts/install.sh`,
> `scripts/setup.sh` (2.241 baris), `panel/agent/dockpanel-agent.service`,
> `panel/frontend/src/data/navItems.ts`,
> `panel/agent/src/services/docker_apps.rs` (daftar template statis `TEMPLATES`).

---

## 1. Kenapa DockPanel, kenapa lite

- Fitur setara 1Panel Pro sudah gratis di upstream: multi-server, white-label,
  WAF ModSecurity + OWASP CRS, uptime monitoring + status page. Yang tidak ada:
  AI Gateway / OpenClaw agent (milik 1Panel) dan KVM Web UI (tidak relevan di HP).
- Binary release upstream statis musl (`x86_64-unknown-linux-musl`,
  `aarch64-unknown-linux-musl` di `.github/workflows/release.yml`). Artinya
  binary agent/API/CLI tidak butuh glibc, jadi tidak patah di Alpine musl.
- Panelnya ringan: klaim upstream ~49 MB (agent ~35 MB + API ~14 MB),
  ~109 MB kalau dihitung Postgres bawaannya. Di HP 4 GB, yang boros itu
  aplikasinya, bukan panelnya.
- Yang **tidak** langsung jalan: installer hanya kenal apt/dnf/yum, unit
  servicenya systemd murni, dan setup-nya menginstal layanan host Debian/RHEL
  (nginx host, PHP via sury, Node via nodesource, firewalld/ufw, certbot timer).
  Itu semua yang dipotong/diubah di fork ini, bukan binary-nya.

## 2. Yang TIDAK diubah (supaya sync upstream tetap murah)

- Bahasa dan arsitektur tetap: Rust (agent/API/CLI) + React + Postgres.
- Jangan ubah skema database, format `api.env`, socket agent
  (`/var/run/dockpanel/agent.sock`), atau port panel (8443 HTTPS).
- Jangan build Rust di HP. Pakai binary release upstream
  (`dockpanel-agent-linux-arm64`, `dockpanel-api-linux-arm64`, frontend tarball).
  Build dari source butuh ~3 GB RAM menurut `install.sh` — di HP 4 GB itu
  terlalu mepet dan lambat.
- Patch fork dipisah per commit (lihat §9) supaya bisa rebase tiap rilis upstream.

## 3. Profil lite: apa yang jalan, apa yang disembunyikan

### 3.1 Tetap jalan (inti dashboard ala CasaOS)

| Menu | Alasan dipertahankan |
|---|---|
| Dashboard (diperluas, §6) | Metrik CPU/RAM/disk + kartu aplikasi |
| Docker Apps | Inti CasaOS: install aplikasi satu klik |
| Databases (Docker saja) | MySQL/Postgres sebagai container, bukan host |
| Files, Terminal | Sudah ada, ringan, berguna di HP |
| Monitoring, Backups | Uptime check + backup S3/SFTP, sudah gratis |
| Settings | Akun, passkey/2FA, notifikasi |

### 3.2 Disembunyikan di mode lite (route tetap ada, nav saja yang hilang)

Sites, WP Toolkit, Git Deploy, Migration, Reseller, DNS, CDN, Mail,
WordPress, WHMCS, dan semua halaman hosting klasik. Ini profil UX, **bukan**
batas keamanan: API-nya masih bisa dipanggil langsung kalau sengaja dibuka.
Kalau nanti butuh batas nyata, tambahkan guard 403 di backend untuk route
yang dinonaktifkan (opsional, fase M3).

### 3.3 Yang tidak diinstal sama sekali di HP

Host PHP-FPM, mail (Postfix/Dovecot/Rspamd), PowerDNS, dan PHP site stack.
Aplikasi PHP tetap bisa jalan sebagai container dari katalog Docker Apps.
Ini memangkas paling banyak dependensi apk dan paling banyak RAM.

## 4. Port installer: apt/dnf/yum → apk

### 4.1 Titik yang harus diubah

| File upstream | Masalah di Alpine | Perbaikan fork |
|---|---|---|
| `scripts/install.sh` baris 32–42 | Error kalau tidak ada apt/dnf/yum | Tambah cabang `apk`: `PKG_INSTALL="apk add"`, `PKG_UPDATE="apk update"` |
| `scripts/setup.sh` `detect_pkg_manager()` | Sama, plus logika EPEL/CRB | Cabang apk: lewati EPEL/CRB sepenuhnya |
| `scripts/setup.sh` `install_dependencies()` | `lsb-release` tidak ada di Alpine; nama ssh client beda | apk: `curl openssl ca-certificates openssh-client gnupg sshpass` (sshpass best-effort, seperti upstream) |
| `scripts/setup.sh` `install_docker()` | Repo `download.docker.com/linux/centos`, `get.docker.com` | apk: `apk add docker docker-cli-compose`, lalu `rc-update add docker default` + `rc-service docker start`. Jangan pakai get.docker.com di Alpine |
| `scripts/setup.sh` `install_nginx()` | `systemctl enable --now nginx` | apk: `apk add nginx`, lalu `rc-update add nginx default` (atau unit systemd kalau varian systemd, §5) |
| `scripts/setup.sh` `install_node()` | Nodesource deb/rpm | **Hanya** kalau `BUILD_FROM_SOURCE=1`. Mode release (default fork) lewati Node sepenuhnya; frontend pakai tarball |
| `scripts/setup.sh` `install_php()` + `install_recommended_services()` | PHP sury/ondrej, certbot timer systemd | Di mode lite: lewati `install_php`. Certbot opsional saja: `apk add certbot certbot-nginx`, renewal lewat cron, bukan `certbot.timer` |
| `scripts/setup.sh` `detect_firewall()` / `fw_allow()` | Hanya firewalld/ufw | Di Alpine: `FW_MGR=none` secara default. Jangan auto-install firewalld/ufw (tidak ada di repo Alpine). Panel diasumsikan di LAN; aturan nftables opsional disediakan sebagai file contoh, tidak dipasang otomatis |
| `scripts/setup.sh` `configure_selinux()` | Tidak relevan | Sudah no-op kalau `getenforce` tidak ada; biarkan begitu, jangan tambah SELinux |
| `scripts/setup.sh` `create_directories()` | Membuat `/var/lib/dpkg`, `/var/cache/apt` | Bungkus path Debian-only dengan cek `PKG_MGR`: hanya dibuat kalau apt. Jangan buat direktori palsu di Alpine |
| `panel/agent/src/safe_cmd.rs` | Update sistem via apt/dnf, sandbox systemd | Di lite: endpoint update sistem host dinonaktifkan di UI (tampilkan pesan "kelola via apk manual"). Jangan coba menerjemahkan apt→apk secara buta di agent |

### 4.2 Pemetaan paket (apk)

```text
Debian/RHEL              → Alpine (apk)
nginx                    → nginx
docker-ce + compose      → docker + docker-cli-compose
curl, openssl,           → curl, openssl, ca-certificates
ca-certificates          → openssh-client, gnupg
openssh-client(s)        → certbot, certbot-nginx (opsional)
certbot + python3-       → postgres:16-alpine (container, tetap)
  certbot-nginx          → (tidak berubah)
postgres (host)          → TIDAK DIPAKAI — tetap container
php-fpm, postfix,        → TIDAK DIINSTAL di mode lite
dovecot, powerdns        →
```

### 4.3 Nginx Alpine: jalur conf-nya beda

Upstream `configure_nginx()` hanya kenal `sites-enabled` lalu `conf.d`.
Paket nginx Alpine modern memakai `http.d/` (contoh: `/etc/nginx/http.d/default.conf`),
dan user/group-nya `nginx`, bukan `www-data` (upstream sudah punya fallback
`www-data` → `nginx`, pertahankan).

Perbaikan:

```bash
if [ -d /etc/nginx/http.d ]; then
  NGINX_CONF="/etc/nginx/http.d/dockpanel-panel.conf"
  rm -f /etc/nginx/http.d/default.conf
elif [ -d /etc/nginx/sites-enabled ]; then
  NGINX_CONF="/etc/nginx/sites-enabled/dockpanel-panel.conf"
else
  NGINX_CONF="/etc/nginx/conf.d/dockpanel-panel.conf"
fi
nginx -t && rc-service nginx reload   # atau systemctl reload nginx (varian systemd)
```

Selalu `nginx -t` dulu sebelum reload. Jangan hapus `default.conf` kalau file
panel gagal ditulis.

## 5. Supervisi service: OpenRC default, systemd opsional

### 5.1 Deteksi init (satu installer, dua jalur)

```bash
if [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1; then
  INIT="systemd"
else
  INIT="openrc"
fi
```

- postmarketOS default = OpenRC. Varian postmarketOS-systemd boleh dipakai,
  tapi jangan jadikan syarat: kalau fork mengharuskan systemd, kamu kehilangan
  justru keunggulan Alpine.
- Jalur systemd: pakai unit upstream apa adanya
  (`panel/agent/dockpanel-agent.service` + unit API yang dibuat `setup.sh`).
- Jalur OpenRC: pakai skrip di bawah. Jangan meniru sandbox systemd
  (`ProtectSystem`, `ReadWritePaths`) di OpenRC — itu bukan fitur OpenRC.

### 5.2 `/etc/init.d/dockpanel-agent` (OpenRC)

```sh
#!/sbin/openrc-run
name="dockpanel-agent"
description="DockPanel Agent (lite)"
command="/usr/local/bin/dockpanel-agent"
command_background=true
pidfile="/run/dockpanel-agent.pid"

depend() {
  need docker net
  use nginx
  after docker
}

start_pre() {
  checkpath -d -m 0755 /run/dockpanel /var/lib/dockpanel/git
}

start_post() {
  # samakan dengan ExecStartPost di unit systemd: socket milik grup nginx
  sleep 1
  chgrp nginx /var/run/dockpanel/agent.sock 2>/dev/null
  chmod 660 /var/run/dockpanel/agent.sock 2>/dev/null
}
```

### 5.3 `/etc/init.d/dockpanel-api` (OpenRC)

```sh
#!/sbin/openrc-run
name="dockpanel-api"
description="DockPanel API (lite)"
command="/usr/local/bin/dockpanel-api"
command_background=true
pidfile="/run/dockpanel-api.pid"

depend() {
  need docker net dockpanel-agent
  after dockpanel-agent
}

start_pre() {
  checkpath -d -m 0755 /run/dockpanel
  # API membaca env dari /etc/dockpanel/api.env (format KEY=value).
  # openrc-run tidak membaca EnvironmentFile ala systemd, jadi export manual:
  set -a
  . /etc/dockpanel/api.env
  set +a
}
```

Aktifkan:

```bash
rc-update add docker default
rc-update add nginx default
rc-update add dockpanel-agent default
rc-update add dockpanel-api default
rc-service docker start
rc-service nginx start
rc-service dockpanel-agent start
rc-service dockpanel-api start
```

Postgres tetap container Docker (`--restart unless-stopped`, image
`postgres:16-alpine`, port hanya `127.0.0.1:<DB_PORT>:5432`), jadi tidak
butuh service OpenRC sendiri. Tambahkan batas di mode lite:
`docker run --memory=256m --memory-swap=512m ... postgres:16-alpine`.
Tanpa batas, Postgres bisa ikut makan RAM saat HP sibuk.

### 5.4 Yang harus diubah di `setup.sh:create_services()`

Pisah fungsi: `create_services_systemd()` (kode lama) dan
`create_services_openrc()` (menulis dua file di atas + `rc-update add`).
`wait_for_unit()` yang sekarang memanggil `systemctl is-active` dan
`journalctl` harus punya padanan OpenRC: `rc-service <nama> status` dan
log dari `/var/log/dockpanel/` atau output `start-stop-daemon`.
Jangan biarkan installer lite gagal hanya karena `systemctl` tidak ada.

## 6. Mode lite di frontend (perubahan paling kecil)

### 6.1 Satu flag, bukan fork UI kedua

- Backend: baca env `DOCKPANEL_LITE=1`, kembalikan di endpoint bootstrap/
  settings sebagai `lite: true`.
- Frontend: jangan hardcode daftar menu lite di banyak file. Satu tempat:
  `panel/frontend/src/data/navItems.ts`.

Tambahkan flag di interface yang sudah ada:

```ts
export interface NavItem {
  to: string;
  label: string;
  iconName: string;
  adminOnly?: boolean;
  resellerVisible?: boolean;
  resellerOnly?: boolean;
  liteVisible?: boolean; // baru: tampil di mode lite
}
```

Lalu di `isNavVisible()` (fungsi yang sama yang sudah dipakai sidebar dan
command palette Ctrl+K): kalau mode lite aktif dan `liteVisible` tidak true,
sembunyikan. Ini penting — upstream sendiri mencatat command palette pernah
menawarkan menu yang backend-nya menolak; jangan ulangi bug itu di lite.

Menu lite (`liteVisible: true`): Dashboard, Docker Apps, Databases,
Files, Terminal, Monitoring, Backups/Backup Manager, Settings, Notifications.
Sisanya tidak diberi flag, otomatis hilang di lite.

### 6.2 Dashboard jadi home ala CasaOS (tanpa route baru)

Jangan buat route `/home` baru — itu menambah divergensi. Perluas
`panel/frontend/src/pages/Dashboard.tsx` yang sudah ada:

1. Bagian atas tetap: metrik live CPU/RAM/disk/network + grafik 24 jam.
2. Tambah bagian "Aplikasi saya": kartu dari daftar Docker Apps yang sedang
   jalan (nama, status, port, tombol buka/stop/restart). Data sudah ada di
   API Docker Apps; tidak perlu endpoint baru.
3. Tambah bagian "Aksi cepat": tombol ke Docker Apps, Files, Terminal,
   Backups. Hanya link, tanpa logika baru.

Target UX: buka panel → langsung kelihatan aplikasi dan tombolnya, bukan
menu hosting. Itu inti CasaOS yang diambil, tanpa meniru seluruh CasaOS.

## 7. Katalog template lite: dari 147 jadi allowlist

Template upstream didefinisikan statis di
`panel/agent/src/services/docker_apps.rs` (`TEMPLATES: &[AppTemplateDef]`).
Jangan edit satu per satu di tempat yang sama tanpa jejak — tambah field:

```rust
pub struct AppTemplateDef {
    // ... field yang sudah ada ...
    pub lite: bool, // true hanya kalau lolos audit §7.1
}
```

`list_templates()` memfilter `lite == true` kalau backend jalan dengan
`DOCKPANEL_LITE=1`. Frontend tidak perlu tahu soal allowlist; ia hanya
menampilkan apa yang dikembalikan API. Katalog penuh tetap ada kalau flag
lite dimatikan.

### 7.1 Kriteria lolos lite (semua harus ya)

1. Image punya tag `linux/arm64` (cek di Docker Hub / manifest, bukan asumsi).
2. Bisa start dan serve tanpa input eksternal yang tidak ditanyakan form
   (alasan beberapa template upstream sudah dicatat bermasalah).
3. Tidak butuh mount socket Docker host, tidak butuh `--privileged`,
   tidak butuh GPU passthrough (tidak relevan di HP).
4. RAM idle wajar untuk HP (target: < 300 MB per aplikasi ringan;
   database/media berat tetap boleh, tapi beri label berat di kartu).
5. Data persisten di volume Docker yang jelas, bukan di dalam container saja.

### 7.2 Starter pack yang disarankan untuk diuji dulu (bukan janji)

Jellyfin/Immich (pilih satu dulu, jangan keduanya sekaligus di awal),
Pi-hole atau AdGuard, Nextcloud **atau** Filebrowser (pilih satu),
Uptime Kuma, dan satu database saja sesuai kebutuhan. Uji satu per satu di
HP target sebelum menambah katalog. Upstream sendiri mengakui sebagian
template belum lolos census; jangan impor 147 template mentah-mentah.

## 8. Anggaran resource untuk HP 4 GB (target, wajib diukur ulang)

| Komponen | Target idle |
|---|---|
| postmarketOS + base | ~200–300 MB |
| Docker daemon | ~100–150 MB |
| nginx host | ~15 MB |
| DockPanel agent + API | ~49 MB (klaim upstream) |
| Postgres container (limit 256 MB) | ~60–110 MB |
| **Total panel + OS** | **~450–650 MB** |
| Sisa untuk aplikasi | ~3,3 GB |

Aturan hemat yang ikut di fork:

- Log Docker: `log-opts max-size=10m max-file=3` di `/etc/docker/daemon.json`
  (eMMC HP cepat aus kalau log tidak dibatasi).
- Matikan default: CVE scanning sudah default off di upstream — biarkan off
  di HP. Nyalakan manual saja kalau perlu.
- Auto-sleep container idle: pertahankan (ini justru membantu HP), jangan
  matikan demi "responsif".
- Jangan jalankan dua media server + dua cloud file sekaligus di awal.
  Satu kategori, satu aplikasi, sampai RAM idle terukur stabil.

## 9. Struktur fork dan milestone

### 9.1 Cabang dan commit

```text
fork: <akun>/dockpanel-lite
branch kerja: lite-pmos   (dari tag rilis upstream, bukan dari main liar)
commit, urut dan terpisah:
  01  installer: cabang apk di install.sh + setup.sh
  02  service: create_services_openrc() + dua init script OpenRC
  03  nginx: deteksi http.d Alpine + grup nginx
  04  lite: flag DOCKPANEL_LITE + liteVisible di navItems.ts
  05  dashboard: seksi "Aplikasi saya" di Dashboard.tsx
  06  katalog: field lite di AppTemplateDef + allowlist awal
  07  docs: README lite + skrip smoke test (§10)
```

Jangan campur perbaikan upstream umum ke dalam commit lite — kirim itu
sebagai PR terpisah ke upstream kalau memang perbaikan umum. Fork lite
tetap kecil supaya rebase tidak sakit.

### 9.2 Milestone dan kriteria selesai

| Milestone | Selesai kalau... |
|---|---|
| **M0 — Boot** | `apk add docker docker-cli-compose nginx` + Docker jalan di HP target; `uname -m` = `aarch64` terkonfirmasi |
| **M1 — Installer apk** | Installer lite jalan sampai akhir di postmarketOS OpenRC tanpa apt/dnf/yum/systemctl; panel bisa dibuka di `https://<IP-HP>:8443` |
| **M2 — Service** | Setelah reboot, `rc-service dockpanel-agent status`, `dockpanel-api status`, `docker ps` (Postgres jalan) semua hijau tanpa intervensi manual |
| **M3 — Lite UX** | Nav hanya menampilkan menu §6.1; Dashboard menampilkan kartu aplikasi jalan; menu hosting tidak muncul di sidebar maupun Ctrl+K |
| **M4 — Katalog** | Minimal 5 template allowlist lolos install→buka→stop→hapus di HP target; sisanya tetap tersembunyi di mode lite |
| **M5 — Ketahanan** | 7 hari jalan: tidak ada OOM, log Docker tidak membengkak, backup satu aplikasi berhasil restore di percobaan |

Urutan ini disengaja: M1–M2 dulu, UI belakangan. Panel yang cantik tapi
tidak bisa reboot sendiri tidak berguna di HP yang sewaktu-waktu restart.

## 10. Checklist uji di perangkat (jangan skip)

```bash
uname -m                       # harus aarch64; armv7 = stop, ganti base
apk add docker docker-cli-compose nginx curl
rc-update add docker default && rc-service docker start
docker run --rm --platform linux/arm64 hello-world  # atau image arm64 kecil
# setelah install lite:
rc-service dockpanel-agent status
rc-service dockpanel-api status
docker ps --format '{{.Names}} {{.Status}}'   # dockpanel-postgres harus Up
curl -k https://127.0.0.1:8443/ -o /dev/null -w '%{http_code}\n'  # harap 200/302
nginx -t
free -m                        # bandingkan dengan anggaran §8
```

Uji juga: reboot → panel kembali sendiri; install 1 aplikasi → buka lewat
port-nya; stop aplikasi → RAM turun; backup → hapus → restore.

## 11. Risiko yang harus ditulis jujur di README fork

1. **Upstream muda dan satu maintainer.** Star/fork jauh di bawah 1Panel,
   rilis sangat sering. Fork lite harus pin ke satu tag upstream, jangan
   ikuti main setiap hari.
2. **Sebagian fitur upstream sendiri diakui belum sempurna** (di
   `FEATURES.md` upstream: Teams tanpa UI, migrasi aplikasi yang tidak
   pernah selesai, beberapa template masih bermasalah). Mode lite justru
   melindungi dari sini dengan menyembunyikan fitur itu.
3. **Kernel HP tidak sama dengan VPS.** Docker butuh cgroup, overlayfs,
   dan modul jaringan yang lengkap. Kalau kernel postmarketOS perangkatmu
   memangkas itu, panel tidak bisa memperbaikinya dari userspace.
4. **Baterai dan panas.** HP tanpa kipas yang jalan 24/7 akan throttle.
   Letakkan HP di tempat berventilasi, dan pertimbangkan lepas baterai
   kalau perangkat memang didedikasikan jadi server (hanya kalau kamu
   paham risikonya).
5. **Lisensi AGPLv3.** Fork ini tetap AGPLv3. Kalau fork-nya ditawarkan
   sebagai layanan lewat jaringan ke orang lain, source modifikasinya wajib
   tersedia untuk mereka. Untuk pemakaian pribadi, tidak ada kewajiban itu.

## 12. Keputusan yang masih perlu kamu buat (bukan blocker M0–M2)

1. **OpenRC saja, atau dukung juga varian postmarketOS-systemd?**
   Rekomendasi blueprint ini: OpenRC dulu (M1–M2). Tambah jalur systemd
   belakangan hanya kalau ada perangkat yang memang sudah systemd.
2. **Domain + HTTPS publik, atau LAN saja?**
   Default lite = LAN + self-signed di 8443. Let's Encrypt hanya kalau
   `PANEL_DOMAIN` diisi dan port 80/443 bisa dijangkau.
3. **Data aplikasi di eMMC internal atau storage eksternal?**
   Rekomendasi: Postgres dan panel di internal, data aplikasi berat
   (media, cloud file) di USB/SD kalau tersedia — eMMC HP bukan dirancang
   untuk tulis berat 24/7.

---

*Dokumen ini blueprint, bukan installer jadi. Langkah berikutnya yang
paling masuk akal: M0 (cek `uname -m` + Docker di HP target), lalu M1
(cabang apk di `install.sh`/`setup.sh`).*
