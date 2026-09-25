"""Three Round 5 server findings that were reported and left open
(V17-CHECKLIST.md:202-204; CODEX-AUDIT-2026-09-25.md «NOT DONE» #3), fixed
2026-09-25:

1. `_failed_auth` grew by one entry per attacker-chosen user_id — rate_limited()
   stored even EMPTY lists and pruned only the key it was asked about.
2. An unauthenticated request could make the box read up to 32 MB, because the
   body was read before auth. Now a request without a valid bearer header is
   capped at 64 KiB (the browser's own sendBeacon/keepalive quota) and an
   oversized one is refused 413 without reading a byte.
3. HTTP 500 echoed the exception text to the open internet.

Run: python3 -m unittest server.tests.test_server_hardening
"""
from __future__ import annotations

import json
import pathlib
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from server.tests.test_state_loss_guards import TOKEN, _load_raedsync, session_with

USER = "raed-guard-v16"


class FailedAuthBoundTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._dir = tempfile.TemporaryDirectory()
        cls.rs = _load_raedsync(pathlib.Path(cls._dir.name) / "auth.db")

    @classmethod
    def tearDownClass(cls):
        cls._dir.cleanup()

    def setUp(self):
        self.rs._failed_auth.clear()
        self.rs._failed_auth_swept_at[0] = 0.0

    def test_asking_about_a_name_stores_nothing(self):
        for i in range(5000):
            self.assertFalse(self.rs.rate_limited(f"probe-{i}"))
        self.assertEqual(len(self.rs._failed_auth), 0,
                         "a name that never failed must not occupy the table")

    def test_failures_across_many_names_stay_under_the_ceiling(self):
        for i in range(5000):
            self.rs.record_failed(f"attacker-{i}")
        self.assertLessEqual(len(self.rs._failed_auth), self.rs.FAILED_AUTH_MAX_KEYS)

    def test_expired_entries_are_swept_without_being_queried_again(self):
        old = self.rs.time.time() - self.rs.FAILED_AUTH_WINDOW_S - 5
        for i in range(50):
            self.rs._failed_auth[f"old-{i}"] = [old]
        self.rs._failed_auth_swept_at[0] = 0.0
        self.rs.record_failed("someone-new")
        self.assertEqual(list(self.rs._failed_auth), ["someone-new"])

    def test_one_key_keeps_a_bounded_list_and_still_throttles(self):
        for _ in range(1000):
            self.rs.record_failed(USER)
        self.assertLessEqual(len(self.rs._failed_auth[USER.lower()]), self.rs.FAILED_AUTH_THRESHOLD * 2)
        self.assertTrue(self.rs.rate_limited(USER))


class HttpHardeningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._dir = tempfile.TemporaryDirectory()
        cls.rs = _load_raedsync(pathlib.Path(cls._dir.name) / "http.db")
        cls.rs.init_db()
        cls.httpd = cls.rs.ThreadingHTTPServer(("127.0.0.1", 0), cls.rs.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.base = "http://127.0.0.1:%d" % cls.port
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls._dir.cleanup()

    def post(self, body: bytes, headers: dict):
        request = urllib.request.Request(self.base + "/state", data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def big_state(self, target_bytes: int) -> dict:
        state = {"history": [dict(session_with(4), ended_at="2026-09-20T18:00:00Z")],
                 "prs": {"x": {"score": 1}}, "notes_pad": "x" * target_bytes}
        return state

    def test_an_unauthenticated_oversized_body_is_refused_without_being_read(self):
        # Raw socket: declare 1 MB, send only the headers. A server that reads
        # before deciding would block here waiting for the body; the fixed one
        # answers 413 at once.
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as sock:
            sock.sendall(b"POST /state HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n"
                         b"Content-Length: 1048576\r\n\r\n")
            reply = sock.recv(4096).decode("latin-1")
        self.assertIn(" 413 ", reply.splitlines()[0])
        self.assertIn("payload_too_large", reply)

    def test_a_wrong_bearer_does_not_unlock_the_big_limit(self):
        body = json.dumps({"user_id": USER, "state_json": self.big_state(200_000)}).encode()
        status, answer = self.post(body, {"Content-Type": "application/json", "Authorization": "Bearer nope"})
        self.assertEqual(status, 413)

    def test_an_authenticated_full_state_push_above_the_pre_auth_cap_still_works(self):
        body = json.dumps({"user_id": USER, "state_json": self.big_state(200_000),
                           "settings_json": {}, "updated_at": "2026-09-25T10:00:00Z",
                           "mode": "replace"}).encode()
        self.assertGreater(len(body), self.rs.PRE_AUTH_MAX_BODY_BYTES)
        status, answer = self.post(body, {"Content-Type": "application/json", "Authorization": "Bearer " + TOKEN})
        self.assertEqual(status, 200, answer)

    def test_a_beacon_sized_body_with_its_token_in_the_body_still_works(self):
        body = json.dumps({"user_id": USER, "_auth_token": TOKEN,
                           "state_json": {"history": [dict(session_with(4), ended_at="2026-09-20T18:00:00Z")],
                                          "prs": {"x": {"score": 1}}},
                           "settings_json": {}, "updated_at": "2026-09-25T11:00:00Z"}).encode()
        self.assertLess(len(body), self.rs.PRE_AUTH_MAX_BODY_BYTES)
        status, answer = self.post(body, {"Content-Type": "text/plain"})
        self.assertEqual(status, 200, answer)

    def test_a_500_never_echoes_the_exception(self):
        secret = "/home/raed/raedsync/data.db sqlite3.OperationalError"
        original = self.rs.get_head

        def boom(*_a, **_k):
            raise RuntimeError(secret)

        self.rs.get_head = boom
        try:
            request = urllib.request.Request(self.base + "/state?user=" + USER,
                                             headers={"Authorization": "Bearer " + TOKEN})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request, timeout=10)
            text = caught.exception.read().decode()
            self.assertEqual(caught.exception.code, 500)
            self.assertNotIn("home/raed", text)
            self.assertNotIn("OperationalError", text)
            self.assertEqual(json.loads(text)["error"], "server_error")
            # POST path too.
            body = json.dumps({"user_id": USER, "state_json": {"history": []}}).encode()
            status, answer = self.post(body, {"Content-Type": "application/json", "Authorization": "Bearer " + TOKEN})
            self.assertEqual(status, 500)
            self.assertNotIn("home/raed", json.dumps(answer))
        finally:
            self.rs.get_head = original


if __name__ == "__main__":
    unittest.main()
