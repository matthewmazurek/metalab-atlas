"""
Field indexer: Cached discovery of params and metrics fields.

Maintains a lightweight index file (.atlas_index.json) for fast field lookups.
Uses mtime-based invalidation for incremental updates.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from atlas.models import FieldIndex, FieldInfo, FieldType


class FieldIndexer:
    """
    Manages the field index for a store.

    The index tracks known param and metric keys across all runs,
    with inferred types and value statistics.
    """

    INDEX_FILENAME = ".atlas_index.json"

    def __init__(self, store_path: Path) -> None:
        """Initialize with store path."""
        self._store_path = store_path
        self._index_path = store_path / self.INDEX_FILENAME
        self._cached_index: FieldIndex | None = None
        self._cache_mtime: float | None = None

    def _get_runs_mtime(self) -> float:
        """Get the modification time of the runs directory."""
        runs_dir = self._store_path / "runs"
        if not runs_dir.exists():
            return 0.0
        return runs_dir.stat().st_mtime

    def _is_cache_valid(self) -> bool:
        """Check if the cached index is still valid."""
        if self._cached_index is None or self._cache_mtime is None:
            return False
        return self._get_runs_mtime() <= self._cache_mtime

    def get_index(self) -> FieldIndex:
        """Get the field index, rebuilding if necessary."""
        # Check in-memory cache first
        if self._is_cache_valid():
            return self._cached_index  # type: ignore

        # Try to load from file
        if self._index_path.exists():
            try:
                index = self._load_from_file()
                # Check if file index is still valid
                if index.last_scan:
                    file_mtime = self._index_path.stat().st_mtime
                    runs_mtime = self._get_runs_mtime()
                    if file_mtime >= runs_mtime:
                        self._cached_index = index
                        self._cache_mtime = runs_mtime
                        return index
            except Exception:
                pass

        # Rebuild index
        index = self._rebuild_index()
        self._save_to_file(index)
        self._cached_index = index
        self._cache_mtime = self._get_runs_mtime()
        return index

    def _load_from_file(self) -> FieldIndex:
        """Load index from file."""
        data = json.loads(self._index_path.read_text())
        return FieldIndex(
            version=data.get("version", 1),
            last_scan=datetime.fromisoformat(data["last_scan"]) if data.get("last_scan") else None,
            run_count=data.get("run_count", 0),
            params_fields={
                k: FieldInfo(**v) for k, v in data.get("params_fields", {}).items()
            },
            metrics_fields={
                k: FieldInfo(**v) for k, v in data.get("metrics_fields", {}).items()
            },
            record_fields={
                k: FieldInfo(**v) for k, v in data.get("record_fields", {}).items()
            },
        )

    def _save_to_file(self, index: FieldIndex) -> None:
        """Save index to file."""
        data = {
            "version": index.version,
            "last_scan": index.last_scan.isoformat() if index.last_scan else None,
            "run_count": index.run_count,
            "params_fields": {
                k: v.model_dump() for k, v in index.params_fields.items()
            },
            "metrics_fields": {
                k: v.model_dump() for k, v in index.metrics_fields.items()
            },
            "record_fields": {
                k: v.model_dump() for k, v in index.record_fields.items()
            },
        }
        self._index_path.write_text(json.dumps(data, indent=2))

    # Record fields to index (discrete categorical fields)
    RECORD_FIELDS_TO_INDEX = ["status", "experiment_id"]

    def _rebuild_index(self) -> FieldIndex:
        """Rebuild the index by scanning all runs."""
        runs_dir = self._store_path / "runs"
        if not runs_dir.exists():
            return FieldIndex(last_scan=datetime.now())

        params_stats: dict[str, dict] = {}
        metrics_stats: dict[str, dict] = {}
        record_stats: dict[str, dict] = {}
        run_count = 0

        for run_file in runs_dir.glob("*.json"):
            try:
                data = json.loads(run_file.read_text())
                run_count += 1

                # Index params
                for key, value in data.get("params_resolved", {}).items():
                    if key not in params_stats:
                        params_stats[key] = self._init_stats(value)
                    self._update_stats(params_stats[key], value)

                # Index metrics
                for key, value in data.get("metrics", {}).items():
                    if key not in metrics_stats:
                        metrics_stats[key] = self._init_stats(value)
                    self._update_stats(metrics_stats[key], value)

                # Index record fields (status, experiment_id, etc.)
                record = data.get("record", {})
                for key in self.RECORD_FIELDS_TO_INDEX:
                    if key in record:
                        value = record[key]
                        if key not in record_stats:
                            record_stats[key] = self._init_stats(value)
                        self._update_stats(record_stats[key], value)

            except (json.JSONDecodeError, KeyError):
                continue

        return FieldIndex(
            version=1,
            last_scan=datetime.now(),
            run_count=run_count,
            params_fields={k: self._stats_to_field_info(v) for k, v in params_stats.items()},
            metrics_fields={k: self._stats_to_field_info(v) for k, v in metrics_stats.items()},
            record_fields={k: self._stats_to_field_info(v) for k, v in record_stats.items()},
        )

    def _init_stats(self, value: Any) -> dict:
        """Initialize statistics for a field."""
        return {
            "type": self._infer_type(value),
            "count": 0,
            "values": set(),
            "min": None,
            "max": None,
        }

    def _infer_type(self, value: Any) -> FieldType:
        """Infer field type from value."""
        if isinstance(value, bool):
            return FieldType.BOOLEAN
        elif isinstance(value, (int, float)):
            return FieldType.NUMERIC
        elif isinstance(value, str):
            return FieldType.STRING
        return FieldType.UNKNOWN

    def _update_stats(self, stats: dict, value: Any) -> None:
        """Update field statistics."""
        stats["count"] += 1

        if stats["type"] == FieldType.NUMERIC and isinstance(value, (int, float)):
            if stats["min"] is None or value < stats["min"]:
                stats["min"] = value
            if stats["max"] is None or value > stats["max"]:
                stats["max"] = value
        elif stats["type"] in (FieldType.STRING, FieldType.BOOLEAN):
            if len(stats["values"]) < 100:  # Limit stored values
                stats["values"].add(str(value))

    def _stats_to_field_info(self, stats: dict) -> FieldInfo:
        """Convert stats to FieldInfo."""
        values = None
        if stats["type"] in (FieldType.STRING, FieldType.BOOLEAN) and stats["values"]:
            values = sorted(stats["values"])

        return FieldInfo(
            type=stats["type"],
            count=stats["count"],
            values=values,
            min_value=stats.get("min"),
            max_value=stats.get("max"),
        )

    def invalidate(self) -> None:
        """Invalidate the cached index."""
        self._cached_index = None
        self._cache_mtime = None
