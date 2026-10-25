from app.main import app
from app.models import Base
from app.models.design import DesignProject


def test_design_nodes_table_is_gone():
    assert "design_nodes" not in Base.metadata.tables
    assert "design_projects" in Base.metadata.tables
    assert "canvas_state" in DesignProject.__table__.columns
    assert "revision" in DesignProject.__table__.columns


def test_design_node_routes_are_gone():
    paths = {route.path for route in app.routes}
    assert "/api/design/projects/{project_id}/canvas" in paths
    assert not any(path.endswith("/nodes") or "/nodes/" in path for path in paths)
