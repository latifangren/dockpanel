use crate::safe_cmd::{safe_command, safe_command_unsandboxed};
use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use std::collections::HashMap;
use sysinfo::{Components, Networks, System};

use super::{AppState, NetworkSnapshot};

#[derive(Serialize, Clone, Debug)]
pub struct DiskMountInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total_gb: f64,
    pub used_gb: f64,
    pub free_gb: f64,
    pub usage_pct: f32,
    pub is_removable: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct BatteryInfo {
    pub present: bool,
    pub capacity_pct: Option<u8>,
    pub status: Option<String>,
    pub plugged_in: Option<bool>,
    pub temp_c: Option<f32>,
}

#[derive(Serialize)]
struct SystemInfo {
    hostname: String,
    os: String,
    kernel: String,
    uptime_secs: u64,
    cpu_count: usize,
    cpu_usage: f32,
    cpu_model: String,
    cpu_temp: Option<f32>,
    mem_total_mb: u64,
    mem_used_mb: u64,
    mem_usage_pct: f32,
    swap_total_mb: u64,
    swap_used_mb: u64,
    disk_total_gb: f64,
    disk_used_gb: f64,
    disk_usage_pct: f32,
    load_avg_1: f64,
    load_avg_5: f64,
    load_avg_15: f64,
    process_count: usize,
    disks: Vec<DiskMountInfo>,
    battery: Option<BatteryInfo>,
}

#[derive(Serialize)]
struct ProcessInfo {
    pid: u32,
    name: String,
    cpu_pct: f32,
    mem_mb: u64,
}

#[derive(Serialize)]
struct NetworkInfo {
    name: String,
    rx_bytes: u64,
    tx_bytes: u64,
    rx_rate: u64,
    tx_rate: u64,
}

fn read_battery_info() -> Option<BatteryInfo> {
    let power_supply = std::path::Path::new("/sys/class/power_supply");
    if !power_supply.is_dir() {
        return None;
    }

    let mut capacity = None;
    let mut status = None;
    let mut temp_c = None;
    let mut plugged_in = None;
    let mut found_battery = false;

    if let Ok(entries) = std::fs::read_dir(power_supply) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let ps_type = std::fs::read_to_string(path.join("type"))
                .unwrap_or_default()
                .trim()
                .to_lowercase();

            if ps_type == "battery" || name.contains("bat") || name.contains("bms") {
                found_battery = true;
                if let Ok(cap) = std::fs::read_to_string(path.join("capacity")) {
                    if let Ok(val) = cap.trim().parse::<u8>() {
                        capacity = Some(val.min(100));
                    }
                }
                if let Ok(st) = std::fs::read_to_string(path.join("status")) {
                    let s = st.trim().to_string();
                    if !s.is_empty() {
                        status = Some(s);
                    }
                }
                if let Ok(t) = std::fs::read_to_string(path.join("temp")) {
                    if let Ok(val) = t.trim().parse::<f32>() {
                        let c = if val > 1000.0 {
                            val / 1000.0
                        } else if val > 100.0 {
                            val / 10.0
                        } else {
                            val
                        };
                        temp_c = Some((c * 10.0).round() / 10.0);
                    }
                }
            } else if ps_type == "mains" || ps_type == "usb" || ps_type == "usb_pd" || name.contains("usb") || name.contains("ac") || name.contains("charger") {
                if let Ok(online) = std::fs::read_to_string(path.join("online")) {
                    if online.trim() == "1" {
                        plugged_in = Some(true);
                    } else if online.trim() == "0" && plugged_in.is_none() {
                        plugged_in = Some(false);
                    }
                }
            }
        }
    }

    if found_battery || capacity.is_some() {
        Some(BatteryInfo {
            present: true,
            capacity_pct: capacity,
            status,
            plugged_in,
            temp_c,
        })
    } else {
        None
    }
}

