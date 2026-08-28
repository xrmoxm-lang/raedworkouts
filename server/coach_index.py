#!/usr/bin/env python3
"""Local-only citation index for the RaedWorkouts coach.

The only embedding implementation is fastembed's CPU ONNX model.  This module
deliberately contains no model-provider client and no network retrieval path.
"""

from __future__ import annotations

import argparse
import math
import hashlib
import json
import os
import re
import sqlite3
import sys
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Iterator, Protocol
from array import array

MODEL_NAME = "BAAI/bge-small-en-v1.5"
VECTOR_DIMENSIONS = 384
MAX_TOKENS = 400
DEFAULT_BATCH_SIZE = 48
DEFAULT_MAX_RSS_MB = 768
DEFAULT_CORPUS = Path(__file__).resolve().parents[2] / "sources" / "text"


class IndexBuildError(RuntimeError):
    """The local-only index could not be constructed."""


class Embeddings(Protocol):
    def embed(self, texts: Iterable[str]) -> Iterable[object]: ...


class TokenCounter(Protocol):
    def encode(self, text: str) -> object: ...


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    doc_id: str
    source_path: str
    char_start: int
    char_end: int
    token_count: int
    text: str


def _require_local_runtime() -> tuple[Embeddings, TokenCounter]:
    try:
        from fastembed import TextEmbedding
        from tokenizers import Tokenizer
    except ImportError as error:
        raise IndexBuildError(
            "Local embeddings are unavailable. Install server/requirements-coach.txt "
            "inside the HP venv; do not replace this with an embedding API."
        ) from error

    # The tokenizer is required for a realised (not word-estimated) chunk count.
    # Fastembed's model pull is the only network event; it downloads the model,
    # never the corpus or a user's question.
    tokenizer_path = os.environ.get("RAEDCOACH_TOKENIZER")
    if tokenizer_path:
        tokenizer = Tokenizer.from_file(tokenizer_path)
    else:
        tokenizer = Tokenizer.from_pretrained(MODEL_NAME)
    return TextEmbedding(model_name=MODEL_NAME), tokenizer


def _token_count(tokenizer: TokenCounter, text: str) -> int:
    return len(tokenizer.encode(text).ids)  # type: ignore[attr-defined]


def _is_heading(line: str) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) > 140:
        return False
    if stripped.startswith("#"):
        return True
    if re.match(r"^(?:\d+(?:\.\d+)*|[A-Z])(?:[.)]|\s+-)\s+", stripped):
        return True
    letters = re.sub(r"[^A-Za-z]", "", stripped)
    return len(letters) >= 4 and stripped == stripped.upper() and len(stripped.split()) <= 12


def _sections(text: str) -> list[tuple[int, str]]:
    lines = text.splitlines(keepends=True)
    sections: list[tuple[int, str]] = []
    start = 0
    buffer: list[str] = []
    offset = 0
    for line in lines:
        if _is_heading(line) and buffer:
            sections.append((start, "".join(buffer)))
            start = offset
            buffer = []
        buffer.append(line)
        offset += len(line)
    if buffer:
        sections.append((start, "".join(buffer)))
    return sections


def _pieces(section_start: int, text: str) -> list[tuple[int, str]]:
    pieces: list[tuple[int, str]] = []
    cursor = 0
    for match in re.finditer(r"\S(?:.*?\S)?(?=\n\s*\n|\Z)", text, flags=re.S):
        value = match.group(0).strip()
        if value:
            pieces.append((section_start + match.start(), value))
        cursor = match.end()
    if not pieces and text.strip():
        pieces.append((section_start + cursor, text.strip()))
    return pieces


def _split_to_fit(start: int, text: str, tokenizer: TokenCounter, limit: int) -> list[tuple[int, str]]:
    if _token_count(tokenizer, text) <= limit:
        return [(start, text)]
    words = list(re.finditer(r"\S+", text))
    if not words:
        return []
    result: list[tuple[int, str]] = []
    index = 0
    while index < len(words):
        end = index + 1
        while end <= len(words):
            candidate = text[words[index].start() : words[end - 1].end()]
            if _token_count(tokenizer, candidate) > limit:
                break
            end += 1
        if end == index + 1:
            raise IndexBuildError("One token exceeds the local model chunk limit")
        last = end - 1
        value = text[words[index].start() : words[last - 1].end()]
        result.append((start + words[index].start(), value))
        index = last
    return result


