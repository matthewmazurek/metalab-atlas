"""
Histogram API router: Compute binned value distributions.
"""

from __future__ import annotations

from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends

from atlas.aggregate import get_field_value
from atlas.deps import StoreAdapter, get_store
from atlas.models import HistogramRequest, HistogramResponse

router = APIRouter(prefix="/api", tags=["histogram"])


@router.post("/histogram", response_model=HistogramResponse)
async def histogram(
    request: HistogramRequest,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> HistogramResponse:
    """
    Compute histogram of a field's values.

    Bins the values of the specified field across all matching runs
    and returns bin edges and counts for visualization.

    Example request:
    ```json
    {
        "field": "metrics.accuracy",
        "bin_count": 20,
        "filter": {"experiment_id": "my_experiment"}
    }
    ```
    """
    # Use SQL pushdown if available (PostgresStoreAdapter)
    if hasattr(store, "compute_histogram_sql"):
        return store.compute_histogram_sql(request)

    # Fallback to in-memory histogram
    runs, _ = store.query_runs(
        filter=request.filter,
        limit=100000,  # Get all matching runs
        offset=0,
    )

    # Extract field values with run IDs
    values: list[float] = []
    run_ids: list[str] = []
    for run in runs:
        val = get_field_value(run, request.field)
        if val is not None:
            try:
                values.append(float(val))
                run_ids.append(run.record.run_id)
            except (TypeError, ValueError):
                continue

    if not values:
        # Return empty histogram
        return HistogramResponse(
            field=request.field,
            bins=[0.0, 1.0],
            counts=[0],
            total=0,
            run_ids_per_bin=[[]],
        )

    # Compute histogram using numpy
    counts, bin_edges = np.histogram(values, bins=request.bin_count)

    # Assign run IDs to bins using digitize
    # digitize returns 1-indexed bin assignments (0 = below first edge, n = above last)
    bin_assignments = np.digitize(
        values, bin_edges[:-1]
    )  # Use [:-1] so last bin is inclusive

    # Group run IDs by bin
    run_ids_per_bin: list[list[str]] = [[] for _ in range(len(counts))]
    for i, bin_idx in enumerate(bin_assignments):
        # Clamp to valid range (digitize can return len(bins) for values at max edge)
        bin_idx = min(bin_idx - 1, len(counts) - 1)  # Convert to 0-indexed
        bin_idx = max(0, bin_idx)
        run_ids_per_bin[bin_idx].append(run_ids[i])

    return HistogramResponse(
        field=request.field,
        bins=bin_edges.tolist(),
        counts=counts.tolist(),
        total=len(values),
        run_ids_per_bin=run_ids_per_bin,
    )
