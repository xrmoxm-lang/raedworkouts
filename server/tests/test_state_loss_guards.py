"""The two ways the server itself could delete Raed's training, 2026-09-23.

1. `merge_states` resolved a same-key active session by last-writer-wins on the
   whole blob, with none of the completed_sets care it applies to history. A
   second client pushing an older copy of the session he is training deleted the
   sets logged since — and the merged copy was handed back for his phone to
   apply mid-workout.

2. The fast path writes an incoming state verbatim whenever `base_rev` matches
   the head. A device whose local blob was truncated boots on `defaultState()`,
   which carries `history: []` — indistinguishable, to the old `looks_partial`
   guard, from "he deleted his last session" — and pushes it with a matching
   base_rev. Measured: 12 sessions and 21 PRs replaced by nothing.

Run: python3 -m unittest server.tests.test_state_loss_guards
"""
from __future__ import annotations

import copy
import importlib.util
import json
import os
import pathlib
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

TOKEN = "test-token-not-a-secret"


def _load_raedsync(db_path: pathlib.Path):
    """Import raedsync.py against a throwaway DB.

    Its DB path, token and allowlist are module-level constants read from the
    environment at import time, so the environment has to be set first and the
    module loaded fresh per test class.
    """
    os.environ["RAEDSYNC_DB"] = str(db_path)
    os.environ["RAEDSYNC_TOKEN"] = TOKEN
    os.environ["RAEDSYNC_ALLOWLIST"] = str(db_path.parent / "allowlist.json")
    os.environ["RAEDSYNC_HOME"] = str(db_path.parent)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # canonical_user_id(allow_create=True) refuses a user that is not allowlisted.
    (db_path.parent / "allowlist.json").write_text(json.dumps(
        {"users": {"raed-guard-v16": {"display_name": "Raed", "experience": "detrained"}}}))
    spec = importlib.util.spec_from_file_location(
        "raedsync_under_test", pathlib.Path(__file__).resolve().parents[1] / "raedsync.py")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except SystemExit:  # the module guards a __main__ server start
        pass
    return module


HEAD_AT = "2026-09-23T17:40:00Z"
OLDER_AT = "2026-09-23T17:20:00Z"


def session_with(sets: int, session_id="upper_a", started_at="2026-09-23T17:00:00Z") -> dict:
    return {
        "session_id": session_id,
        "started_at": started_at,
        "uid": "u-" + session_id,
        "exercises": {
            "chest_press_machine": {
                "sets": [
                    {"is_warmup": False, "weight": 40, "reps": 10, "completed": True}
                    for _ in range(sets)
                ]
            }
        },
    }


class ActiveSessionMergeTests(unittest.TestCase):
    """The live session must be merged like history, not like a scalar."""

    @classmethod
    def setUpClass(cls):
        cls._dir = tempfile.TemporaryDirectory()
        cls.raedsync = _load_raedsync(pathlib.Path(cls._dir.name) / "merge.db")

    @classmethod
    def tearDownClass(cls):
        cls._dir.cleanup()

    def test_an_older_copy_of_the_same_session_never_deletes_logged_sets(self):
        head = {"history": [], "active_session": session_with(5)}
        incoming = {"history": [], "active_session": session_with(2)}
        out = self.raedsync.merge_states(head, incoming, HEAD_AT, OLDER_AT)
        self.assertEqual(
            self.raedsync.completed_sets(out["active_session"]), 5,
            "a second client's stale copy must not delete the three sets logged since")
        self.assertEqual(out["history"], [], "and the live session is not archived behind his back")

    def test_a_newer_copy_with_more_sets_still_wins(self):
        head = {"history": [], "active_session": session_with(2)}
        incoming = {"history": [], "active_session": session_with(5)}
        out = self.raedsync.merge_states(head, incoming, OLDER_AT, HEAD_AT)
        self.assertEqual(self.raedsync.completed_sets(out["active_session"]), 5)

    def test_equal_evidence_is_settled_by_the_clock(self):
        # Same count, different content: the newer writer wins, which is the old
        # behaviour and is correct when neither side has more work.
        head = {"history": [], "active_session": session_with(3)}
        incoming = copy.deepcopy(head)
        incoming["active_session"]["exercises"]["chest_press_machine"]["sets"][0]["weight"] = 45
        out = self.raedsync.merge_states(head, incoming, OLDER_AT, HEAD_AT)
        self.assertEqual(
            out["active_session"]["exercises"]["chest_press_machine"]["sets"][0]["weight"], 45)

    def test_a_deliberate_finish_still_clears_the_session(self):
        # The tombstone path must survive the new branch: this is the 2026-09-04
        # regression that test_merge_active_session.py exists for.
        head = {"history": [], "active_session": session_with(5)}
        key = self.raedsync.session_key(head["active_session"])
        out = self.raedsync.merge_states(
            head,
            {"history": [dict(session_with(5), ended_at=HEAD_AT)], "active_session": None,
             "active_cleared": {"key": key, "at": HEAD_AT}},
            OLDER_AT, HEAD_AT)
        self.assertIsNone(out["active_session"])


