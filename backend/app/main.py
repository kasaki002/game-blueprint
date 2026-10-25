"""Game Blueprint - FastAPI Application Entrypoint."""
from __future__ import annotations

# When this file is started directly (``python app/main.py``), Python puts
# ``backend/app`` first on sys.path.  That can make an unrelated third-party
# package named ``app`` in site-packages win over this project's package.
# Put the backend package root first so both direct execution and
# ``uvicorn app.main:app`` import the same local modules.
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

from app.modules.query.router import router as query_router
from app.modules.analyze.router import router as analyze_router
from app.modules.inspiration.router import router as inspiration_router
from app.modules.design.router import router as design_router
from app.modules.system.router import router as system_router
from app.modules.auth.router import router as auth_router
from app.modules.tasks.router import router as tasks_router
from sqlalchemy import text

from app.core.database import close_databases, engine, get_mongo_db, initialize_database
from app.workers.job_store import open_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    await initialize_database()
    yield
    await close_databases()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.include_router(query_router)
app.include_router(analyze_router)
app.include_router(inspiration_router)
app.include_router(design_router)
app.include_router(system_router)
app.include_router(auth_router)
app.include_router(tasks_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def validate_origin(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin not in settings.trusted_origins:
            return JSONResponse({"detail": "Untrusted request origin"}, status_code=403)
    return await call_next(request)


@app.get("/health")
async def health():
    components: dict[str, dict[str, object]] = {}

    try:
        async with engine.connect() as connection:
            vector_enabled = bool(await connection.scalar(text(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
            )))
            chunk_count = int(await connection.scalar(text("SELECT count(*) FROM document_chunks")) or 0)
        components["postgres"] = {"status": "ok"}
        components["vector_index"] = {
            "status": "ok" if vector_enabled else "unavailable",
            "provider": settings.vector_store,
            "document_chunks": chunk_count,
        }
    except Exception as exc:
        components["postgres"] = {"status": "unavailable", "error": str(exc)}
        components["vector_index"] = {"status": "unknown", "provider": settings.vector_store}

    redis = None
    try:
        redis = await asyncio.wait_for(open_redis(), timeout=2)
        await asyncio.wait_for(redis.ping(), timeout=2)
        worker_keys = await asyncio.wait_for(redis.keys("arq:*health-check*"), timeout=2)
        components["redis"] = {"status": "ok"}
        components["crawler_worker"] = {"status": "ok" if worker_keys else "unavailable"}
    except Exception as exc:
        components["redis"] = {"status": "unavailable", "error": str(exc)}
        components["crawler_worker"] = {"status": "unknown"}
    finally:
        if redis is not None:
            await redis.aclose()

    try:
        mongo = await asyncio.wait_for(get_mongo_db(), timeout=2)
        await asyncio.wait_for(mongo.command("ping"), timeout=2)
        components["mongodb"] = {"status": "ok"}
    except Exception as exc:
        components["mongodb"] = {"status": "unavailable", "error": str(exc)}

    status = "ok" if all(item["status"] == "ok" for item in components.values()) else "degraded"
    return {"status": status, "components": components}
