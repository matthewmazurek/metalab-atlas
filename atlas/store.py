"""
Store adapter: Protocol for Atlas store backends.

Atlas requires a PostgreSQL backend for all query operations.
The StoreAdapter protocol defines the contract that PostgresStoreAdapter implements.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from atlas.models import (
    ArtifactPreview,
    FieldIndex,
    FilterSpec,
    ManifestInfo,
    ManifestResponse,
    RunResponse,
    StatusCounts,
)


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

    def get_status_counts(self, experiment_id: str | None = None) -> "StatusCounts":
        """Get lightweight status counts."""
        ...

    # Structured results (capture.data)
    def list_results(self, run_id: str) -> list[str]:
        """Return list of structured result names for a run."""
        ...

    def get_result(self, run_id: str, name: str) -> dict[str, Any] | None:
        """Return a structured result entry for a run."""
        ...
