"""Establish the managed schema and upgrade legacy MVP databases."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260724_0001"
down_revision = None
branch_labels = None
depends_on = None


def _columns(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))

    from app.models import Base
    inspector = sa.inspect(bind)
    # create_all is intentionally allowed to add tables missing from older MVP databases.
    # A partial schema is recoverable; aborting here prevented first deployment after a
    # database had only the original user/design/inspiration tables.
    Base.metadata.create_all(bind=bind)

    inspector = sa.inspect(bind)
    user_columns = _columns(inspector, "users")
    if "username_normalized" not in user_columns:
        op.add_column("users", sa.Column("username_normalized", sa.String(32), nullable=True))
    if "password_hash" not in user_columns:
        op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    if "is_admin" not in user_columns:
        op.add_column("users", sa.Column("is_admin", sa.Boolean(), server_default=sa.false(), nullable=False))
    if "is_active" not in user_columns:
        op.add_column("users", sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False))
    bind.execute(sa.text("UPDATE users SET username_normalized = lower(username) WHERE username_normalized IS NULL"))
    bind.execute(sa.text("UPDATE users SET password_hash = 'legacy-unusable' WHERE password_hash IS NULL"))
    if "email" in user_columns:
        op.alter_column("users", "email", existing_type=sa.String(255), nullable=True)
    op.alter_column("users", "username_normalized", nullable=False)
    op.alter_column("users", "password_hash", nullable=False)
    if not any(index["name"] == "uq_users_username_normalized" for index in sa.inspect(bind).get_indexes("users")):
        op.create_index("uq_users_username_normalized", "users", ["username_normalized"], unique=True)

    if "revision" not in _columns(sa.inspect(bind), "design_projects"):
        op.add_column("design_projects", sa.Column("revision", sa.Integer(), server_default="0", nullable=False))

    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_document_chunks_search_vector ON document_chunks USING gin (search_vector)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops)"))


def downgrade() -> None:
    raise RuntimeError("The platform baseline migration is intentionally irreversible")
