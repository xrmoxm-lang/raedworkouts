#!/usr/bin/env python3
"""Local HTTP retrieval only: no chat completion, prompt, or text generation."""

from __future__ import annotations

import argparse
import heapq
import json
import math
import os
import re
import signal
import sqlite3
from datetime import UTC, datetime, timedelta
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from ingest import DEFAULT_MODEL, DEFAULT_RSS_CEILING_MB, ROOT, normalise_vector, ps_rss_mb


class RetrievalError(RuntimeError):
    pass


# Raed writes in Arabic but says the gym words in English, transliterated:
# "الديلود", "السيت", "الريبس". The multilingual model bridges ordinary Arabic
# to English prose well — "كم بروتين أحتاج" finds the protein chapters at 0.66 —
# but a transliterated technical term is not a word in either language, and
# "وش هو الديلود ومتى أسويه؟" returned Cable Shrug cues at 0.363 while 62 chunks
# in the corpus discuss deloads.
#
# This is query expansion, not generation: the English term is appended to the
# question before embedding, so the search sees both spellings. Nothing is
# invented and nothing is shown to him that is not in his own books.
#
# Deliberately short. Every entry is a term that appears in the corpus and that
# he would plausibly type in Arabic letters.
GYM_TERM_BRIDGE = {
    # Each entry maps a transliterated term to a DESCRIPTIVE GLOSS, not just the
    # English word. Measured on this index, 2026-09-03:
    #
    #     "سوبرست" -> "superset"                                    0.398
    #     "سوبرست" -> "superset ... back to back without rest"       0.624
    #     "الديلود" -> "deload"                                      0.466
    #     "الديلود" -> "deload week of reduced volume for recovery"  0.769
    #
    # The reason is the embedding model: paraphrase-multilingual-MiniLM is weak
    # on rare technical tokens and strong on described behaviour. "superset"
    # lands near "supercompensation" and "super-ROM" — string neighbours that
    # are not the concept — while the description lands on the paragraph that
    # actually explains it. So the gloss is doing the retrieval work, and the
    # bare term alone was never going to.
    "ديلود": "deload week of reduced training volume for recovery",
    "الديلود": "deload week of reduced training volume for recovery",
    "سوبرست": "superset supersetting two exercises back to back without rest between them",
    "السوبرست": "superset supersetting two exercises back to back without rest between them",
    "دروبست": "drop set reducing the weight and continuing the set to failure",
    "دروب": "drop set reducing the weight and continuing the set",
    "سيت": "set of repetitions",
    "سيتات": "sets of repetitions",
    "مجموعة": "set of repetitions",
    "مجموعات": "sets per muscle group per week",
    "ريب": "repetition rep",
    "ريبس": "repetitions reps per set",
    "تكرارات": "repetitions reps per set",
    "فوليوم": "training volume total weekly sets",
    "الحجم": "training volume total weekly sets",
    "كارديو": "cardio aerobic training",
    "بروتين": "protein daily intake grams per kilogram",
    "كرياتين": "creatine supplementation",
    "سعرات": "calories daily energy intake",
    "فشل": "training to failure taking a set to muscular failure",
    "الفشل": "training to failure taking a set to muscular failure",
    "تضخيم": "hypertrophy muscle growth bulking phase",
    "تنشيف": "fat loss cutting phase caloric deficit",
    "احماء": "warm up before training general warm up",
    "إحماء": "warm up before training general warm up",
    "الاحماء": "warm up before training general warm up",
    "تدرج": "ramp up warm up sets working up to the working weight",
    "التدرج": "ramp up warm up sets working up to the working weight",
    "تدريجي": "progressive overload adding weight or reps over time",
    "راحة": "rest between sets how long to rest",
    "الراحة": "rest between sets how long to rest",
    "نطاق": "rep range how many repetitions per set",
    "شدة": "intensity effort level RPE",
    "الشدة": "intensity effort level RPE",
    "عضلة": "muscle group",
    "صدر": "chest pectorals",
    "ظهر": "back lats",
    "اكتاف": "shoulders delts",
    "أكتاف": "shoulders delts",
    "باي": "biceps",
    "تراي": "triceps",
    "رجل": "legs quads hamstrings",
    "رجول": "legs quads hamstrings",
    "سكوات": "squat",
    "ديدليفت": "deadlift",
    "بنش": "bench press",
    "وزن": "load weight lifted",
    "تيمبو": "tempo the speed of the lifting and lowering phases of a repetition",
    "نوم": "sleep and recovery",
    "ستريتش": "stretching mobility work",
    "اطالة": "stretching mobility work",
    "كافيين": "caffeine pre workout stimulant",
    "مكمل": "supplement supplementation",
    "مكملات": "supplements creatine protein powder caffeine",
    "بطن": "abs core abdominal training",
    "تردد": "training frequency how many times per week to train a muscle",
    "تكنيك": "lifting technique and form",
    "اصابة": "injury pain and how to train around it",
    "مفصل": "joint pain",
    "تعافي": "recovery between sessions",
    "برنامج": "training programme structure",
    "تمرين": "exercise selection",
    "ايجابي": "concentric phase",
    "سلبي": "eccentric phase lowering the weight",
    # He types these in English as often as he transliterates them, and they are
    # exactly the rare tokens this embedding model handles worst. Measured:
    # "وش يعني tempo؟" landed on a paragraph about mind-muscle connection, while
    # the library holds 184 chunks containing the word "tempo".
    "tempo": "tempo the speed of the lifting and lowering phases of a repetition",
    "rir": "reps in reserve RIR how many reps you had left in the tank",
    "rpe": "rate of perceived exertion RPE scale of effort",
    "deload": "deload week of reduced training volume for recovery",
    "superset": "superset supersetting two exercises back to back without rest between them",
    "1rm": "one rep max 1RM percentage of maximum",
    "amrap": "as many reps as possible set",
    "dropset": "drop set reducing the weight and continuing the set",
    "اسبوعيا": "per week weekly",
    "بالاسبوع": "per week weekly",
}


