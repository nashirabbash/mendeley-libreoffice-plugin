#!/usr/bin/env python3
"""Mendeley OAuth loopback server for ONLYOFFICE Desktop Editors."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import argparse
from threading import Thread
import os
import sys
from pathlib import Path
import tempfile
import time
import urllib.parse

HOST = "127.0.0.1"
PORT = 8080
SERVICE_NAME = "mendeley-loopback"
HTML_CALLBACK = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Mendeley Login Successful</title></head>
<body><h2>Login Berhasil</h2><p>Token Mendeley diterima. Kembali ke ONLYOFFICE.</p>
<script>
(function () {
    var hash = new URLSearchParams(window.location.hash.slice(1));
    var search = new URLSearchParams(window.location.search);
    var token = hash.get("access_token") || search.get("code");
    if (token) {
        fetch("/token", { method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({token: token}) });
    }
})();
</script></body></html>"""


def token_file_path():
    if os.name == "nt":
        root = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        root = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return root / "mendeley-onlyoffice" / "active-token.json"


def write_token(path, token):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(prefix=".token-", dir=str(path.parent))
    try:
        if os.name != "nt":
            os.chmod(temporary_path, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as token_file:
            json.dump({"token": token}, token_file)
            token_file.flush()
            os.fsync(token_file.fileno())
        os.replace(temporary_path, path)
        if os.name != "nt":
            os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def _try_decrypt_windows_cookie(encrypted_value):
    try:
        import ctypes
        import ctypes.wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [
                ("cbData", ctypes.wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_char)),
            ]

        in_blob = DATA_BLOB(len(encrypted_value), ctypes.cast(ctypes.create_string_buffer(encrypted_value), ctypes.POINTER(ctypes.c_char)))
        out_blob = DATA_BLOB()
        if ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
            result = ctypes.string_at(out_blob.pbData, out_blob.cbData).decode("utf-8", "ignore")
            ctypes.windll.kernel32.LocalFree(out_blob.pbData)
            if result and len(result) > 20:
                return result
    except Exception:
        pass
    return None


def get_token_from_mendeley_app():
    import sqlite3
    candidate_paths = []
    if os.name == "nt":
        appdata = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
        localappdata = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        candidate_paths.extend([
            appdata / "Mendeley Reference Manager" / "Network" / "Cookies",
            appdata / "Mendeley Reference Manager" / "Cookies",
            localappdata / "Mendeley Reference Manager" / "Network" / "Cookies",
            localappdata / "Mendeley Reference Manager" / "Cookies",
        ])
    elif sys.platform == "darwin":
        app_support = Path.home() / "Library" / "Application Support"
        candidate_paths.extend([
            app_support / "Mendeley Reference Manager" / "Cookies",
            app_support / "Mendeley Reference Manager" / "Network" / "Cookies",
        ])
    else:
        config_home = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
        candidate_paths.extend([
            config_home / "Mendeley Reference Manager" / "Cookies",
            config_home / "Mendeley Reference Manager" / "Network" / "Cookies",
            Path.home() / ".var" / "app" / "com.elsevier.MendeleyReferenceManager" / "config" / "Mendeley Reference Manager" / "Cookies",
            Path.home() / ".var" / "app" / "com.elsevier.MendeleyReferenceManager" / "config" / "Mendeley Reference Manager" / "Network" / "Cookies",
        ])

    for cp in candidate_paths:
        if not cp.is_file():
            continue
        try:
            con = sqlite3.connect(f"file:{cp.as_posix()}?mode=ro", uri=True)
            try:
                cur = con.cursor()
                cur.execute("SELECT value, encrypted_value FROM cookies WHERE name='accessToken'")
                row = cur.fetchone()
                if row:
                    val, enc = row[0], row[1]
                    if val and isinstance(val, str) and len(val) > 20:
                        return val
                    if os.name == "nt" and enc:
                        decrypted = _try_decrypt_windows_cookie(enc)
                        if decrypted:
                            return decrypted
            finally:
                con.close()
        except Exception:
            continue
    return None


def read_token(path):
    try:
        with Path(path).open(encoding="utf-8") as token_file:
            token = json.load(token_file).get("token")
            if token:
                return token
    except (OSError, ValueError, TypeError):
        pass
    if Path(path) == token_file_path():
        app_token = get_token_from_mendeley_app()
        if app_token:
            try:
                write_token(path, app_token)
            except Exception:
                pass
            return app_token
    return None


def clear_token(path):
    try:
        Path(path).unlink()
    except FileNotFoundError:
        pass

