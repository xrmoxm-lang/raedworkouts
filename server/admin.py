#!/usr/bin/env python3
"""Small SSH-only admin helper for Raedworkouts sync v2."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(os.environ.get("RAEDSYNC_HOME", "~/raedsync")).expanduser()
DB_PATH = Path(os.environ.get("RAEDSYNC_DB", str(ROOT / "data.db"))).expanduser()


def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def load_state(text):
    try:
        return json.loads(text or "{}")
    except Exception:
        return {}


def sessions_count(text):
    return len(load_state(text).get("history") or [])


def cmd_list_users(_args):
    with connect() as con:
        rows = con.execute(
            """
            select s.user_id, s.updated_at, s.state_json, u.pin_hash, u.pin_set_at
            from state s
            left join users u on lower(u.user_id)=lower(s.user_id)
            order by lower(s.user_id)
            """
        ).fetchall()
        for row in rows:
            has_pin = "yes" if row["pin_hash"] else "no"
            print(f"{row['user_id']}\t{sessions_count(row['state_json'])} sessions\tpin={has_pin}\tupdated={row['updated_at']}")


def cmd_reset_pin(args):
    with connect() as con:
        con.execute("update users set pin_salt=null, pin_hash=null, pin_set_at=null where lower(user_id)=lower(?)", (args.user,))
        con.commit()
    print(f"reset pin for {args.user}")


def cmd_delete_user(args):
    with connect() as con:
        con.execute("delete from users where lower(user_id)=lower(?)", (args.user,))
        con.commit()
    print(f"deleted PIN/user auth row for {args.user}; state untouched")


def cmd_delete_row(args):
    if not args.yes:
        raise SystemExit("Refusing without --yes")
    with connect() as con:
        con.execute("delete from users where lower(user_id)=lower(?)", (args.user,))
        con.execute("delete from revisions where lower(user_id)=lower(?)", (args.user,))
        con.execute("delete from state where lower(user_id)=lower(?)", (args.user,))
        con.commit()
    print(f"deleted state, revisions, and auth for {args.user}")


def cmd_revisions(args):
    with connect() as con:
        rows = con.execute(
            "select id, server_at, updated_at, state_json from revisions where lower(user_id)=lower(?) order by id desc limit ?",
            (args.user, args.limit),
        ).fetchall()
        for row in rows:
            print(f"{row['id']}\t{row['server_at']}\tupdated={row['updated_at']}\t{sessions_count(row['state_json'])} sessions")


def cmd_restore_rev(args):
    with connect() as con:
        rev = con.execute(
            "select * from revisions where lower(user_id)=lower(?) and id=?",
            (args.user, args.rev),
        ).fetchone()
        if not rev:
            raise SystemExit("revision not found")
        server_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        con.execute(
            """
            insert into state(user_id,state_json,settings_json,updated_at)
            values(?,?,?,?)
            on conflict(user_id) do update set
              state_json=excluded.state_json,
              settings_json=excluded.settings_json,
              updated_at=excluded.updated_at
            """,
            (rev["user_id"], rev["state_json"], rev["settings_json"], server_at),
        )
        con.execute(
            "insert into revisions(user_id,state_json,settings_json,updated_at,server_at) values(?,?,?,?,?)",
            (rev["user_id"], rev["state_json"], rev["settings_json"], server_at, server_at),
        )
        con.commit()
    print(f"restored {args.user} revision {args.rev} as new head")


def main():
    global DB_PATH
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(DB_PATH), help="SQLite DB path")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list-users").set_defaults(func=cmd_list_users)

    p = sub.add_parser("reset-pin")
    p.add_argument("user")
    p.set_defaults(func=cmd_reset_pin)

    p = sub.add_parser("delete-user")
    p.add_argument("user")
    p.set_defaults(func=cmd_delete_user)

    p = sub.add_parser("delete-row")
    p.add_argument("user")
    p.add_argument("--yes", action="store_true")
    p.set_defaults(func=cmd_delete_row)

    p = sub.add_parser("revisions")
    p.add_argument("user")
    p.add_argument("--limit", type=int, default=30)
    p.set_defaults(func=cmd_revisions)

    p = sub.add_parser("restore-rev")
    p.add_argument("user")
    p.add_argument("rev", type=int)
    p.set_defaults(func=cmd_restore_rev)

    args = parser.parse_args()
    DB_PATH = Path(args.db).expanduser()
    args.func(args)


if __name__ == "__main__":
    main()