# Some words gloss correctly on their own and wrongly inside a phrase, so the
# phrase has to win and swallow its words.
#
# The case that forced this: "كم راحة بين المجموعات؟" -- how long do I rest
# between sets. Word by word it expands to
#
#     "rest between sets how long to rest  sets per muscle group per week"
#                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#
# because مجموعات glosses to weekly volume, which is right when he asks how many
# sets to do a week and poison here. That trailing clause is a textbook
# description of weekly volume, so every result came back about weekly volume and
# the question was answered "your books don't cover this" -- about rest between
# sets, in a library of training programmes.
#
# Measured before and after, top-5 by relevance to what was actually asked:
#
#   كم راحة بين المجموعات؟   Hypertrophy Handbook p44 (rest DAYS)  ->  ACSM p3 (rest time between sets)
#   كم سعرة أحتاج للتنشيف؟   Powerbuilding p27 (generic deficit)   ->  Body Recomp p64/65/111 (the actual maths)
#   كم مجموعة للصدر بالأسبوع؟ Chest Hypertrophy p19 (the routine)  ->  Pelland 2025 p2/p10 (the volume meta-analysis)
#
# Protein, deload, superset and warm-up were re-measured and are unchanged.
GYM_PHRASE_BRIDGE = {
    "بين المجموعات": "rest interval between sets how many minutes to rest before the next set",
    "بين المجموعتين": "rest interval between sets how many minutes to rest before the next set",
    "بين التمارين": "rest between exercises",
    "كم سعره": "how many calories per day target daily calorie intake",
    "كم سعرات": "how many calories per day target daily calorie intake",
    "كم سعره حراريه": "how many calories per day target daily calorie intake",
    "في الاسبوع": "per week weekly total number of sets per muscle group per week",
}
_PHRASE_SIZES = sorted({len(k.split()) for k in GYM_PHRASE_BRIDGE}, reverse=True)


# Arabic glues its articles and conjunctions onto the front of a word: the
# question says "الكرياتين", the table says "كرياتين", and an exact whitespace
# match misses it. That is not hypothetical -- "هل الكرياتين مفيد؟" retrieved
# nothing about creatine even though the library has 18 chunks on it, including
# the loading phase and the maintenance dose, because the gloss never fired.
#
# Stripping the clitics fixes every entry at once. The alternative, writing both
# forms by hand, is what the table had been doing for four of its fifty terms and
# silently not doing for the rest.
ARABIC_CLITICS = ("وال", "بال", "كال", "فال", "لل", "ال", "و", "ف", "ب", "ل", "ك")
# Raed types إحماء and احماء interchangeably, and so does everyone. Folding the
# hamza forms means the table needs one spelling per term instead of four.
ARABIC_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ى": "ي", "ة": "ه", "ـ": ""})
_BRIDGE_FOLDED = {k.translate(ARABIC_FOLD): v for k, v in GYM_TERM_BRIDGE.items()}


def bridge_lookup(word: str) -> str | None:
    """Find a bridge term, seeing through a leading article, conjunction or hamza."""
    hit = GYM_TERM_BRIDGE.get(word) or GYM_TERM_BRIDGE.get(word.lower())
    if hit:
        return hit
    folded = word.translate(ARABIC_FOLD)
    hit = _BRIDGE_FOLDED.get(folded)
    if hit:
        return hit
    # Two passes, because Arabic stacks these: "وبالكرياتين" is و + بال +
    # كرياتين, and stripping one prefix leaves "بالكرياتين", which is in no
    # table. One pass found الكرياتين and missed وبالكرياتين, so the fix only
    # half worked. Two is enough for every combination that occurs -- a
    # conjunction, then a preposition-plus-article -- and stopping there keeps
    # it from chewing a short ordinary word down to a false match.
    for _ in range(2):
        stripped = None
        for clitic in ARABIC_CLITICS:
            if folded.startswith(clitic) and len(folded) > len(clitic) + 1:
                stripped = folded[len(clitic):]
                break
        if stripped is None:
            break
        hit = _BRIDGE_FOLDED.get(stripped)
        if hit:
            return hit
        folded = stripped
    return None


def expand_query(question: str) -> str:
    """Append English glosses for the gym terms in the question.

    Phrases are matched first, longest first, and consume their words so a word
    gloss cannot contradict the phrase it sits inside.
    """
    words = [
        token.strip("،.,!:؛()\"'؟?").strip().translate(ARABIC_FOLD)
        for token in question.replace("؟", " ").replace("?", " ").split()
    ]
    consumed: set[int] = set()
    extra: list[str] = []

    for size in _PHRASE_SIZES:
        for start in range(len(words) - size + 1):
            span = range(start, start + size)
            if any(i in consumed for i in span):
                continue
            # Clitics are stripped from the FIRST word of the phrase before
            # matching. "وبين المجموعات" -- "and between the sets" -- missed
            # "بين المجموعات" entirely and fell through to the word-level gloss
            # for مجموعات, which is the weekly-volume gloss this whole table
            # exists to override. One leading و undid the fix.
            head, *tail = words[start:start + size]
            candidates = {" ".join([head, *tail])}
            for clitic in ARABIC_CLITICS:
                if head.startswith(clitic) and len(head) > len(clitic) + 1:
                    candidates.add(" ".join([head[len(clitic):], *tail]))
            gloss = next((GYM_PHRASE_BRIDGE[c] for c in candidates if c in GYM_PHRASE_BRIDGE), None)
            if gloss:
                if gloss not in extra:
                    extra.append(gloss)
                consumed.update(span)

    for index, word in enumerate(words):
        if index in consumed or not word:
            continue
        english = bridge_lookup(word)
        if english and english not in extra:
            extra.append(english)
    return f"{question} {' '.join(extra)}" if extra else question


# Words that carry no discriminating power in a gym corpus, so a phrase built
# around them is not evidence of anything.
_STOP = {
    "the", "a", "an", "of", "to", "for", "and", "or", "in", "on", "at", "is",
    "are", "be", "how", "what", "when", "your", "you", "my", "i", "do", "does",
    "per", "with", "should", "many", "much", "long", "before", "after", "next",
    "this", "that", "it", "its", "their", "there",
}
# A phrase in more than this many chunks is a turn of phrase, not a location.
_RESCUE_MAX_CHUNKS = 25


def rescue_phrases(gloss: str) -> list[str]:
    """Trigrams then bigrams of content words, longest first."""
    words = [w for w in re.findall(r"[a-z0-9%.\-]+", gloss.lower()) if w]
    out: list[str] = []
    for size in (3, 2):
        for i in range(len(words) - size + 1):
            span = words[i:i + size]
            if span[0] in _STOP or span[-1] in _STOP:
                continue
            if all(w in _STOP for w in span):
                continue
            phrase = " ".join(span)
            if phrase not in out:
                out.append(phrase)
    return out


