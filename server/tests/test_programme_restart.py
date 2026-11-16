"""Round 8 (2026-11-16): `programme_restart: {at, cycle}` survives the sync merge.

Raed restarts the programme clock («ودي نعيد الخمسة weeks») on one device. A
stale device whose push is merely NEWER must not undo it, and a client that
never heard of the key must not erase it: the restart with the later `at` wins,
from either side. Mirrors domain/state-merge.js mergeProgrammeRestart.
"""
import importlib.util
import pathlib
import unittest

_SPEC = importlib.util.spec_from_file_location(
    "raedsync_restart", pathlib.Path(__file__).resolve().parents[1] / "raedsync.py")
raedsync = importlib.util.module_from_spec(_SPEC)
try:
    _SPEC.loader.exec_module(raedsync)
except SystemExit:  # the module guards a __main__ server start
    pass

OLDER_PUSH = "2026-11-16T09:00:00Z"
NEWER_PUSH = "2026-11-16T12:00:00Z"
EARLY = {"at": "2026-11-16T10:00:00.000Z", "cycle": 2}
LATE = {"at": "2026-11-16T11:00:00.000Z", "cycle": 3}


def _merge(head_restart, incoming_restart, head_at=OLDER_PUSH, incoming_at=NEWER_PUSH):
    head = {"history": []}
    incoming = {"history": []}
    if head_restart is not ...:
        head["programme_restart"] = head_restart
    if incoming_restart is not ...:
        incoming["programme_restart"] = incoming_restart
    return raedsync.merge_states(head, incoming, head_at, incoming_at)


class ProgrammeRestartMergeTests(unittest.TestCase):
    def test_a_newer_push_without_the_restart_does_not_undo_it(self):
        out = _merge(LATE, None)
        self.assertEqual(out.get("programme_restart"), LATE)

    def test_a_newer_push_from_an_old_client_that_never_sends_the_key(self):
        out = _merge(LATE, ...)
        self.assertEqual(out.get("programme_restart"), LATE)

    def test_the_later_restart_wins_when_the_head_holds_it(self):
        out = _merge(LATE, EARLY)
        self.assertEqual(out["programme_restart"], LATE, "a stale device's earlier restart must not win by pushing last")

    def test_the_later_restart_wins_when_the_incoming_holds_it(self):
        out = _merge(EARLY, LATE, head_at=NEWER_PUSH, incoming_at=OLDER_PUSH)
        self.assertEqual(out["programme_restart"], LATE)

    def test_sanitize_state_keeps_the_key(self):
        clean = raedsync.sanitize_state({"programme_restart": LATE, "history": []})
        self.assertEqual(clean.get("programme_restart"), LATE)

    def test_no_restart_anywhere_stays_absent_or_null(self):
        out = _merge(..., ...)
        self.assertIsNone(out.get("programme_restart"))


if __name__ == "__main__":
    unittest.main()