async fn system_info(State(state): State<AppState>) -> Json<SystemInfo> {
    let mut sys = state.system.lock().await;
    sys.refresh_memory();

    // CPU is NOT refreshed here. A per-request refresh measures the interval
    // since whichever unrelated caller last hit this endpoint — and this
    // handler's own work lands inside that interval — so the answer tracked the
    // request pattern instead of the load. The sampler owns a fixed window.
    let cpu_usage = state.cpu.usage();
    let mem_total = sys.total_memory();
    let mem_used = sys.used_memory();

    // Disk info: root partition + multi-disk list (MicroSD, external, USB)
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let (disk_total, disk_used) = disks
        .iter()
        .find(|d| d.mount_point() == std::path::Path::new("/"))
        .map(|d| (d.total_space(), d.total_space() - d.available_space()))
        .unwrap_or((0, 0));

    let disks_list: Vec<DiskMountInfo> = disks
        .iter()
        .filter(|d| {
            let mp = d.mount_point().to_string_lossy();
            !mp.starts_with("/proc") && !mp.starts_with("/sys") && !mp.starts_with("/dev")
        })
        .map(|d| {
            let total = d.total_space() as f64 / 1_073_741_824.0;
            let free = d.available_space() as f64 / 1_073_741_824.0;
            let used = (total - free).max(0.0);
            let usage_pct = if total > 0.0 { ((used / total) * 100.0) as f32 } else { 0.0 };
            DiskMountInfo {
                name: d.name().to_string_lossy().to_string(),
                mount_point: d.mount_point().to_string_lossy().to_string(),
                file_system: d.file_system().to_string_lossy().to_string(),
                total_gb: (total * 10.0).round() / 10.0,
                used_gb: (used * 10.0).round() / 10.0,
                free_gb: (free * 10.0).round() / 10.0,
                usage_pct,
                is_removable: d.is_removable(),
            }
        })
        .collect();

    let load_avg = System::load_average();

    // CPU model from first core
    let cpu_model = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_default();

    // CPU temperature — find the highest package/core/tctl reading
    let components = Components::new_with_refreshed_list();
    let cpu_temp = components
        .iter()
        .filter(|c| {
            let label = c.label().to_lowercase();
            label.contains("core")
                || label.contains("cpu")
                || label.contains("package")
                || label.contains("tctl")
        })
        .filter_map(|c| c.temperature())
        .reduce(|a, b| a.max(b));

    // Swap memory
    let swap_total = sys.total_swap();
    let swap_used = sys.used_swap();

    // Process count, counted from /proc directly. Getting it from sysinfo means
    // refreshing every process's stats — a full walk that cost ~70 ms of CPU per
    // call and was the contaminant in the CPU window described above.
    let process_count = crate::services::cpu_sampler::process_count();

    Json(SystemInfo {
        hostname: System::host_name().unwrap_or_default(),
        os: System::long_os_version().unwrap_or_default(),
        kernel: System::kernel_version().unwrap_or_default(),
        uptime_secs: System::uptime(),
        cpu_count: sys.cpus().len(),
        cpu_usage,
        cpu_model,
        cpu_temp,
        mem_total_mb: mem_total / 1_048_576,
        mem_used_mb: mem_used / 1_048_576,
        mem_usage_pct: if mem_total > 0 {
            (mem_used as f32 / mem_total as f32) * 100.0
        } else {
            0.0
        },
        swap_total_mb: swap_total / 1_048_576,
        swap_used_mb: swap_used / 1_048_576,
        disk_total_gb: disk_total as f64 / 1_073_741_824.0,
        disk_used_gb: disk_used as f64 / 1_073_741_824.0,
        disk_usage_pct: if disk_total > 0 {
            (disk_used as f32 / disk_total as f32) * 100.0
        } else {
            0.0
        },
        load_avg_1: load_avg.one,
        load_avg_5: load_avg.five,
        load_avg_15: load_avg.fifteen,
        process_count,
        disks: disks_list,
        battery: read_battery_info(),
    })
}

async fn processes() -> Json<Vec<ProcessInfo>> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    // Brief pause then refresh again for accurate CPU readings
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut procs: Vec<ProcessInfo> = sys
        .processes()
        .values()
        .map(|p| ProcessInfo {
            pid: p.pid().as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cpu_pct: p.cpu_usage(),
            mem_mb: p.memory() / 1_048_576,
        })
        .collect();

    procs.sort_by(|a, b| b.cpu_pct.partial_cmp(&a.cpu_pct).unwrap_or(std::cmp::Ordering::Equal));
    procs.truncate(20);

    Json(procs)
}

async fn network(State(state): State<AppState>) -> Json<Vec<NetworkInfo>> {
    let networks = Networks::new_with_refreshed_list();
    let now = std::time::Instant::now();

    // Build current readings
    let mut current_readings = HashMap::new();
    for (name, data) in networks.iter() {
        current_readings.insert(
            name.to_string(),
            (data.total_received(), data.total_transmitted()),
        );
    }

    // Compute rates from previous snapshot
    let mut prev = state.network_snapshot.lock().await;
    let prev_snapshot = prev.take();

    let interfaces: Vec<NetworkInfo> = current_readings
        .iter()
        .map(|(name, &(rx, tx))| {
            let (rx_rate, tx_rate) = prev_snapshot
                .as_ref()
                .and_then(|snap| {
                    let elapsed = now.duration_since(snap.timestamp).as_secs_f64();
                    if elapsed <= 0.0 {
                        return None;
                    }
                    snap.readings.get(name).map(|&(prev_rx, prev_tx)| {
                        let rx_diff = rx.saturating_sub(prev_rx);
                        let tx_diff = tx.saturating_sub(prev_tx);
                        (
                            (rx_diff as f64 / elapsed) as u64,
                            (tx_diff as f64 / elapsed) as u64,
                        )
                    })
                })
                .unwrap_or((0, 0));

            NetworkInfo {
                name: name.clone(),
                rx_bytes: rx,
                tx_bytes: tx,
                rx_rate,
                tx_rate,
            }
        })
        .collect();

    // Store current snapshot for next call
    *prev = Some(NetworkSnapshot {
        readings: current_readings,
        timestamp: now,
    });

    Json(interfaces)
}

