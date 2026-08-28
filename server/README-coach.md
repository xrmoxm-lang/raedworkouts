# Local coach foundation

`coach_index.py` builds the citation index only with the HP CPU model
`BAAI/bge-small-en-v1.5` (`fastembed`, ONNX, 384 dimensions). It has no paid
embedding fallback. Run it on the HP after placing this worktree's
`sources/text/` alongside the server code:

```sh
python3 -m venv ~/raedcoach/.venv
~/raedcoach/.venv/bin/pip install -r server/requirements-coach.txt
~/raedcoach/.venv/bin/python server/coach_index.py build \
  --corpus sources/text --db ~/raedcoach/coach-index.sqlite
```

The build is intentionally streaming: it embeds and commits one bounded batch
at a time, emits `LOCAL_INDEX_PROGRESS files=… chunks=… rss_mb=…`, and leaves
the database in a resumable `building` state after an interruption. It never
holds a corpus-wide vector matrix in memory. The default ceiling is 768 MiB;
crossing it stops cleanly before the next batch and the same command resumes
from the last committed batch.

Smoke-test the local HP runtime first (use a separate disposable database so a
partial sample cannot be mistaken for the full index):

```sh
~/raedcoach/.venv/bin/python server/coach_index.py build \
  --corpus sources/text --db /tmp/raedcoach-index-smoke.sqlite \
  --limit 3 --batch-size 24 --max-rss-mb 768
```

For a full build, keep the default database path and use a conservative batch:

```sh
~/raedcoach/.venv/bin/python server/coach_index.py build \
  --corpus sources/text --db ~/raedcoach/coach-index.sqlite \
  --batch-size 48 --max-rss-mb 768
```

The output is the authoritative measurement: document count, word count,
realised BGE-token count, chunk count, dimensions, and database size.

Implemented question graph:

```text
query_rewrite -> retrieve -> answer -> validate -> deliver
```

Each node declares read/write fields in `coach_graph.py`; the runner writes the
whole serialisable state to SQLite after every node. The model-backed contracts
reject any key containing `weight`, `load`, or `kg`. Load decisions remain in
the browser's tested `domain/clamps.js` pipeline (via `domain/progression.js`).

Stubbed deliberately: `session_report`, `weekly_adjust`, `extract_note`,
`swap_explain`, `friday_note`, `accountant`, `budget_gate`, `meter`, voice
transcription, all provider adapters, and all UI/HTTP wiring. No voice code is
present. A subscription-backed query-rewrite/answer adapter is supplied by the
future server integration; its failure is a typed error, never a refusal.
