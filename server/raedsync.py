#!/usr/bin/env python3
"""Raedworkouts sync server v2.

Stdlib-only HTTP + SQLite. The server is the merge authority: every accepted
POST creates a revision, and stale/legacy POSTs are merged into the current
head instead of replacing it.
"""

from __future__ import annotations

import copy
import gzip
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse


HOST = os.environ.get("RAEDSYNC_HOST", "127.0.0.1")
PORT = int(os.environ.get("RAEDSYNC_PORT", "8790"))
ROOT = Path(os.environ.get("RAEDSYNC_HOME", "~/raedsync")).expanduser()
DB_PATH = Path(os.environ.get("RAEDSYNC_DB", str(ROOT / "data.db"))).expanduser()
TOKEN_FILE = Path(os.environ.get("RAEDSYNC_TOKEN_FILE", str(ROOT / "token"))).expanduser()
ALLOWLIST_PATH = Path(os.environ.get("RAEDSYNC_ALLOWLIST", str(ROOT / "allowlist.json"))).expanduser()
LEGACY_GRACE = timedelta(days=14)
MAX_USERS = 15

STATE_DENY = {"last_sync"}
SETTINGS_DENY = {
    "sync_key",
    "sync_url",
    "user_key",
    "last_rev",
    "pending_variant",
    "pending_registration",
    "needs_pin_reauth",
}