def prose_weight(text: str) -> float:
    """Penalise workout-table scaffolding so it stops outranking real prose.

    Asked "how long should I rest between sets", retrieval kept returning a
    programme table's column headers -- "...SETS REPS %1RM RPE REST SET 1 SET 2"
    and "REST TIMES ARE GIVEN IN MINUTES". Those rows contain every keyword in
    the question and none of the answer, and they recur near-identically across
    dozens of pages, so they crowded out the paragraphs that actually explain it.

    The discriminator is case. Table headers are almost entirely capitals; real
    sentences are mostly lowercase. This is a multiplier, not a filter -- a
    table still wins if nothing better exists, which matters because some
    answers genuinely live in tables.
    """
    letters = [character for character in text if character.isalpha()]
    if len(letters) < 40:
        return 1.0
    lower_ratio = sum(1 for character in letters if character.islower()) / len(letters)
    if lower_ratio >= 0.75:
        return 1.0
    if lower_ratio <= 0.35:
        return 0.72
    # Linear between the two, so nothing changes rank abruptly at a threshold.
    return 0.72 + (lower_ratio - 0.35) * (0.28 / 0.40)


class Retriever:
    def __init__(self, database: Path, model_cache: Path, model_name: str, rss_ceiling_mb: float) -> None:
        if not database.exists():
            raise RetrievalError(f"index does not exist: {database}")
        self.database = database
        self.rss_ceiling_mb = rss_ceiling_mb
        self.lock = threading.Lock()
        from fastembed import TextEmbedding

        self.model = TextEmbedding(model_name=model_name, cache_dir=str(model_cache), threads=1)
        self._enforce_rss("model_loaded")
        with self._connection() as connection:
            row = connection.execute("SELECT COUNT(*), COALESCE(MAX(dim), 0) FROM chunks").fetchone()
        self.chunk_count, self.dim = int(row[0]), int(row[1])
        if not self.chunk_count or not self.dim:
            raise RetrievalError("index contains no vector chunks")
        self._load_matrix()

    def _load_matrix(self) -> None:
        """Hold the vectors and their prose weights in memory, once.

        Measured on this box, 2026-09-02, for a single question:

            full table scan (text + vector)   0.075 s
            prose_weight() on every chunk     0.871 s   <-- recomputed per query
            dot products in pure Python       0.535 s   <-- 4,444 x 384 interpreted
            the same maths in numpy           0.004 s   (130x)

        So roughly 1.4 s of a 1.8 s request was arithmetic the server had
        already done, on text that had not changed since it was indexed.

        The old loop streamed rows in batches of 128 with the note "never load
        the vector corpus into RAM". That instinct was right for the TEXT — the
        book bodies are large — but the vectors are 4,444 x 384 float32 =
        6.8 MB, against a 1400 MB ceiling and 643 MB in use. The texts are still
        not held: only the top-k rows are read back by id, after the ranking.
        """
        import numpy as np
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT id, text, vector FROM chunks ORDER BY id").fetchall()
        self._ids = np.array([int(r[0]) for r in rows], dtype=np.int64)
        # prose_weight depends only on the text, which is immutable once indexed.
        self._prose = np.array([prose_weight(r[1]) for r in rows], dtype=np.float32)
        # Whitespace-collapsed lowercase copies, for the exact-phrase rescue in
        # phrase_rescue(). ~4 MB for this corpus, measured, against a 1400 MB
        # ceiling. The docstring above says the texts are not held; that was
        # true when only ranking needed them, and this is the deliberate
        # exception, with the cost measured rather than assumed.
        self._flat = [" ".join((r[1] or "").lower().split()) for r in rows]
        self._matrix = np.frombuffer(
            b"".join(r[2] for r in rows), dtype=np.float32).reshape(len(rows), self.dim)
        self._np = np
        self._enforce_rss("matrix_loaded")
        flat_mb = sum(len(t) for t in self._flat) / 1e6
        print(f"matrix_loaded chunks={len(rows)} vectors_mb={self._matrix.nbytes / 1e6:.1f} "
              f"text_mb={flat_mb:.1f}", flush=True)

    def _connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(f"file:{self.database}?mode=ro", uri=True, timeout=30)
        connection.execute("PRAGMA query_only=ON")
        return connection

    def _enforce_rss(self, label: str) -> None:
        rss = ps_rss_mb()
        if rss is None or rss >= self.rss_ceiling_mb:
            print(f"RSS_ABORT service label={label} rss_mb={rss} ceiling_mb={self.rss_ceiling_mb}", file=sys.stderr, flush=True)
            # Abort instead of risking the other HP workloads; systemd may restart it.
            os._exit(70)

    def _embed_query(self, question: str) -> list[float]:
        question = expand_query(question)
        with self.lock:
            if hasattr(self.model, "query_embed"):
                vector = next(self.model.query_embed([question]))
            else:
                vector = next(self.model.embed(["Represent this sentence for searching relevant passages: " + question]))
            self._enforce_rss("query_embedded")
        normalised = normalise_vector(vector)
        if len(normalised) != self.dim:
            raise RetrievalError(f"query vector dimension {len(normalised)} differs from index dimension {self.dim}")
        return normalised

    @staticmethod
    def _dot(query: list[float], packed: bytes) -> float:
        values = memoryview(packed).cast("f")
        return sum(left * right for left, right in zip(query, values))

    def search(self, question: str, top_k: int, min_score: float) -> list[dict[str, Any]]:
        """Rank in numpy, then read back only the rows that won.

        Identical maths to the streaming version it replaces: the same dot
        product against the same normalised vectors, multiplied by the same
        prose_weight, filtered by the same min_score. Only the order of work
        changed — weights precomputed, arithmetic vectorised, and text fetched
        for the handful of chunks that actually make the cut instead of all
        4,444 on the way past.
        """
        np = self._np
        query = np.array(self._embed_query(question), dtype=np.float32)
        scores = (self._matrix @ query) * self._prose

        if int(top_k) <= 0:
            return []
        # 494 of the 4,288 chunks are exact duplicate text — programme PDFs
        # repeat the same cue block on every week's page, one of them twelve
        # times. Ranking is per chunk, so a question about shrugs came back as
        # the same paragraph three times and the answer was one passage wearing
        # three page numbers. Over-fetch, then keep the first occurrence of each
        # distinct text; the page kept is the highest-scoring one.
        take = min(int(top_k) * 6, scores.shape[0])
        idx = np.argpartition(-scores, take - 1)[:take] if take < scores.shape[0] else np.arange(scores.shape[0])
        idx = idx[np.argsort(-scores[idx])]

        winners = [(int(self._ids[i]), float(scores[i])) for i in idx if float(scores[i]) >= min_score]
        if not winners:
            # The exact-phrase rescue runs HERE too, not only after a
            # successful dense search. It exists precisely because the
            # answering clause can sit in a window whose vector describes
            # something else -- and when that happens for EVERY chunk, the
            # dense scores are all below the floor and the old code returned
            # empty without ever looking for the phrase. The one mechanism
            # that can still find the answer was switched off in the only
            # case where it was the last resort.
            rescued = self._phrase_rescue(question, [], top_k)
            if rescued:
                print(f"phrase_rescue_only n={len(rescued)}", flush=True)
                self._enforce_rss("search_complete")
                return rescued
            self._enforce_rss("search_complete")
            return []

        placeholders = ",".join("?" for _ in winners)
        with self._connection() as connection:
            rows = {
                int(r[0]): r
                for r in connection.execute(
                    # LEFT JOIN, not JOIN: 49 chunks were deliberately left
                    # untranslated (tables, figure captions), and an inner join
                    # would make them vanish from search entirely.
                    f"SELECT c.id, c.work, c.page, c.text, a.text_ar "
                    f"FROM chunks c LEFT JOIN chunks_ar a ON a.chunk_id = c.id "
                    f"WHERE c.id IN ({placeholders})",
                    [w[0] for w in winners],
                )
            }
        results = []
        seen: set[str] = set()
        for chunk_id, score in winners:
            row = rows.get(chunk_id)
            if row is None:
                continue
            # Normalised so near-identical OCR spacing does not slip a copy past.
            fingerprint = " ".join((row[3] or "").split())
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            results.append({
                "text": row[3], "work": row[1], "page": row[2],
                # None when the chunk has no translation; the app falls back to
                # the English rather than showing an empty passage.
                "text_ar": row[4],
                "score": round(score, 6),
            })
            if len(results) >= int(top_k):
                break
        results = self._phrase_rescue(question, results, top_k)
        self._enforce_rss("search_complete")
        return results

    def _phrase_rescue(self, question: str, results: list, top_k: int) -> list:
        """Add chunks that literally contain a rare phrase from the gloss.

        Why this exists. The index is fixed-width character windows, roughly 900
        chars, cut without regard to sentence or topic. The ACSM paper states
        "eight to twenty repetitions per set, 2-3 min rest between sets, loads
        40%-70% 1RM" -- the answer to "كم راحة بين المجموعات؟" -- inside a window
        whose surrounding text is about resistance-training participation rates
        among older adults. The window's vector describes participation rates,
        because that is most of what it says, so no phrasing of the question
        retrieves it. Dense search cannot reach a clause whose neighbours are
        about something else.

        The exact phrase can. "rest between sets" appears in exactly two chunks
        in the whole library, and both are the ones that answer the question.
        That rarity is the safeguard: a phrase in more than _RESCUE_MAX_CHUNKS
        chunks is a common turn of phrase and is skipped, so this adds precision
        without adding noise.

        It appends, never re-ranks. The dense winners keep their order and their
        places, so a rescue can only ever add a passage the model may cite -- and
        the model decides whether any of them actually answer the question.
        """
        gloss = expand_query(question)[len(question):].strip()
        if not gloss:
            return results
        have = {" ".join((r.get("text") or "").split()) for r in results}
        added = 0
        for phrase in rescue_phrases(gloss)[:12]:
            if added >= 2:
                break
            hits = [i for i, flat in enumerate(self._flat) if phrase in flat]
            if not hits or len(hits) > _RESCUE_MAX_CHUNKS:
                continue
            with self._connection() as connection:
                rows = connection.execute(
                    "SELECT c.id, c.work, c.page, c.text, a.text_ar "
                    "FROM chunks c LEFT JOIN chunks_ar a ON a.chunk_id = c.id "
                    f"WHERE c.id IN ({','.join('?' * len(hits))})",
                    [int(self._ids[i]) for i in hits],
                ).fetchall()
            for row in rows:
                if added >= 2:
                    break
                fingerprint = " ".join((row[3] or "").split())
                if fingerprint in have:
                    continue
                have.add(fingerprint)
                results.append({
                    "text": row[3], "work": row[1], "page": row[2], "text_ar": row[4],
                    # Named, not faked as a similarity score: this passage is here
                    # because it contains the phrase, and pretending otherwise
                    # would put an invented number in front of Raed.
                    "score": None, "matched_phrase": phrase,
                })
                added += 1
        if added:
            print(f"phrase_rescue added={added}", flush=True)
        return results


