import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "mendeley-loopback-server.py"
SPEC = importlib.util.spec_from_file_location("mendeley_loopback_server", MODULE_PATH)
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class LoopbackServerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.token_path = Path(self.temp_dir.name) / "token.json"
        self.server = SERVER.create_server("127.0.0.1", 0, self.token_path)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = "http://127.0.0.1:{}".format(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp_dir.cleanup()

    def test_health_endpoint_identifies_helper_for_launcher_reuse(self):
        with urlopen(self.base_url + "/health") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response), {"service": "mendeley-loopback", "status": "ok"})

    def test_token_endpoint_persists_owner_only_token(self):
        request = Request(
            self.base_url + "/token",
            data=json.dumps({"token": "secret-token"}).encode(),
            headers={"Content-Type": "application/json", "Origin": "null"},
            method="POST",
        )
        with urlopen(request) as response:
            self.assertEqual(json.load(response), {"status": "ok"})
        self.assertEqual(json.loads(self.token_path.read_text())["token"], "secret-token")
        if os.name != "nt":
            self.assertEqual(self.token_path.stat().st_mode & 0o777, 0o600)

    def test_token_endpoint_rejects_unapproved_origin(self):
        request = Request(
            self.base_url + "/token",
            data=b'{"token":"secret-token"}',
            headers={"Content-Type": "application/json", "Origin": "https://attacker.invalid"},
            method="POST",
        )
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 403)
        error.exception.close()
        self.assertFalse(self.token_path.exists())

    def test_delete_endpoint_clears_previous_login_token(self):
        SERVER.write_token(self.token_path, "stale-token")
        request = Request(
            self.base_url + "/token",
            headers={"Origin": "null"},
            method="DELETE",
        )
        with urlopen(request) as response:
            self.assertEqual(json.load(response), {"status": "cleared"})
        self.assertFalse(self.token_path.exists())
    def test_startup_reuses_running_mendeley_server(self):
        self.assertIsNone(
            SERVER.start_or_reuse_server("127.0.0.1", self.server.server_port, self.token_path)
        )
    def test_stop_command_stops_only_healthy_mendeley_helper(self):
        self.assertTrue(SERVER.stop_server(self.server.server_port))
        self.thread.join(timeout=2)
        self.assertFalse(self.thread.is_alive())



if __name__ == "__main__":
    unittest.main()
