"""The sync merge must honour a session the user deliberately ended.

Added 2026-09-04 after the audit. The client sends `active_session: null` when it
finishes or discards a session, and the server could not tell that apart from
"this writer has no session running", so it restored its own copy. Measured
against merge_states itself: finishing put the session in history AND handed it
back as in-progress, so finishing again duplicated it and double-counted the
weekly volume; discarding one simply undid the discard.

The client now stamps `active_cleared: {key, at}`. Only the session it names is
cleared.
"""
import importlib.util
import pathlib

_SPEC = importlib.util.spec_from_file_location(
    "raedsync", pathlib.Path(__file__).resolve().parents[1] / "raedsync.py")
raedsync = importlib.util.module_from_spec(_SPEC)
try:
    _SPEC.loader.exec_module(raedsync)
except SystemExit:  # the module guards a __main__ server start
    pass

HEAD_AT = "2026-09-04T09:00:00Z"
INCOMING_AT = "2026-09-04T09:30:00Z"
SESSION = {
    "session_id": "upper_a",
    "started_at": HEAD_AT,
    "uid": "u1",
    "exercises": {
        "chest_press_machine": {
            "sets": [{"is_warmup": False, "weight": 40, "reps": 10, "completed": True}]
        }
    },
}
KEY = f"{HEAD_AT}|upper_a"


def _merge(incoming):
    return raedsync.merge_states(
        {"history": [], "active_session": dict(SESSION)}, incoming, HEAD_AT, INCOMING_AT)


def test_a_finished_session_is_not_handed_back_as_in_progress():
    out = _merge({
        "history": [dict(SESSION, ended_at=INCOMING_AT)],
        "active_session": None,
        "active_cleared": {"key": KEY, "at": INCOMING_AT},
    })
    assert out["active_session"] is None, "finishing must not restore the session as in-progress"
    assert len(out["history"]) == 1, "and it must appear exactly once, not twice"


def test_a_discarded_session_stays_discarded():
    out = _merge({
        "history": [],
        "active_session": None,
        "active_cleared": {"key": KEY, "at": INCOMING_AT},
    })
    assert out["active_session"] is None
    assert out["history"] == [], "a discard is intent; it must not reappear in history either"


def test_another_devices_live_session_is_never_cleared_by_an_unrelated_tombstone():
    other = dict(SESSION, session_id="lower_b", started_at="2026-09-04T11:00:00Z")
    out = raedsync.merge_states(
        {"history": [], "active_session": other},
        {"history": [], "active_session": None,
         "active_cleared": {"key": KEY, "at": INCOMING_AT}},
        HEAD_AT, INCOMING_AT)
    assert out["active_session"] is not None, "only the named session may be cleared"
    assert out["active_session"]["session_id"] == "lower_b"


def test_a_client_that_sends_no_tombstone_keeps_the_old_behaviour():
    # An older app build still in someone's browser must not start losing its
    # session because the server learned a new field.
    out = _merge({"history": [], "active_session": None})
    assert out["active_session"] is not None
