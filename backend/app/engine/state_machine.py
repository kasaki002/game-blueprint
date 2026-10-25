"""Custom state machine engine for AI workflow orchestration.

Inspired by gaming-research-agent-ai (kchia):
TypedDict-based DAG with EntryPoint, Step, Termination, conditional transitions,
Snapshot history, and Run metadata."""

from __future__ import annotations

import copy
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, Generic, List, Optional, TypeVar, Union, get_type_hints

T = TypeVar("T")


class Step(Generic[T]):
    """A single processing step in the state machine workflow."""

    def __init__(self, step_id: str, logic: Callable[..., Dict[str, Any]]):
        self.step_id = step_id
        self.logic = logic

    def run(self, state: T, resource: Optional[Dict[str, Any]] = None) -> T:
        result = self.logic(state, resource) if resource is not None else self.logic(state)
        updated = dict(state)  # type: ignore[arg-type]
        if isinstance(state, dict):
            updated.update(result)
            return updated  # type: ignore[return-value]
        hints = get_type_hints(type(state))
        for k, v in result.items():
            if k in hints:
                updated[k] = v
        return type(state)(**updated)  # type: ignore


class EntryPoint(Step[T]):
    def __init__(self):
        super().__init__("__entry__", lambda s, r=None: {})


class Termination(Step[T]):
    def __init__(self):
        super().__init__("__termination__", lambda s, r=None: {})


@dataclass
class Transition(Generic[T]):
    source: str
    targets: List[str]
    condition: Optional[Callable[[T], Union[str, List[str]]]] = None

    def resolve(self, state: T) -> List[str]:
        if self.condition:
            result = self.condition(state)
            if isinstance(result, str):
                return [result]
            return result
        return self.targets


@dataclass
class Snapshot(Generic[T]):
    snapshot_id: str
    timestamp: datetime
    state_data: T
    step_id: str

    @classmethod
    def create(cls, state: T, step_id: str) -> Snapshot[T]:
        return cls(
            snapshot_id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            state_data=copy.deepcopy(state),
            step_id=step_id,
        )


@dataclass
class Run(Generic[T]):
    run_id: str
    start_timestamp: datetime
    snapshots: List[Snapshot[T]] = field(default_factory=list)
    end_timestamp: Optional[datetime] = None

    @classmethod
    def create(cls) -> Run[T]:
        return cls(run_id=str(uuid.uuid4()), start_timestamp=datetime.now())

    def add_snapshot(self, snapshot: Snapshot[T]):
        self.snapshots.append(snapshot)

    def complete(self):
        self.end_timestamp = datetime.now()

    def get_final_state(self) -> Optional[T]:
        return self.snapshots[-1].state_data if self.snapshots else None


class StateMachine(Generic[T]):
    """DAG-based workflow engine with typed states and conditional transitions."""

    def __init__(self, state_schema: type):
        self.state_schema = state_schema
        self.steps: Dict[str, Step[T]] = {}
        self.transitions: Dict[str, List[Transition[T]]] = {}

    def add_steps(self, steps: List[Step[T]]):
        for step in steps:
            self.steps[step.step_id] = step

    def connect(
        self,
        source: Union[Step[T], str],
        targets: Union[Step[T], str, List[Union[Step[T], str]]],
        condition: Optional[Callable[[T], Union[str, List[str]]]] = None,
    ):
        src = source.step_id if isinstance(source, Step) else source
        tgt_list = targets if isinstance(targets, list) else [targets]
        tgt_ids = [t.step_id if isinstance(t, Step) else t for t in tgt_list]
        self.transitions.setdefault(src, []).append(Transition(source=src, targets=tgt_ids, condition=condition))

    def run(self, state: T, resource: Optional[Dict[str, Any]] = None) -> Run[T]:
        entries = [s for s in self.steps.values() if isinstance(s, EntryPoint)]
        if not entries:
            raise ValueError("No EntryPoint in workflow")

        current_run = Run.create()
        current_step_id = entries[0].step_id

        while current_step_id:
            step = self.steps[current_step_id]
            if isinstance(step, Termination):
                break

            state = step.run(state, resource)
            current_run.add_snapshot(Snapshot.create(state, current_step_id))

            transitions = self.transitions.get(current_step_id, [])
            next_steps: List[str] = []
            for t in transitions:
                next_steps += t.resolve(state)
            if not next_steps:
                raise ValueError(f"No transitions from step: {current_step_id}")
            if len(next_steps) > 1:
                raise NotImplementedError("Parallel execution not supported yet.")
            current_step_id = next_steps[0]

        current_run.complete()
        return current_run
