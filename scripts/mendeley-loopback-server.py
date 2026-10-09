#!/usr/bin/env python3
"""
Mendeley OAuth Loopback Server for ONLYOFFICE Desktop Editors
Listens on http://127.0.0.1:8080/ to capture OAuth implicit/code token
and writes directly to ONLYOFFICE cache & exposes local token endpoint.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.parse
import os
import sys

PORT = 8080
SHARED_TOKEN_FILE = "/tmp/mendeley_active_token.json"

HTML_CALLBACK = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Mendeley Login Successful</title>
    <style>
        body { font-family: -apple-system, sans-serif; text-align: center; padding: 40px; background: #fafafa; color: #333; }
        .card { background: white; max-width: 480px; margin: 0 auto; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h2 { color: #2e7d32; margin-top: 0; }
        p { color: #666; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="card">
        <h2>✓ Login Berhasil!</h2>
        <p>Token otorisasi Mendeley telah berhasil ditangkap.</p>
        <p>Anda dapat menutup tab ini dan kembali ke <b>ONLYOFFICE</b>. Halaman daftar referensi sedang dimuat otomatis.</p>
    </div>
    <script>
        // Extract token from hash and send to loopback server
        (function() {
            var hash = window.location.hash || "";
            var search = window.location.search || "";
            var token = null;

            var matchToken = hash.match(/access_token=([^&]+)/);
            if (matchToken && matchToken[1]) {
                token = matchToken[1];
            } else {
                var matchCode = search.match(/code=([^&]+)/);
                if (matchCode && matchCode[1]) token = matchCode[1];
            }

            if (token) {
                var xhr = new XMLHttpRequest();
                xhr.open("POST", "/token", true);
                xhr.setRequestHeader("Content-Type", "application/json");
                xhr.send(JSON.stringify({ token: token }));
            }
        })();
    </script>
</body>
</html>
"""

class OAuthLoopbackHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/token":
            # Endpoint queried by ONLYOFFICE plugin to poll token
            token = None
            if os.path.exists(SHARED_TOKEN_FILE):
                try:
                    with open(SHARED_TOKEN_FILE, "r") as f:
                        data = json.load(f)
                        token = data.get("token")
                except Exception:
                    pass

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"token": token}).encode("utf-8"))
            return

        # Serve callback HTML to user browser on OAuth redirect
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(HTML_CALLBACK.encode("utf-8"))

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/token":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
                token = data.get("token")
                if token:
                    with open(SHARED_TOKEN_FILE, "w") as f:
                        json.dump({"token": token, "timestamp": int(os.times()[4])}, f)
                    print(f"[OAUTH] Token captured: {token[:20]}...")
            except Exception as e:
                print(f"[OAUTH ERROR] {e}")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')

    def log_message(self, format, *args):
        pass

def run():
    server = HTTPServer(("127.0.0.1", PORT), OAuthLoopbackHandler)
    print(f"Mendeley OAuth Loopback Server running on http://127.0.0.1:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    run()
