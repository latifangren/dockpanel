#!/usr/bin/env python3
"""DockPanel Docker container metrics monitor (B6).

Polls the local Docker socket, writes one JSON snapshot per poll to
/run/dockpanel/docker-stats.json (atomic replace), which nginx serves at
/api/docker-stats behind the panel's auth gate (see configure_nginx in
scripts/setup.sh). Output schema is the Dashboard's contract — do not
rename fields: {total, running, stopped, containers[], updated_at}, each
container {id, name, image, state, status, cpu_pct, mem_mb, mem_limit_mb,
mem_pct}.

Behaviour notes (B6, 2026-11-01):
- Poll interval is 6s (was 3s): sequential per-container stats calls are
  real CPU on a phone, and nothing on the Dashboard needs 3s freshness.
- Failures are LOGGED to stderr (journal on systemd, the init script's
  log file on OpenRC) with exponential backoff up to 60s — never
  swallowed. A failed poll writes nothing: no file, or the last good
  file, is served, never a fabricated snapshot.
- /run/dockpanel is created BEFORE the first Docker call. Previously it
  was created only after a successful call, so a box whose Docker was
  slow to start served 404s until the first success for no good reason.
- One fresh socket connection per API call: reusing a single
  HTTPConnection across the list + stats calls left it in a broken
  state after any single stats failure.
"""

import http.client
import json
import logging
import os
import socket
import sys
import time

POLL_INTERVAL = 6.0
MAX_BACKOFF = 60.0
SOCKET_PATH = "/var/run/docker.sock"
OUT_DIR = "/run/dockpanel"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s dockpanel-docker-monitor %(levelname)s: %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("dockpanel-docker-monitor")


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path):
        super().__init__("localhost")
        self.socket_path = socket_path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)


def docker_get(path):
    """GET one Docker API path over the unix socket; raise on any failure."""
    conn = UnixHTTPConnection(SOCKET_PATH)
    try:
        conn.request("GET", path)
        res = conn.getresponse()
        body = res.read()
        if res.status != 200:
            raise RuntimeError(f"Docker API {path} returned HTTP {res.status}")
        return json.loads(body.decode("utf-8"))
    finally:
        conn.close()


def collect_docker_stats():
    """Write one snapshot. Returns True on success, False on failure (logged)."""
    try:
        os.makedirs(OUT_DIR, exist_ok=True)
        containers = docker_get("/containers/json?all=true")
        if not isinstance(containers, list):
            raise RuntimeError(f"Docker API /containers/json returned {type(containers).__name__}, not a list")

        out = []
        running_count = 0
        for c in containers:
            state = c.get("State", "")
            is_running = state == "running"
            if is_running:
                running_count += 1
            c_id = c.get("Id", "")[:12]
            name = (c.get("Names", [""])[0]).lstrip("/")

            cpu_pct = 0.0
            mem_mb = 0.0
            mem_limit_mb = 0.0
            mem_pct = 0.0

            if is_running:
                try:
                    stats = docker_get(f"/containers/{c_id}/stats?stream=false")

                    # Memory
                    mem_usage = stats.get("memory_stats", {}).get("usage", 0)
                    mem_limit = stats.get("memory_stats", {}).get("limit", 0)
                    mem_mb = round(mem_usage / (1024 * 1024), 1)
                    mem_limit_mb = round(mem_limit / (1024 * 1024), 1)
                    if mem_limit > 0:
                        mem_pct = round((mem_usage / mem_limit) * 100, 1)

                    # CPU
                    cpu_stats = stats.get("cpu_stats", {})
                    precpu_stats = stats.get("precpu_stats", {})
                    cpu_delta = cpu_stats.get("cpu_usage", {}).get("total_usage", 0) - precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
                    system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)
                    online_cpus = cpu_stats.get("online_cpus") or len(cpu_stats.get("cpu_usage", {}).get("percpu_usage", [])) or 1
                    if system_delta > 0 and cpu_delta > 0:
                        cpu_pct = round((cpu_delta / system_delta) * online_cpus * 100, 2)
                except Exception as e:
                    # One container's stats must not kill the whole snapshot.
                    log.warning("stats failed for container %s (%s): %s; reporting zeros", c_id, name, e)

            out.append({
                "id": c_id,
                "name": name,
                "image": c.get("Image", ""),
                "state": state,
                "status": c.get("Status", ""),
                "cpu_pct": cpu_pct,
                "mem_mb": mem_mb,
                "mem_limit_mb": mem_limit_mb,
                "mem_pct": mem_pct,
            })

        data = {
            "total": len(containers),
            "running": running_count,
            "stopped": len(containers) - running_count,
            "containers": out,
            "updated_at": int(time.time()),
        }

        tmp_file = os.path.join(OUT_DIR, "docker-stats.tmp")
        target_file = os.path.join(OUT_DIR, "docker-stats.json")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp_file, target_file)
        os.chmod(target_file, 0o644)
        return True
    except Exception as e:
        log.error("collection failed: %s", e)
        return False


def main():
    log.info("starting, polling every %.0fs", POLL_INTERVAL)
    failures = 0
    while True:
        if collect_docker_stats():
            failures = 0
            time.sleep(POLL_INTERVAL)
        else:
            failures += 1
            backoff = min(MAX_BACKOFF, POLL_INTERVAL * (2 ** min(failures, 4)))
            log.warning("backing off %.0fs after %d consecutive failure(s)", backoff, failures)
            time.sleep(backoff)


if __name__ == "__main__":
    main()
