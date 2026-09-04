"""Grounded question answering over the local RaedWorkouts citation index."""

from __future__ import annotations

import re
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from typing import Callable, Iterable, Protocol

try:  # supports both `python server/…` and package-based unit tests
    from .coach_index import VECTOR_DIMENSIONS
except ImportError:
    from coach_index import VECTOR_DIMENSIONS


class CoachQuestionError(RuntimeError):
    code = "coach_question_error"


class QueryRewriteError(CoachQuestionError):
    code = "query_rewrite_failed"


class RetrievalError(CoachQuestionError):
    code = "retrieval_failed"


class GroundingError(CoachQuestionError):
    code = "grounding_validation_failed"


class QueryRewriter(Protocol):
    def __call__(self, question: str) -> list[str]: ...


class Answerer(Protocol):
    def __call__(self, question: str, passages: list[dict]) -> dict: ...


@dataclass(frozen=True)
class RetrievalResult:
    chunk_id: str
    doc_id: str
    source_path: str
    char_start: int
    char_end: int
    text: str
    semantic_score: float
    lexical_rank: int | None
    fused_score: float

    def citation(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "doc": self.doc_id,
            "source_path": self.source_path,
            "char_start": self.char_start,
            "char_end": self.char_end,
        }


def _has_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06ff]", text))


def _normalise_query(query: str) -> str:
    tokens = re.findall(r"[\w'-]+", query)
    if not tokens:
        raise RetrievalError("The rewritten query is empty")
    # Quoting each token keeps FTS syntax out of user-controlled text.
    return " AND ".join(f'"{token.replace(chr(34), "")}"' for token in tokens)


class LocalRetriever:
    """FTS5 + local-vector retrieval.  It never calls a remote embedding service."""

    def __init__(self, db_path: str, embedder):
        self.db_path = db_path
        self.embedder = embedder

    def search(self, queries: Iterable[str], top_k: int = 6) -> list[RetrievalResult]:
        try:
            import numpy as np
        except ImportError as error:
            raise RetrievalError("numpy is unavailable for local cosine retrieval") from error
        queries = list(queries)
        if not queries:
            raise RetrievalError("No retrieval queries were supplied")
        try:
            with closing(sqlite3.connect(self.db_path)) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute(
                    """select c.*, v.vector from corpus_chunks c join chunk_vectors v using(chunk_id)
                       order by c.chunk_id"""
                ).fetchall()
                if not rows:
                    raise RetrievalError("The local index contains no chunks")
                vectors = np.vstack([np.frombuffer(row["vector"], dtype=np.float32) for row in rows])
                if vectors.shape[1] != VECTOR_DIMENSIONS:
                    raise RetrievalError("The local index dimension does not match bge-small-en-v1.5")
                ranks: dict[str, list[int]] = {}
                for query in queries:
                    lexical = connection.execute(
                        "select chunk_id from corpus_fts where corpus_fts match ? order by bm25(corpus_fts) limit ?",
                        (_normalise_query(query), top_k * 4),
                    ).fetchall()
                    for rank, row in enumerate(lexical, start=1):
                        ranks.setdefault(row["chunk_id"], []).append(rank)
                query_vectors = np.asarray(list(self.embedder.embed(queries)), dtype=np.float32)
        except CoachQuestionError:
            raise
        except Exception as error:
            raise RetrievalError(f"Local retrieval failed: {error}") from error
        if query_vectors.ndim != 2 or query_vectors.shape[1] != VECTOR_DIMENSIONS:
            raise RetrievalError("The local query embedder returned the wrong vector dimension")
        query_vectors /= np.maximum(np.linalg.norm(query_vectors, axis=1, keepdims=True), 1e-12)
        semantic = vectors @ query_vectors.T
        best_semantic = semantic.max(axis=1)
        by_id = {row["chunk_id"]: (index, row) for index, row in enumerate(rows)}
        scores: list[RetrievalResult] = []
        for chunk_id, (index, row) in by_id.items():
            lexical_ranks = ranks.get(chunk_id, [])
            rrf = sum(1 / (60 + rank) for rank in lexical_ranks)
            semantic_value = float(best_semantic[index])
            # Dense vectors rank the entire universe.  A low semantic score is
            # intentionally not enough to claim the question is covered.
            fused = rrf + max(semantic_value, 0.0) / 100
            if lexical_ranks or semantic_value >= 0.45:
                scores.append(RetrievalResult(
                    chunk_id=chunk_id,
                    doc_id=row["doc_id"], source_path=row["source_path"],
                    char_start=row["char_start"], char_end=row["char_end"], text=row["text"],
                    semantic_score=semantic_value, lexical_rank=min(lexical_ranks) if lexical_ranks else None,
                    fused_score=fused,
                ))
        return sorted(scores, key=lambda item: item.fused_score, reverse=True)[:top_k]


def _rewrite(question: str, rewriter: QueryRewriter | None) -> list[str]:
    if not _has_arabic(question):
        return [question]
    if rewriter is None:
        raise QueryRewriteError("Arabic retrieval requires the subscription query-rewrite node")
    try:
        queries = rewriter(question)
    except Exception as error:
        raise QueryRewriteError(f"Query rewrite failed: {error}") from error
    if not isinstance(queries, list) or not queries or not all(isinstance(query, str) and query.strip() for query in queries):
        raise QueryRewriteError("Query rewrite returned no usable English search queries")
    return queries


def _extractive_answer(passages: list[RetrievalResult]) -> str:
    excerpts = "\n\n".join(f"[{item.chunk_id}] {item.text[:700].strip()}" for item in passages[:3])
    return f"المقاطع ذات الصلة من المصادر:\n\n{excerpts}"


def answer_question(question: str, retriever, *, rewriter: QueryRewriter | None = None, answerer: Answerer | None = None) -> dict:
    """Return a cited answer, a true lack-of-coverage refusal, or raise a typed error.

    In particular, a broken Arabic query-rewrite step is an ERROR.  It must
    never be converted into the otherwise-valid `not_in_sources` result.
    """
    if not isinstance(question, str) or not question.strip():
        raise CoachQuestionError("Question must be non-empty text")
    queries = _rewrite(question.strip(), rewriter)
    passages = retriever.search(queries)
    if not passages:
        return {
            "status": "not_in_sources",
            "answer_ar": "هذا غير مذكور في المصادر المتاحة.",
            "citations": [],
            "passages": [],
        }
    citations = [item.citation() for item in passages]
    if answerer is None:
        answer_ar = _extractive_answer(passages)
        cited_ids = [item.chunk_id for item in passages]
    else:
        proposed = answerer(question, [{**item.citation(), "text": item.text} for item in passages])
        answer_ar = proposed.get("answer_ar") if isinstance(proposed, dict) else None
        cited_ids = proposed.get("citations") if isinstance(proposed, dict) else None
        valid_ids = {citation["chunk_id"] for citation in citations}
        if not isinstance(answer_ar, str) or not answer_ar.strip() or not isinstance(cited_ids, list) or not cited_ids:
            raise GroundingError("A model answer must contain text and at least one citation")
        if not set(cited_ids).issubset(valid_ids):
            raise GroundingError("A model answer cited a passage that was not retrieved")
    return {
        "status": "grounded",
        "answer_ar": answer_ar,
        "citations": [citation for citation in citations if citation["chunk_id"] in cited_ids],
        "passages": [{**item.citation(), "text": item.text, "score": item.fused_score} for item in passages],
    }