# ---- A written answer, grounded in his own books --------------------------
#
# Raed asked for this in as many words and called it "ما هي خيار": an answer in
# Arabic built from the passages retrieval already finds, instead of five
# English paragraphs he has to read himself.
#
# Four rules this layer does not get to break:
#
#   1. It never runs without sources. If nothing clears the score floor the
#      request returns no_match and the API is never called, so the model is
#      never in a position to invent an answer. That is D8 -- "a blank beats a
#      wrong one" -- applied to prose instead of video.
#   2. The key stays on this machine. In the app it would ship to anyone who
#      opens the page.
#   3. The passages come back with the answer, never instead of it. He can read
#      the source himself, and the answer cites book and page inline.
#   4. A failed or slow call is not a failed search. The passages are the
#      product; the written answer is a convenience on top of them.
#
# The passages are sent in ENGLISH even though the answer is Arabic: the English
# is the original text of the books, the Arabic is a machine translation of it,
# and grounding on a translation of a source is one lossy step further from what
# the author wrote. It is also about a third of the tokens.
#
# Cost, measured rather than estimated: gpt-5.6-luna at $0.20 / $1.20 per
# million, five passages, ~943 in and ~105 out => $0.00031 a question, about 31
# cents per thousand. The identical-question cache below means his own repeats
# are free.
# The models he can switch between, with their real prices so the app can show
# what a change costs instead of asking him to trust a name. Prices are per
# million tokens, input/output.
MODEL_CHOICES = [
    {"id": "gpt-5.6-luna", "in": 0.20, "out": 1.20, "note": "الأرخص — المستعمل"},
    {"id": "gpt-5.6-terra", "in": 2.00, "out": 12.00, "note": "١٠× أغلى"},
    {"id": "gpt-5.6-sol", "in": 5.00, "out": 30.00, "note": "٢٥× أغلى"},
]
MODEL_PRICES = {m["id"]: (m["in"] / 1e6, m["out"] / 1e6) for m in MODEL_CHOICES}


# The chosen model lives in a file, not only in memory: he picks it in Settings
# and it has to still be the one answering after the next restart. The env var
# stays the default for a fresh install.
MODEL_CHOICE_FILE = ROOT / "model.txt"


def _load_model_choice() -> str:
    default = os.environ.get("RAEDWORKOUTS_ANSWER_MODEL", "gpt-5.6-luna")
    try:
        chosen = MODEL_CHOICE_FILE.read_text().strip()
    except Exception:
        return default
    # Only from the published list. A value from disk is still input.
    return chosen if any(m["id"] == chosen for m in MODEL_CHOICES) else default


