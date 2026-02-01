"""
Field Values API router: Raw field values for frontend-driven plotting.

This endpoint returns raw field values that the frontend can use to construct
any visualization (histograms, scatter plots, box plots, etc.) without the
backend needing to know about specific plot types.
"""

from __future__ import annotations

from typing import Annotated

from atlas.deps import StoreAdapter, get_store
from atlas.models import FieldValuesRequest, FieldValuesResponse, FilterSpec
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/api/fields", tags=["fields"])


@router.post("/values", response_model=FieldValuesResponse)
async def get_field_values(
    request: FieldValuesRequest,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> FieldValuesResponse:
    """
    Get raw field values for plotting.

    Returns values for the requested fields across matching runs.
    If the total exceeds max_points, returns a random sample.

    Use this for:
    - Histograms (bin values client-side)
    - Scatter plots (x/y field pairs)
    - Box plots (compute quartiles client-side)
    - Any other visualization

    Example request:
    ```json
    {
        "fields": ["params.expr_val", "metrics.score"],
        "filter": {"experiment_id": "my_experiment:1.0.0"},
        "max_points": 10000
    }
    ```
    """
    # Check if store supports get_field_values (Postgres-specific for now)
    if hasattr(store, "get_field_values"):
        return store.get_field_values(request)

    # Fallback for file-based stores: use query_runs and extract values
    return _fallback_get_field_values(store, request)


def _fallback_get_field_values(
    store: StoreAdapter,
    request: FieldValuesRequest,
) -> FieldValuesResponse:
    """Fallback implementation using query_runs for stores without native support."""
    # Get total count first
    _, total = store.query_runs(filter=request.filter, limit=1, offset=0)

    # Determine if we need to sample
    sampled = total > request.max_points
    limit = request.max_points if sampled else total

    # Query runs (note: this doesn't truly random sample, just takes first N)
    # For proper sampling, use the native implementation
    runs, _ = store.query_runs(
        filter=request.filter,
        limit=limit,
        offset=0,
    )

    # Extract field values
    fields_data: dict[str, list[float | str | None]] = {f: [] for f in request.fields}
    run_ids: list[str] = []

    for run in runs:
        if request.include_run_ids:
            run_ids.append(run.record.run_id)

        for field in request.fields:
            value = _extract_field_value(run, field)
            fields_data[field].append(value)

    return FieldValuesResponse(
        fields=fields_data,
        run_ids=run_ids if request.include_run_ids else None,
        total=total,
        returned=len(runs),
        sampled=sampled,
    )


def _extract_field_value(run, field: str) -> float | str | None:
    """Extract a field value from a RunResponse."""
    parts = field.split(".", 1)
    if len(parts) != 2:
        return None

    namespace, key = parts

    if namespace == "params":
        return run.params.get(key)
    elif namespace == "metrics":
        return run.metrics.get(key)
    elif namespace == "derived":
        return run.derived_metrics.get(key)
    elif namespace == "record":
        return getattr(run.record, key, None)

    return None
