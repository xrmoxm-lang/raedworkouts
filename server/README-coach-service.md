# `coach-service.py` — the live answer service

**The HP is authoritative. This file is a copy.**

`~/raedworkouts-ai/service.py` on the HP is what actually runs, under
`raedworkouts-retrieval.service`. Until 2026-09-05 it existed *only* there —
1221 lines, no version control anywhere, backed up by ad-hoc `.bak-` files beside
it. This is the same failure `server/raedsync.py` already taught us, where the
repo copy had drifted 146 lines behind the running file.

## The rule

1. **Patch the live file on the HP first**, then copy it back here and commit.
2. Never copy this file *over* the live one without diffing — you will delete
   whatever was changed on the server since the last sync.
3. Verify they match: `md5sum` on both.

```sh
scp raed@100.127.81.84:/home/raed/raedworkouts-ai/service.py server/coach-service.py
sudo systemctl restart raedworkouts-retrieval   # on the HP
curl -s https://raed-hp.tail53bd35.ts.net/coach/health -H "X-Coach-Key: …"
```

Note `server/coach_qa.py` is a **different, older** module and is not this
service.
