#!/usr/bin/env python3
"""Manage only the isolated Copilot sidecar; never operate Sub2API containers."""
import argparse
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / "runtime"
KEY = RUNTIME / "gateway.key"
TOKEN = RUNTIME / "auth" / "github_token"
PROJECT = "sub2api-copilot"
CLIENT_ID = "Iv1.b507a08c87ecfe98"  # public GitHub Copilot OAuth client ID


def config():
    values = {"COPILOT_GATEWAY_PORT": "18991", "COPILOT_ACCOUNT_TYPE": "individual"}
    if not (ROOT / ".env").is_file():
        raise ValueError("Run init first")
    for line in (ROOT / ".env").read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, sep, value = line.partition("=")
        if not sep or name not in values:
            raise ValueError("Only documented ordinary configuration fields are allowed")
        values[name] = value.strip()
    port = values["COPILOT_GATEWAY_PORT"]
    if not port.isdecimal() or not 1024 <= int(port) <= 65535:
        raise ValueError("COPILOT_GATEWAY_PORT is invalid")
    if values["COPILOT_ACCOUNT_TYPE"] not in ("individual", "business", "enterprise"):
        raise ValueError("COPILOT_ACCOUNT_TYPE is invalid")
    return values


def docker():
    executable = shutil.which("docker")
    if executable is None:
        candidate = Path.home() / ".orbstack/bin/docker"
        if candidate.is_file():
            executable = str(candidate)
    if executable is None:
        raise ValueError("Docker is unavailable")
    return executable


def compose(*args):
    values = config()
    # Do not let unrelated shell variables override this deployment's .env.
    env = dict(os.environ, **values)
    command = [docker(), "compose", "--project-name", PROJECT,
               "--project-directory", str(ROOT), "--env-file", str(ROOT / ".env"),
               "-f", str(ROOT / "compose.yaml"), *args]
    return subprocess.run(command, cwd=ROOT, env=env, check=True)


def private_write(path, value):
    # Atomic replacement; no partially written credentials on interruption.
    temporary = path.with_name(path.name + ".new")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write(value)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    os.chmod(path, 0o600)


def gateway_key():
    key = KEY.read_text().strip()
    if not re.fullmatch(r"[a-f0-9]{64}", key):
        raise ValueError("Gateway key format is invalid")
    return key


def init():
    RUNTIME.mkdir(mode=0o700, exist_ok=True)
    (RUNTIME / "auth").mkdir(mode=0o700, exist_ok=True)
    os.chmod(RUNTIME, 0o700)
    os.chmod(RUNTIME / "auth", 0o700)
    if not (ROOT / ".env").exists():
        private_write(ROOT / ".env", (ROOT / ".env.example").read_text())
    config()
    if not KEY.exists():
        private_write(KEY, secrets.token_hex(32) + "\n")
    key = gateway_key()
    private_write(RUNTIME / "auth.inc",
                  'map $http_authorization $bearer_ok { default 0; "Bearer ' + key + '" 1; }\n'
                  'map $http_x_api_key $apikey_ok { default 0; "' + key + '" 1; }\n')
    print("Initialized. Key stored locally; its value is not displayed.")


