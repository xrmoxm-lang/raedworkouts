"""The coach's $25/month ceiling must fail CLOSED (2026-09-25).

`month_spend_usd()` used to return 0.0 whenever the spend ledger could not be
read, so a locked or corrupt spend.sqlite3 turned the «hard ceiling» into no
ceiling at all — on a key that ships in public JavaScript
(CODEX-AUDIT-2026-09-25.md «NOT DONE» #2). An unreadable ledger now refuses the
paid call with `answer.status == "spend_unverified"`; retrieval (his books,
local and free) still answers.

Run: python3 -m unittest server.tests.test_coach_spend_cap
"""
from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
import types
import unittest
import urllib.request


def _load_coach(root: pathlib.Path):
    # coach-service.py imports its helpers from the HP-only `ingest` module
    # (not in this repo). Only ROOT matters here: it decides where the spend
    # ledger lives, so it is pointed at a throwaway directory.
    fake = types.ModuleType("ingest")
    fake.DEFAULT_MODEL = "test-model"
    fake.DEFAULT_RSS_CEILING_MB = 1024
    fake.ROOT = root
    fake.normalise_vector = lambda v: v
    fake.ps_rss_mb = lambda: 0.0
    previous = sys.modules.get("ingest")
    sys.modules["ingest"] = fake
    try:
        spec = importlib.util.spec_from_file_location(
            "coach_service_under_test", pathlib.Path(__file__).resolve().parents[1] / "coach-service.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        if previous is None:
            sys.modules.pop("ingest", None)
        else:
            sys.modules["ingest"] = previous
    return module


class _Retriever:
    chunk_count = 1

    def search(self, question, top_k, min_score):
        return [{"chunk_id": "book:1", "text": "Progressive overload.", "score": 0.9}]


class CoachSpendCapTests(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self._dir.name)
        self.coach = _load_coach(self.root)
        self.coach.SPEND_CAP_USD = 25.0
        self.paid_calls = []
        self.coach.write_answer = lambda *a, **k: self.paid_calls.append(a) or {
            "status": "ok", "answered": True, "text": "x", "used": ["book:1"]}

    def tearDown(self):
        self._dir.cleanup()

    def break_ledger(self):
        # A directory where the sqlite file should be: sqlite3 cannot open it,
        # exactly like a corrupt or permission-locked ledger.
        self.coach.SPEND_DB = self.root / "spend-broken"
        self.coach.SPEND_DB.mkdir()

    def post_answer(self):
        httpd = self.coach.ThreadingHTTPServer(("127.0.0.1", 0), self.coach.Handler)
        httpd.retriever = _Retriever()
        httpd.allowed_origins = set()
        httpd.access_key = ""
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            request = urllib.request.Request(
                "http://127.0.0.1:%d/answer" % httpd.server_address[1],
                data=json.dumps({"question": "how many sets per week?"}).encode(),
                headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(request, timeout=10) as response:
                return json.loads(response.read())
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_an_unreadable_ledger_refuses_the_paid_call(self):
        self.break_ledger()
        self.assertTrue(self.coach.over_spend_cap(), "unknown spend must count as over the ceiling")
        answer = self.post_answer()
        self.assertEqual(self.paid_calls, [], "no paid model call may be made on an unreadable ledger")
        self.assertEqual(answer["answer"]["status"], "spend_unverified")
        self.assertNotIn("month_usd", answer["answer"], "no invented spend figure")
        self.assertEqual(len(answer["results"]), 1, "his books still answer")

    def test_a_readable_ledger_under_the_cap_still_answers(self):
        answer = self.post_answer()
        self.assertEqual(len(self.paid_calls), 1)
        self.assertEqual(answer["answer"]["status"], "ok")

    def test_a_ledger_at_the_cap_reports_over_budget_with_the_figure(self):
        self.coach.record_spend("m", "answer", 1, 1, 30.0)
        answer = self.post_answer()
        self.assertEqual(self.paid_calls, [])
        self.assertEqual(answer["answer"]["status"], "over_budget")
        self.assertEqual(answer["answer"]["month_usd"], 30.0)


if __name__ == "__main__":
    unittest.main()
