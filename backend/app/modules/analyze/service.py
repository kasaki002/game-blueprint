"""Persistent reports, hybrid retrieval, and database-backed chat."""
from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.engine.llm import LLM
from app.engine.retrieval import HybridRetriever
from app.models.analysis import AnalysisReport, ChatMessage, ChatSession
from app.models.game import GameMetadata


class AnalyzeService:
    def __init__(self) -> None:
        self.llm = LLM(model=settings.openai_model, api_key=settings.openai_api_key, max_output_tokens=settings.llm_max_output_tokens)
        self.retriever = HybridRetriever()

    async def generate_answer(self, db: AsyncSession, prompt: str, max_context_tokens: int) -> tuple[str, list[dict], dict]:
        citations = await self.retriever.search(db, prompt)
        char_budget = max_context_tokens * 4
        context = "\n\n".join(item["content"] for item in citations)[:char_budget] or "No indexed documents matched."
        response = self.llm.invoke([{"role": "user", "content": f"Use the cited context when possible. State uncertainty clearly.\n\nContext:\n{context}\n\nRequest:\n{prompt}"}])
        usage = response.token_usage
        return response.content, [{key: value for key, value in item.items() if key != "content"} for item in citations], {
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
            "model": settings.openai_model,
        }

    async def trigger_analysis(self, db: AsyncSession, user_id: UUID, game_id: UUID, template_id: str, params: dict) -> dict | None:
        game = await db.get(GameMetadata, game_id)
        if not game:
            return None
        prompts = {
            "char-tier": "分析角色强度梯度并说明判断依据。", "build-recommend": "推荐不同玩法的装备构筑。",
            "boss-guide": "创建 Boss 攻略并分析攻击模式与弱点。", "story-deep": "深入分析故事、主题和叙事结构。",
            "mechanic": "分析核心机制、反馈循环和数值关系。",
        }

        # Build rich context from game metadata
        game_context = f"游戏名称：{game.name}\n"
        if game.aliases:
            game_context += f"别名：{', '.join(game.aliases)}\n"
        if game.genres:
            game_context += f"类型：{', '.join(game.genres)}\n"
        if game.developers:
            game_context += f"开发商：{', '.join(game.developers)}\n"
        if game.publishers:
            game_context += f"发行商：{', '.join(game.publishers)}\n"
        if game.platforms:
            game_context += f"平台：{', '.join(game.platforms)}\n"
        if game.release_date:
            game_context += f"发行日期：{game.release_date}\n"
        if game.summary:
            game_context += f"简介：{game.summary}\n"

        prompt = f"{game_context}\n分析参数：{json.dumps(params, ensure_ascii=False)}\n\n任务：{prompts.get(template_id, '分析这款游戏的核心设计。')}"
        answer, citations, metadata = await self.generate_answer(db, prompt, settings.analysis_context_max_tokens)
        report = AnalysisReport(user_id=user_id, game_id=game_id, report_type=template_id, content=f"# 游戏分析报告\n\n{answer}", charts_data=[], citations=citations, generation_meta={**metadata, "documents_used": len(citations)})
        db.add(report)
        await db.flush()
        await db.refresh(report)
        return {"status": "completed", "report_id": str(report.id), "answer": answer, **report.generation_meta}

    async def list_reports(self, db: AsyncSession, user_id: UUID, limit: int = 30) -> list[dict]:
        rows = await db.execute(select(AnalysisReport, GameMetadata.name).join(GameMetadata).where(AnalysisReport.user_id == user_id).order_by(AnalysisReport.created_at.desc()).limit(limit))
        return [self._summary(report, game_name) for report, game_name in rows.all()]

    async def get_report(self, db: AsyncSession, report_id: UUID, user_id: UUID) -> dict | None:
        report = await db.scalar(select(AnalysisReport).where(AnalysisReport.id == report_id, AnalysisReport.user_id == user_id))
        return self._report(report) if report else None

    async def delete_report(self, db: AsyncSession, report_id: UUID, user_id: UUID) -> bool:
        report = await db.scalar(select(AnalysisReport).where(AnalysisReport.id == report_id, AnalysisReport.user_id == user_id))
        if not report:
            return False
        await db.delete(report)
        return True

    async def export_report(self, db: AsyncSession, report_id: UUID, user_id: UUID, fmt: str) -> bytes:
        report = await self.get_report(db, report_id, user_id)
        if not report:
            raise KeyError(report_id)
        if fmt == "json":
            return json.dumps(report, ensure_ascii=False, default=str, indent=2).encode()
        if fmt in {"md", "markdown"}:
            return report["content"].encode()
        raise ValueError(f"Unsupported export format: {fmt}")

    async def list_chat_sessions(self, db: AsyncSession, user_id: UUID) -> list[dict]:
        rows = await db.scalars(select(ChatSession).where(ChatSession.user_id == user_id).order_by(ChatSession.updated_at.desc()))
        return [self._chat_session(row) for row in rows]

    async def get_chat_session(self, db: AsyncSession, session_id: UUID, user_id: UUID) -> ChatSession | None:
        return await db.scalar(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id))

    async def create_chat_session(self, db: AsyncSession, user_id: UUID, title: str, game_id: UUID | None) -> dict:
        row = ChatSession(user_id=user_id, title=title, game_id=game_id)
        db.add(row)
        await db.flush()
        await db.refresh(row)
        return self._chat_session(row)

    async def list_messages(self, db: AsyncSession, session_id: UUID, user_id: UUID) -> list[dict] | None:
        if not await self.get_chat_session(db, session_id, user_id):
            return None
        rows = await db.scalars(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at))
        return [self._message(row) for row in rows]

    async def chat(self, db: AsyncSession, session_id: UUID, user_id: UUID, message: str) -> dict | None:
        session = await self.get_chat_session(db, session_id, user_id)
        if not session:
            return None
        db.add(ChatMessage(session_id=session.id, role="user", content=message))
        await db.flush()
        history = list(await db.scalars(select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at.desc()).limit(20)))
        context = "\n".join(f"{row.role}: {row.content}" for row in reversed(history))
        answer, citations, meta = await self.generate_answer(db, context, settings.chat_context_max_tokens)
        assistant = ChatMessage(session_id=session.id, role="assistant", content=answer, model=meta["model"], prompt_tokens=meta["prompt_tokens"], completion_tokens=meta["completion_tokens"], citations=citations)
        db.add(assistant)
        await db.flush()
        await db.refresh(assistant)
        return self._message(assistant)

    async def chat_stream(self, db: AsyncSession, session_id: UUID, user_id: UUID, message: str):
        """Stream chat response token by token."""
        session = await self.get_chat_session(db, session_id, user_id)
        if not session:
            return

        # Save user message
        db.add(ChatMessage(session_id=session.id, role="user", content=message))
        await db.flush()

        # Get history
        history = list(await db.scalars(select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at.desc()).limit(20)))

        # Retrieve context
        citations = await self.retriever.search(db, message)
        char_budget = settings.chat_context_max_tokens * 4
        context = "\n\n".join(item["content"] for item in citations)[:char_budget] or "No indexed documents matched."

        # Build prompt with history
        history_text = "\n".join(f"{row.role}: {row.content}" for row in reversed(history))
        prompt = f"Use the cited context when possible. State uncertainty clearly.\n\nContext:\n{context}\n\nConversation:\n{history_text}"

        # Stream response
        full_content = ""
        async for chunk in self.llm.astream([{"role": "user", "content": prompt}]):
            full_content += chunk
            yield chunk

        # Save assistant message after streaming completes
        assistant = ChatMessage(
            session_id=session.id,
            role="assistant",
            content=full_content,
            model=settings.openai_model,
            citations=[{key: value for key, value in item.items() if key != "content"} for item in citations]
        )
        db.add(assistant)
        await db.flush()

    @staticmethod
    def _chat_session(row: ChatSession) -> dict:
        return {"id": row.id, "title": row.title, "game_id": row.game_id, "summary": row.summary, "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat()}

    @staticmethod
    def _message(row: ChatMessage) -> dict:
        return {"id": row.id, "session_id": row.session_id, "role": row.role, "content": row.content, "status": row.status, "error": row.error, "model": row.model, "prompt_tokens": row.prompt_tokens, "completion_tokens": row.completion_tokens, "citations": row.citations or [], "created_at": row.created_at.isoformat()}

    @staticmethod
    def _report(report: AnalysisReport) -> dict:
        return {"id": report.id, "report_id": report.id, "game_id": report.game_id, "report_type": report.report_type, "content": report.content, "charts_data": report.charts_data or [], "citations": report.citations or [], "generation_meta": report.generation_meta or {}, "created_at": report.created_at.isoformat(), "updated_at": report.updated_at.isoformat()}

    @staticmethod
    def _summary(report: AnalysisReport, game_name: str) -> dict:
        return {"id": report.id, "game_id": report.game_id, "game_name": game_name, "report_type": report.report_type, "excerpt": report.content.replace("# 游戏分析报告", "").strip().replace("\n", " ")[:180], "created_at": report.created_at.isoformat(), "updated_at": report.updated_at.isoformat()}
