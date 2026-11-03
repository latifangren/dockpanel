#!/usr/bin/env python3
import os
import json

def detect_device_model():
    candidates = [
        "/proc/device-tree/model",
        "/sys/firmware/devicetree/base/model",
        "/sys/class/dmi/id/product_name",
        "/sys/class/dmi/id/board_name",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "rb") as f:
                    val = f.read().decode("utf-8", errors="ignore").strip("\x00 \t\n\r")
                    if val and val.lower() not in ("none", "default string", "to be filled by o.e.m."):
                        return val
            except Exception:
                pass
    return None

def detect_soc_name():
    soc_family = None
    soc_machine = None
    if os.path.exists("/sys/devices/soc0/family"):
        try:
            with open("/sys/devices/soc0/family", "r", encoding="utf-8", errors="ignore") as f:
                val = f.read().strip()
                if val:
                    soc_family = val
        except Exception:
            pass

    if os.path.exists("/sys/devices/soc0/machine"):
        try:
            with open("/sys/devices/soc0/machine", "r", encoding="utf-8", errors="ignore") as f:
                val = f.read().strip()
                if val:
                    soc_machine = val
        except Exception:
            pass

    if soc_family and soc_machine:
        return f"{soc_family} {soc_machine}"
    if soc_machine:
        return soc_machine
    if soc_family:
        return soc_family
    return None

def detect_battery():
    ps = "/sys/class/power_supply"
    if not os.path.exists(ps):
        return None
    try:
        for name in os.listdir(ps):
            if "bat" in name.lower() or "bms" in name.lower():
                return name
    except Exception:
        pass
    return None

def main():
    data = {
        "device_model": detect_device_model(),
        "soc_name": detect_soc_name(),
        "has_battery": detect_battery() is not None,
    }
    print(json.dumps(data, indent=2))

if __name__ == "__main__":
    main()