def iter_document_chunks(path: Path, tokenizer: TokenCounter, max_tokens: int = MAX_TOKENS) -> Iterator[Chunk]:
    """Yield one document's chunks without retaining the corpus in memory."""
    text = path.read_text(encoding="utf-8", errors="replace")
    doc_id = path.stem
    for section_start, section in _sections(text):
        current_start: int | None = None
        current: list[str] = []
        for piece_start, piece in _pieces(section_start, section):
            for fitted_start, fitted in _split_to_fit(piece_start, piece, tokenizer, max_tokens):
                candidate = "\n\n".join([*current, fitted])
                if current and _token_count(tokenizer, candidate) > max_tokens:
                    value = "\n\n".join(current)
                    assert current_start is not None
                    yield _make_chunk(doc_id, path, current_start, value, tokenizer)
                    current, current_start = [fitted], fitted_start
                else:
                    if current_start is None:
                        current_start = fitted_start
                    current.append(fitted)
        if current:
            assert current_start is not None
            yield _make_chunk(doc_id, path, current_start, "\n\n".join(current), tokenizer)


def chunk_document(path: Path, tokenizer: TokenCounter, max_tokens: int = MAX_TOKENS) -> list[Chunk]:
    """Compatibility wrapper for the focused chunker tests and small callers."""
    return list(iter_document_chunks(path, tokenizer, max_tokens))


def _make_chunk(doc_id: str, path: Path, start: int, text: str, tokenizer: TokenCounter) -> Chunk:
    token_count = _token_count(tokenizer, text)
    if token_count > MAX_TOKENS:
        raise IndexBuildError(f"{path.name} produced an oversized {token_count}-token chunk")
    digest = hashlib.sha256(f"{doc_id}:{start}:{text}".encode()).hexdigest()[:20]
    return Chunk(f"{doc_id}:{digest}", doc_id, str(path), start, start + len(text), token_count, text)


