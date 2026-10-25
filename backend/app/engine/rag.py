"""Three-stage RAG pipeline with quality evaluation and web fallback.

Inspired by gaming-research-agent-ai (kchia):
1. Retrieve: semantic search over vector DB
2. Evaluate: LLM-as-judge determines if retrieved docs are sufficient
3. Generate (with web fallback): answer or search + answer"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from typing_extensions import TypedDict

from app.engine.state_machine import StateMachine, Step, EntryPoint, Termination, Run
from app.engine.llm import LLM


class RAGState(TypedDict):
    question: str
    documents: List[str]
    distances: List[float]
    answer: str
    needs_web_search: bool
    session_id: str


class RAGPipeline:
    """Three-stage RAG pipeline orchestrated via state machine."""

    def __init__(self, llm: LLM, vector_store: Any, web_searcher: Optional[Any] = None):
        self.llm = llm
        self.vector_store = vector_store
        self.web_searcher = web_searcher
        self.resource = {"llm": llm, "vector_store": vector_store, "web_searcher": web_searcher}
        self.workflow = self._build_workflow()

    def _retrieve(self, state: RAGState, resource: Dict) -> RAGState:
        vs = resource.get("vector_store")
        if vs is None:
            return {"documents": [], "distances": []}
        results = vs.query(query_texts=[state["question"]])
        docs = results.get("documents", [[]])[0] if results.get("documents") else []
        dists = results.get("distances", [[]])[0] if results.get("distances") else []
        return {"documents": docs, "distances": dists}

    def _evaluate(self, state: RAGState, resource: Dict) -> RAGState:
        llm: LLM = resource["llm"]
        docs = state.get("documents", [])
        if not docs:
            return {"needs_web_search": True}

        prompt = (
            f"Question: {state['question']}\n\n"
            f"Retrieved documents:\n{chr(10).join(f'- {d[:300]}' for d in docs[:3])}\n\n"
            "Are these documents sufficient to answer the question? Answer only YES or NO."
        )
        resp = llm.invoke([{"role": "user", "content": prompt}])
        needs_search = "no" in resp.content.strip().lower()
        return {"needs_web_search": needs_search}

    def _generate(self, state: RAGState, resource: Dict) -> RAGState:
        llm: LLM = resource["llm"]
        docs = state.get("documents", [])
        context = "\n\n".join(docs) if docs else "No documents available."

        prompt = (
            "You are a game research assistant. Answer the question using the provided context.\n"
            "If the context is insufficient, say so clearly.\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {state['question']}\n\n"
            "Answer:"
        )
        resp = llm.invoke([{"role": "user", "content": prompt}])
        return {"answer": resp.content}

    def _web_search(self, state: RAGState, resource: Dict) -> RAGState:
        searcher = resource.get("web_searcher")
        if searcher is None:
            return self._generate(state, resource)
        results = searcher.search(state["question"])
        state["documents"] = [str(r) for r in results]
        return self._generate(state, resource)

    def _build_workflow(self) -> StateMachine[RAGState]:
        machine = StateMachine[RAGState](RAGState)

        def check_quality(state: RAGState):
            return "_web_search" if state.get("needs_web_search", False) else "_generate"

        entry = EntryPoint[RAGState]()
        retrieve = Step[RAGState]("_retrieve", self._retrieve)
        evaluate = Step[RAGState]("_evaluate", self._evaluate)
        generate = Step[RAGState]("_generate", self._generate)
        web_search = Step[RAGState]("_web_search", self._web_search)
        termination = Termination[RAGState]()

        machine.add_steps([entry, retrieve, evaluate, generate, web_search, termination])
        machine.connect(entry, retrieve)
        machine.connect(retrieve, evaluate)
        machine.connect(evaluate, [generate, web_search], check_quality)
        machine.connect(generate, termination)
        machine.connect(web_search, termination)

        return machine

    async def invoke(self, question: str, session_id: str = "default") -> Run[RAGState]:
        initial: RAGState = {
            "question": question,
            "documents": [],
            "distances": [],
            "answer": "",
            "needs_web_search": False,
            "session_id": session_id,
        }
        return self.workflow.run(initial, self.resource)
