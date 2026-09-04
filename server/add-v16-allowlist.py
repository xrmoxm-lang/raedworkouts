#!/usr/bin/env python3
"""Add the isolated v16 sync identities without touching v15 rows.

Run this against the HP server's live allowlist before deploying the parallel
PWA. It is deliberately additive: bare `raed`, `bassam`, and `abdullah` keys
remain exactly where they are, while the v16 client can create only its
separate suffixed rows.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path


V16_USERS = {
    "raed-v16": {"display_name": "Raed", "experience": "detrained", "bodyweight_kg": 82},
    "bassam-v16": {"display_name": "Bassam", "experience": "returning"},
    "abdullah-v16": {"display_name": "Abdullah", "experience": "beginner"},
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Add the parallel v16 sync identities to an existing allowlist.")
    parser.add_argument("--allowlist", required=True, type=Path, help="Live raedsync allowlist.json path")
    args = parser.parse_args()
    target = args.allowlist.expanduser().resolve()
    if not target.is_file():
        raise SystemExit(f"Refusing to create an unknown allowlist: {target}")

    try:
        data = json.loads(target.read_text())
    except json.JSONDecodeError as error:
        raise SystemExit(f"Refusing to rewrite invalid JSON at {target}: {error}") from error
    if not isinstance(data, dict) or not isinstance(data.get("users"), dict):
        raise SystemExit(f"Refusing to rewrite {target}: expected an object with a users object")

    users = data["users"]
    before_v15 = {key: users.get(key) for key in ("raed", "bassam", "abdullah")}
    added = []
    for user_id, profile in V16_USERS.items():
        if user_id not in users:
            users[user_id] = profile
            added.append(user_id)
    # This explicit invariant keeps the helper from ever becoming a migration.
    if before_v15 != {key: users.get(key) for key in before_v15}:
        raise SystemExit("Invariant failed: this helper must not alter bare v15 allowlist entries")

    mode = target.stat().st_mode
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=target.parent, prefix=f".{target.name}.", delete=False) as out:
        json.dump(data, out, ensure_ascii=False, indent=2)
        out.write("\n")
        temp_name = out.name
    os.chmod(temp_name, mode)
    os.replace(temp_name, target)
    print(f"V16_ALLOWLIST_READY added={','.join(added) if added else 'none'} kept_v15=raed,bassam,abdullah")


if __name__ == "__main__":
    main()
