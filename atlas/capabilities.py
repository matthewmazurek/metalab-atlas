"""
Store adapter capability protocols: Optional interfaces for atlas adapters.

These protocols allow adapters to expose optional capabilities that
routers/API code can depend on via isinstance() checks, replacing
scattered hasattr() and type checks.

Pattern:
    if isinstance(store, SupportsSqlPushdown):
        return store.compute_aggregate_sql(request)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from atlas.models import AggregateRequest, AggregateResponse, SearchGroup


@runtime_checkable
class SupportsSqlPushdown(Protocol):
    """
    Adapter capability: SQL-based aggregate computation.

    Used by:
    - aggregate router: to push aggregation to SQL for large datasets

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


@runtime_checkable
class SupportsRefresh(Protocol):
    """
    Adapter capability: can refresh/re-scan state.

    Used by:
    - deps.py: to trigger store refresh when needed

    Stores that cache state should implement this.
    """

    def refresh(self) -> None:
        """
        Refresh adapter state (clear caches, re-scan schemas, etc.).
        """
        ...


@runtime_checkable
class SupportsSearch(Protocol):
    """
    Adapter capability: native search with SQL pushdown.

    Used by:
    - search router: to dispatch to efficient SQL-native search
      instead of the generic Python-loop approach.

    PostgresStoreAdapter implements this with ~5 targeted SQL queries
    instead of 100+ sequential queries.
    """

    def search(self, q: str, limit: int = 5) -> list["SearchGroup"]:
        """
        Search across experiments, runs, fields, and fingerprints.

        Args:
            q: The search query string.
            limit: Maximum hits per category.

        Returns:
            List of SearchGroup results (empty groups excluded).
        """
        ...