/// GET /system/disk-io — Get disk I/O stats from /proc/diskstats.
async fn disk_io() -> Json<serde_json::Value> {
    // Take two snapshots 1 second apart to calculate rate
    let read1 = read_diskstats().await;
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let read2 = read_diskstats().await;

    let read_rate = if read2.0 >= read1.0 { (read2.0 - read1.0) * 512 } else { 0 }; // sectors * 512 = bytes
    let write_rate = if read2.1 >= read1.1 { (read2.1 - read1.1) * 512 } else { 0 };

    Json(serde_json::json!({
        "read_bytes_sec": read_rate,
        "write_bytes_sec": write_rate,
        "read_total_mb": (read2.0 * 512) / (1024 * 1024),
        "write_total_mb": (read2.1 * 512) / (1024 * 1024),
    }))
}

async fn read_diskstats() -> (u64, u64) {
    let content = tokio::fs::read_to_string("/proc/diskstats").await.unwrap_or_default();
    let mut reads: u64 = 0;
    let mut writes: u64 = 0;

    for line in content.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 14 {
            let dev = parts[2];
            // Only count main block devices, not partitions
            let is_main = (dev.starts_with("sd") && dev.len() == 3)
                || (dev.starts_with("vd") && dev.len() == 3)
                || (dev.starts_with("xvd") && dev.len() == 4)
                || (dev.starts_with("nvme") && dev.contains("n") && !dev.contains("p"));
            if is_main {
                reads += parts[5].parse::<u64>().unwrap_or(0);   // sectors read
                writes += parts[9].parse::<u64>().unwrap_or(0);  // sectors written
            }
        }
    }
    (reads, writes)
}

/// POST /system/cleanup — Free disk space by clearing caches and temp files.
async fn disk_cleanup() -> Json<serde_json::Value> {
    let mut freed = Vec::new();

    // 1. apt cache — unsandboxed because /var/cache/apt is outside the
    // agent unit's ReadWritePaths and apt-get clean would silently no-op.
    if safe_command_unsandboxed("apt-get", &[]).args(["clean"]).output().await.is_ok() {
        freed.push("apt cache");
    }

    // 2. journal logs older than 3 days
    if safe_command("journalctl").args(["--vacuum-time=3d"]).output().await.is_ok() {
        freed.push("old journal logs");
    }

    // 3. tmp files older than 7 days
    if safe_command("find").args(["/tmp", "-type", "f", "-mtime", "+7", "-delete"]).output().await.is_ok() {
        freed.push("old temp files");
    }

    // 4. Docker dangling images
    if safe_command("docker").args(["image", "prune", "-f"]).output().await.is_ok() {
        freed.push("dangling Docker images");
    }

    // Get disk usage after cleanup
    let df = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        safe_command("df").args(["-h", "/"]).output(),
    ).await;
    let disk_info = df.ok().and_then(|r| r.ok())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default();

    Json(serde_json::json!({
        "cleaned": freed,
        "disk_after": disk_info.lines().nth(1).unwrap_or("")
    }))
}

/// POST /system/hostname — Change server hostname.
async fn change_hostname(Json(body): Json<serde_json::Value>) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let hostname = body.get("hostname").and_then(|v| v.as_str()).unwrap_or("");
    if hostname.is_empty() || hostname.len() > 63 || !hostname.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
        return Err((axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Invalid hostname"}))));
    }

    let _ = safe_command("hostnamectl").args(["set-hostname", hostname]).output().await;
    Ok(Json(serde_json::json!({ "ok": true, "hostname": hostname })))
}

/// GET /system/port-check?port=8080 — Is this host port free to publish on?
///
/// Answers the one question the deploy preflight cannot answer from the panel's
/// own records: a port can be held by something DockPanel doesn't manage — the
/// operator's own service, a stray container, a system daemon — and the only
/// authority on that is the host itself.
///
/// Probes `127.0.0.1` because that is exactly where `docker_apps::deploy`
/// publishes (`host_ip: 127.0.0.1`), so a successful bind here is evidence about
/// the same address the container will contend for. Same bind-test idiom as
/// `routes/database.rs::find_free_port`.
async fn port_check(
    axum::extract::Query(q): axum::extract::Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let port: u16 = q
        .get("port")
        .and_then(|p| p.parse().ok())
        .filter(|p| *p > 0)
        .ok_or_else(|| {
            (
                axum::http::StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "port must be 1-65535"})),
            )
        })?;

    // Binding and immediately dropping is the only honest test. The listener is
    // closed at the end of this scope; nothing is left holding the port.
    let free = std::net::TcpListener::bind(("127.0.0.1", port)).is_ok();

    Ok(Json(serde_json::json!({ "port": port, "free": free })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/system/info", get(system_info))
        .route("/system/processes", get(processes))
        .route("/system/network", get(network))
        .route("/system/disk-io", get(disk_io))
        .route("/system/port-check", get(port_check))
        .route("/system/cleanup", axum::routing::post(disk_cleanup))
        .route("/system/hostname", axum::routing::post(change_hostname))
}
