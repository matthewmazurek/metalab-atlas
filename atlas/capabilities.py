"""
Store adapter capability protocols: Optional interfaces for atlas adapters.

These protocols allow adapters to expose optional capabilities that
routers/API code can depend on via isinstance() checks, replacing
scattered hasattr() and type checks.

Pattern:
    if isinstance(store, SupportsSqlPushdown):
        return store.compute_aggregate_sql(request)
    else:
        # fallback to in-memory computation
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from atlas.models import (
        AggregateRequest,
        AggregateResponse,
        HistogramRequest,
        HistogramResponse,
    )


@runtime_checkable
class SupportsSqlPushdown(Protocol):
    """
    Adapter capability: SQL-based aggregate/histogram computation.

    Used by:
    - aggregate router: to push aggregation to SQL for large datasets
    - histogram router: to push binning to SQL for large datasets

    PostgresStoreAdapter implements this for efficient queries on 300k+ runs.
    """

    def compute_aggregate_sql(
        self,
        request: "AggregateRequest",
    ) -> "AggregateResponse":
        """
        Compute aggregation directly in SQL.

        Args:
            request: The aggregation request parameters.

        Returns:
            Aggregated series data.
        """
        ...

    def compute_histogram_sql(
        self,
        request: "HistogramRequest",
    ) -> "HistogramResponse":
        """
        Compute histogram directly in SQL using width_bucket().

        Args:
            request: The histogram request parameters.

        Returns:
            Histogram bin data.
        """
        ...


@runtime_checkable
class SupportsStorePaths(Protocol):
    """
    Adapter capability: exposes filesystem store paths.

    Used by:
    - experiments router: to find manifest files
    - SLURM status endpoint: to locate experiment stores

    FileStoreAdapter and MultiStoreAdapter implement this.
    """

    def get_store_paths(self) -> list[Path]:
        """
        Return list of store root paths.

        For single-store adapters, returns a single-element list.
        For multi-store adapters, returns all discovered store paths.

        Returns:
            List of Path objects to store roots.
        """
        ...


@runtime_checkable
class SupportsRemoteExec(Protocol):
    """
    Adapter capability: remote command execution via SSH.

    Used by:
    - experiments router: to run SLURM commands on remote clusters
    - SLURM status endpoint: to query squeue/sacct via SSH

    RemoteStoreAdapter implements this.
    """

    def exec_remote_command(
        self,
        command: str,
        timeout: float = 30.0,
    ) -> tuple[int, str, str]:
        """
        Execute a command on the remote host.

        Args:
            command: The shell command to execute.
            timeout: Command timeout in seconds.

        Returns:
            Tuple of (exit_code, stdout, stderr).
        """
        ...


@runtime_checkable
class SupportsRefresh(Protocol):
    """
    Adapter capability: can refresh/re-scan state.

    Used by:
    - deps.py: to trigger store refresh when needed
    - MultiStoreAdapter: to re-discover stores

    Stores that cache state should implement this.
    """

    def refresh(self) -> None:
        """
        Refresh adapter state (re-scan stores, clear caches, etc.).
        """
        ...
