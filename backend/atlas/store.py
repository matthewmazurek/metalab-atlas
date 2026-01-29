"""
Store adapter: Backend-agnostic interface for run data access.

Initial implementation wraps metalab's FileStore with in-memory filtering.
Designed for future replacement with indexed backend (SQLite/DuckDB).

Supports multi-store discovery: when given a parent directory, discovers
all subdirectories that are valid metalab stores with run records.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import sys
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from atlas.models import (
    AggFn,
    ArrayInfo,
    ArtifactInfo,
    ArtifactPreview,
    DataPoint,
    ErrorBarType,
    FieldFilter,
    FieldIndex,
    FieldInfo,
    FieldType,
    FilterOp,
    FilterSpec,
    ManifestInfo,
    ManifestResponse,
    NumpyInfo,
    OperationInfo,
    PreviewData,
    ProvenanceInfo,
    RecordFields,
    RunResponse,
    RunStatus,
    Series,
)

logger = logging.getLogger(__name__)

# Add metalab to path if needed
METALAB_PATH = Path(__file__).parent.parent.parent.parent / "metalab"
if str(METALAB_PATH.parent) not in sys.path:
    sys.path.insert(0, str(METALAB_PATH.parent))


class StoreAdapter(Protocol):
    """Protocol for store backends."""

    def query_runs(
        self,
        filter: FilterSpec | None = None,
        sort_by: str | None = None,
        sort_order: str = "desc",
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[RunResponse], int]:
        """Return filtered runs + total count."""
        ...

    def get_run(self, run_id: str) -> RunResponse | None:
        """Get a single run by ID."""
        ...

    def get_field_index(self, filter: FilterSpec | None = None) -> FieldIndex:
        """Return field metadata index."""
        ...

    def get_artifact_content(
        self, run_id: str, artifact_name: str
    ) -> tuple[bytes, str]:
        """Return artifact content and content type."""
        ...

    def get_artifact_preview(self, run_id: str, artifact_name: str) -> ArtifactPreview:
        """Return safe artifact preview."""
        ...

    def get_log(self, run_id: str, log_name: str) -> str | None:
        """Return log content."""
        ...

    def list_logs(self, run_id: str) -> list[str]:
        """Return list of available log names for a run."""
        ...

    def list_experiments(self) -> list[tuple[str, int, datetime | None]]:
        """Return list of (experiment_id, run_count, latest_run)."""
        ...

    def list_experiment_manifests(self, experiment_id: str) -> list["ManifestInfo"]:
        """Return list of manifest info for an experiment."""
        ...

    def get_experiment_manifest(
        self, experiment_id: str, timestamp: str | None = None
    ) -> "ManifestResponse | None":
        """Get experiment manifest content. If timestamp is None, return latest."""
        ...


class FileStoreAdapter:
    """
    Adapter wrapping metalab's FileStore.

    Uses in-memory caching and filtering. Designed to be replaced
    with an indexed backend for large stores.
    """

    # Preview size limits
    JSON_PREVIEW_MAX_BYTES = 100 * 1024  # 100KB
    TEXT_PREVIEW_MAX_BYTES = 10 * 1024  # 10KB
    IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024  # 10MB

    def __init__(self, store_path: str | Path) -> None:
        """Initialize with path to metalab store."""
        from metalab.store.file import FileStore

        self._store_path = Path(store_path)
        self._store = FileStore(store_path)
        self._cache_time: datetime | None = None
        self._cache_ttl_seconds = 30

    def _get_cached_records(self) -> list[Any]:
        """Get cached run records from metalab store."""
        # Simple TTL cache
        now = datetime.now()
        if (
            self._cache_time is None
            or (now - self._cache_time).total_seconds() > self._cache_ttl_seconds
        ):
            self._cached_records = self._store.list_run_records()
            self._cache_time = now
        return self._cached_records

    def _convert_record(self, record: Any) -> RunResponse:
        """Convert metalab RunRecord to API RunResponse."""
        # Convert provenance
        prov = record.provenance
        provenance = ProvenanceInfo(
            code_hash=prov.code_hash,
            python_version=prov.python_version,
            metalab_version=prov.metalab_version,
            executor_id=prov.executor_id,
            host=prov.host,
            extra=prov.extra,
        )

        # Convert artifacts
        artifacts = [
            ArtifactInfo(
                artifact_id=a.artifact_id,
                name=a.name,
                kind=a.kind,
                format=a.format,
                content_hash=a.content_hash,
                size_bytes=a.size_bytes,
                metadata={k: v for k, v in a.metadata.items() if not k.startswith("_")},
            )
            for a in record.artifacts
        ]

        # Build record fields
        # For RUNNING status, set finished_at and duration_ms to None
        is_running = record.status.value == "running"
        record_fields = RecordFields(
            run_id=record.run_id,
            experiment_id=record.experiment_id,
            status=RunStatus(record.status.value),
            context_fingerprint=record.context_fingerprint,
            params_fingerprint=record.params_fingerprint,
            seed_fingerprint=record.seed_fingerprint,
            started_at=record.started_at,
            finished_at=None if is_running else record.finished_at,
            duration_ms=None if is_running else record.duration_ms,
            provenance=provenance,
            error=record.error,
            tags=record.tags,
            warnings=record.warnings,
            notes=record.notes,
        )

        # Load derived metrics if they exist
        derived_metrics = self._store.get_derived(record.run_id) or {}

        return RunResponse(
            record=record_fields,
            params=record.params_resolved or {},
            metrics=record.metrics or {},
            derived_metrics=derived_metrics,
            artifacts=artifacts,
        )

    def _get_field_value(self, run: RunResponse, field_path: str) -> Any:
        """Get a value from a run using dot-notation field path."""
        parts = field_path.split(".", 1)

        # Handle special case: searching across all metrics
        if field_path == "metrics":
            # Return concatenated string of all metric key:value pairs for text search
            return " ".join(f"{k}:{v}" for k, v in run.metrics.items())

        # Handle special case: searching across all params
        if field_path == "params":
            return " ".join(f"{k}:{v}" for k, v in run.params.items())

        # Handle special case: searching across all derived metrics
        if field_path == "derived":
            return " ".join(f"{k}:{v}" for k, v in run.derived_metrics.items())

        if len(parts) != 2:
            return None

        namespace, key = parts

        if namespace == "record":
            return getattr(run.record, key, None)
        elif namespace == "params":
            return run.params.get(key)
        elif namespace == "metrics":
            return run.metrics.get(key)
        elif namespace == "derived":
            return run.derived_metrics.get(key)

        return None

    def _apply_filter(
        self, runs: list[RunResponse], filter: FilterSpec
    ) -> list[RunResponse]:
        """Apply FilterSpec to a list of runs."""
        result = runs

        # Filter by experiment_id
        if filter.experiment_id:
            result = [
                r for r in result if r.record.experiment_id == filter.experiment_id
            ]

        # Filter by status
        if filter.status:
            status_set = set(filter.status)
            result = [r for r in result if r.record.status in status_set]

        # Filter by time range
        # Note: metalab stores timestamps in local time (naive), but filter dates
        # come from the frontend as UTC. Convert filter dates to local time.
        if filter.started_after:
            after = filter.started_after
            # Convert UTC to local time if timezone-aware
            if after.tzinfo is not None:
                after = after.astimezone().replace(tzinfo=None)
            result = [r for r in result if r.record.started_at >= after]
        if filter.started_before:
            before = filter.started_before
            # Convert UTC to local time if timezone-aware
            if before.tzinfo is not None:
                before = before.astimezone().replace(tzinfo=None)
            result = [r for r in result if r.record.started_at <= before]

        # Apply field filters
        if filter.field_filters:
            for ff in filter.field_filters:
                result = self._apply_field_filter(result, ff)

        return result

    def _apply_field_filter(
        self, runs: list[RunResponse], ff: FieldFilter
    ) -> list[RunResponse]:
        """Apply a single field filter."""
        filtered = []
        for run in runs:
            value = self._get_field_value(run, ff.field)
            if value is None:
                continue

            match = False
            try:
                if ff.op == FilterOp.EQ:
                    match = value == ff.value
                elif ff.op == FilterOp.NE:
                    match = value != ff.value
                elif ff.op == FilterOp.LT:
                    match = value < ff.value
                elif ff.op == FilterOp.LE:
                    match = value <= ff.value
                elif ff.op == FilterOp.GT:
                    match = value > ff.value
                elif ff.op == FilterOp.GE:
                    match = value >= ff.value
                elif ff.op == FilterOp.CONTAINS:
                    match = str(ff.value).lower() in str(value).lower()
                elif ff.op == FilterOp.IN:
                    # Get comparable value: use .value for enums, str() for others
                    # Field index stores values as strings (e.g., bool True -> "True")
                    cmp_value = value.value if hasattr(value, 'value') else str(value)
                    match = cmp_value in ff.value
            except (TypeError, ValueError):
                continue

            if match:
                filtered.append(run)

        return filtered

    def query_runs(
        self,
        filter: FilterSpec | None = None,
        sort_by: str | None = None,
        sort_order: str = "desc",
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[RunResponse], int]:
        """Query runs with filtering, sorting, and pagination."""
        # Get all records and convert
        records = self._get_cached_records()
        runs = [self._convert_record(r) for r in records]

        # Apply filter
        if filter:
            runs = self._apply_filter(runs, filter)

        total = len(runs)

        # Sort
        if sort_by:
            reverse = sort_order == "desc"
            try:
                runs.sort(
                    key=lambda r: self._get_field_value(r, sort_by) or "",
                    reverse=reverse,
                )
            except (TypeError, ValueError):
                pass
        else:
            # Default sort by started_at desc
            runs.sort(key=lambda r: r.record.started_at, reverse=True)

        # Paginate
        runs = runs[offset : offset + limit]

        return runs, total

    def get_run(self, run_id: str) -> RunResponse | None:
        """Get a single run by ID."""
        record = self._store.get_run_record(run_id)
        if record is None:
            return None
        return self._convert_record(record)

    # Record fields to index (discrete categorical fields)
    RECORD_FIELDS_TO_INDEX = ["status", "experiment_id", "seed_fingerprint"]

    def get_field_index(self, filter: FilterSpec | None = None) -> FieldIndex:
        """Build field index from runs."""
        records = self._get_cached_records()
        runs = [self._convert_record(r) for r in records]

        if filter:
            runs = self._apply_filter(runs, filter)

        params_fields: dict[str, dict] = {}
        metrics_fields: dict[str, dict] = {}
        derived_fields: dict[str, dict] = {}
        record_fields: dict[str, dict] = {}

        for run in runs:
            # Index params
            for key, value in run.params.items():
                if key not in params_fields:
                    params_fields[key] = {
                        "type": self._infer_type(value),
                        "count": 0,
                        "values": set(),
                        "min": None,
                        "max": None,
                    }
                self._update_field_stats(params_fields[key], value)

            # Index metrics
            for key, value in run.metrics.items():
                if key not in metrics_fields:
                    metrics_fields[key] = {
                        "type": self._infer_type(value),
                        "count": 0,
                        "values": set(),
                        "min": None,
                        "max": None,
                    }
                self._update_field_stats(metrics_fields[key], value)

            # Index derived metrics
            for key, value in run.derived_metrics.items():
                if key not in derived_fields:
                    derived_fields[key] = {
                        "type": self._infer_type(value),
                        "count": 0,
                        "values": set(),
                        "min": None,
                        "max": None,
                    }
                self._update_field_stats(derived_fields[key], value)

            # Index record fields (status, experiment_id, etc.)
            for key in self.RECORD_FIELDS_TO_INDEX:
                value = getattr(run.record, key, None)
                if value is not None:
                    # Convert enum values to their string value
                    if hasattr(value, "value"):
                        value = value.value
                    if key not in record_fields:
                        record_fields[key] = {
                            "type": self._infer_type(value),
                            "count": 0,
                            "values": set(),
                            "min": None,
                            "max": None,
                        }
                    self._update_field_stats(record_fields[key], value)

        return FieldIndex(
            version=1,
            last_scan=datetime.now(),
            run_count=len(runs),
            params_fields={k: self._to_field_info(v) for k, v in params_fields.items()},
            metrics_fields={
                k: self._to_field_info(v) for k, v in metrics_fields.items()
            },
            derived_fields={
                k: self._to_field_info(v) for k, v in derived_fields.items()
            },
            record_fields={k: self._to_field_info(v) for k, v in record_fields.items()},
        )

    def _infer_type(self, value: Any) -> FieldType:
        """Infer field type from a value."""
        if isinstance(value, bool):
            return FieldType.BOOLEAN
        elif isinstance(value, (int, float)):
            return FieldType.NUMERIC
        elif isinstance(value, str):
            return FieldType.STRING
        return FieldType.UNKNOWN

    def _update_field_stats(self, stats: dict, value: Any) -> None:
        """Update field statistics with a new value."""
        stats["count"] += 1

        if stats["type"] == FieldType.NUMERIC and isinstance(value, (int, float)):
            if stats["min"] is None or value < stats["min"]:
                stats["min"] = value
            if stats["max"] is None or value > stats["max"]:
                stats["max"] = value
        elif stats["type"] == FieldType.STRING:
            stats["values"].add(str(value))
        elif stats["type"] == FieldType.BOOLEAN:
            stats["values"].add(str(value))

    def _to_field_info(self, stats: dict) -> FieldInfo:
        """Convert stats dict to FieldInfo."""
        values = None
        if stats["type"] in (FieldType.STRING, FieldType.BOOLEAN):
            values = sorted(stats["values"])[:100]  # Limit to 100 unique values

        return FieldInfo(
            type=stats["type"],
            count=stats["count"],
            values=values,
            min_value=stats.get("min"),
            max_value=stats.get("max"),
        )

    def get_artifact_content(
        self, run_id: str, artifact_name: str
    ) -> tuple[bytes, str]:
        """Get artifact content by run_id and artifact name."""
        # Find artifact path
        artifact_dir = self._store_path / "artifacts" / run_id

        # Try common extensions
        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            path = artifact_dir / f"{artifact_name}{ext}"
            if path.exists():
                content = path.read_bytes()
                content_type, _ = mimetypes.guess_type(str(path))
                return content, content_type or "application/octet-stream"

        raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

    def get_artifact_preview(self, run_id: str, artifact_name: str) -> ArtifactPreview:
        """Get safe artifact preview."""
        # Find artifact
        artifact_dir = self._store_path / "artifacts" / run_id
        artifact_path = None
        artifact_format = ""

        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            path = artifact_dir / f"{artifact_name}{ext}"
            if path.exists():
                artifact_path = path
                artifact_format = ext.lstrip(".") or "binary"
                break

        if artifact_path is None:
            raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

        size_bytes = artifact_path.stat().st_size
        preview = PreviewData()
        truncated = False

        # Generate preview based on format
        if artifact_format == "json":
            if size_bytes <= self.JSON_PREVIEW_MAX_BYTES:
                try:
                    preview.json_content = json.loads(artifact_path.read_text())
                except json.JSONDecodeError:
                    pass
            else:
                truncated = True

        elif artifact_format == "npz":
            try:
                import numpy as np

                # Max elements to include for visualization
                MAX_ARRAY_ELEMENTS = 10000

                with np.load(artifact_path, allow_pickle=False) as data:
                    arrays = {}
                    for name in data.files:
                        arr = data[name]
                        # Include actual values for 1D arrays under size limit
                        values = None
                        if len(arr.shape) == 1 and arr.shape[0] <= MAX_ARRAY_ELEMENTS:
                            values = arr.astype(float).tolist()
                        arrays[name] = ArrayInfo(
                            shape=list(arr.shape),
                            dtype=str(arr.dtype),
                            values=values,
                        )
                    preview.numpy_info = NumpyInfo(arrays=arrays)
            except Exception:
                pass

        elif artifact_format in ("txt", "csv", "log"):
            if size_bytes <= self.TEXT_PREVIEW_MAX_BYTES:
                preview.text_content = artifact_path.read_text()
            else:
                preview.text_content = artifact_path.read_text()[
                    : self.TEXT_PREVIEW_MAX_BYTES
                ]
                truncated = True

        elif artifact_format in ("png", "jpg", "jpeg", "gif", "webp"):
            if size_bytes <= self.IMAGE_PREVIEW_MAX_BYTES:
                import base64

                preview.image_thumbnail = base64.b64encode(
                    artifact_path.read_bytes()
                ).decode()

        # Infer kind from format
        kind = "file"
        if artifact_format == "json":
            kind = "json"
        elif artifact_format == "npz":
            kind = "numpy"
        elif artifact_format in ("png", "jpg", "jpeg", "gif", "webp"):
            kind = "image"
        elif artifact_format in ("txt", "csv", "log"):
            kind = "text"

        return ArtifactPreview(
            name=artifact_name,
            kind=kind,
            format=artifact_format,
            size_bytes=size_bytes,
            preview=preview,
            preview_truncated=truncated,
        )

    def get_log(self, run_id: str, log_name: str) -> str | None:
        """Get log content."""
        return self._store.get_log(run_id, log_name)

    def list_logs(self, run_id: str) -> list[str]:
        """List available log names for a run."""
        return self._store.list_logs(run_id)

    def list_experiments(self) -> list[tuple[str, int, datetime | None]]:
        """List all experiments with counts, including stores without runs."""
        records = self._get_cached_records()

        experiments: dict[str, tuple[int, datetime | None]] = {}
        for record in records:
            exp_id = record.experiment_id
            if exp_id not in experiments:
                experiments[exp_id] = (0, None)

            count, latest = experiments[exp_id]
            count += 1
            if latest is None or record.started_at > latest:
                latest = record.started_at
            experiments[exp_id] = (count, latest)

        # If no experiments found from runs, include the store itself
        # using its directory name as the experiment ID
        if not experiments:
            store_name = self._store_path.name
            experiments[store_name] = (0, None)

        return [
            (exp_id, count, latest) for exp_id, (count, latest) in experiments.items()
        ]

    def list_experiment_manifests(self, experiment_id: str) -> list[ManifestInfo]:
        """List all manifest files for an experiment."""
        experiments_dir = self._store_path / "experiments"
        if not experiments_dir.exists():
            return []

        # Manifest files are named: {experiment_id}_{timestamp}.json
        # The experiment_id may contain colons which are replaced with underscores
        safe_id = experiment_id.replace(":", "_")
        manifests = []

        for path in experiments_dir.glob(f"{safe_id}_*.json"):
            try:
                # Extract timestamp from filename
                # Format: {safe_id}_{YYYYMMDD_HHMMSS}.json
                stem = path.stem
                timestamp = stem[len(safe_id) + 1 :]  # +1 for the underscore

                # Parse the manifest to get submitted_at and total_runs
                data = json.loads(path.read_text())
                submitted_at_str = data.get("submitted_at")
                submitted_at = (
                    datetime.fromisoformat(submitted_at_str)
                    if submitted_at_str
                    else datetime.now()
                )
                total_runs = data.get("total_runs", 0)

                manifests.append(
                    ManifestInfo(
                        experiment_id=experiment_id,
                        timestamp=timestamp,
                        submitted_at=submitted_at,
                        total_runs=total_runs,
                    )
                )
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"Failed to parse manifest {path}: {e}")
                continue

        # Sort by timestamp descending (most recent first)
        manifests.sort(key=lambda m: m.submitted_at, reverse=True)
        return manifests

    def get_experiment_manifest(
        self, experiment_id: str, timestamp: str | None = None
    ) -> ManifestResponse | None:
        """Get experiment manifest content."""
        experiments_dir = self._store_path / "experiments"
        if not experiments_dir.exists():
            return None

        safe_id = experiment_id.replace(":", "_")

        if timestamp is None:
            # Get the latest manifest
            manifests = self.list_experiment_manifests(experiment_id)
            if not manifests:
                return None
            timestamp = manifests[0].timestamp

        manifest_path = experiments_dir / f"{safe_id}_{timestamp}.json"
        if not manifest_path.exists():
            return None

        try:
            data = json.loads(manifest_path.read_text())

            # Parse operation info
            operation_data = data.get("operation", {})
            operation = (
                OperationInfo(
                    ref=operation_data.get("ref"),
                    name=operation_data.get("name"),
                    code_hash=operation_data.get("code_hash"),
                )
                if operation_data
                else None
            )

            # Parse submitted_at
            submitted_at_str = data.get("submitted_at")
            submitted_at = (
                datetime.fromisoformat(submitted_at_str) if submitted_at_str else None
            )

            return ManifestResponse(
                experiment_id=data.get("experiment_id", experiment_id),
                name=data.get("name"),
                version=data.get("version"),
                description=data.get("description"),
                tags=data.get("tags", []),
                operation=operation,
                params=data.get("params", {}),
                seeds=data.get("seeds", {}),
                context_fingerprint=data.get("context_fingerprint"),
                metadata=data.get(
                    "metadata", data.get("runtime_hints")
                ),  # BC: accept old name
                total_runs=data.get("total_runs", 0),
                run_ids=data.get("run_ids"),
                submitted_at=submitted_at,
            )
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Failed to parse manifest {manifest_path}: {e}")
            return None


def is_valid_store(path: Path) -> bool:
    """
    Check if a path is a valid metalab store.

    A valid store has a _meta.json file at its root.
    """
    meta_file = path / "_meta.json"
    return meta_file.exists()


def discover_stores(root: Path, max_depth: int = 2) -> list[Path]:
    """
    Discover all valid metalab stores starting from root.

    Searches up to max_depth levels deep. If root itself is a valid store
    with runs, it's included. Subdirectories that are valid stores are also
    discovered.

    Args:
        root: Starting directory
        max_depth: Maximum depth to search (default 2)

    Returns:
        List of paths to valid stores
    """
    stores = []

    # Check if root itself is a valid store
    if is_valid_store(root):
        stores.append(root)

    # Search subdirectories
    def search(path: Path, depth: int) -> None:
        if depth > max_depth:
            return

        try:
            for entry in path.iterdir():
                if entry.is_dir() and not entry.name.startswith("."):
                    if is_valid_store(entry):
                        stores.append(entry)
                    else:
                        # Continue searching deeper
                        search(entry, depth + 1)
        except PermissionError:
            pass

    search(root, 1)
    return stores


class MultiStoreAdapter:
    """
    Adapter that aggregates multiple FileStore instances.

    Discovers all valid stores in a directory tree and presents
    a unified view of all runs across all stores.
    """

    def __init__(self, root_path: str | Path, max_depth: int = 2) -> None:
        """
        Initialize with root path for store discovery.

        Args:
            root_path: Root directory to search for stores
            max_depth: Maximum depth to search for stores
        """
        self._root_path = Path(root_path)
        self._max_depth = max_depth
        self._adapters: list[FileStoreAdapter] = []
        self._store_paths: list[Path] = []
        self._cache_time: datetime | None = None
        self._cache_ttl_seconds = 30
        self._discover_stores()

    def _discover_stores(self) -> None:
        """Discover and initialize store adapters."""
        self._store_paths = discover_stores(self._root_path, self._max_depth)
        self._adapters = [FileStoreAdapter(p) for p in self._store_paths]

        if self._store_paths:
            logger.info(f"Discovered {len(self._store_paths)} store(s):")
            for p in self._store_paths:
                logger.info(f"  - {p}")
        else:
            logger.warning(f"No valid stores found in {self._root_path}")

    def refresh_stores(self) -> None:
        """Re-discover stores (call if new experiments are added)."""
        self._discover_stores()

    @property
    def store_paths(self) -> list[Path]:
        """Return list of discovered store paths."""
        return self._store_paths.copy()

    def query_runs(
        self,
        filter: FilterSpec | None = None,
        sort_by: str | None = None,
        sort_order: str = "desc",
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[RunResponse], int]:
        """Query runs across all stores."""
        all_runs: list[RunResponse] = []

        for adapter in self._adapters:
            # Get all runs from each store (no pagination yet)
            runs, _ = adapter.query_runs(
                filter=filter,
                sort_by=None,  # Sort after aggregation
                sort_order=sort_order,
                limit=100000,  # Get all
                offset=0,
            )
            all_runs.extend(runs)

        total = len(all_runs)

        # Sort aggregated results
        if sort_by:
            reverse = sort_order == "desc"
            try:
                # Use the same field access as FileStoreAdapter
                def get_value(run: RunResponse) -> Any:
                    parts = sort_by.split(".", 1)
                    if len(parts) != 2:
                        return ""
                    namespace, key = parts
                    if namespace == "record":
                        return getattr(run.record, key, "")
                    elif namespace == "params":
                        return run.params.get(key, "")
                    elif namespace == "metrics":
                        return run.metrics.get(key, "")
                    return ""

                all_runs.sort(key=get_value, reverse=reverse)
            except (TypeError, ValueError):
                pass
        else:
            # Default sort by started_at desc
            all_runs.sort(key=lambda r: r.record.started_at, reverse=True)

        # Paginate
        runs = all_runs[offset : offset + limit]

        return runs, total

    def get_run(self, run_id: str) -> RunResponse | None:
        """Get a single run by ID from any store."""
        for adapter in self._adapters:
            run = adapter.get_run(run_id)
            if run is not None:
                return run
        return None

    def get_field_index(self, filter: FilterSpec | None = None) -> FieldIndex:
        """Build aggregated field index from all stores."""
        # Merge field indices from all stores
        all_params: dict[str, dict] = {}
        all_metrics: dict[str, dict] = {}
        all_derived: dict[str, dict] = {}
        all_records: dict[str, dict] = {}
        total_runs = 0

        def merge_fields(target: dict, source_fields: dict[str, FieldInfo]) -> None:
            """Merge field info from source into target dict."""
            for key, info in source_fields.items():
                if key not in target:
                    target[key] = {
                        "type": info.type,
                        "count": 0,
                        "values": set(info.values or []),
                        "min": info.min_value,
                        "max": info.max_value,
                    }
                stats = target[key]
                stats["count"] += info.count
                if info.values:
                    stats["values"].update(info.values)
                if info.min_value is not None:
                    if stats["min"] is None or info.min_value < stats["min"]:
                        stats["min"] = info.min_value
                if info.max_value is not None:
                    if stats["max"] is None or info.max_value > stats["max"]:
                        stats["max"] = info.max_value

        for adapter in self._adapters:
            idx = adapter.get_field_index(filter)
            total_runs += idx.run_count

            # Merge all field types
            merge_fields(all_params, idx.params_fields)
            merge_fields(all_metrics, idx.metrics_fields)
            merge_fields(all_derived, idx.derived_fields)
            merge_fields(all_records, idx.record_fields)

        def to_field_info(stats: dict) -> FieldInfo:
            values = None
            if stats["type"] in (FieldType.STRING, FieldType.BOOLEAN):
                values = sorted(stats["values"])[:100]
            return FieldInfo(
                type=stats["type"],
                count=stats["count"],
                values=values,
                min_value=stats.get("min"),
                max_value=stats.get("max"),
            )

        return FieldIndex(
            version=1,
            last_scan=datetime.now(),
            run_count=total_runs,
            params_fields={k: to_field_info(v) for k, v in all_params.items()},
            metrics_fields={k: to_field_info(v) for k, v in all_metrics.items()},
            derived_fields={k: to_field_info(v) for k, v in all_derived.items()},
            record_fields={k: to_field_info(v) for k, v in all_records.items()},
        )

    def get_artifact_content(
        self, run_id: str, artifact_name: str
    ) -> tuple[bytes, str]:
        """Get artifact content from the appropriate store."""
        for adapter in self._adapters:
            try:
                return adapter.get_artifact_content(run_id, artifact_name)
            except FileNotFoundError:
                continue
        raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

    def get_artifact_preview(self, run_id: str, artifact_name: str) -> ArtifactPreview:
        """Get artifact preview from the appropriate store."""
        for adapter in self._adapters:
            try:
                return adapter.get_artifact_preview(run_id, artifact_name)
            except FileNotFoundError:
                continue
        raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

    def get_log(self, run_id: str, log_name: str) -> str | None:
        """Get log content from the appropriate store."""
        for adapter in self._adapters:
            log = adapter.get_log(run_id, log_name)
            if log is not None:
                return log
        return None

    def list_logs(self, run_id: str) -> list[str]:
        """List available log names from the appropriate store."""
        for adapter in self._adapters:
            logs = adapter.list_logs(run_id)
            if logs:
                return logs
        return []

    def list_experiments(self) -> list[tuple[str, int, datetime | None]]:
        """List all experiments across all stores, including stores without runs."""
        experiments: dict[str, tuple[int, datetime | None]] = {}

        for adapter in self._adapters:
            for exp_id, count, latest in adapter.list_experiments():
                if exp_id not in experiments:
                    experiments[exp_id] = (0, None)

                existing_count, existing_latest = experiments[exp_id]
                new_count = existing_count + count
                new_latest = latest
                if existing_latest is not None:
                    if latest is None or existing_latest > latest:
                        new_latest = existing_latest
                experiments[exp_id] = (new_count, new_latest)

        return [
            (exp_id, count, latest) for exp_id, (count, latest) in experiments.items()
        ]

    def list_experiment_manifests(self, experiment_id: str) -> list[ManifestInfo]:
        """List all manifest files for an experiment across all stores."""
        all_manifests: list[ManifestInfo] = []
        for adapter in self._adapters:
            all_manifests.extend(adapter.list_experiment_manifests(experiment_id))

        # Sort by timestamp descending (most recent first)
        all_manifests.sort(key=lambda m: m.submitted_at, reverse=True)
        return all_manifests

    def get_experiment_manifest(
        self, experiment_id: str, timestamp: str | None = None
    ) -> ManifestResponse | None:
        """Get experiment manifest content from any store."""
        if timestamp is None:
            # Get the latest manifest across all stores
            manifests = self.list_experiment_manifests(experiment_id)
            if not manifests:
                return None
            timestamp = manifests[0].timestamp

        for adapter in self._adapters:
            manifest = adapter.get_experiment_manifest(experiment_id, timestamp)
            if manifest is not None:
                return manifest
        return None


def create_store_adapter(
    store_path: str | Path,
) -> FileStoreAdapter | MultiStoreAdapter:
    """
    Create the appropriate store adapter for a given path.

    If the path is a single valid store, returns a FileStoreAdapter.
    Otherwise, returns a MultiStoreAdapter that discovers stores in subdirectories.

    Args:
        store_path: Path to store or parent directory containing stores

    Returns:
        FileStoreAdapter or MultiStoreAdapter
    """
    path = Path(store_path)

    # Check if it's a single valid store with runs
    if is_valid_store(path):
        # Still check for nested stores - if there are any, use MultiStoreAdapter
        nested = discover_stores(path, max_depth=2)
        if len(nested) == 1 and nested[0] == path:
            # Single store, use simple adapter
            logger.info(f"Using single store: {path}")
            return FileStoreAdapter(path)

    # Use multi-store discovery
    logger.info(f"Using multi-store discovery from: {path}")
    return MultiStoreAdapter(path)