class EmptyStateFastPathTests(unittest.TestCase):
    """A body with no training evidence may never replace a head that has some."""

    @classmethod
    def setUpClass(cls):
        cls._dir = tempfile.TemporaryDirectory()
        cls.raedsync = _load_raedsync(pathlib.Path(cls._dir.name) / "post.db")
        cls.raedsync.init_db()
        cls.httpd = cls.raedsync.ThreadingHTTPServer(("127.0.0.1", 0), cls.raedsync.Handler)
        cls.base = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls._dir.cleanup()

    def post(self, state, base_rev=None, mode=None, updated_at=HEAD_AT):
        body = {
            "user_id": "raed-guard-v16",
            "state_json": state,
            "settings_json": {"lang": "ar"},
            "updated_at": updated_at,
            "base_rev": base_rev,
        }
        if mode:
            body["mode"] = mode
        request = urllib.request.Request(
            self.base + "/state", data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + TOKEN},
            method="POST")
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())

    def head_state(self):
        request = urllib.request.Request(
            self.base + "/state?user=raed-guard-v16",
            headers={"Authorization": "Bearer " + TOKEN})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())["state_json"]

    def test_a_defaultstate_push_with_a_matching_base_rev_does_not_wipe_the_head(self):
        seeded = {
            "history": [dict(session_with(4, session_id="upper_a"), ended_at="2026-09-20T18:00:00Z"),
                        dict(session_with(4, session_id="lower_b",
                                          started_at="2026-09-21T17:00:00Z"), ended_at="2026-09-21T18:00:00Z")],
            "prs": {"chest_press_machine": {"kg": 60, "reps": 8, "score": 74}},
            "bodyweight_log": [{"date": "2026-09-20", "kg": 82}],
            "exercise_prefs": {"chest_press_machine": {"equipment": "machine"}},
            "active_session": None,
        }
        first = self.post(seeded, base_rev=None)
        self.assertEqual(len(self.head_state()["history"]), 2)

        # Exactly what a phone that lost its local blob sends: defaultState(),
        # `history: []` present, and the base_rev of the last good sync.
        empty = {"history": [], "prs": {}, "bodyweight_log": [], "custom_exercises": [],
                 "exercise_prefs": {}, "substitutions": [], "active_session": None,
                 "current_week": 1, "current_block": 1, "msg_index": 0}
        answer = self.post(empty, base_rev=first["rev"], updated_at="2026-09-23T18:00:00Z")
        self.assertTrue(answer["merged"], "an evidence-free body must be merged, never written verbatim")

        head = self.head_state()
        self.assertEqual(len(head["history"]), 2, "his two sessions must survive an empty push")
        self.assertEqual(head["prs"]["chest_press_machine"]["score"], 74, "and so must his PRs")
        # And the merged state is handed back, so the phone that lost its copy
        # gets it returned on the same request.
        self.assertEqual(len(answer["state_json"]["history"]), 2)

    def test_deleting_a_session_still_works(self):
        # The guard must not turn a real delete into an undo. A client that
        # deleted one of two sessions still carries its PRs and its equipment
        # memory, so it has training evidence and keeps the fast path.
        seeded = {
            "history": [dict(session_with(4, session_id="upper_a"), ended_at="2026-09-20T18:00:00Z"),
                        dict(session_with(4, session_id="lower_b",
                                          started_at="2026-09-21T17:00:00Z"), ended_at="2026-09-21T18:00:00Z")],
            "prs": {"chest_press_machine": {"kg": 60, "reps": 8, "score": 74}},
            "bodyweight_log": [{"date": "2026-09-20", "kg": 82}],
            "active_session": None,
        }
        first = self.post(seeded, base_rev=None, updated_at="2026-09-22T10:00:00Z")
        kept = copy.deepcopy(seeded)
        kept["history"] = [seeded["history"][0]]
        answer = self.post(kept, base_rev=first["rev"], updated_at="2026-09-22T11:00:00Z")
        self.assertFalse(answer["merged"], "a delete with the right base_rev is still a verbatim write")
        self.assertEqual(len(self.head_state()["history"]), 1, "the deleted session must stay deleted")

    def test_an_explicit_restore_may_still_replace_everything(self):
        # mode=replace is him choosing — restore a revision, import a file, undo.
        self.post({"history": [dict(session_with(4), ended_at="2026-09-20T18:00:00Z")],
                   "prs": {"x": {"score": 3}}}, base_rev=None, updated_at="2026-09-22T12:00:00Z")
        answer = self.post({"history": [], "prs": {}}, base_rev=None, mode="replace",
                           updated_at="2026-09-22T13:00:00Z")
        self.assertTrue(answer["replaced"])
        self.assertEqual(self.head_state()["history"], [])


