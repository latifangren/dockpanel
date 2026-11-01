#!/usr/bin/env python3
"""Bootstrap the AList local storage for DockPanel Lite (B5).

Logs in as the AList admin and creates a Local storage rooted at
``--root`` (default ``/``) with mount path ``/`` — but only when no
storage with that mount path exists yet, so re-running is safe.

The admin password is read from ``--password-file`` (mode 600, written
by scripts/setup.sh). It is never printed, never put on a command line,
and never logged. Exit codes: 0 = storage present (created or already
there); 2 = the AList API did not behave as expected (server down,
login rejected, or an unexpected response shape) — setup.sh turns
that into a LOUD warning with manual steps, never a silent success.

Only the Python standard library is used. The storage-create payload
sends just ``root_folder_path`` in ``addition``; every other Local
driver field is left to the server's defaults. If a future AList
version requires more, the server says so in its error message and
this script exits 2 with that message intact.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


class BootstrapError(Exception):
    """An expected failure whose message is safe to show the operator."""


def http_json(base_url, method, path, token=None, payload=None, timeout=15):
    """One JSON request. Returns the decoded body dict.

    Raises BootstrapError with the server's message (never credentials)
    on HTTP errors, and on any response that is not a JSON object.
    """
    url = base_url.rstrip("/") + path
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    if token:
        headers["Authorization"] = token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise BootstrapError(
            "AList answered HTTP %s for %s %s: %s" % (exc.code, method, path, detail)
        )
    except urllib.error.URLError as exc:
        raise BootstrapError("cannot reach AList at %s: %s" % (url, exc.reason))
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        raise BootstrapError("AList answered %s %s with non-JSON: %r" % (method, path, body[:200]))
    if not isinstance(parsed, dict):
        raise BootstrapError("AList answered %s %s with unexpected JSON: %r" % (method, path, body[:200]))
    return parsed


def wait_ready(base_url, timeout):
    """Wait until AList answers at all. Login errors do NOT count as down."""
    deadline = time.time() + timeout
    last_error = "no attempt made"
    while time.time() < deadline:
        try:
            http_json(base_url, "GET", "/api/public/settings", timeout=5)
            return
        except BootstrapError as exc:
            last_error = str(exc)
            # A 401/403-shaped answer still proves the server is up: the
            # settings endpoint may require auth on some builds. Only
            # connection failures should keep us waiting.
            if "HTTP 401" in last_error or "HTTP 403" in last_error:
                return
        time.sleep(2)
    raise BootstrapError("AList did not answer within %ss: %s" % (timeout, last_error))


def login(base_url, username, password):
    resp = http_json(
        base_url, "POST", "/api/auth/login",
        payload={"username": username, "password": password},
    )
    if resp.get("code") != 200:
        raise BootstrapError("AList login failed: %s" % (resp.get("message", "unknown error")))
    token = (resp.get("data") or {}).get("token")
    if not token:
        raise BootstrapError("AList login answered 200 but carried no token")
    return token


def list_storages(base_url, token):
    resp = http_json(base_url, "GET", "/api/admin/storage/list?page=1&per_page=100", token=token)
    if resp.get("code") != 200:
        raise BootstrapError("listing storages failed: %s" % (resp.get("message", "unknown error")))
    content = (resp.get("data") or {}).get("content")
    if not isinstance(content, list):
        raise BootstrapError("storage list had no content array: %r" % (str(resp)[:300],))
    return content


def create_storage(base_url, token, root):
    resp = http_json(
        base_url, "POST", "/api/admin/storage/create", token=token,
        payload={
            "mount_path": "/",
            "order": 0,
            "driver": "Local",
            "cache_expiration": 30,
            "status": 1,
            "addition": {"root_folder_path": root},
        },
    )
    if resp.get("code") != 200:
        raise BootstrapError("creating the Local storage failed: %s" % (resp.get("message", "unknown error")))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:5244",
                        help="AList HTTP address (default: %(default)s)")
    parser.add_argument("--password-file", required=True,
                        help="file holding the admin password (mode 600)")
    parser.add_argument("--admin-user", default="admin",
                        help="AList admin username (default: %(default)s)")
    parser.add_argument("--root", default="/",
                        help="local directory the storage serves (default: %(default)s)")
    parser.add_argument("--timeout", type=int, default=60,
                        help="seconds to wait for AList to answer (default: %(default)s)")
    args = parser.parse_args(argv)

    try:
        with open(args.password_file, "r", encoding="utf-8") as handle:
            password = handle.read().strip()
    except OSError as exc:
        print("cannot read password file %s: %s" % (args.password_file, exc), file=sys.stderr)
        return 2
    if not password:
        print("password file %s is empty" % args.password_file, file=sys.stderr)
        return 2

    try:
        wait_ready(args.base_url, args.timeout)
        token = login(args.base_url, args.admin_user, password)
        for storage in list_storages(args.base_url, token):
            if storage.get("mount_path") == "/":
                print("Local storage at mount / already exists (driver %s) — nothing to do."
                      % storage.get("driver", "?"))
                return 0
        create_storage(args.base_url, token, args.root)
        for storage in list_storages(args.base_url, token):
            if storage.get("mount_path") == "/":
                print("Local storage created: mount / -> %s" % args.root)
                return 0
        raise BootstrapError("storage create answered success but / is still not listed")
    except BootstrapError as exc:
        print("alist-bootstrap: %s" % exc, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
