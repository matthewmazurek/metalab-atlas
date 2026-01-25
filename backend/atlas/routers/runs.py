"""
Runs API router: List and get run records.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from atlas.deps import get_store
from atlas.models import (
    FieldFilter,
    FilterOp,
    FilterSpec,
    RunListResponse,
    RunResponse,
    RunStatus,
)
from atlas.store import FileStoreAdapter

router = APIRouter(prefix="/api/runs", tags=["runs"])


def parse_filter_spec(
    experiment_id: str | None = Query(default=None),
    status: list[str] | None = Query(default=None),
    started_after: datetime | None = Query(default=None),
    started_before: datetime | None = Query(default=None),
) -> FilterSpec:
    """Parse filter parameters from query string."""
    status_list = None
    if status:
        status_list = [RunStatus(s) for s in status]

    return FilterSpec(
        experiment_id=experiment_id,
        status=status_list,
        started_after=started_after,
        started_before=started_before,
    )


@router.get("", response_model=RunListResponse)
async def list_runs(
    store: Annotated[FileStoreAdapter, Depends(get_store)],
    filter: Annotated[FilterSpec, Depends(parse_filter_spec)],
    sort_by: str | None = Query(default="record.started_at"),
    sort_order: str = Query(default="desc", regex="^(asc|desc)$"),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> RunListResponse:
    """
    List runs with filtering, sorting, and pagination.

    Supports filtering by:
    - experiment_id: exact match
    - status: one or more status values
    - started_after/started_before: time range

    Sorting can be on any field (e.g., record.started_at, metrics.best_f).
    """
    runs, total = store.query_runs(
        filter=filter,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=limit,
        offset=offset,
    )

    return RunListResponse(
        runs=runs,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: str,
    store: Annotated[FileStoreAdapter, Depends(get_store)],
) -> RunResponse:
    """Get a single run by ID."""
    run = store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return run
