"""
Experiments API router: Manifest listing, retrieval, and export.
"""

from __future__ import annotations

import json
import logging
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from atlas.deps import StoreAdapter, get_store
from atlas.models import (
    FilterSpec,
    ManifestInfo,
    ManifestListResponse,
    ManifestResponse,
    SlurmArrayStatusResponse,
    StatusCounts,
)

logger = logging.getLogger(__name__)

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


@router.get("/{experiment_id}/status-counts", response_model=StatusCounts)
async def get_status_counts(
    experiment_id: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> StatusCounts:
    """
    Get lightweight status counts for an experiment.

    This is optimized for dashboard polling - only reads the status
    field from each run record, avoiding full record conversion.
    Returns counts for success, failed, running, and cancelled states.
    """
    return store.get_status_counts(experiment_id)


@router.get("/{experiment_id}/export")
async def export_experiment(
    experiment_id: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
    format: str = Query(default="csv", pattern="^(csv|parquet)$"),
    include_params: bool = Query(default=True),
    include_metrics: bool = Query(default=True),
    include_derived: bool = Query(default=True),
    include_record: bool = Query(default=True),
) -> Response:
    """
    Export experiment results as CSV or Parquet.

    Downloads all runs for an experiment as a tabular file.
    Parquet format includes embedded metadata for provenance tracking.

    Args:
        experiment_id: The experiment identifier.
        format: Output format ('csv' or 'parquet').
        include_params: Include parameter columns (prefixed with 'param_').
        include_metrics: Include metric columns.
        include_derived: Include derived metric columns (prefixed with 'derived_').
        include_record: Include record fields (run_id, status, timestamps).

    Returns:
        File download response with appropriate content type.
    """
    from atlas.export import (
        build_export_metadata,
        dataframe_to_csv_bytes,
        dataframe_to_parquet_bytes,
        runs_to_dataframe,
    )

    # Query all runs for this experiment
    filter_spec = FilterSpec(experiment_id=experiment_id)
    runs, total = store.query_runs(
        filter=filter_spec,
        limit=100000,  # Get all runs
        offset=0,
    )

    if not runs:
        raise HTTPException(
            status_code=404,
            detail=f"No runs found for experiment: {experiment_id}",
        )

    # Convert to DataFrame
    try:
        df = runs_to_dataframe(
            runs=runs,
            include_params=include_params,
            include_metrics=include_metrics,
            include_derived=include_derived,
            include_record=include_record,
        )
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Export dependencies not installed: {e}",
        )

    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_experiment_id = experiment_id.replace(":", "_").replace("/", "_")

    if format == "parquet":
        # Get context fingerprint from manifest if available
        manifest = store.get_experiment_manifest(experiment_id)
        context_fingerprint = manifest.context_fingerprint if manifest else None

        # Build metadata and export
        try:
            metadata = build_export_metadata(
                experiment_id=experiment_id,
                total_runs=len(runs),
                context_fingerprint=context_fingerprint,
            )
            content = dataframe_to_parquet_bytes(df, metadata)
        except ImportError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Parquet export requires pyarrow: {e}",
            )

        filename = f"{safe_experiment_id}_{timestamp}.parquet"
        media_type = "application/octet-stream"
    else:
        # CSV export
        content = dataframe_to_csv_bytes(df)
        filename = f"{safe_experiment_id}_{timestamp}.csv"
        media_type = "text/csv"

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# Cache for experiment_id -> store_path mapping (avoids expensive scans)
_experiment_store_cache: dict[str, tuple[str, datetime]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


def _get_experiment_store_path(
    experiment_id: str,
    store: StoreAdapter,
) -> str | None:
    """
    Get the store path for an experiment (with caching).

    Args:
        experiment_id: The experiment ID to look up.
        store: The store adapter.

    Returns:
        Path to the store root, or None if not found.
    """
    # Check cache
    now = datetime.now()
    if experiment_id in _experiment_store_cache:
        cached_path, cached_at = _experiment_store_cache[experiment_id]
        if (now - cached_at).total_seconds() < _CACHE_TTL_SECONDS:
            return cached_path

    # Try to find the store path
    from atlas.store import FileStoreAdapter, MultiStoreAdapter

    if isinstance(store, MultiStoreAdapter):
        # Scan all stores for this experiment
        for store_path in store.store_paths:
            manifest_path = Path(store_path) / "manifest.json"
            if manifest_path.exists():
                try:
                    with open(manifest_path) as f:
                        manifest = json.load(f)
                    if manifest.get("experiment_id") == experiment_id:
                        _experiment_store_cache[experiment_id] = (store_path, now)
                        return store_path
                except Exception:
                    pass
    elif isinstance(store, FileStoreAdapter):
        store_path = store.store_path
        manifest_path = Path(store_path) / "manifest.json"
        if manifest_path.exists():
            try:
                with open(manifest_path) as f:
                    manifest = json.load(f)
                if manifest.get("experiment_id") == experiment_id:
                    _experiment_store_cache[experiment_id] = (store_path, now)
                    return store_path
            except Exception:
                pass
    else:
        # Remote store adapter
        # For remote stores, we need to read the manifest via SFTP
        # The store adapter should have already synced the manifest
        if hasattr(store, "store_path") or hasattr(store, "_local_path"):
            local_path = getattr(store, "_local_path", None) or getattr(
                store, "store_path", None
            )
            if local_path:
                manifest_path = Path(local_path) / "manifest.json"
                if manifest_path.exists():
                    try:
                        with open(manifest_path) as f:
                            manifest = json.load(f)
                        if manifest.get("experiment_id") == experiment_id:
                            _experiment_store_cache[experiment_id] = (
                                str(local_path),
                                now,
                            )
                            return str(local_path)
                    except Exception:
                        pass

    return None


def _run_local_slurm_cmd(
    cmd: list[str],
    timeout: float = 30.0,
) -> tuple[int, str, str]:
    """Run a SLURM command locally."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", f"Command timed out after {timeout}s"
    except Exception as e:
        return -1, "", str(e)


def _normalize_slurm_state(state: str) -> str:
    """Normalize SLURM state string (strips trailing +, uppercases)."""
    return state.upper().rstrip("+")


def _is_step_job(job_id: str) -> bool:
    """Check if job ID is a step job."""
    return "." in job_id and any(
        job_id.endswith(suffix) for suffix in [".batch", ".extern", ".0"]
    )


def _parse_squeue_output(stdout: str) -> dict[str, int]:
    """Parse squeue output to state counts."""
    counts: dict[str, int] = {}
    for line in stdout.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 2:
            job_id, state = parts[0], parts[1]
            if _is_step_job(job_id):
                continue
            state = _normalize_slurm_state(state)
            counts[state] = counts.get(state, 0) + 1
    return counts


def _parse_sacct_output(stdout: str) -> dict[str, int]:
    """Parse sacct output to state counts."""
    counts: dict[str, int] = {}
    for line in stdout.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 2:
            job_id, state = parts[0], parts[1]
            if _is_step_job(job_id):
                continue
            state = _normalize_slurm_state(state)
            counts[state] = counts.get(state, 0) + 1
    return counts


@router.get("/{experiment_id}/slurm-status", response_model=SlurmArrayStatusResponse)
async def get_slurm_status(
    experiment_id: str,
    store: Annotated[StoreAdapter, Depends(get_store)],
) -> SlurmArrayStatusResponse:
    """
    Get SLURM scheduler status for an experiment.

    Returns detailed job state counts from squeue (active jobs) and
    sacct (terminal jobs). For remote stores, executes commands via SSH.

    Args:
        experiment_id: The experiment identifier.

    Returns:
        SlurmArrayStatusResponse with explicit state buckets.

    Raises:
        HTTPException 404: If experiment not found or no SLURM manifest.
        HTTPException 500: If SLURM commands fail.
    """
    # Find the store path for this experiment
    store_path = _get_experiment_store_path(experiment_id, store)
    if store_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Experiment not found: {experiment_id}",
        )

    # Read the manifest to get job_ids
    manifest_path = Path(store_path) / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No manifest found for experiment: {experiment_id}",
        )

    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read manifest: {e}",
        )

    # Check if this is a SLURM array-indexed submission
    if manifest.get("submission_mode") != "array_indexed":
        raise HTTPException(
            status_code=400,
            detail="Experiment was not submitted as SLURM array (no scheduler status available)",
        )

    job_ids = manifest.get("job_ids", [])
    total_runs = manifest.get("total_runs", 0)

    if not job_ids:
        # No jobs submitted yet
        return SlurmArrayStatusResponse(
            job_ids=[],
            total=total_runs,
            running=0,
            pending=total_runs,
            completed=0,
            failed=0,
            cancelled=0,
            timeout=0,
            oom=0,
            other=0,
        )

    # Determine if we need to use SSH for remote execution
    from atlas.remote import RemoteStoreAdapter

    is_remote = isinstance(store, RemoteStoreAdapter)

    # Query squeue
    job_list = ",".join(job_ids)
    squeue_cmd = f"squeue -h -j {job_list} -o '%i %T'"

    if is_remote and hasattr(store, "_conn"):
        exit_code, stdout, stderr = store._conn.exec_command(squeue_cmd, timeout=30.0)
    else:
        exit_code, stdout, stderr = _run_local_slurm_cmd(
            ["squeue", "-h", "-j", job_list, "-o", "%i %T"],
            timeout=30.0,
        )

    now = datetime.now()
    squeue_counts = _parse_squeue_output(stdout) if exit_code == 0 else {}
    last_squeue_at = now if exit_code == 0 else None

    # Query sacct
    sacct_cmd = f"sacct -n -P -j {job_list} --format=JobIDRaw,State"

    if is_remote and hasattr(store, "_conn"):
        exit_code, stdout, stderr = store._conn.exec_command(sacct_cmd, timeout=60.0)
    else:
        exit_code, stdout, stderr = _run_local_slurm_cmd(
            ["sacct", "-n", "-P", "-j", job_list, "--format=JobIDRaw,State"],
            timeout=60.0,
        )

    sacct_counts = _parse_sacct_output(stdout) if exit_code == 0 else {}
    last_sacct_at = now if exit_code == 0 else None

    # Extract explicit buckets
    running = squeue_counts.get("RUNNING", 0)
    pending = squeue_counts.get("PENDING", 0)
    completing = squeue_counts.get("COMPLETING", 0)

    completed = sacct_counts.get("COMPLETED", 0)
    failed = sacct_counts.get("FAILED", 0)
    cancelled = sacct_counts.get("CANCELLED", 0)
    timeout = sacct_counts.get("TIMEOUT", 0)
    oom = sacct_counts.get("OUT_OF_MEMORY", 0)

    # Calculate other
    accounted = (
        running + pending + completing + completed + failed + cancelled + timeout + oom
    )
    other = max(0, total_runs - accounted)

    # Add completing to running for simplicity
    running_total = running + completing

    return SlurmArrayStatusResponse(
        job_ids=job_ids,
        total=total_runs,
        running=running_total,
        pending=pending,
        completed=completed,
        failed=failed,
        cancelled=cancelled,
        timeout=timeout,
        oom=oom,
        other=other,
        last_squeue_at=last_squeue_at,
        last_sacct_at=last_sacct_at,
        sacct_stale=last_sacct_at is None,
    )
