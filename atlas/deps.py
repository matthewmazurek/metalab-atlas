"""
Dependency injection for MetaLab Atlas.

Atlas requires a PostgreSQL backend for all query operations.
Optionally, file_root can be provided for serving artifact/log content.
"""

from __future__ import annotations

import os
from functools import lru_cache

from atlas.pg_store import PostgresStoreAdapter

# Type alias for store adapter (Postgres-only)
StoreAdapter = PostgresStoreAdapter


def get_store_path() -> str:
    """Get store path/URL from environment."""
    return os.environ.get("ATLAS_STORE_PATH", "")


def get_file_root() -> str | None:
    """Get optional file root from environment."""
    return os.environ.get("ATLAS_FILE_ROOT")


def is_postgres_url(path: str) -> bool:
    """Check if a path is a PostgreSQL connection string."""
    return path.startswith("postgresql://") or path.startswith("postgres://")


@lru_cache(maxsize=1)
def _get_postgres_store_singleton(
    url: str,
    file_root: str | None,
) -> PostgresStoreAdapter:
    """Create cached Postgres store adapter instance."""
    return PostgresStoreAdapter(
        connection_string=url,
        file_root=file_root,
    )


def get_store() -> StoreAdapter:
    """
    Dependency that provides the store adapter.

    The store path is read from ATLAS_STORE_PATH environment variable
    and must be a PostgreSQL connection string.

    Optionally, ATLAS_FILE_ROOT can be set to enable serving artifact
    and log content from the filesystem.

    Raises:
        ValueError: If ATLAS_STORE_PATH is not set or is not a PostgreSQL URL.
    """
    store_path = get_store_path()

    if not store_path:
        raise ValueError(
            "ATLAS_STORE_PATH is not set. "
            "Atlas requires a PostgreSQL connection string. "
            "Example: ATLAS_STORE_PATH=postgresql://user@localhost:5432/metalab"
        )

    if not is_postgres_url(store_path):
        raise ValueError(
            f"ATLAS_STORE_PATH must be a PostgreSQL URL, got: {store_path!r}. "
            "Atlas requires a PostgreSQL backend for query operations. "
            "Example: ATLAS_STORE_PATH=postgresql://user@localhost:5432/metalab"
        )

    file_root = get_file_root()
    return _get_postgres_store_singleton(store_path, file_root)


def reset_store_cache() -> None:
    """Reset the store cache (for testing)."""
    _get_postgres_store_singleton.cache_clear()


def refresh_stores() -> int:
    """
    Refresh store discovery to pick up new experiments.

    Returns 1 (single Postgres store).
    """
    from atlas.capabilities import SupportsRefresh

    store = get_store()

    if isinstance(store, SupportsRefresh):
        store.refresh()

    return 1