def make_handler(token_path):
    class OAuthLoopbackHandler(BaseHTTPRequestHandler):
        def _approved_origin(self):
            origin = self.headers.get("Origin")
            if origin in (None, "null", "file://"):
                return True
            try:
                parsed = urllib.parse.urlsplit(origin)
                parsed.port
            except ValueError:
                return False
            return (
                parsed.scheme in ("http", "https")
                and parsed.hostname in ("localhost", "127.0.0.1", "::1")
                and not parsed.username
                and not parsed.password
                and not parsed.path
                and not parsed.query
                and not parsed.fragment
            )

        def _approved_host(self):
            host = self.headers.get("Host", "").split(":", 1)[0]
            return host in ("127.0.0.1", "localhost")
        def _send_json(self, status, payload):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            origin = self.headers.get("Origin")
            if origin is not None and self._approved_origin():
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(body)
        def _reject_request(self):
            print(json.dumps({
                "level": "warn",
                "event": "http.request_rejected",
                "data": {
                    "method": self.command,
                    "path": urllib.parse.urlsplit(self.path).path,
                    "origin": self.headers.get("Origin"),
                    "host": self.headers.get("Host"),
                },
            }), flush=True)
            self._send_json(403, {"error": "origin_not_allowed"})


        def do_OPTIONS(self):
            if not self._approved_origin():
                self._reject_request()
                return
            self.send_response(204)
            origin = self.headers.get("Origin")
            if origin is not None:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            if not self._approved_host() or not self._approved_origin():
                self._reject_request()
                return
            path = urllib.parse.urlparse(self.path).path
            if path == "/health":
                self._send_json(200, {"service": SERVICE_NAME, "status": "ok"})
            elif path == "/token":
                self._send_json(200, {"token": read_token(token_path)})
            elif path == "/" or path == "/callback":
                body = HTML_CALLBACK.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self._send_json(404, {"error": "not_found"})

        def do_POST(self):
            if not self._approved_host() or not self._approved_origin():
                self._reject_request()
                return
            path = urllib.parse.urlparse(self.path).path
            if path == "/shutdown":
                self._send_json(200, {"status": "stopping"})
                Thread(target=self.server.shutdown, daemon=True).start()
                return
            if path != "/token":
                self._send_json(404, {"error": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 16384:
                    raise ValueError("invalid body size")
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                token = payload.get("token") if isinstance(payload, dict) else None
                if not isinstance(token, str) or not token or len(token) > 8192:
                    raise ValueError("invalid token")
                write_token(token_path, token)
                print(json.dumps({"level": "success", "event": "oauth.token_captured"}), flush=True)
                self._send_json(200, {"status": "ok"})
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
                print(json.dumps({"level": "error", "event": "oauth.token_rejected", "data": {"error": str(error)}}), flush=True)
                self._send_json(400, {"error": "invalid_token_payload"})

        def do_DELETE(self):
            if not self._approved_host() or not self._approved_origin():
                self._reject_request()
                return
            if urllib.parse.urlparse(self.path).path != "/token":
                self._send_json(404, {"error": "not_found"})
                return
            clear_token(token_path)
            self._send_json(200, {"status": "cleared"})
        def log_message(self, format, *args):
            print(json.dumps({"level": "info", "event": "http.request", "data": {"message": format % args}}), flush=True)

    return OAuthLoopbackHandler


def create_server(host=HOST, port=PORT, token_path=None):
    return ThreadingHTTPServer((host, port), make_handler(token_path or token_file_path()))


def start_or_reuse_server(host=HOST, port=PORT, token_path=None):
    try:
        return create_server(host, port, token_path)
    except OSError:
        import urllib.request

        try:
            with urllib.request.urlopen("http://127.0.0.1:{}/health".format(port), timeout=2) as response:
                health = json.load(response)
            if health == {"service": SERVICE_NAME, "status": "ok"}:
                print(json.dumps({"level": "info", "event": "server.reused", "data": {"port": port}}), flush=True)
                return None
        except (OSError, ValueError):
            pass
        raise


def stop_server(port=PORT):
    import urllib.request

    endpoint = "http://127.0.0.1:{}".format(port)
    try:
        with urllib.request.urlopen(endpoint + "/health", timeout=2) as response:
            health = json.load(response)
        if health != {"service": SERVICE_NAME, "status": "ok"}:
            print(json.dumps({"level": "error", "event": "server.stop_refused", "data": {"port": port}}), flush=True)
            return False
        request = urllib.request.Request(endpoint + "/shutdown", data=b"", method="POST")
        with urllib.request.urlopen(request, timeout=2):
            pass
        for attempt in range(20):
            try:
                with urllib.request.urlopen(endpoint + "/health", timeout=0.2) as response:
                    if json.load(response) != {"service": SERVICE_NAME, "status": "ok"}:
                        return True
            except OSError:
                return True
            time.sleep(0.1)
        return False
    except OSError:
        return False


def run():
    try:
        server = start_or_reuse_server()
    except OSError as error:
        print(json.dumps({"level": "error", "event": "server.start_failed", "data": {"error": str(error), "port": PORT}}), flush=True)
        raise
    if server is None:
        return
    print(json.dumps({"level": "success", "event": "server.started", "data": {"host": HOST, "port": PORT}}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print(json.dumps({"level": "info", "event": "server.stopped"}), flush=True)


def configure_logging():
    log_path = token_file_path().parent / "helper.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("a", encoding="utf-8", buffering=1)
    if os.name != "nt":
        os.chmod(log_path, 0o600)
    sys.stdout = log_file
    sys.stderr = log_file

if __name__ == "__main__":
    configure_logging()
    parser = argparse.ArgumentParser()
    parser.add_argument("--stop", action="store_true")
    arguments = parser.parse_args()
    if arguments.stop:
        stop_server()
    else:
        run()