ANSWER_MODEL = _load_model_choice()
ANSWER_PRICE_IN = 0.20 / 1_000_000
ANSWER_PRICE_OUT = 1.20 / 1_000_000
# Why the model judges answerability and the similarity score does not.
#
# The obvious guard is a score floor: only answer when retrieval is confident.
# I measured whether that works, on 26 questions, and it does not. The bands
# overlap in the wrong direction:
#
#   real, the books answer it        nonsense, the books do not
#   ------------------------------   --------------------------------
#   هل الإحماء ضروري؟        0.396   وش عاصمة اليابان؟          0.179
#   وش يعني tempo؟           0.398   علاج حب الشباب؟            0.273
#   وش هو RIR؟               0.412   كيف أغير زيت السيارة؟      0.401
#   هل الكرياتين مفيد؟       0.476   وش أفضل وصفة كبسة لحم؟     0.514
#   كم سعرة أحتاج للتنشيف؟   0.606   كم جرعة الأنسولين للسكري؟  0.547
#
# No threshold separates those columns. "وش هو RIR؟" scores 0.412 and its top
# passage is the exact RPE/RIR definition on page 89; the kabsa question scores
# higher and lands on quinoa. The score measures cross-lingual similarity, not
# whether the passage answers the question, and a floor high enough to stop the
# kabsa question would silence RIR, tempo, creatine and warm-ups -- core
# questions his library genuinely covers.
#
# So the floor stays low enough to let real questions through, and the model
# decides answerability with the passages in front of it. It returns a flag, not
# a sentence I have to parse: `answered` false means the app shows a plain "not
# in your books" state instead of dressing five irrelevant passages up as
# sources. `used` names the passages it actually drew on, so the app can show
# those and drop the rest.
#
# This is D8 -- a blank beats a wrong one -- moved to where the judgement can
# actually be made.
ANSWER_SCHEMA = {
    "name": "coach_answer",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "answered": {"type": "boolean"},
            "text": {"type": "string"},
            "used": {"type": "array", "items": {"type": "integer"}},
        },
        "required": ["answered", "text", "used"],
        "additionalProperties": False,
    },
}
ANSWER_SYSTEM = (
    "أنت مدرب رائد الشخصي، ولا تعرف شيئاً خارج المقاطع المعطاة لك من كتبه.\n\n"
    "أعد كائن JSON فيه:\n"
    "- answered: هل تجيب المقاطع على سؤاله فعلاً؟\n"
    "- text: الجواب بالعربية الفصحى المبسّطة.\n"
    "- used: أرقام المقاطع التي أخذت منها فعلاً (مثال: [1,3]).\n\n"
    "قواعد ملزمة:\n"
    "- إذا كانت المقاطع لا تجيب على السؤال: answered=false، وفي text جملة واحدة "
    "تقول إن كتبه لا تغطي هذا، بلا أي معلومة من عندك، و used فارغة.\n"
    "- لا تذكر رقماً ولا توصية غير موجودة نصاً في المقاطع.\n"
    # Titles were cited inline as "(The Ultimate Guide to Body Recomposition، "
    # "صفحة ١٠٤)". Rendered in an RTL paragraph, a title that long wraps: "(The"
    # ends one line and the rest begins the next, and the reader has to
    # reassemble it across a direction change. A bracketed index is one or two
    # characters, is direction-neutral, and points at the passage card below,
    # which already carries the book and the page.
    "- بعد كل معلومة ضع رقم المقطع الذي أخذتها منه هكذا: [1] أو [2].\n"
    "- أبقِ المصطلحات التقنية بالإنجليزية إن لم يكن لها مقابل عربي شائع "
    "(RIR, RPE, 1RM, superset, deload).\n"
    "- خمس جمل كحد أقصى، بلا مقدمات ولا خواتيم."
)

# Identical questions are common -- he taps the same example chips, and reopening
# the tab re-asks. Small, bounded, and process-local: it disappears on restart,
# which is the right lifetime for something that costs a third of a cent to
# rebuild.
_ANSWER_CACHE: dict[str, dict] = {}
_ANSWER_CACHE_MAX = 128
_ANSWER_LOCK = threading.Lock()


def _answer_cache_key(question: str, results: list, context: str = "") -> str:
    # Keyed on the question AND the passages: if the index is rebuilt and the
    # same question retrieves different sources, the old answer must not stand.
    pages = "|".join(f"{r.get('work')}#{r.get('page')}" for r in results)
    return " ".join(question.lower().split()) + "||" + pages + "||" + context.lower()


