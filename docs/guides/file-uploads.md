# File Manager (AList) & WebDAV Guide

DockPanel Lite integrates **AList** as its native file manager, accessible directly from the **Files** (`/files`) page in the sidebar.

Unlike traditional web hosting file managers that suffer from file size limits, AList is a high-performance, native Go binary running as a managed daemon (`systemd` or `OpenRC`) with zero-copy in-memory streaming through Nginx (`/fs`).

---

## 🌟 Capabilities

- **No File Size Limit**: Upload and download large files (videos, ISOs, database dumps) directly without HTTP body truncation.
- **RAM Streaming**: Nginx proxying is configured with `proxy_buffering off;` and `proxy_max_temp_file_size 0;`, meaning uploads and downloads stream straight through memory without burning write cycles on the device's eMMC flash storage.
- **Local & External Storage**: Pre-configured with a local storage mount rooted at `/`, giving complete access to system logs, configuration files, Docker volumes, and external drives (MicroSD cards, USB OTG).
- **Cloud Storage Integration**: Connect external cloud storage accounts (Google Drive, OneDrive, S3, WebDAV, Baidu, Dropbox, etc.) directly into your file manager.
- **Media & Document Preview**: Built-in previewers for audio, video, photos, PDF, Markdown, and code with syntax highlighting.

---

## 🔑 Access & Authentication

When DockPanel Lite is installed via `scripts/setup.sh`:

1. AList is installed at `/usr/local/bin/alist` and runs on internal port `5244`.
2. A random admin password is automatically generated and securely stored in:
   ```bash
   cat /etc/dockpanel/alist-admin.txt
   ```
3. A local storage driver rooted at `/` is initialized automatically via `scripts/alist-bootstrap.py`.
4. The web interface is accessible within the panel at **Files** (`/files`), or directly via `http://<PANEL-IP>/fs/`.

---

## 🌐 WebDAV Access (Mount as Network Drive)

AList exposes a standard WebDAV endpoint on port `5244` at subpath `/dav`:

- **URL**: `http://<DEVICE-IP>:5244/dav`
- **Username**: `admin`
- **Password**: Found in `/etc/dockpanel/alist-admin.txt`

### Connecting from Clients:
- **Windows**: Map Network Drive → enter `http://<DEVICE-IP>:5244/dav`.
- **macOS**: Finder → Connect to Server (`Cmd+K`) → enter `http://<DEVICE-IP>:5244/dav`.
- **Linux**: GNOME Files / Dolphin → Connect to Server → `webdav://<DEVICE-IP>:5244/dav`.
- **Android / iOS**: Use apps like *FE File Explorer*, *VLC*, *Solid Explorer*, or *FolderSync*.

---

## 🛠 Management & Troubleshooting

### Restarting the Service
- **systemd** (postmarketOS whyred):
  ```bash
  sudo systemctl restart alist
  ```
- **OpenRC** (Alpine Linux standard):
  ```bash
  sudo rc-service alist restart
  ```

### Resetting Admin Password
To set a custom password for the AList admin:
```bash
sudo /usr/local/bin/alist admin set <NEW_PASSWORD> --data /var/lib/alist
```
