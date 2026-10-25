"""Application configuration."""
from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- App ---
    app_name: str = "Game Blueprint API"
    debug: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]
    trusted_origins: list[str] = ["http://localhost:3000"]
    session_cookie_name: str = "game_blueprint_session"
    session_days: int = 7
    secure_cookies: bool = False
    register_limit: int = 5
    login_limit: int = 10

    # --- PostgreSQL ---
    postgres_dsn: str = "postgresql+asyncpg://postgres:postgres@localhost:15432/game_blueprint"

    # --- MongoDB ---
    mongo_dsn: str = "mongodb://localhost:27017"
    mongo_db: str = "game_blueprint"

    # --- Vector DB (pgvector / Pinecone) ---
    vector_store: str = "pgvector"  # pgvector | pinecone
    pinecone_api_key: str | None = None
    pinecone_env: str | None = None
    pinecone_index: str | None = None

    # --- LLM ---
    llm_provider: str = "openai"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-20250514"

    # --- RAG ---
    embedding_model: str = "text-embedding-3-small"
    chunk_size: int = 512
    chunk_overlap: int = 64
    top_k: int = 5
    chat_context_max_tokens: int = 6000
    analysis_context_max_tokens: int = 12000
    llm_max_output_tokens: int = 2000

    # --- Crawler ---
    proxy_pool: list[str] = []
    crawl_timeout: int = 30
    crawl_delay: float = 1.0
    crawl_max_results: int = 3
    crawl_max_retries: int = 3
    crawl_job_ttl: int = 86400
    crawler_user_agent: str = "GameBlueprint/0.1 (+https://localhost)"
    browser_crawl_enabled: bool = True
    browser_crawl_concurrency: int = 2
    browser_crawl_timeout: int = 30

    # --- Task Queue ---
    redis_dsn: str = "redis://localhost:6379/0"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