def write_answer(question: str, results: list, timeout: float = 30.0, context: str = "") -> dict:
    """Answer from these passages. Never called with an empty list.

    `context` is the exercise Raed is standing at, and it is deliberately NOT
    part of the question. Glued on, it silently narrowed every question: asked
    "متى أسوي ديلود؟" from inside a session on the Chest Press Machine, the model
    answered "your books do not cover when to deload for the Chest Press
    Machine" -- true, useless, and not what he asked. It is passed as a note the
    model may use when the passages say something specific about that movement,
    and ignore otherwise.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        # Honest state, not a failure: the search worked, the answer is off.
        return {"status": "unconfigured"}

    key = _answer_cache_key(question, results, context)
    with _ANSWER_LOCK:
        hit = _ANSWER_CACHE.get(key)
    if hit is not None:
        print(f"answer_cached model={ANSWER_MODEL}", flush=True)
        return dict(hit, cached=True)

    passages = "\n\n".join(
        f"[{i + 1}] {r.get('work', '')} — page {r.get('page', '')}\n{r.get('text', '')}"
        for i, r in enumerate(results)
    )
    body = json.dumps({
        "model": ANSWER_MODEL,
        "messages": [
            {"role": "system", "content": ANSWER_SYSTEM},
            {"role": "user", "content": (
                f"سؤال رائد: {question}\n"
                + (f"(هو الآن يتمرّن على: {context} — هذا سياق فقط، وليس جزءاً من السؤال. "
                   f"لا تُضيّق الجواب عليه إلا إذا كانت المقاطع تخصّه فعلاً.)\n" if context else "")
                + f"\nالمقاطع من كتبه:\n{passages}"
            )},
        ],
        "max_completion_tokens": 600,
        "response_format": {"type": "json_schema", "json_schema": ANSWER_SCHEMA},
    }, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except Exception as error:
        print(f"answer_failed model={ANSWER_MODEL} error={type(error).__name__}", flush=True)
        return {"status": "failed", "error": type(error).__name__}

    raw = ((payload.get("choices") or [{}])[0].get("message") or {}).get("content", "") or ""
    usage = payload.get("usage") or {}
    tokens_in = int(usage.get("prompt_tokens") or 0)
    tokens_out = int(usage.get("completion_tokens") or 0)
    price_in, price_out = MODEL_PRICES.get(ANSWER_MODEL, (ANSWER_PRICE_IN, ANSWER_PRICE_OUT))
    usd = tokens_in * price_in + tokens_out * price_out
    record_spend(ANSWER_MODEL, "answer", tokens_in, tokens_out, usd)
    print(f"answer_ok model={ANSWER_MODEL} in={tokens_in} out={tokens_out} usd={usd:.6f}", flush=True)
    try:
        parsed = json.loads(raw)
        text = str(parsed.get("text") or "").strip()
        answered = bool(parsed.get("answered"))
        used = [int(n) for n in (parsed.get("used") or []) if isinstance(n, (int, float))]
    except (ValueError, TypeError):
        # strict json_schema makes this near-impossible, but a malformed reply
        # must not become a confident answer.
        print("answer_unparsable", flush=True)
        return {"status": "failed", "error": "unparsable"}
    if not text:
        return {"status": "failed", "error": "empty_completion"}
    # 1-based in the prompt, 0-based here, and clamped: a hallucinated index
    # must not reach into a passage that was never sent.
    used = sorted({n - 1 for n in used if 1 <= n <= len(results)})

    answer = {
        "status": "ok", "answered": answered, "text": text, "used": used,
        "model": ANSWER_MODEL,
        "tokens_in": tokens_in, "tokens_out": tokens_out, "usd": round(usd, 6),
    }
    with _ANSWER_LOCK:
        if len(_ANSWER_CACHE) >= _ANSWER_CACHE_MAX:
            _ANSWER_CACHE.pop(next(iter(_ANSWER_CACHE)))
        _ANSWER_CACHE[key] = answer
    return answer


def rewrite_query(question: str, timeout: float = 25.0) -> str:
    """The same question, in the English a training book would use.

    This exists because of a measurement, not a hunch. Of seven questions the
    coach refused while the answer sat in his library, the failure was almost
    always Arabic->English recall: "كم مجموعة للعضلة بالأسبوع؟" found nothing,
    while "How many weekly sets per muscle group optimize hypertrophy?" found
    the 10-set minimum on three pages. The model knows the vocabulary the books
    use; retrieval does not.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return ""
    body = json.dumps({
        "model": ANSWER_MODEL,
        "messages": [
            {"role": "system", "content":
             "You turn an Arabic gym question into the English phrasing a "
             "hypertrophy or nutrition textbook would use for the SAME question. "
             "Reply with the search phrase only: 6-14 words, no quotes, no "
             "explanation, never empty."},
            {"role": "user", "content": question},
        ],
        "max_completion_tokens": 60,
    }, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except Exception as error:
        print(f"rewrite_failed {type(error).__name__}", flush=True)
        return ""
    text = ((payload.get("choices") or [{}])[0].get("message") or {}).get("content", "") or ""
    usage = payload.get("usage") or {}
    price_in, price_out = MODEL_PRICES.get(ANSWER_MODEL, (ANSWER_PRICE_IN, ANSWER_PRICE_OUT))
    record_spend(ANSWER_MODEL, "rewrite",
                 usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0),
                 usage.get("prompt_tokens", 0) * price_in + usage.get("completion_tokens", 0) * price_out)
    # An empty rewrite is a real outcome -- the model returned nothing twice in
    # testing -- and must not become a 3-character query the endpoint rejects.
    return text.strip()


WEB_SYSTEM = (
    "أنت مدرب رائد. كتبه لا تغطي هذا السؤال، فتجيب من الإنترنت.\n"
    "- أجب بالعربية الفصحى المبسّطة، في أربع جمل كحد أقصى.\n"
    "- اذكر أرقاماً محددة إن وُجدت، ولا تخترع رقماً.\n"
    "- إذا كانت المصادر متضاربة، قل ذلك.\n"
    "- أبقِ المصطلحات التقنية بالإنجليزية (RIR, RPE, 1RM, deload)."
)


def answer_from_web(question: str, timeout: float = 90.0) -> dict:
    """Last resort, and it says so.

    Raed asked for exactly this shape: make sure the books really do not have
    it, THEN go to the internet, and say that is where it came from. So this is
    only ever reached after two library passes have failed, and what it returns
    is labelled `source: web` all the way to the screen -- the app renders it
    differently, because an answer from the open internet is not the same kind
    of thing as a line from a book he owns.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {"status": "unconfigured"}
    body = json.dumps({
        "model": ANSWER_MODEL,
        "tools": [{"type": "web_search"}],
        "input": f"{WEB_SYSTEM}\n\nسؤال رائد: {question}",
    }, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except Exception as error:
        print(f"web_failed {type(error).__name__}", flush=True)
        return {"status": "failed", "error": type(error).__name__}

    text, citations = "", []
    for item in payload.get("output") or []:
        if item.get("type") != "message":
            continue
        for chunk in item.get("content") or []:
            text += chunk.get("text") or ""
            for note in chunk.get("annotations") or []:
                url = note.get("url") or ""
                if url and url not in citations:
                    citations.append(url)
    usage = payload.get("usage") or {}
    tokens_in = int(usage.get("input_tokens") or 0)
    tokens_out = int(usage.get("output_tokens") or 0)
    price_in, price_out = MODEL_PRICES.get(ANSWER_MODEL, (ANSWER_PRICE_IN, ANSWER_PRICE_OUT))
    usd = tokens_in * price_in + tokens_out * price_out
    record_spend(ANSWER_MODEL, "web", tokens_in, tokens_out, usd)
    print(f"web_ok in={tokens_in} out={tokens_out} usd={usd:.6f} cites={len(citations)}", flush=True)
    if not text.strip():
        return {"status": "failed", "error": "empty"}
    return {"status": "ok", "answered": True, "source": "web", "text": text.strip(),
            "citations": citations[:5], "used": [], "model": ANSWER_MODEL,
            "tokens_in": tokens_in, "tokens_out": tokens_out, "usd": round(usd, 6)}

# ---- What the coach costs, kept rather than printed --------------------------
#
# Spend used to exist only as a line in journald, which rotates. Raed asked for
# this week, this month, and since the beginning, so it has to be stored. One
# row per call, no aggregation on write: the totals are cheap to compute over a
# table this small and a stored total is a number that can drift from its parts.
SPEND_DB = ROOT / "spend.sqlite3"
SPEND_ALERT_USD = float(os.environ.get("RAEDWORKOUTS_MONTHLY_ALERT_USD", "5"))
# A HARD ceiling, not a second alert.
#
# COACH_KEY ships in the app's public JavaScript — the same accepted trust model
# as SYNC_KEY — and this service is public through the Funnel. That trade was
# fine while the worst case was someone reading Raed's books. It stopped being
# fine once /answer became a metered call: anyone with the page source could
# spend his OpenAI credit, without limit, and the only thing watching was an
# alert that reports after the fact.
#
# Set above the alert on purpose, so the alert is what he sees first and the cap
# is what he never reaches.
SPEND_CAP_USD = float(os.environ.get("RAEDWORKOUTS_MONTHLY_CAP_USD", "25"))


def month_spend_usd() -> float:
    """This calendar month's spend. Fails OPEN — a cap that cannot read its own
    ledger must not lock him out of a coach he is paying for."""
    try:
        with _spend_conn() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(usd), 0) FROM spend WHERE at >= ?",
                (datetime.now(UTC).strftime("%Y-%m-01"),)).fetchone()
        return float(row[0] or 0.0)
    except Exception as error:
        print(f"spend_read_failed {type(error).__name__}", flush=True)
        return 0.0


def over_spend_cap() -> bool:
    return SPEND_CAP_USD > 0 and month_spend_usd() >= SPEND_CAP_USD


def _spend_conn():
    conn = sqlite3.connect(SPEND_DB, timeout=10)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS spend (
            at TEXT NOT NULL, model TEXT NOT NULL, kind TEXT NOT NULL,
            tokens_in INTEGER, tokens_out INTEGER, usd REAL NOT NULL
        )""")
    conn.execute("CREATE INDEX IF NOT EXISTS spend_at ON spend(at)")
    return conn


