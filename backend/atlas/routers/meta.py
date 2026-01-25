"""
Meta API router: Field discovery and experiment listing.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from atlas.deps import get_store
from atlas.models import ExperimentInfo, ExperimentsResponse, FieldIndex
from atlas.store import FileStoreAdapter

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/fields", response_model=FieldIndex)
async def get_fields(
    store: Annotated[FileStoreAdapter, Depends(get_store)],
    experiment_id: str | None = Query(default=None),
) -> FieldIndex:
    """
    Get available fields (params and metrics) across runs.

    Returns cached field index with:
    - Field names and inferred types (numeric, string, boolean)
    - Value counts and ranges
    - Unique values for categorical fields

    The index is automatically refreshed when new runs are added.
    """
    from atlas.models import FilterSpec

    filter_spec = None
    if experiment_id:
        filter_spec = FilterSpec(experiment_id=experiment_id)

    return store.get_field_index(filter_spec)


@router.get("/experiments", response_model=ExperimentsResponse)
async def list_experiments(
    store: Annotated[FileStoreAdapter, Depends(get_store)],
) -> ExperimentsResponse:
    """
    List all experiments with run counts.

    Returns experiment IDs and metadata for building filter dropdowns.
    """
    experiments_data = store.list_experiments()

    experiments = [
        ExperimentInfo(
            experiment_id=exp_id,
            run_count=count,
            latest_run=latest,
        )
        for exp_id, count, latest in experiments_data
    ]

    # Sort by latest run (most recent first)
    experiments.sort(key=lambda e: e.latest_run or "", reverse=True)

    return ExperimentsResponse(experiments=experiments)
