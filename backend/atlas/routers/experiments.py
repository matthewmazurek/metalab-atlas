"""
Experiments API router: Manifest listing and retrieval.
"""

from __future__ import annotations

from typing import Annotated

from atlas.deps import StoreAdapter, get_store
from atlas.models import ManifestInfo, ManifestListResponse, ManifestResponse
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


@router.get("/{experiment_id}/manifests", response_model=ManifestListResponse)
async def list_manifests(
    experiment_id: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> ManifestListResponse:
    """
    List all manifest versions for an experiment.

    Returns manifest metadata sorted by timestamp (most recent first).
    """
    manifests = store.list_experiment_manifests(experiment_id)
    return ManifestListResponse(manifests=manifests)


@router.get("/{experiment_id}/manifests/latest", response_model=ManifestResponse | None)
async def get_latest_manifest(
    experiment_id: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> ManifestResponse | None:
    """
    Get the most recent manifest for an experiment.

    Returns null if no manifest exists (this is expected for experiments
    that were run before manifests were introduced).
    """
    return store.get_experiment_manifest(experiment_id, timestamp=None)


@router.get("/{experiment_id}/manifests/{timestamp}", response_model=ManifestResponse)
async def get_manifest(
    experiment_id: str,
    timestamp: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> ManifestResponse:
    """
    Get a specific manifest version by timestamp.
    """
    manifest = store.get_experiment_manifest(experiment_id, timestamp=timestamp)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Manifest not found")
    return manifest
