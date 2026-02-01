"""API routers for MetaLab Atlas."""

from atlas.routers.artifacts import router as artifacts_router
from atlas.routers.experiments import router as experiments_router
from atlas.routers.field_values import router as field_values_router
from atlas.routers.histogram import router as histogram_router
from atlas.routers.meta import router as meta_router
from atlas.routers.runs import router as runs_router

__all__ = [
    "runs_router",
    "artifacts_router",
    "meta_router",
    "field_values_router",
    "experiments_router",
    "histogram_router",
]
