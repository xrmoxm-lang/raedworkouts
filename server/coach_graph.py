"""Static, durable coach-node runner; control flow is code, never model output."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable


class ContractError(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class NodeContract:
    name: str
    reads: frozenset[str]
    writes: frozenset[str]
    model_backed: bool = False

    def validate_output(self, output: dict) -> None:
        if not isinstance(output, dict) or not set(output).issubset(self.writes):
            raise ContractError(f"{self.name} may write only {sorted(self.writes)}")
        if self.model_backed and _contains_load(output):
            raise ContractError(f"{self.name} cannot emit a weight or load; domain/clamps.js owns that decision")


def _contains_load(value, key: str = "") -> bool:
    if any(token in key.lower() for token in ("weight", "load", "_kg", "kg_")):
        return True
    if isinstance(value, dict):
        return any(_contains_load(item, str(item_key)) for item_key, item in value.items())
    if isinstance(value, list):
        return any(_contains_load(item, key) for item in value)
    return False


QUESTION_CONTRACTS = {
    "query_rewrite": NodeContract("query_rewrite", frozenset({"question"}), frozenset({"search_queries"}), True),
    "retrieve": NodeContract("retrieve", frozenset({"search_queries"}), frozenset({"retrieved"})),
    "answer": NodeContract("answer", frozenset({"question", "retrieved"}), frozenset({"answer"}), True),
    "validate": NodeContract("validate", frozenset({"answer", "retrieved"}), frozenset({"validation"})),
    "deliver": NodeContract("deliver", frozenset({"answer", "validation"}), frozenset({"delivered"})),
}
QUESTION_EDGES = {
    "query_rewrite": "retrieve", "retrieve": "answer", "answer": "validate", "validate": "deliver", "deliver": None,
}


def init_runs_db(connection: sqlite3.Connection) -> None:
    connection.execute(
        """create table if not exists coach_runs (
             run_id text primary key, user_id text not null, kind text not null,
             step text, status text not null, state text not null,
             updated_at text not null)"""
    )


class CoachRunner:
    """One durable state row per run, checkpointed after every node."""

    def __init__(self, db_path: str, nodes: dict[str, Callable[[dict], dict]]):
        self.db_path, self.nodes = db_path, nodes
        with closing(sqlite3.connect(db_path)) as connection:
            init_runs_db(connection)
            connection.commit()

    def enqueue_question(self, user_id: str, question: str) -> str:
        run_id = str(uuid.uuid4())
        state = {
            "run_id": run_id, "kind": "question", "user_id": user_id, "question": question,
            "step": "query_rewrite", "status": "pending", "attempts": {}, "errors": [],
        }
        self._checkpoint(state)
        return run_id

    def load(self, run_id: str) -> dict:
        with closing(sqlite3.connect(self.db_path)) as connection:
            row = connection.execute("select state from coach_runs where run_id=?", (run_id,)).fetchone()
        if row is None:
            raise KeyError(run_id)
        return json.loads(row[0])

    def step_once(self, run_id: str) -> dict:
        state = self.load(run_id)
        step = state.get("step")
        if step is None or state["status"] in {"done", "failed"}:
            return state
        contract = QUESTION_CONTRACTS[step]
        if not contract.reads.issubset(state):
            raise ContractError(f"{step} is missing its declared inputs")
        try:
            output = self.nodes[step](state)
            contract.validate_output(output)
            state.update(output)
            state["attempts"][step] = 0
            state["step"] = QUESTION_EDGES[step]
            state["status"] = "done" if state["step"] is None else "running"
        except Exception as error:
            state["attempts"][step] = state["attempts"].get(step, 0) + 1
            state["errors"].append({"step": step, "error": repr(error), "fatal": True})
            state["step"], state["status"] = "dead_letter", "failed"
        self._checkpoint(state)
        return state

    def drain(self, run_id: str) -> dict:
        state = self.load(run_id)
        while state.get("step") not in {None, "dead_letter"}:
            state = self.step_once(run_id)
        return state

    def _checkpoint(self, state: dict) -> None:
        payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        with closing(sqlite3.connect(self.db_path)) as connection:
            init_runs_db(connection)
            connection.execute(
                """insert into coach_runs values(?,?,?,?,?,?,?)
                   on conflict(run_id) do update set step=excluded.step,status=excluded.status,
                   state=excluded.state,updated_at=excluded.updated_at""",
                (state["run_id"], state["user_id"], state["kind"], state.get("step"), state["status"], payload, now_iso()),
            )
            connection.commit()
