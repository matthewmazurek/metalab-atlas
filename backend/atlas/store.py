"""
Store adapter: Backend-agnostic interface for run data access.

Initial implementation wraps metalab's FileStore with in-memory filtering.
Designed for future replacement with indexed backend (SQLite/DuckDB).
"""

from __future__ import annotations

import json
import mimetypes
import sys
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from atlas.models import (
    AggFn,
    ArtifactInfo,
    ArtifactPreview,
    ArrayInfo,
    DataPoint,
    ErrorBarType,
    FieldFilter,
    FieldIndex,
    FieldInfo,
    FieldType,
    FilterOp,
    FilterSpec,
    NumpyInfo,
    PreviewData,
    ProvenanceInfo,
    RecordFields,
    RunResponse,
    RunStatus,
    Series,
)

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

    def get_artifact_preview(
        self, run_id: str, artifact_name: str
    ) -> ArtifactPreview:
        """Return safe artifact preview."""
        ...

    def get_log(self, run_id: str, log_name: str) -> str | None:
        """Return log content."""
        ...

    def list_experiments(self) -> list[tuple[str, int, datetime | None]]:
        """Return list of (experiment_id, run_count, latest_run)."""
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
        record_fields = RecordFields(
            run_id=record.run_id,
            experiment_id=record.experiment_id,
            status=RunStatus(record.status.value),
            context_fingerprint=record.context_fingerprint,
            params_fingerprint=record.params_fingerprint,
            seed_fingerprint=record.seed_fingerprint,
            started_at=record.started_at,
            finished_at=record.finished_at,
            duration_ms=record.duration_ms,
            provenance=provenance,
            error=record.error,
            tags=record.tags,
            warnings=record.warnings,
            notes=record.notes,
        )

        return RunResponse(
            record=record_fields,
            params=record.params_resolved or {},
            metrics=record.metrics or {},
            artifacts=artifacts,
        )

    def _get_field_value(self, run: RunResponse, field_path: str) -> Any:
        """Get a value from a run using dot-notation field path."""
        parts = field_path.split(".", 1)
        if len(parts) != 2:
            return None

        namespace, key = parts

        if namespace == "record":
            return getattr(run.record, key, None)
        elif namespace == "params":
            return run.params.get(key)
        elif namespace == "metrics":
            return run.metrics.get(key)

        return None

    def _apply_filter(self, runs: list[RunResponse], filter: FilterSpec) -> list[RunResponse]:
        """Apply FilterSpec to a list of runs."""
        result = runs

        # Filter by experiment_id
        if filter.experiment_id:
            result = [r for r in result if r.record.experiment_id == filter.experiment_id]

        # Filter by status
        if filter.status:
            status_set = set(filter.status)
            result = [r for r in result if r.record.status in status_set]

        # Filter by time range
        if filter.started_after:
            result = [r for r in result if r.record.started_at >= filter.started_after]
        if filter.started_before:
            result = [r for r in result if r.record.started_at <= filter.started_before]

        # Apply field filters
        if filter.field_filters:
            for ff in filter.field_filters:
                result = self._apply_field_filter(result, ff)

        return result

    def _apply_field_filter(self, runs: list[RunResponse], ff: FieldFilter) -> list[RunResponse]:
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
                    match = ff.value in str(value)
                elif ff.op == FilterOp.IN:
                    match = value in ff.value
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

    def get_field_index(self, filter: FilterSpec | None = None) -> FieldIndex:
        """Build field index from runs."""
        records = self._get_cached_records()
        runs = [self._convert_record(r) for r in records]

        if filter:
            runs = self._apply_filter(runs, filter)

        params_fields: dict[str, dict] = {}
        metrics_fields: dict[str, dict] = {}

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

        return FieldIndex(
            version=1,
            last_scan=datetime.now(),
            run_count=len(runs),
            params_fields={
                k: self._to_field_info(v) for k, v in params_fields.items()
            },
            metrics_fields={
                k: self._to_field_info(v) for k, v in metrics_fields.items()
            },
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

    def get_artifact_preview(
        self, run_id: str, artifact_name: str
    ) -> ArtifactPreview:
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

                with np.load(artifact_path, allow_pickle=False) as data:
                    arrays = {}
                    for name in data.files:
                        arr = data[name]
                        arrays[name] = ArrayInfo(
                            shape=list(arr.shape),
                            dtype=str(arr.dtype),
                        )
                    preview.numpy_info = NumpyInfo(arrays=arrays)
            except Exception:
                pass

        elif artifact_format in ("txt", "csv", "log"):
            if size_bytes <= self.TEXT_PREVIEW_MAX_BYTES:
                preview.text_content = artifact_path.read_text()
            else:
                preview.text_content = artifact_path.read_text()[:self.TEXT_PREVIEW_MAX_BYTES]
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

    def list_experiments(self) -> list[tuple[str, int, datetime | None]]:
        """List all experiments with counts."""
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

        return [(exp_id, count, latest) for exp_id, (count, latest) in experiments.items()]
