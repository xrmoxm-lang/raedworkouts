"""A public endpoint must not believe Content-Length.

Added 2026-09-04. read_json_body() read exactly what the header claimed. The
service is reachable from the open internet through the Tailscale funnel, and the
body is read BEFORE auth is checked, so anyone could send
`Content-Length: 5000000000` and make the box try to pull five gigabytes into
memory — a one-line denial of service against his home server with no
credentials. A non-numeric header raised ValueError and became a 500.
"""
import importlib.util
import pathlib

_SPEC = importlib.util.spec_from_file_location(
    "raedsync", pathlib.Path(__file__).resolve().parents[1] / "raedsync.py")
raedsync = importlib.util.module_from_spec(_SPEC)
try:
    _SPEC.loader.exec_module(raedsync)
except SystemExit:
    pass

_HANDLER = next(
    obj for obj in vars(raedsync).values()
    if isinstance(obj, type) and hasattr(obj, "read_json_body"))


class _Rfile:
    def __init__(self):
        self.asked = None

    def read(self, n):
        self.asked = n
        return b'{"a":1}'


class _Req:
    def __init__(self, content_length):
        self.headers = {"content-length": content_length}
        self.rfile = _Rfile()


def _call(content_length):
    req = _Req(content_length)
    body = _HANDLER.read_json_body(req)
    return body, req.rfile.asked


def test_a_lying_content_length_is_never_read():
    body, asked = _call("5000000000")
    assert asked is None, "the socket must not be read at all for an absurd length"
    assert body == {}


def test_a_non_numeric_content_length_does_not_raise():
    body, asked = _call("not-a-number")
    assert body == {}
    assert asked is None


def test_a_negative_content_length_is_rejected():
    body, asked = _call("-1")
    assert body == {}
    assert asked is None


def test_an_honest_body_still_reads_normally():
    body, asked = _call("7")
    assert asked == 7
    assert body == {"a": 1}


def test_the_cap_is_far_above_a_real_push():
    # His whole state is ~4.5 MB after three years of training.
    assert raedsync.MAX_BODY_BYTES >= 16 * 1024 * 1024


def test_a_flood_of_bad_auth_cannot_lock_out_the_real_token():
    """rate_limited() is keyed by user_id alone, and it used to be checked BEFORE
    the credential — so anyone reaching this public service could send eight bad
    requests for "raed-v16" and stop his phone syncing a finished workout for
    fifteen minutes, with no credential at all.
    """
    import sqlite3
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    con.execute("create table users (user_id text, pin_hash text, pin_salt text, pin_set_at text)")

    token = raedsync.read_token()
    if not token:
        return  # no token configured in this environment; nothing to assert

    raedsync._failed_auth.clear()
    for _ in range(12):
        raedsync.record_failed("raed-v16")
    assert raedsync.rate_limited("raed-v16") is True, "the counter must actually be hot"

    ok, why = raedsync.auth_ok(con, "raed-v16", {"authorization": f"Bearer {token}"})
    assert ok is True, "a correct token must still be accepted while the counter is hot"

    bad, why_bad = raedsync.auth_ok(con, "raed-v16", {"authorization": "Bearer wrong"})
    assert bad is False and why_bad == "rate", "a wrong token while throttled is still refused"
