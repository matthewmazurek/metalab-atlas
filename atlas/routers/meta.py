"""
Meta API router: Field discovery and experiment listing.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated

from atlas.deps import StoreAdapter, get_store, refresh_stores
from atlas.models import (
    ExperimentInfo,
    ExperimentSummary,
    ExperimentsResponse,
    ExperimentsSummaryResponse,
    FieldIndex,
)
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meta", tags=["meta"])


class RefreshResponse(BaseModel):
    """Response from store refresh."""

    stores_discovered: int
    message: str


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_store_discovery() -> RefreshResponse:
    """
    Refresh store discovery to pick up new experiments.

    Call this endpoint after adding new experiments to the store directory
    without needing to restart the server.
    """
    count = refresh_stores()
    return RefreshResponse(
        stores_discovered=count,
        message=f"Discovered {count} experiment store(s)",
    )


@router.get("/fields", response_model=FieldIndex)
async def get_fields(
    store: Annotated[StoreAdapter, Depends(get_store)],
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
    store: Annotated[StoreAdapter, Depends(get_store)],
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

    # Sort by latest run (most recent first), experiments without runs go to the end
    experiments.sort(
        key=lambda e: (e.latest_run is not None, e.latest_run or datetime.min),
        reverse=True,
    )

    return ExperimentsResponse(experiments=experiments)


def _fallback_experiments_summary(store: StoreAdapter) -> list[ExperimentSummary]:
    """
    Build experiment summaries from individual store methods.

    Used when the store doesn't support the optimized batch query
    (i.e. non-Postgres stores like FileStoreAdapter).
    """
    experiments_data = store.list_experiments()
    summaries: list[ExperimentSummary] = []

    for exp_id, count, latest in experiments_data:
        # Get status counts
        counts = store.get_status_counts(exp_id)

        # Get latest manifest
        manifest = store.get_experiment_manifest(exp_id, timestamp=None)

        summaries.append(
            ExperimentSummary(
                experiment_id=exp_id,
                run_count=count,
                latest_run=latest,
                success=counts.success,
                failed=counts.failed,
                running=counts.running,
                cancelled=counts.cancelled,
                name=manifest.name if manifest else None,
                tags=manifest.tags if manifest else [],
                total_runs=manifest.total_runs if manifest else None,
            )
        )

    return summaries


@router.get("/experiments/summary", response_model=ExperimentsSummaryResponse)
async def list_experiments_summary(
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> ExperimentsSummaryResponse:
    """
    List all experiments with status counts and manifest info in one call.

    This is the preferred endpoint for the experiments list page. It returns
    everything needed to render the full table without per-experiment requests.

    Uses an optimized batch query on Postgres stores; falls back to N+1
    calls on file-based stores (where N is typically small).
    """
    # Use optimized batch method if available (Postgres stores)
    if hasattr(store, "get_experiments_summary"):
        experiments = store.get_experiments_summary()
    else:
        experiments = _fallback_experiments_summary(store)

    # Sort by latest run (most recent first)
    experiments.sort(
        key=lambda e: (e.latest_run is not None, e.latest_run or datetime.min),
        reverse=True,
    )

    return ExperimentsSummaryResponse(experiments=experiments)