class HistoryTombstoneTests(EmptyStateFastPathTests):
    """A deleted history session never resurrects through a merge (2026-09-25).

    The pre-existing test above proves a delete only when the deleting client's
    base_rev MATCHES the head (verbatim fast path). These are the stale cases
    CODEX-AUDIT-2026-09-25.md «NOT DONE» #1 names: a stale device pushing its
    pre-delete copy, and a delete that itself lands on a stale head row.
    """

    USER_STATE = None

    def seeded(self):
        return {
            "history": [dict(session_with(4, session_id="upper_a", started_at="2026-09-20T17:00:00Z"),
                             ended_at="2026-09-20T18:00:00Z"),
                        dict(session_with(4, session_id="lower_b", started_at="2026-09-21T17:00:00Z"),
                             ended_at="2026-09-21T18:00:00Z")],
            "prs": {"chest_press_machine": {"kg": 60, "reps": 8, "score": 74}},
            "bodyweight_log": [{"date": "2026-09-20", "kg": 82}],
            "active_session": None,
        }

    def tombstone(self, sess, at="2026-09-25T10:00:00Z"):
        return {"target_type": "session", "target_id": sess["uid"],
                "key": self.raedsync.session_key(sess), "deleted_at": at}

    def setUp(self):
        # Every test starts from a clean head via an explicit replace.
        self.first = self.post(self.seeded(), base_rev=None, mode="replace", updated_at="2026-09-24T10:00:00Z")

    def test_a_stale_device_pushing_its_pre_delete_copy_does_not_resurrect_the_session(self):
        seeded = self.seeded()
        doomed = seeded["history"][1]
        deleted = copy.deepcopy(seeded)
        deleted["history"] = [seeded["history"][0]]
        deleted["history_tombstones"] = [self.tombstone(doomed)]
        self.post(deleted, base_rev=self.first["rev"], updated_at="2026-09-25T10:00:00Z")
        self.assertEqual([h["session_id"] for h in self.head_state()["history"]], ["upper_a"])

        # The phone that never saw the delete: old base_rev, full history, and a
        # NEWER clock — the worst case for a union.
        answer = self.post(self.seeded(), base_rev=self.first["rev"], updated_at="2026-09-25T11:00:00Z")
        self.assertTrue(answer["merged"])
        head = self.head_state()
        self.assertEqual([h["session_id"] for h in head["history"]], ["upper_a"],
                         "a stale device must not bring a deleted session back")
        self.assertEqual(len(head["history_tombstones"]), 1, "the head keeps the tombstone")
        self.assertEqual([h["session_id"] for h in answer["state_json"]["history"]], ["upper_a"],
                         "and the stale device is handed the delete on the same request")

    def test_a_delete_that_lands_on_a_stale_head_row_still_deletes(self):
        # Another device pushed in between, so the deleting client's base_rev
        # is stale and its push goes through merge, where head still HAS it.
        seeded = self.seeded()
        other = copy.deepcopy(seeded)
        other["bodyweight_log"].append({"date": "2026-09-24", "kg": 81.5})
        self.post(other, base_rev=self.first["rev"], updated_at="2026-09-24T12:00:00Z")
        deleted = copy.deepcopy(seeded)
        deleted["history"] = [seeded["history"][0]]
        deleted["history_tombstones"] = [self.tombstone(seeded["history"][1])]
        answer = self.post(deleted, base_rev=self.first["rev"], updated_at="2026-09-25T10:00:00Z")
        self.assertTrue(answer["merged"])
        self.assertEqual([h["session_id"] for h in self.head_state()["history"]], ["upper_a"],
                         "the stale head row must not undo the delete")

    def test_a_stale_copy_under_another_uid_is_matched_by_session_key(self):
        seeded = self.seeded()
        deleted = copy.deepcopy(seeded)
        deleted["history"] = [seeded["history"][0]]
        deleted["history_tombstones"] = [self.tombstone(seeded["history"][1])]
        self.post(deleted, base_rev=self.first["rev"], updated_at="2026-09-25T10:00:00Z")
        stale = self.seeded()
        stale["history"][1]["uid"] = "sess-backfilled-elsewhere"
        stale["history"][1]["exercises"]["chest_press_machine"]["sets"].append(
            {"is_warmup": False, "weight": 40, "reps": 10, "completed": True})
        self.post(stale, base_rev=self.first["rev"], updated_at="2026-09-25T11:00:00Z")
        self.assertEqual([h["session_id"] for h in self.head_state()["history"]], ["upper_a"])

    def test_a_stale_device_holding_the_deleted_session_as_live_does_not_revive_it(self):
        seeded = self.seeded()
        doomed = seeded["history"][1]
        deleted = copy.deepcopy(seeded)
        deleted["history"] = [seeded["history"][0]]
        deleted["history_tombstones"] = [self.tombstone(doomed)]
        self.post(deleted, base_rev=self.first["rev"], updated_at="2026-09-25T10:00:00Z")
        stale = self.seeded()
        stale["history"] = [seeded["history"][0]]
        live = copy.deepcopy(doomed)
        live.pop("ended_at", None)
        stale["active_session"] = live
        self.post(stale, base_rev=self.first["rev"], updated_at="2026-09-25T11:00:00Z")
        head = self.head_state()
        self.assertIsNone(head.get("active_session"))
        self.assertEqual([h["session_id"] for h in head["history"]], ["upper_a"])

    def test_a_restored_session_survives_a_stale_tombstone(self):
        seeded = self.seeded()
        doomed = seeded["history"][1]
        tomb = self.tombstone(doomed)
        restored = self.seeded()
        restored["history"][1]["revived_at"] = "2026-09-25T12:00:00Z"
        restored["history_tombstones"] = [tomb]
        self.post(restored, base_rev=None, mode="replace", updated_at="2026-09-25T12:00:00Z")
        stale = self.seeded()
        stale["history"] = [seeded["history"][0]]
        stale["history_tombstones"] = [tomb]
        self.post(stale, base_rev=self.first["rev"], updated_at="2026-09-25T13:00:00Z")
        self.assertEqual(len(self.head_state()["history"]), 2, "a session he restored must stay restored")

    def test_old_clients_without_tombstones_merge_exactly_as_before(self):
        head = self.seeded()
        incoming = {"history": [dict(session_with(3, session_id="upper_b", started_at="2026-09-22T17:00:00Z"),
                                     ended_at="2026-09-22T18:00:00Z")]}
        out = self.raedsync.merge_states(head, incoming, OLDER_AT, HEAD_AT)
        self.assertEqual([h["session_id"] for h in out["history"]], ["upper_a", "lower_b", "upper_b"])
        self.assertNotIn("history_tombstones", out)

    # The inherited HTTP tests are not re-run here.
    test_a_defaultstate_push_with_a_matching_base_rev_does_not_wipe_the_head = None
    test_deleting_a_session_still_works = None
    test_an_explicit_restore_may_still_replace_everything = None


if __name__ == "__main__":
    unittest.main()
