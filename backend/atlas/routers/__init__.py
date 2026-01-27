"""API routers for Metalab Atlas."""

from atlas.routers.aggregate import router as aggregate_router
from atlas.routers.artifacts import router as artifacts_router
from atlas.routers.histogram import router as histogram_router
from atlas.routers.meta import router as meta_router
from atlas.routers.runs import router as runs_router

__all__ = ["runs_router", "artifacts_router", "meta_router", "aggregate_router", "histogram_router"]
