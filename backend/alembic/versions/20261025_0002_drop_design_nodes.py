"""Drop the unused design_nodes table.

Canvas nodes have always been stored inside ``design_projects.canvas_state``.
The parallel ``design_nodes`` table and its CRUD endpoints were never used by
the editor, so the relation is removed to keep a single source of truth.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261025_0002"
down_revision = "20260724_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS design_nodes CASCADE")


def downgrade() -> None:
    op.create_table(
        "design_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("design_projects.id"), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("position_x", sa.Float(), nullable=True),
        sa.Column("position_y", sa.Float(), nullable=True),
        sa.Column("properties", postgresql.JSONB(), nullable=True),
        sa.Column("connected_to", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column("reference_report_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_design_nodes_project_id", "design_nodes", ["project_id"])