def record_spend(model: str, kind: str, tokens_in: int, tokens_out: int, usd: float) -> None:
    try:
        with _spend_conn() as conn:
            conn.execute(
                "INSERT INTO spend (at, model, kind, tokens_in, tokens_out, usd) VALUES (?,?,?,?,?,?)",
                (datetime.now(UTC).isoformat(timespec="seconds"), model, kind,
                 int(tokens_in or 0), int(tokens_out or 0), float(usd or 0.0)))
    except Exception as error:
        # Never let accounting break an answer he is waiting for.
        print(f"spend_write_failed {type(error).__name__}", flush=True)


def spend_summary() -> dict:
    """Totals for the settings panel. Windows are calendar-based, not rolling:
    "this month" has to mean what the calendar says or it cannot be checked."""
    now = datetime.now(UTC)
    week = (now - timedelta(days=now.weekday() + 1 if now.weekday() < 6 else 0)).strftime("%Y-%m-%d")
    month = now.strftime("%Y-%m-01")
    year = now.strftime("%Y-01-01")
    out = {"alert_usd": SPEND_ALERT_USD, "model": ANSWER_MODEL, "models": MODEL_CHOICES}
    try:
        with _spend_conn() as conn:
            for label, since in (("week", week), ("month", month), ("year", year), ("all", "0")):
                row = conn.execute(
                    "SELECT COUNT(*), COALESCE(SUM(usd), 0) FROM spend WHERE at >= ?",
                    (since,)).fetchone()
                out[label] = {"questions": row[0], "usd": round(row[1], 6)}
            first = conn.execute("SELECT MIN(at) FROM spend").fetchone()[0]
            out["since"] = (first or "")[:10]
    except Exception as error:
        return {"status": "unavailable", "error": type(error).__name__}
    out["cap_usd"] = SPEND_CAP_USD
    out["over_alert"] = out["month"]["usd"] >= SPEND_ALERT_USD
    out["over_cap"] = SPEND_CAP_USD > 0 and out["month"]["usd"] >= SPEND_CAP_USD
    return out


