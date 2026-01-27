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
    # Query runs with filter
    runs, _ = store.query_runs(
        filter=request.filter,
        limit=10000,  # Get all matching runs
        offset=0,
    )

    # Extract field values
    values = []
    for run in runs:
        val = get_field_value(run, request.field)
        if val is not None:
            try:
                values.append(float(val))
            except (TypeError, ValueError):
                continue

    if not values:
        # Return empty histogram
        return HistogramResponse(
            field=request.field,
            bins=[0.0, 1.0],
            counts=[0],
            total=0,
        )

    # Compute histogram using numpy
    counts, bin_edges = np.histogram(values, bins=request.bin_count)

    return HistogramResponse(
        field=request.field,
        bins=bin_edges.tolist(),
        counts=counts.tolist(),
        total=len(values),
    )