def github_post(path, body):
    request = urllib.request.Request("https://github.com" + path,
                                     data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Never print response bodies, request objects or headers.
        raise ValueError("GitHub device authorization HTTP status " + str(error.code)) from None


def auth():
    config()
    if TOKEN.is_file() and TOKEN.stat().st_size:
        raise ValueError("A credential already exists; stop the sidecar and remove it locally before reauthorizing")
    device = github_post("/login/device/code", {"client_id": CLIENT_ID, "scope": "read:user"})
    code = device.get("user_code", "")
    uri = device.get("verification_uri", "")
    if not re.fullmatch(r"[A-Z0-9]{4}-[A-Z0-9]{4}", code) or uri != "https://github.com/login/device":
        raise ValueError("GitHub returned an unexpected device authorization response")
    interval = max(5, int(device.get("interval", 5)))
    expiry = time.monotonic() + min(900, max(1, int(device.get("expires_in", 900))))
    # Only the user-facing device code is printed; device_code and tokens stay local.
    print("Authorize at " + uri + " with code " + code, flush=True)
    while time.monotonic() < expiry:
        time.sleep(interval)
        try:
            result = github_post("/login/oauth/access_token", {
                "client_id": CLIENT_ID, "device_code": device["device_code"],
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
        except (urllib.error.URLError, OSError):
            # Device codes remain valid across transient network failures.
            # Keep the original expiry and do not log request/response objects.
            continue
        token = result.get("access_token")
        if token:
            if not isinstance(token, str) or "\n" in token or len(token) < 20:
                raise ValueError("GitHub returned an invalid credential format")
            private_write(TOKEN, token)
            print("GitHub authorization saved locally. Start the adapter to verify Copilot access.", flush=True)
            return
        error = result.get("error")
        if error == "slow_down":
            interval += 5
        elif error != "authorization_pending":
            raise ValueError("GitHub authorization was denied, expired or failed; rerun auth")
    raise ValueError("GitHub device authorization expired; rerun auth")


def local_request(path, authenticated=False, api_key=False, method="GET", body=None):
    headers = {}
    if authenticated:
        key = gateway_key()
        headers = {"X-Api-Key": key} if api_key else {"Authorization": "Bearer " + key}
    connection = http.client.HTTPConnection("127.0.0.1", int(config()["COPILOT_GATEWAY_PORT"]), timeout=10)
    try:
        if body is not None:
            headers["Content-Type"] = "application/json"
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        body = response.read(4 * 1024 * 1024)
        return response.status, body
    finally:
        connection.close()


def verify():
    # Integration smoke checks against the actual gateway, not unit tests.
    cases = [("/healthz", False, 200), ("/v1/models", False, 401),
             ("/token", True, 404), ("/usage", True, 404),
             ("/v1/responses", False, 401)]
    for path, authenticated, expected in cases:
        status, _ = local_request(path, authenticated)
        print(path + ": " + str(status))
        if status != expected:
            raise ValueError("Gateway integration check failed")
    status, _ = local_request("/v1/responses", True, method="POST", body=b"{}")
    print("Responses validation: " + str(status))
    if status != 400:
        raise ValueError("Responses request validation is unavailable")
    for api_key in (False, True):
        status, body = local_request("/v1/models", True, api_key)
        print("Authenticated models (" + ("x-api-key" if api_key else "bearer") + "): " + str(status))
        if TOKEN.is_file() and TOKEN.stat().st_size:
            if status != 200 or not isinstance(json.loads(body).get("data"), list):
                raise ValueError("Copilot model catalog is not ready")
        elif status != 502:
            raise ValueError("Expected unavailable adapter before authorization")
    print("Gateway integration checks passed. Model inference requires Copilot authorization.")


def status():
    config()
    print("Gateway key: " + ("set" if KEY.is_file() and KEY.stat().st_size else "missing"))
    print("GitHub credential: " + ("set" if TOKEN.is_file() and TOKEN.stat().st_size else "missing"))
    compose("ps")
    for path in ("/healthz", "/readyz"):
        try:
            code, _ = local_request(path)
            print(path + ": " + str(code))
        except (OSError, http.client.HTTPException):
            print(path + ": unavailable")


def account_template():
    # Private handoff file for the existing admin API. Do not print or git-add.
    port = config()["COPILOT_GATEWAY_PORT"]
    payload = {
        "name": "GitHub Copilot (isolated adapter)", "platform": "openai", "type": "apikey",
        "credentials": {"base_url": "http://host.docker.internal:" + port,
                        "api_key": gateway_key(), "model_mapping": {}},
        "extra": {"openai_responses_mode": "force_chat_completions",
                  "openai_responses_supported": False},
        "concurrency": 1, "priority": 1,
    }
    private_write(RUNTIME / "account.json", json.dumps(payload, indent=2) + "\n")
    print("Private account template saved to runtime/account.json; no account was created.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["init", "build", "auth", "gateway", "start", "status", "verify", "account-template", "stop"])
    args = parser.parse_args()
    if args.command == "init":
        init()
    elif args.command == "build":
        compose("build", "adapter")
    elif args.command == "auth":
        auth()
    elif args.command == "gateway":
        compose("up", "-d", "--wait", "--wait-timeout", "45", "--no-deps", "gateway")
    elif args.command == "start":
        if not TOKEN.is_file() or not TOKEN.stat().st_size:
            raise ValueError("Authorize with auth first; no adapter was started")
        gateway_key()
        compose("up", "-d", "--wait", "--wait-timeout", "90", "--no-build", "adapter", "gateway")
    elif args.command == "status":
        status()
    elif args.command == "verify":
        verify()
    elif args.command == "account-template":
        account_template()
    elif args.command == "stop":
        compose("stop", "gateway", "adapter")


if __name__ == "__main__":
    os.umask(0o077)
    try:
        main()
    except KeyboardInterrupt:
        print("Stopped; credentials are not displayed.", file=sys.stderr)
        sys.exit(130)
    except (OSError, ValueError, subprocess.CalledProcessError, http.client.HTTPException) as error:
        # Only locally authored ValueError messages are safe to expose.
        message = str(error) if isinstance(error, ValueError) else type(error).__name__
        print("Operation failed: " + message, file=sys.stderr)
        sys.exit(1)