class Server(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, address: tuple[str, int], retriever: Retriever, allowed_origins: set[str], access_key: str = "") -> None:
        self.retriever = retriever
        self.allowed_origins = allowed_origins
        self.access_key = access_key
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server: Server
    server_version = "RaedWorkoutsRetrieval/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: object) -> None:
        # Avoid recording questions in system logs. Status-only access records are enough.
        print(f"http client={self.client_address[0]} status={getattr(self, '_response_status', 0)}", flush=True)

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin and origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Coach-Key")
            # Chrome Private Network Access. The page is a PUBLIC https origin
            # (Vercel) while this host is a PRIVATE address (100.x CGNAT over
            # Tailscale), so Chrome blocks the request unless the server opts in
            # on the preflight. curl never enforces this, so it surfaced only in
            # a real browser, and only as a bare "TypeError: Failed to fetch".
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self._response_status = status
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._response_status = 204
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/usage":
            # Same key as everything else: it reports what he has spent, which
            # is nobody else's business either.
            expected = getattr(self.server, "access_key", "")
            if expected:
                import hmac
                if not hmac.compare_digest(self.headers.get("X-Coach-Key", ""), expected):
                    self._send(401, {"status": "unauthorized"})
                    return
            self._send(200, spend_summary())
            return
        if self.path == "/health":
            self._send(200, {"status": "ok", "mode": "retrieval_only", "chunks": self.server.retriever.chunk_count})
            return
        self._send(404, {"status": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/search", "/answer", "/model"):
            self._send(404, {"status": "not_found"})
            return
        # Constant-time compare so a wrong key cannot be recovered by timing.
        expected = getattr(self.server, "access_key", "")
        if expected:
            import hmac
            supplied = self.headers.get("X-Coach-Key", "")
            if not hmac.compare_digest(supplied, expected):
                # Drain the request body before answering. Replying 401 with an
                # unread body leaves the connection out of sync, and Tailscale
                # Serve rewrites the whole thing into its own 400 HTML page --
                # so the caller cannot tell "wrong key" from "malformed request".
                try:
                    pending = int(self.headers.get("Content-Length", "0"))
                    if 0 < pending <= 32_768:
                        self.rfile.read(pending)
                except (TypeError, ValueError):
                    pass
                self._send(401, {"status": "unauthorized"})
                return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 32_768:
                raise ValueError("body must be 2 to 32768 bytes")
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("JSON body must be an object")

            if self.path == "/model":
                global ANSWER_MODEL
                chosen = data.get("model")
                if not any(m["id"] == chosen for m in MODEL_CHOICES):
                    raise ValueError("unknown model")
                MODEL_CHOICE_FILE.write_text(chosen)
                ANSWER_MODEL = chosen
                print(f"model_changed to={chosen}", flush=True)
                self._send(200, {"status": "ok", "model": chosen})
                return

            question = data.get("question")
            if not isinstance(question, str) or not 3 <= len(question.strip()) <= 1000:
                raise ValueError("question must be a 3-1000 character string")
            # The exercise Raed is standing at, when he asked from inside a
            # session. It arrives as its own field rather than glued onto the
            # question, because those are two different jobs -- see write_answer.
            context = data.get("context")
            if context is not None and (not isinstance(context, str) or len(context) > 120):
                raise ValueError("context must be a string of at most 120 characters")
            context = (context or "").strip()
            # The app decides whether leaving the library is allowed, so the
            # internet can never be reached by a request that did not ask.
            allow_web = bool(data.get("allow_web"))
            top_k = data.get("top_k", 10)
            min_score = data.get("min_score", 0.45)
            # `isinstance(True, int)` is True in Python, so {"top_k": true,
            # "min_score": false} used to validate as 1 and 0.0 -- and a
            # min_score of 0.0 turns off the floor on a PUBLIC endpoint, so a
            # malformed request could force a paid answer call on whatever
            # retrieval happened to rank first. Reject bools explicitly.
            if isinstance(top_k, bool) or not isinstance(top_k, int) or not 1 <= top_k <= 10:
                raise ValueError("top_k must be an integer from 1 to 10")
            if isinstance(min_score, bool) or not isinstance(min_score, (int, float)) \
                    or not 0 <= float(min_score) <= 1:
                raise ValueError("min_score must be between 0 and 1")
            # Retrieval sees the exercise name; the model does not see it as part
            # of the question. Appending it here surfaces passages about the
            # movement he is on without turning "when do I deload?" into "when do
            # I deload for the Chest Press Machine?".
            probe = f"{question.strip()} {context}".strip() if context else question.strip()
            results = self.server.retriever.search(probe, top_k, float(min_score))
            if not results:
                # Nothing cleared the floor, so /answer stops here too and the
                # API is never called. A model handed no passages is a model
                # guessing, and guessing is the one thing this must not do.
                self._send(200, {"status": "no_match", "message": "no match", "results": []})
                return
            if self.path == "/answer":
                # Over the ceiling, retrieval still runs — it is local, free, and
                # it is the half of this feature that is actually HIS books. He
                # loses the written prose, not the library, and he is told which.
                if over_spend_cap():
                    self._send(200, {
                        "status": "ok", "results": results,
                        "answer": {"status": "over_budget", "answered": False,
                                   "month_usd": round(month_spend_usd(), 4),
                                   "cap_usd": SPEND_CAP_USD},
                    })
                    return
                written = write_answer(question.strip(), results, context=context)
                written["pass"] = 1

                # Pass 2: his books again, asked in their own language. Only
                # when the first pass said the passages do not answer it --
                # never to second-guess an answer it already gave.
                if written.get("status") == "ok" and not written.get("answered"):
                    english = rewrite_query(question.strip())
                    if len(english) >= 3:
                        # A lower floor on the retry, deliberately. The English
                        # rewrite is the better query, so the reason to be
                        # cautious is weaker — and the model still decides
                        # whether what comes back answers anything.
                        retry = self.server.retriever.search(
                            english, top_k, min(float(min_score), 0.25))
                        # Union, not replacement: pass 1's passages were the
                        # best matches for how HE asked it, and dropping them
                        # to make room for a rephrasing throws away evidence.
                        seen = {" ".join((r.get("text") or "").split()) for r in retry}
                        merged = retry + [r for r in results
                                          if " ".join((r.get("text") or "").split()) not in seen]
                        merged = merged[:max(top_k, len(retry))]
                        if merged:
                            second = write_answer(question.strip(), merged, context=context)
                            if second.get("status") == "ok" and second.get("answered"):
                                second["pass"] = 2
                                second["rewritten_as"] = english
                                self._send(200, {"status": "ok", "results": merged, "answer": second})
                                return

                # Pass 3: the open internet, and it is labelled as such the
                # whole way to the screen. Only reached when both library
                # passes have failed, and only when the caller asked for it --
                # the app sends allow_web, so this can never surprise him.
                if allow_web and written.get("status") == "ok" and not written.get("answered"):
                    web = answer_from_web(question.strip())
                    if web.get("status") == "ok":
                        web["pass"] = 3
                        self._send(200, {"status": "ok", "results": results, "answer": web})
                        return

                self._send(200, {"status": "ok", "results": results, "answer": written})
                return
            self._send(200, {"status": "ok", "results": results})
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            self._send(400, {"status": "invalid_request", "error": str(error)})
        except RetrievalError as error:
            self._send(503, {"status": "unavailable", "error": str(error)})
        except Exception:
            self._send(500, {"status": "unavailable"})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / "index.sqlite3")
    parser.add_argument("--model-cache", type=Path, default=ROOT / "models")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--port", type=int, default=8124)
    parser.add_argument("--rss-ceiling-mb", type=float, default=DEFAULT_RSS_CEILING_MB)
    parser.add_argument("--allowed-origins", default=os.environ.get("RAEDWORKOUTS_ALLOWED_ORIGINS", "https://raedmohammed.github.io"))
    # Required once the service is reachable from outside the tailnet. Without
    # it the endpoint would serve the text of books Raed paid for to anyone who
    # finds the URL, and an unguessable path is not access control.
    parser.add_argument("--access-key", default=os.environ.get("RAEDWORKOUTS_ACCESS_KEY", ""))
    args = parser.parse_args()
    if args.rss_ceiling_mb <= 0 or args.rss_ceiling_mb >= 1500:
        raise SystemExit("rss ceiling must be positive and strictly below 1500 MB")
    retriever = Retriever(args.database.resolve(), args.model_cache.resolve(), args.model, args.rss_ceiling_mb)
    origins = {item.strip() for item in args.allowed_origins.split(",") if item.strip()}
    servers = [Server(("127.0.0.1", args.port), retriever, origins, args.access_key), Server(("100.127.81.84", args.port), retriever, origins, args.access_key)]
    stop = threading.Event()

    def request_shutdown(*_: object) -> None:
        if stop.is_set():
            return
        stop.set()
        for running in servers:
            threading.Thread(target=running.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    threads = [threading.Thread(target=running.serve_forever, name=f"http-{running.server_address[0]}", daemon=True) for running in servers]
    for thread in threads:
        thread.start()
    print(f"SERVICE_READY port={args.port} listeners=127.0.0.1,100.127.81.84 chunks={retriever.chunk_count} generation=false auth=" + ("on" if args.access_key else "OFF"), flush=True)
    stop.wait()
    for running in servers:
        running.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
