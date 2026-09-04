from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from server.coach_graph import CoachRunner, ContractError, NodeContract
from server.coach_index import MAX_TOKENS, IndexBuildError, build_index, chunk_document
from server.coach_qa import QueryRewriteError, RetrievalResult, answer_question


class FakeEncoding:
    def __init__(self, text: str):
        self.ids = text.split()


class FakeTokenizer:
    def encode(self, text: str):
        return FakeEncoding(text)


class FakeEmbedder:
    """Small deterministic local stand-in; records that indexing stays batched."""

    def __init__(self, fail_on_call: int | None = None):
        self.calls: list[int] = []
        self.fail_on_call = fail_on_call

    def embed(self, texts):
        batch = list(texts)
        self.calls.append(len(batch))
        if self.fail_on_call and len(self.calls) == self.fail_on_call:
            raise RuntimeError("simulated HP interruption")
        return [[1.0] * 384 for _ in batch]


PASSAGE = RetrievalResult(
    chunk_id="acsm:one", doc_id="acsm_position_stand", source_path="sources/text/acsm_position_stand.txt",
    char_start=20, char_end=80, text="Resistance training is prescribed with progressive overload.",
    semantic_score=0.8, lexical_rank=1, fused_score=0.03,
)


class StaticRetriever:
    def __init__(self, results):
        self.results = results
        self.queries = []

    def search(self, queries):
        self.queries = list(queries)
        return self.results


class CoachQuestionAnswerTests(unittest.TestCase):
    def test_grounded_answer_has_resolving_citation(self):
        retriever = StaticRetriever([PASSAGE])
        result = answer_question("What is progressive overload?", retriever)
        self.assertEqual(result["status"], "grounded")
        self.assertEqual(result["citations"], [PASSAGE.citation()])
        self.assertIn(PASSAGE.chunk_id, result["answer_ar"])
        self.assertEqual(retriever.queries, ["What is progressive overload?"])

    def test_genuine_no_coverage_refuses_with_no_citations(self):
        result = answer_question("What is the capital of Mars?", StaticRetriever([]))
        self.assertEqual(result["status"], "not_in_sources")
        self.assertEqual(result["citations"], [])
        self.assertIn("غير مذكور", result["answer_ar"])

    def test_query_rewrite_failure_is_an_error_not_a_refusal(self):
        def broken_rewriter(_question):
            raise OSError("subscription adapter unavailable")

        with self.assertRaisesRegex(QueryRewriteError, "Query rewrite failed") as caught:
            answer_question("كم مجموعة للصدر؟", StaticRetriever([]), rewriter=broken_rewriter)
        print(f"QUERY_REWRITE_ERROR_SURFACED: {caught.exception}")
        print("COACH_QA_PATHS_PASSED")

    def test_chunker_uses_realised_token_counter_and_keeps_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "book.txt"
            source.write_text("# Heading\n\n" + " ".join(f"token{i}" for i in range(850)))
            chunks = chunk_document(source, FakeTokenizer())
        self.assertGreaterEqual(len(chunks), 3)
        self.assertTrue(all(chunk.token_count <= MAX_TOKENS for chunk in chunks))
        self.assertEqual(chunks[0].doc_id, "book")

    def test_indexer_commits_small_batches_resumes_after_interruption_and_obeys_rss_ceiling(self):
        with tempfile.TemporaryDirectory() as directory:
            corpus = Path(directory) / "corpus"
            corpus.mkdir()
            for number in range(3):
                (corpus / f"source-{number}.txt").write_text(
                    "# Heading\n\n" + " ".join(f"word{number}_{i}" for i in range(520))
                )
            db = Path(directory) / "index.sqlite"
            interrupted = FakeEmbedder(fail_on_call=2)
            with self.assertRaisesRegex(RuntimeError, "simulated HP interruption"):
                build_index(corpus, db, embedder=interrupted, tokenizer=FakeTokenizer(), batch_size=2)
            self.assertTrue(db.exists(), "a checkpoint database must exist before a full corpus completes")
            self.assertTrue(all(size <= 2 for size in interrupted.calls), "the embedder must never receive an unbounded corpus")

            resumed = FakeEmbedder()
            result = build_index(corpus, db, embedder=resumed, tokenizer=FakeTokenizer(), batch_size=2)
            self.assertGreater(result["chunks"], 3)
            self.assertTrue(all(size <= 2 for size in resumed.calls), "resume must retain the same memory bound")

            smoke = build_index(
                corpus, Path(directory) / "smoke.sqlite", embedder=FakeEmbedder(), tokenizer=FakeTokenizer(),
                batch_size=2, limit=1,
            )
            self.assertEqual(smoke["documents"], 1, "--limit must make a fast, bounded smoke index")

            with self.assertRaisesRegex(IndexBuildError, "RSS ceiling"):
                build_index(
                    corpus, Path(directory) / "ceiling.sqlite", embedder=FakeEmbedder(), tokenizer=FakeTokenizer(),
                    batch_size=2, max_rss_bytes=1, rss_reader=lambda: 2,
                )
        print("COACH_INDEX_STREAM_RESUME_MEMORY_GUARD_PASSED")


class CoachGraphTests(unittest.TestCase):
    def test_checkpointed_question_graph_contracts_and_completion(self):
        nodes = {
            "query_rewrite": lambda state: {"search_queries": ["chest weekly set volume"]},
            "retrieve": lambda state: {"retrieved": [PASSAGE.citation()]},
            "answer": lambda state: {"answer": {"answer_ar": "نص مدعوم", "citations": [PASSAGE.chunk_id]}},
            "validate": lambda state: {"validation": {"ok": True}},
            "deliver": lambda state: {"delivered": {"stored": True}},
        }
        with tempfile.TemporaryDirectory() as directory:
            runner = CoachRunner(str(Path(directory) / "runs.sqlite"), nodes)
            run_id = runner.enqueue_question("raed", "كم مجموعة للصدر؟")
            result = runner.drain(run_id)
            self.assertEqual(result["status"], "done")
            self.assertIsNone(result["step"])
            self.assertEqual(result["delivered"], {"stored": True})
            self.assertEqual(runner.load(run_id)["answer"]["citations"], [PASSAGE.chunk_id])

    def test_model_contract_rejects_any_weight_or_load_output(self):
        contract = NodeContract("answer", frozenset(), frozenset({"answer"}), model_backed=True)
        with self.assertRaisesRegex(ContractError, "cannot emit a weight or load") as caught:
            contract.validate_output({"answer": {"load_kg": 80}})
        print(f"MODEL_LOAD_REJECTED: {caught.exception}")
        print("COACH_GRAPH_CONTRACTS_PASSED")

    def test_node_failure_is_checkpointed_as_dead_letter(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = CoachRunner(str(Path(directory) / "runs.sqlite"), {
                "query_rewrite": lambda state: (_ for _ in ()).throw(QueryRewriteError("broken rewrite")),
            })
            run_id = runner.enqueue_question("raed", "كم مجموعة للصدر؟")
            result = runner.step_once(run_id)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["step"], "dead_letter")
        self.assertEqual(result["errors"][0]["step"], "query_rewrite")
