#!/usr/bin/python3
"""Precog native messaging helper.

Chrome starts this when the Precog extension asks it to, hands it one Claude
Messages API request on stdin, and reads the API's response from stdout. The
request is made from this process rather than from the browser, and the API
key stays here: it is read from the macOS Keychain (or ANTHROPIC_API_KEY) and
is never sent to the extension.

Only the extension IDs listed in the native messaging manifest written by
install.sh can talk to this script.
"""

import json
import os
import struct
import subprocess
import sys
import urllib.error
import urllib.request

API_URL = "https://api.anthropic.com/v1/messages"
KEYCHAIN_SERVICE = "precog-anthropic-api-key"
# The only request headers the extension may set; everything else is fixed here
FORWARDED_HEADERS = ("anthropic-version", "anthropic-beta")
TIMEOUT_SECONDS = 120


def read_message():
    header = sys.stdin.buffer.read(4)
    if len(header) < 4:
        return None
    (length,) = struct.unpack("<I", header)
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


def write_message(message):
    data = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def api_key():
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    try:
        result = subprocess.run(
            ["/usr/bin/security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def handle(message):
    if message.get("type") == "ping":
        return {"ok": True, "has_key": bool(api_key())}
    if message.get("type") != "messages":
        return {"error": "Unknown request type."}

    body = message.get("body")
    if not isinstance(body, dict):
        return {"error": "Request body must be a JSON object."}

    key = api_key()
    if not key:
        return {
            "error": "No Anthropic API key found. Store one in the Keychain under "
            + KEYCHAIN_SERVICE
            + " (see helper/README.md)."
        }

    headers = {"content-type": "application/json", "x-api-key": key}
    for name in FORWARDED_HEADERS:
        value = (message.get("headers") or {}).get(name)
        if isinstance(value, str) and value:
            headers[name] = value

    request = urllib.request.Request(
        API_URL, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except (urllib.error.URLError, OSError) as e:
        return {"error": "Could not reach the Anthropic API: %s" % e}

    try:
        parsed = json.loads(raw.decode("utf-8"))
    except ValueError:
        parsed = {"error": {"message": raw.decode("utf-8", "replace")[:500]}}
    return {"status": status, "body": parsed}


def main():
    try:
        message = read_message()
        if message is None:
            return
        write_message(handle(message))
    except Exception as e:  # always answer, or the extension only sees a disconnect
        write_message({"error": "Helper failed: %s" % e})


if __name__ == "__main__":
    main()