def init_db(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        pragma journal_mode=wal;
        create table if not exists corpus_meta (key text primary key, value text not null);
        create table if not exists corpus_chunks (
          chunk_id text primary key, doc_id text not null, source_path text not null,
          char_start integer not null, char_end integer not null, token_count integer not null,
          text text not null
        );
        create virtual table if not exists corpus_fts using fts5(
          chunk_id unindexed, doc_id unindexed, text
        );
        create table if not exists chunk_vectors (
          chunk_id text primary key references corpus_chunks(chunk_id), dimensions integer not null,
          vector blob not null
        );
        """
    )


def _rss_bytes() -> int:
    """Return the current process RSS on Linux without a daemon dependency."""
    status = Path("/proc/self/status")
    if status.exists():
        for line in status.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("VmRSS:"):
                # Linux reports VmRSS in KiB.
                return int(line.split()[1]) * 1024
    return 0


def _assert_rss_below(max_rss_bytes: int, rss_reader: Callable[[], int]) -> int:
    rss = rss_reader()
    if rss and rss > max_rss_bytes:
        raise IndexBuildError(
            f"RSS ceiling exceeded: {rss / 1024 / 1024:.1f} MiB > "
            f"{max_rss_bytes / 1024 / 1024:.1f} MiB. Stopped cleanly; rerun resumes from the last batch."
        )
    return rss


def _batches(items: Iterable[Chunk], batch_size: int) -> Iterator[list[Chunk]]:
    batch: list[Chunk] = []
    for item in items:
        batch.append(item)
        if len(batch) == batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def _fingerprint(files: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def _set_meta(connection: sqlite3.Connection, values: dict[str, str]) -> None:
    connection.executemany("insert or replace into corpus_meta values(?,?)", values.items())


def _clear_index(connection: sqlite3.Connection) -> None:
    connection.execute("delete from corpus_fts")
    connection.execute("delete from chunk_vectors")
    connection.execute("delete from corpus_chunks")
    connection.execute("delete from corpus_meta")


def _known_chunk_ids(connection: sqlite3.Connection, chunks: list[Chunk]) -> set[str]:
    if not chunks:
        return set()
    placeholders = ",".join("?" for _ in chunks)
    return {row[0] for row in connection.execute(
        f"select chunk_id from corpus_chunks where chunk_id in ({placeholders})",
        [chunk.chunk_id for chunk in chunks],
    )}


def _normalise_vectors(raw_vectors: Iterable[object], expected: int) -> list[array]:
    """Normalise only one embedding batch; no corpus-wide NumPy matrix exists."""
    vectors: list[array] = []
    for raw in raw_vectors:
        values = [float(value) for value in raw]  # type: ignore[union-attr]
        if len(values) != VECTOR_DIMENSIONS:
            raise IndexBuildError(
                f"Expected {VECTOR_DIMENSIONS}-dimension local vectors, got one with {len(values)} dimensions"
            )
        norm = math.sqrt(sum(value * value for value in values))
        vectors.append(array("f", (value / max(norm, 1e-12) for value in values)))
    if len(vectors) != expected:
        raise IndexBuildError(f"Expected {expected} local vectors for a batch, got {len(vectors)}")
    return vectors


def _write_batch(connection: sqlite3.Connection, chunks: list[Chunk], vectors: Iterable[array]) -> None:
    """Atomically persist a single bounded embedding batch and its checkpoint."""
    connection.executemany(
        "insert or replace into corpus_chunks values(?,?,?,?,?,?,?)",
        [(chunk.chunk_id, chunk.doc_id, chunk.source_path, chunk.char_start, chunk.char_end, chunk.token_count, chunk.text) for chunk in chunks],
    )
    # FTS has no unique constraint. Removing same-id rows makes retries
    # idempotent instead of silently duplicating lexical retrieval hits.
    connection.executemany("delete from corpus_fts where chunk_id=?", [(chunk.chunk_id,) for chunk in chunks])
    connection.executemany("insert into corpus_fts values(?,?,?)", [(chunk.chunk_id, chunk.doc_id, chunk.text) for chunk in chunks])
    connection.executemany(
        "insert or replace into chunk_vectors values(?,?,?)",
        [(chunk.chunk_id, VECTOR_DIMENSIONS, vector.tobytes()) for chunk, vector in zip(chunks, vectors)],
    )


def build_index(
    corpus: Path,
    db_path: Path,
    *,
    embedder: Embeddings | None = None,
    tokenizer: TokenCounter | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    limit: int | None = None,
    max_rss_bytes: int = DEFAULT_MAX_RSS_MB * 1024 * 1024,
    rss_reader: Callable[[], int] = _rss_bytes,
) -> dict[str, int | str]:
    """Build or resume a local index with bounded memory.

    The database is created and checkpointed *before* the first embedding
    batch.  Every commit contains chunks, FTS rows, vectors, and progress
    metadata together, so an interruption can be resumed safely.
    """
    if not corpus.is_dir():
        raise IndexBuildError(f"Corpus directory does not exist: {corpus}")
    files = sorted(corpus.glob("*.txt"))
    if limit is not None:
        if limit <= 0:
            raise IndexBuildError("--limit must be a positive number of files")
        files = files[:limit]
    if not files:
        raise IndexBuildError(f"No .txt source documents in {corpus}")
    if batch_size <= 0:
        raise IndexBuildError("--batch-size must be positive")
    if max_rss_bytes <= 0:
        raise IndexBuildError("--max-rss-mb must be positive")
    if embedder is None or tokenizer is None:
        embedder, tokenizer = _require_local_runtime()
    corpus_fingerprint = _fingerprint(files)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(db_path)) as connection:
        init_db(connection)
        prior = dict(connection.execute("select key, value from corpus_meta"))
        resume = prior.get("corpus_fingerprint") == corpus_fingerprint and prior.get("build_status") == "building"
        if not resume and prior.get("corpus_fingerprint") != corpus_fingerprint:
            _clear_index(connection)
        elif not resume and prior.get("build_status") == "complete":
            # A completed matching corpus is already a valid idempotent build.
            return report(db_path)

        completed_before = connection.execute("select count(*) from corpus_chunks").fetchone()[0]
        # A partially committed document has rows but is not "files done".
        # Keep the explicit post-document checkpoint rather than inferring it
        # from distinct doc ids and lying to the operator watching the build.
        files_done = int(prior.get("files_completed", "0")) if resume else 0
        _set_meta(connection, {
            "build_status": "building",
            "corpus_fingerprint": corpus_fingerprint,
            "model": MODEL_NAME,
            "dimensions": str(VECTOR_DIMENSIONS),
            "documents_total": str(len(files)),
            "chunks_completed": str(completed_before),
            "files_completed": str(files_done),
        })
        connection.commit()
        print(
            f"LOCAL_INDEX_RESUME {'yes' if resume else 'no'} files={files_done}/{len(files)} "
            f"chunks={completed_before} batch={batch_size}",
            flush=True,
        )

        chunks_completed = completed_before
        for file_number, path in enumerate(files, start=1):
            for candidate_batch in _batches(iter_document_chunks(path, tokenizer), batch_size):
                missing = [chunk for chunk in candidate_batch if chunk.chunk_id not in _known_chunk_ids(connection, candidate_batch)]
                if not missing:
                    continue
                _assert_rss_below(max_rss_bytes, rss_reader)
                vectors = _normalise_vectors(embedder.embed(chunk.text for chunk in missing), len(missing))
                rss = _assert_rss_below(max_rss_bytes, rss_reader)
                _write_batch(connection, missing, vectors)
                chunks_completed += len(missing)
                _set_meta(connection, {
                    "build_status": "building",
                    "chunks_completed": str(chunks_completed),
                    "files_completed": str(file_number - 1),
                })
                connection.commit()
                print(
                    f"LOCAL_INDEX_PROGRESS files={file_number - 1}/{len(files)} chunks={chunks_completed} "
                    f"rss_mb={rss / 1024 / 1024:.1f}",
                    flush=True,
                )
                # Drop each bounded array before the next model invocation.
                del vectors
            files_done = file_number
            _set_meta(connection, {"files_completed": str(files_done), "chunks_completed": str(chunks_completed)})
            connection.commit()
            print(f"LOCAL_INDEX_PROGRESS files={files_done}/{len(files)} chunks={chunks_completed} rss_mb={rss_reader() / 1024 / 1024:.1f}", flush=True)

        chunks = connection.execute("select count(*) from corpus_chunks").fetchone()[0]
        if not chunks:
            raise IndexBuildError("The corpus did not yield any chunks")
        word_count = sum(len(path.read_text(encoding="utf-8", errors="replace").split()) for path in files)
        realised_tokens = connection.execute("select coalesce(sum(token_count), 0) from corpus_chunks").fetchone()[0]
        meta = {
            "model": MODEL_NAME,
            "dimensions": str(VECTOR_DIMENSIONS),
            "documents": str(len(files)),
            "chunks": str(chunks),
            "words": str(word_count),
            "realised_tokens": str(realised_tokens),
            "corpus_fingerprint": corpus_fingerprint,
            "build_status": "complete",
            "files_completed": str(len(files)),
            "chunks_completed": str(chunks),
        }
        _set_meta(connection, meta)
        connection.commit()
    return {**{key: int(value) if value.isdigit() else value for key, value in meta.items()}, "index_bytes": db_path.stat().st_size}


def report(db_path: Path) -> dict[str, int | str]:
    with closing(sqlite3.connect(db_path)) as connection:
        rows = dict(connection.execute("select key, value from corpus_meta"))
        rows["index_bytes"] = db_path.stat().st_size
        return {key: int(value) if str(value).isdigit() else value for key, value in rows.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "report"))
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--db", type=Path, default=Path(os.environ.get("RAEDCOACH_INDEX", "~/raedcoach/coach-index.sqlite")).expanduser())
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="chunks embedded and committed per batch")
    parser.add_argument("--limit", type=int, help="smoke-test only: index the first N sorted source files")
    parser.add_argument("--max-rss-mb", type=int, default=DEFAULT_MAX_RSS_MB, help="cleanly stop above this resident-memory ceiling")
    args = parser.parse_args()
    try:
        result = build_index(
            args.corpus, args.db, batch_size=args.batch_size, limit=args.limit,
            max_rss_bytes=args.max_rss_mb * 1024 * 1024,
        ) if args.command == "build" else report(args.db)
    except IndexBuildError as error:
        print(f"LOCAL_INDEX_ERROR: {error}")
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    if args.command == "build":
        print("LOCAL_INDEX_BUILT")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
