"""
Artifacts API router: Secure artifact access by run_id + name.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from atlas.deps import StoreAdapter, get_store
from atlas.models import ArtifactInfo, ArtifactPreview

router = APIRouter(prefix="/api/runs/{run_id}", tags=["artifacts"])


@router.get("/artifacts", response_model=list[ArtifactInfo])
async def list_artifacts(
    run_id: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> list[ArtifactInfo]:
    """List artifacts for a run."""
    run = store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    return run.artifacts


@router.get("/artifacts/{artifact_name}")
async def get_artifact(
    run_id: str,
    artifact_name: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> Response:
    """
    Download artifact content.

    Security: Only allows access via run_id + artifact_name.
    Never exposes raw filesystem paths.
    """
    try:
        content, content_type = store.get_artifact_content(run_id, artifact_name)
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{artifact_name}"',
            },
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Artifact not found: {run_id}/{artifact_name}",
        )


@router.get("/artifacts/{artifact_name}/preview", response_model=ArtifactPreview)
async def get_artifact_preview(
    run_id: str,
    artifact_name: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> ArtifactPreview:
    """
    Get safe artifact preview.

    Returns metadata and size-limited preview content:
    - JSON: parsed content (if < 100KB)
    - NumPy: shape/dtype only (never loads array data)
    - Text: first 10KB
    - Images: base64 thumbnail
    """
    try:
        return store.get_artifact_preview(run_id, artifact_name)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Artifact not found: {run_id}/{artifact_name}",
        )


@router.get("/logs")
async def list_logs(
    run_id: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> dict:
    """
    List available log names for a run.

    Returns a list of log names (e.g., ["run", "stdout", "stderr"]).
    """
    log_names = store.list_logs(run_id)
    return {
        "run_id": run_id,
        "logs": log_names,
    }


@router.get("/logs/{log_name}")
async def get_log(
    run_id: str,
    log_name: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> dict:
    """
    Get log content (stdout, stderr, etc.).

    Returns log content as text. Returns empty content if log doesn't exist.
    """
    content = store.get_log(run_id, log_name)
    return {
        "run_id": run_id,
        "log_name": log_name,
        "content": content or "",
        "exists": content is not None,
    }