_allowlist_cache: dict[str, object] = {"mtime": None, "users": {}}
_failed_auth: dict[str, list[float]] = {}
_write_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime:
    if not value:
        return datetime.fromtimestamp(0, timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return datetime.fromtimestamp(0, timezone.utc)


def json_loads(value, default):
    if value is None:
        return copy.deepcopy(default)
    if isinstance(value, (dict, list)):
        return copy.deepcopy(value)
    try:
        return json.loads(value)
    except Exception:
        return copy.deepcopy(default)


def json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def read_token() -> str:
    token = os.environ.get("RAEDSYNC_TOKEN", "").strip()
    if token:
        return token
    try:
        return TOKEN_FILE.read_text().strip()
    except FileNotFoundError:
        return ""


def load_allowlist() -> dict[str, dict]:
    try:
        stat = ALLOWLIST_PATH.stat()
    except FileNotFoundError:
        _allowlist_cache["mtime"] = None
        _allowlist_cache["users"] = {}
        return {}
    if _allowlist_cache["mtime"] == stat.st_mtime:
        return _allowlist_cache["users"]  # type: ignore[return-value]
    try:
        data = json.loads(ALLOWLIST_PATH.read_text())
        users = {k.lower(): v for k, v in (data.get("users") or {}).items()}
    except Exception:
        users = {}
    _allowlist_cache["mtime"] = stat.st_mtime
    _allowlist_cache["users"] = users
    return users


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("pragma journal_mode=wal")
    con.execute("pragma busy_timeout=5000")
    return con


def init_db() -> None:
    with connect() as con:
        con.execute(
            """
            create table if not exists state (
              user_id text primary key,
              state_json text not null,
              settings_json text,
              updated_at text
            )
            """
        )
        con.execute(
            """
            create table if not exists revisions (
              id integer primary key autoincrement,
              user_id text not null,
              state_json text not null,
              settings_json text,
              updated_at text,
              server_at text not null
            )
            """
        )
        con.execute(
            """
            create table if not exists users (
              user_id text primary key,
              pin_salt text,
              pin_hash text,
              pin_set_at text,
              created_at text not null
            )
            """
        )
        con.execute("create index if not exists idx_revisions_user_id_id on revisions(user_id, id)")
        seed_missing_revisions(con)


def seed_missing_revisions(con: sqlite3.Connection) -> None:
    rows = con.execute(
        """
        select s.user_id, s.state_json, s.settings_json, s.updated_at
        from state s
        left join revisions r on r.user_id = s.user_id
        group by s.user_id
        having count(r.id) = 0
        """
    ).fetchall()
    server_at = now_iso()
    for row in rows:
        con.execute(
            "insert into revisions(user_id,state_json,settings_json,updated_at,server_at) values(?,?,?,?,?)",
            (row["user_id"], row["state_json"], row["settings_json"], row["updated_at"], server_at),
        )


def latest_rev(con: sqlite3.Connection, user_id: str) -> int | None:
    row = con.execute("select max(id) as rev from revisions where user_id=?", (user_id,)).fetchone()
    return int(row["rev"]) if row and row["rev"] is not None else None


def get_head(con: sqlite3.Connection, user_id: str):
    return con.execute("select * from state where user_id=?", (user_id,)).fetchone()


def sessions_count(state_obj: dict) -> int:
    return len(state_obj.get("history") or [])


def prefer_user_tile(candidate: dict, existing: dict | None) -> bool:
    if not existing:
        return True
    cand_sessions = int(candidate.get("sessions") or 0)
    exist_sessions = int(existing.get("sessions") or 0)
    if cand_sessions != exist_sessions:
        return cand_sessions > exist_sessions
    return parse_iso(candidate.get("updated_at")) >= parse_iso(existing.get("updated_at"))


def completed_sets(session: dict | None) -> int:
    if not isinstance(session, dict):
        return 0
    total = 0
    for ex in (session.get("exercises") or {}).values():
        total += sum(1 for s in (ex.get("sets") or []) if s.get("completed") and not s.get("is_warmup"))
    return total


def strip_obj(value, deny: set[str] | None = None):
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if str(k).startswith("_"):
                continue
            if deny and k in deny:
                continue
            out[k] = strip_obj(v, deny=None)
        return out
    if isinstance(value, list):
        return [strip_obj(v, deny=None) for v in value]
    return value


def sanitize_state(value) -> dict:
    state = strip_obj(json_loads(value, {}), deny=STATE_DENY)
    return state if isinstance(state, dict) else {}


def sanitize_settings(value) -> dict:
    settings = strip_obj(json_loads(value, {}), deny=SETTINGS_DENY)
    if not isinstance(settings, dict):
        return {}
    for key in SETTINGS_DENY:
        settings.pop(key, None)
    return settings


def pin_key(user_id: str, pin: str) -> str:
    return hashlib.sha256(f"{user_id.lower()}:{pin}".encode()).hexdigest()


def stored_pin_hash(salt: str, user_key: str) -> str:
    return hashlib.sha256((salt + user_key).encode()).hexdigest()


def is_legacy_allowed(user_row) -> bool:
    if not user_row or not user_row["pin_hash"]:
        return True
    pin_set_at = parse_iso(user_row["pin_set_at"])
    return datetime.now(timezone.utc) < pin_set_at + LEGACY_GRACE


def rate_limited(user_id: str) -> bool:
    key = user_id.lower()
    cutoff = time.time() - 15 * 60
    attempts = [t for t in _failed_auth.get(key, []) if t >= cutoff]
    _failed_auth[key] = attempts
    return len(attempts) >= 8


def record_failed(user_id: str) -> None:
    key = user_id.lower()
    _failed_auth.setdefault(key, []).append(time.time())


def clear_failed(user_id: str) -> None:
    _failed_auth.pop(user_id.lower(), None)


def auth_ok(con: sqlite3.Connection, user_id: str, headers, body: dict | None = None, require_legacy=False) -> tuple[bool, str]:
    if rate_limited(user_id):
        return False, "rate"
    token = read_token()
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    legacy = auth.startswith("Bearer ") and token and hmac.compare_digest(auth[7:].strip(), token)
    if body and not legacy:
        body_token = str(body.get("_auth_token") or "")
        legacy = bool(token and body_token and hmac.compare_digest(body_token, token))
    if require_legacy:
        if legacy:
            return True, "legacy"
        record_failed(user_id)
        return False, "auth"

    row = con.execute("select * from users where lower(user_id)=lower(?)", (user_id,)).fetchone()
    user_key = headers.get("x-user-key") or headers.get("X-User-Key") or ""
    if body and not user_key:
        user_key = str(body.get("_auth_user_key") or "")
    if row and row["pin_hash"]:
        expected = stored_pin_hash(row["pin_salt"], user_key)
        if user_key and hmac.compare_digest(expected, row["pin_hash"]):
            clear_failed(user_id)
            return True, "user"
        if legacy and is_legacy_allowed(row):
            clear_failed(user_id)
            return True, "legacy-grace"
        record_failed(user_id)
        return False, "auth"
    if legacy:
        clear_failed(user_id)
        return True, "legacy"
    record_failed(user_id)
    return False, "auth"


def validate_user_id(value: str) -> str:
    user_id = (value or "").strip()
    if not (1 <= len(user_id) <= 24):
        raise ValueError("user_id must be 1-24 chars")
    if not re.match(r"^[\w\u0600-\u06FF -]+$", user_id, re.UNICODE):
        raise ValueError("user_id has invalid characters")
    return user_id


def canonical_user_id(con: sqlite3.Connection, requested: str, allow_create: bool) -> tuple[str, dict | None]:
    req = validate_user_id(requested)
    allowlist = load_allowlist()
    row = con.execute(
        """
        select user_id from (
          select user_id from state
          union
          select user_id from users
        )
        where user_id=?
        limit 1
        """,
        (req,),
    ).fetchone()
    if row:
        return row["user_id"], allowlist.get(req.lower())

    variants = con.execute(
        """
        select user_id from (
          select user_id from state
          union
          select user_id from users
        )
        where lower(user_id)=lower(?)
        """,
        (req,),
    ).fetchall()
    if variants:
        best = None
        best_count = -1
        for variant in variants:
            head = get_head(con, variant["user_id"])
            count = sessions_count(sanitize_state(head["state_json"])) if head else 0
            if count > best_count:
                best = variant["user_id"]
                best_count = count
        return best, allowlist.get(req.lower())  # type: ignore[return-value]

    if not allow_create:
        return req, allowlist.get(req.lower())
    if req.lower() not in allowlist:
        raise PermissionError("not_allowlisted")
    return req.lower(), allowlist[req.lower()]


def ensure_profile_state(user_id: str, state_obj: dict, settings_obj: dict, seed: dict | None) -> tuple[dict, dict]:
    profile = state_obj.get("profile") if isinstance(state_obj.get("profile"), dict) else {}
    seed = seed or {}
    display = seed.get("display_name") or profile.get("display_name") or user_id
    profile.setdefault("display_name", display)
    profile.setdefault("experience", seed.get("experience") or "returning")
    if "bodyweight_kg" not in profile:
        profile["bodyweight_kg"] = seed.get("bodyweight_kg")
    profile.setdefault("created_at", now_iso())
    state_obj["profile"] = profile
    settings_obj["user_id"] = user_id
    return state_obj, settings_obj


def session_key(sess: dict) -> str:
    return f"{sess.get('started_at') or sess.get('date') or ''}|{sess.get('session_id') or ''}"


def ensure_session_uid(sess: dict) -> dict:
    if not sess.get("uid"):
        sess["uid"] = "srv-" + uuid.uuid4().hex
    return sess


def session_differs(a: dict, b: dict) -> bool:
    left = copy.deepcopy(a)
    right = copy.deepcopy(b)
    left.pop("uid", None)
    right.pop("uid", None)
    return json_dumps(left) != json_dumps(right)


def merge_history(head_state: dict, incoming_state: dict) -> list:
    merged: dict[str, dict] = {}
    out: list[dict] = []
    for source in ((head_state.get("history") or []), (incoming_state.get("history") or [])):
        for raw in source:
            if not isinstance(raw, dict):
                continue
            sess = ensure_session_uid(copy.deepcopy(raw))
            key = session_key(sess)
            if key not in merged:
                merged[key] = sess
                out.append(sess)
                continue
            current = merged[key]
            cur_count = completed_sets(current)
            new_count = completed_sets(sess)
            if new_count > cur_count:
                merged[key] = sess
                out[out.index(current)] = sess
            elif new_count == cur_count and session_differs(current, sess):
                dup = copy.deepcopy(sess)
                dup["uid"] = "dup-" + uuid.uuid4().hex
                dup["recovered_duplicate"] = True
                out.append(dup)
    out.sort(key=lambda s: s.get("started_at") or s.get("date") or "")
    return out


def merge_bodyweight(head_state: dict, incoming_state: dict) -> list:
    seen = set()
    out = []
    for row in (head_state.get("bodyweight_log") or []) + (incoming_state.get("bodyweight_log") or []):
        if not isinstance(row, dict):
            continue
        key = f"{row.get('date')}|{row.get('kg')}"
        if key in seen:
            continue
        seen.add(key)
        out.append(copy.deepcopy(row))
    out.sort(key=lambda r: r.get("date") or "")
    return out


def merge_prs(head_state: dict, incoming_state: dict) -> dict:
    out = copy.deepcopy(head_state.get("prs") or {})
    for ex_id, pr in (incoming_state.get("prs") or {}).items():
        if not isinstance(pr, dict):
            continue
        old = out.get(ex_id)
        if not isinstance(old, dict) or float(pr.get("score") or 0) > float(old.get("score") or 0):
            out[ex_id] = copy.deepcopy(pr)
    return out


def merge_dict_union(head_state: dict, incoming_state: dict, key: str, incoming_wins=True):
    first = copy.deepcopy(head_state.get(key) or {})
    second = copy.deepcopy(incoming_state.get(key) or {})
    if not isinstance(first, dict):
        first = {}
    if not isinstance(second, dict):
        second = {}
    if key == "custom_videos":
        out = copy.deepcopy(first)
        for ex_id, urls in second.items():
            existing = list(out.get(ex_id) or [])
            for url in urls or []:
                if url not in existing:
                    existing.append(url)
            out[ex_id] = existing
        return out
    if key == "video_hidden":
        out = copy.deepcopy(first)
        for ex_id, vals in second.items():
            existing = list(out.get(ex_id) or [])
            for val in vals or []:
                if val not in existing:
                    existing.append(val)
            out[ex_id] = existing
        return out
    out = copy.deepcopy(first)
    for k, v in second.items():
        if incoming_wins or k not in out:
            out[k] = v
    return out


def merge_custom_exercises(head_state: dict, incoming_state: dict) -> list:
    out = []
    seen = set()
    for ex in (head_state.get("custom_exercises") or []) + (incoming_state.get("custom_exercises") or []):
        if not isinstance(ex, dict):
            continue
        key = ex.get("id") or ex.get("name")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(copy.deepcopy(ex))
    return out


def active_has_work(active: dict | None) -> bool:
    return completed_sets(active) > 0


def merge_session_into_history(history: list, sess: dict) -> None:
    key = session_key(sess)
    for idx, existing in enumerate(history):
        if not isinstance(existing, dict) or session_key(existing) != key:
            continue
        existing_count = completed_sets(existing)
        new_count = completed_sets(sess)
        if new_count > existing_count:
            history[idx] = sess
        elif new_count == existing_count and session_differs(existing, sess):
            dup = copy.deepcopy(sess)
            dup["uid"] = "dup-" + uuid.uuid4().hex
            dup["recovered_duplicate"] = True
            history.append(dup)
        return
    history.append(sess)


def archive_active(history: list, active: dict, updated_at: str, reason: str) -> None:
    sess = ensure_session_uid(copy.deepcopy(active))
    sess["ended_at"] = updated_at or now_iso()
    sess[reason] = True
    merge_session_into_history(history, sess)


def merge_states(head_state: dict, incoming_state: dict, head_updated_at: str, incoming_updated_at: str) -> dict:
    newer_is_incoming = parse_iso(incoming_updated_at) >= parse_iso(head_updated_at)
    out = copy.deepcopy(incoming_state if newer_is_incoming else head_state)

    out["history"] = merge_history(head_state, incoming_state)
    out["bodyweight_log"] = merge_bodyweight(head_state, incoming_state)
    out["prs"] = merge_prs(head_state, incoming_state)
    for key in ("custom_videos", "custom_jn_urls", "video_hidden"):
        out[key] = merge_dict_union(head_state, incoming_state, key, incoming_wins=True)
    out["custom_exercises"] = merge_custom_exercises(head_state, incoming_state)

    head_active = head_state.get("active_session") if isinstance(head_state.get("active_session"), dict) else None
    incoming_active = incoming_state.get("active_session") if isinstance(incoming_state.get("active_session"), dict) else None
    if head_active and incoming_active and session_key(head_active) != session_key(incoming_active):
        incoming_newer = parse_iso(incoming_active.get("started_at")) >= parse_iso(head_active.get("started_at"))
        winner = incoming_active if incoming_newer else head_active
        loser = head_active if incoming_newer else incoming_active
        out["active_session"] = copy.deepcopy(winner)
        if active_has_work(loser):
            archive_active(out["history"], loser, incoming_updated_at if loser is incoming_active else head_updated_at, "recovered_draft")
    elif incoming_active:
        out["active_session"] = copy.deepcopy(incoming_active)
    else:
        out["active_session"] = copy.deepcopy(head_active) if head_active else None

    scalar_source = incoming_state if newer_is_incoming else head_state
    for key in ("current_week", "current_block", "msg_index", "forced_next_session"):
        if key in scalar_source:
            out[key] = scalar_source.get(key)
    return sanitize_state(out)


def merge_settings(head_settings: dict, incoming_settings: dict, head_updated_at: str, incoming_updated_at: str) -> dict:
    return sanitize_settings(incoming_settings if parse_iso(incoming_updated_at) >= parse_iso(head_updated_at) else head_settings)


def prune_revisions(con: sqlite3.Connection, user_id: str) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat().replace("+00:00", "Z")
    keep_ids = {
        row["id"]
        for row in con.execute(
            "select id from revisions where user_id=? order by id desc limit 200",
            (user_id,),
        ).fetchall()
    }
    old_rows = con.execute(
        "select id from revisions where user_id=? and server_at < ?",
        (user_id, cutoff),
    ).fetchall()
    delete_ids = [row["id"] for row in old_rows if row["id"] not in keep_ids]
    if delete_ids:
        con.executemany("delete from revisions where id=?", [(i,) for i in delete_ids])


class Handler(BaseHTTPRequestHandler):
    server_version = "RaedSync/2"

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "authorization,content-type,x-user-key")
        self.send_header("Access-Control-Expose-Headers", "Content-Disposition")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    def send_json(self, status: int, obj: object):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, status: int, error: str):
        self.send_json(status, {"error": error})

    def read_json_body(self) -> dict:
        raw = self.rfile.read(int(self.headers.get("content-length") or "0"))
        if not raw:
            return {}
        try:
            return json.loads(raw.decode())
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        try:
            if parsed.path == "/health":
                return self.send_json(200, {"ok": True, "rev": 2})
            if parsed.path == "/users":
                return self.handle_users()
            if parsed.path == "/state":
                return self.handle_get_state(qs)
            if parsed.path == "/revisions":
                return self.handle_revisions(qs)
            if parsed.path == "/revision":
                return self.handle_revision(qs)
            if parsed.path == "/export":
                return self.handle_export(qs)
            self.send_error_json(404, "not_found")
        except PermissionError as exc:
            self.send_error_json(401, str(exc) or "unauthorized")
        except Exception as exc:
            self.send_error_json(500, f"server_error: {exc}")

    def do_POST(self):
        parsed = urlparse(self.path)
        body = self.read_json_body()
        try:
            if parsed.path == "/state":
                return self.handle_post_state(body)
            if parsed.path == "/register":
                return self.handle_register(body)
            self.send_error_json(404, "not_found")
        except ValueError as exc:
            self.send_error_json(400, str(exc))
        except PermissionError as exc:
            msg = str(exc)
            self.send_error_json(403 if msg == "not_allowlisted" else 401, msg or "unauthorized")
        except Exception as exc:
            self.send_error_json(500, f"server_error: {exc}")

    def handle_users(self):
        with connect() as con:
            ok, reason = auth_ok(con, "_users", self.headers, require_legacy=True)
            if not ok:
                return self.send_error_json(429 if reason == "rate" else 401, "unauthorized")
            users: dict[str, dict] = {}
            for lower, seed in load_allowlist().items():
                uid = seed.get("user_id") or ("Raed" if lower == "raed" else lower)
                users[uid.lower()] = {
                    "user_id": uid,
                    "display_name": seed.get("display_name") or uid,
                    "experience": seed.get("experience") or "returning",
                    "updated_at": None,
                    "has_pin": False,
                    "sessions": 0,
                    "allowlisted": True,
                }
            rows = con.execute(
                """
                select s.user_id, s.state_json, s.updated_at, u.pin_hash
                from state s
                left join users u on lower(u.user_id)=lower(s.user_id)
                """
            ).fetchall()
            for row in rows:
                st = sanitize_state(row["state_json"])
                profile = st.get("profile") if isinstance(st.get("profile"), dict) else {}
                lower = row["user_id"].lower()
                seed = load_allowlist().get(lower, {})
                candidate = {
                    "user_id": row["user_id"],
                    "display_name": profile.get("display_name") or seed.get("display_name") or row["user_id"],
                    "experience": profile.get("experience") or seed.get("experience") or "returning",
                    "updated_at": row["updated_at"],
                    "has_pin": bool(row["pin_hash"]),
                    "sessions": sessions_count(st),
                    "allowlisted": lower in load_allowlist(),
                }
                if prefer_user_tile(candidate, users.get(lower)):
                    users[lower] = candidate
            self.send_json(200, sorted(users.values(), key=lambda u: (u.get("display_name") or u["user_id"]).lower()))

    def handle_get_state(self, qs):
        user_id = validate_user_id((qs.get("user") or [""])[0])
        with connect() as con:
            ok, reason = auth_ok(con, user_id, self.headers)
            if not ok:
                return self.send_error_json(429 if reason == "rate" else 401, "unauthorized")
            row = get_head(con, user_id)
            if not row:
                return self.send_error_json(404, "not_found")
            self.send_json(
                200,
                {
                    "user_id": row["user_id"],
                    "state_json": sanitize_state(row["state_json"]),
                    "settings_json": sanitize_settings(row["settings_json"]),
                    "updated_at": row["updated_at"],
                    "latest_rev": latest_rev(con, row["user_id"]),
                },
            )

    def handle_post_state(self, body):
        with _write_lock:
            user_id = validate_user_id(body.get("user_id") or "")
            incoming_updated_at = body.get("updated_at") or now_iso()
            with connect() as con:
                ok, reason = auth_ok(con, user_id, self.headers, body=body)
                if not ok:
                    return self.send_error_json(429 if reason == "rate" else 401, "unauthorized")
                canonical, seed = canonical_user_id(con, user_id, allow_create=True)
                incoming_state = sanitize_state(body.get("state_json"))
                incoming_settings = sanitize_settings(body.get("settings_json"))
                incoming_state, incoming_settings = ensure_profile_state(canonical, incoming_state, incoming_settings, seed)
                head = get_head(con, canonical)
                current_rev = latest_rev(con, canonical)
                base_rev = body.get("base_rev")
                mode = str(body.get("mode") or "merge")
                if mode not in {"merge", "replace"}:
                    raise ValueError("mode must be merge or replace")
                replace_mode = mode == "replace"
                fast_path = replace_mode or head is None or (base_rev is not None and int(base_rev) == int(current_rev or 0))
                merged = False
                if head and not fast_path:
                    head_state = sanitize_state(head["state_json"])
                    head_settings = sanitize_settings(head["settings_json"])
                    incoming_state = merge_states(head_state, incoming_state, head["updated_at"], incoming_updated_at)
                    incoming_settings = merge_settings(head_settings, incoming_settings, head["updated_at"], incoming_updated_at)
                    incoming_state, incoming_settings = ensure_profile_state(canonical, incoming_state, incoming_settings, seed)
                    merged = True
                server_at = now_iso()
                state_text = json_dumps(incoming_state)
                settings_text = json_dumps(incoming_settings)
                con.execute(
                    """
                    insert into state(user_id,state_json,settings_json,updated_at)
                    values(?,?,?,?)
                    on conflict(user_id) do update set
                      state_json=excluded.state_json,
                      settings_json=excluded.settings_json,
                      updated_at=excluded.updated_at
                    """,
                    (canonical, state_text, settings_text, incoming_updated_at),
                )
                con.execute(
                    "insert into revisions(user_id,state_json,settings_json,updated_at,server_at) values(?,?,?,?,?)",
                    (canonical, state_text, settings_text, incoming_updated_at, server_at),
                )
                rev = int(con.execute("select last_insert_rowid() as id").fetchone()["id"])
                prune_revisions(con, canonical)
                self.send_json(
                    200,
                    {
                        "ok": True,
                        "rev": rev,
                        "latest_rev": rev,
                        "merged": merged,
                        "replaced": replace_mode,
                        "user_id": canonical,
                        "state_json": incoming_state,
                        "settings_json": incoming_settings,
                        "updated_at": incoming_updated_at,
                    },
                )

    def handle_register(self, body):
        with _write_lock:
            requested = validate_user_id(body.get("user_id") or "")
            pin = str(body.get("pin") or "")
            if not re.match(r"^\d{4,6}$", pin):
                raise ValueError("pin must be 4-6 digits")
            with connect() as con:
                ok, reason = auth_ok(con, requested, self.headers, body=body, require_legacy=True)
                if not ok:
                    return self.send_error_json(429 if reason == "rate" else 401, "unauthorized")
                canonical, seed = canonical_user_id(con, requested, allow_create=True)
                count = con.execute("select count(*) as n from users").fetchone()["n"]
                exists_user = con.execute("select * from users where lower(user_id)=lower(?)", (canonical,)).fetchone()
                if count >= MAX_USERS and not exists_user:
                    return self.send_error_json(409, "too_many_users")
                if exists_user and exists_user["pin_hash"]:
                    return self.send_error_json(409, "pin_already_set")
                salt = secrets.token_hex(16)
                key = pin_key(canonical, pin)
                phash = stored_pin_hash(salt, key)
                created_at = now_iso()
                con.execute(
                    """
                    insert into users(user_id,pin_salt,pin_hash,pin_set_at,created_at)
                    values(?,?,?,?,?)
                    on conflict(user_id) do update set
                      pin_salt=excluded.pin_salt,
                      pin_hash=excluded.pin_hash,
                      pin_set_at=excluded.pin_set_at
                    """,
                    (canonical, salt, phash, created_at, created_at),
                )
                if not get_head(con, canonical):
                    state_obj, settings_obj = ensure_profile_state(canonical, {"schema_version": 2, "history": []}, {"user_id": canonical}, seed)
                    text_state = json_dumps(state_obj)
                    text_settings = json_dumps(settings_obj)
                    con.execute(
                        "insert into state(user_id,state_json,settings_json,updated_at) values(?,?,?,?)",
                        (canonical, text_state, text_settings, created_at),
                    )
                    con.execute(
                        "insert into revisions(user_id,state_json,settings_json,updated_at,server_at) values(?,?,?,?,?)",
                        (canonical, text_state, text_settings, created_at, created_at),
                    )
                self.send_json(200, {"ok": True, "user_id": canonical, "user_key": key})

    def handle_revisions(self, qs):
        user_id = validate_user_id((qs.get("user") or [""])[0])
        limit = min(int((qs.get("limit") or ["30"])[0]), 200)
        with connect() as con:
            ok, reason = auth_ok(con, user_id, self.headers)
            if not ok:
                return self.send_error_json(429 if reason == "rate" else 401, "unauthorized")
            rows = con.execute(
                "select id,state_json,updated_at,server_at from revisions where user_id=? order by id desc limit ?",
                (user_id, limit),
            ).fetchall()
            out = []
            for row in rows:
                st = sanitize_state(row["state_json"])
                out.append(
                    {
                        "rev": row["id"],
                        "server_at": row["server_at"],
                        "updated_at": row["updated_at"],
                        "sessions": sessions_count(st),
                        "bytes": len(row["state_json"] or ""),
                    }
                )
            self.send_json(200, out)

    def handle_revision(self, qs):
        user_id = validate_user_id((qs.get("user") or [""])[0])
        rev = int((qs.get("rev") or ["0"])[0])
        with connect() as con:
            ok, reason = auth_ok(con, user_id, self.headers)
            if not ok:
                return self.send_error_json(429 if reason == "rate" else 401, "unauthorized")
            row = con.execute("select * from revisions where user_id=? and id=?", (user_id, rev)).fetchone()
            if not row:
                return self.send_error_json(404, "not_found")
            self.send_json(
                200,
                {
                    "rev": row["id"],
                    "state_json": sanitize_state(row["state_json"]),
                    "settings_json": sanitize_settings(row["settings_json"]),
                    "updated_at": row["updated_at"],
                },
            )

    def handle_export(self, qs):
        user_id = validate_user_id((qs.get("user") or [""])[0])
        with connect() as con:
            ok, reason = auth_ok(con, user_id, self.headers)
            if not ok:
                return self.send_error_json(429 if reason == "rate" else 401, "unauthorized")
            row = get_head(con, user_id)
            if not row:
                return self.send_error_json(404, "not_found")
            payload = {
                "user_id": row["user_id"],
                "state": sanitize_state(row["state_json"]),
                "settings": sanitize_settings(row["settings_json"]),
                "updated_at": row["updated_at"],
                "latest_rev": latest_rev(con, user_id),
            }
            data = json.dumps(payload, ensure_ascii=False, indent=2).encode()
            name = quote(f"{user_id}-workouts-{datetime.now().date().isoformat()}.json")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="{name}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)


def main() -> int:
    init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"raedsync v2 listening on {HOST}:{PORT}, db={DB_PATH}", flush=True)
    httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
