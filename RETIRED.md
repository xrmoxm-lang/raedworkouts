# v15 is retired

**Taken off the internet on 1 September 2026, at Raed's instruction.**
GitHub Pages is unpublished, so `xrmoxm-lang.github.io/raedworkouts` no longer
serves this app. Its replacement is **Raedworkouts Go**:

> **https://raedworkouts-v16.vercel.app**

Nothing was deleted. This is a retirement, not a removal.

## If you ever want v15 back

The exact code is tagged **`v15-final`** on this repository. To run it again:

```sh
git checkout v15-final
# then re-enable GitHub Pages on main in repo Settings → Pages
```

There are also full backups outside git, in
`~/Documents/Project Artifacts/RaedWorkouts/v15-retired/`:

| File | What it is |
|---|---|
| `raedworkouts_v15_full_*.bundle` | every branch and tag, restorable with `git clone` |
| `raedworkouts_v15_worktree_*.tar.gz` | the plain files, no git needed |
| `raedsync_data_*.db` | the sync database, including Raed's 5 logged v15 sessions |

## What was NOT carried over, deliberately

Raed chose **not** to migrate his v15 history into v16: *"لا تنقل القديم ووقف
القديم"*. v16 syncs under `raed-v16` and v15's data stays under `Raed`, untouched
on the server. The two never write to each other — that separation was the point,
and it is why retiring v15 costs nothing.

## Why v16 exists

v15 was a family app with profile PINs and an English interface. v16 is Arabic
only, has no PIN, and adds a coach that searches the 33 Jeff Nippard books Raed
owns and quotes them with book and page — it never writes a sentence of its own.

The v16 work lives on branch `v16-foundation` in this same repository. `main` is
still v15 until Raed approves the merge.
