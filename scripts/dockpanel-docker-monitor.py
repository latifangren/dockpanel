#!/usr/bin/env python3
import time
import json
import socket
import http.client
import os

class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path):
        super().__init__("localhost")
        self.socket_path = socket_path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)

def collect_docker_stats():
    try:
        conn = UnixHTTPConnection("/var/run/docker.sock")
        conn.request("GET", "/containers/json?all=true")
        res = conn.getresponse()
        containers = json.loads(res.read().decode("utf-8"))

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
                    conn.request("GET", f"/containers/{c_id}/stats?stream=false")
                    s_res = conn.getresponse()
                    stats = json.loads(s_res.read().decode("utf-8"))

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
                except Exception:
                    pass

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

        os.makedirs("/run/dockpanel", exist_ok=True)
        tmp_file = "/run/dockpanel/docker-stats.tmp"
        target_file = "/run/dockpanel/docker-stats.json"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp_file, target_file)
        os.chmod(target_file, 0o644)
    except Exception as e:
        pass

def main():
    while True:
        collect_docker_stats()
        time.sleep(3)

if __name__ == "__main__":
    main()
