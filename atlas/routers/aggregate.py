"""
Aggregate API router: Compute grouped statistics for plots.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from atlas.aggregate import compute_aggregate
from atlas.deps import StoreAdapter, get_store
from atlas.models import AggregateRequest, AggregateResponse

router = APIRouter(prefix="/api", tags=["aggregate"])


@router.post("/aggregate", response_model=AggregateResponse)
async def aggregate(
    request: AggregateRequest,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> AggregateResponse:
    """
    Compute aggregated plot data.

    Groups runs by specified fields and aggregates Y values for each X value.
    Supports:
    - Filtering: apply FilterSpec before aggregation
    - Grouping: group_by fields create separate series
    - Replicate handling: aggregate over replicates (e.g., different seeds)
    - Error bars: std, sem, or 95% CI

    Example request:
    ```json
    {
        "x_field": "params.dim",
        "y_field": "metrics.best_f",
        "group_by": ["params.algorithm"],
        "agg_fn": "mean",
        "error_bars": "std"
    }
    ```
    """
    # Use SQL pushdown if available (PostgresStoreAdapter)
    if hasattr(store, "compute_aggregate_sql"):
        return store.compute_aggregate_sql(request)

    # Fallback to in-memory aggregation
    runs, _ = store.query_runs(
        filter=request.filter,
        limit=100000,  # Get all matching runs for aggregation
        offset=0,
    )

    return compute_aggregate(runs, request)
