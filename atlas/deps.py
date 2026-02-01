"""
Dependency injection for MetaLab Atlas.

Provides store adapter instances based on configuration.
Supports local, remote (SSH), and Postgres stores.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Union

from atlas.store import FileStoreAdapter, MultiStoreAdapter, create_store_adapter

if TYPE_CHECKING:
    from atlas.pg_store import PostgresStoreAdapter
    from atlas.remote import RemoteStoreAdapter


# Type alias for store adapters
StoreAdapter = Union[
    FileStoreAdapter,
    MultiStoreAdapter,
    "RemoteStoreAdapter",
    "PostgresStoreAdapter",
]


def get_store_path() -> str:
    """Get store path/URL from environment or default."""
    return os.environ.get("ATLAS_STORE_PATH", "./runs")


def get_remote_config() -> dict[str, str | None]:
    """Get remote connection config from environment."""
    return {
        "key_path": os.environ.get("ATLAS_SSH_KEY"),
        "password": os.environ.get("ATLAS_SSH_PASSWORD"),
        "cache_dir": os.environ.get("ATLAS_CACHE_DIR"),
    }


def get_postgres_config() -> dict[str, str | None]:
    """Get Postgres connection config from environment."""
    return {
        "experiments_root": os.environ.get("ATLAS_EXPERIMENTS_ROOT"),
    }


def is_remote_url(path: str) -> bool:
    """Check if a path is a remote SSH URL."""
    return path.startswith("ssh://") or (
        "@" in path and ":" in path and not path.startswith("postgres")
    )


def is_postgres_url(path: str) -> bool:
    """Check if a path is a PostgreSQL URL."""
    return path.startswith("postgresql://") or path.startswith("postgres://")


@lru_cache(maxsize=1)
def _get_local_store_singleton(store_path: str) -> FileStoreAdapter | MultiStoreAdapter:
    """Create cached local store adapter instance."""
    return create_store_adapter(store_path)


@lru_cache(maxsize=1)
def _get_remote_store_singleton(
    url: str,
    key_path: str | None,
    cache_dir: str | None,
) -> "RemoteStoreAdapter":
    """Create cached remote store adapter instance."""
    from atlas.remote import create_remote_adapter

    return create_remote_adapter(
        url=url,
        key_path=key_path,
        cache_dir=Path(cache_dir) if cache_dir else None,
    )


@lru_cache(maxsize=1)
def _get_postgres_store_singleton(
    url: str,
    experiments_root: str | None,
) -> "PostgresStoreAdapter":
    """Create cached Postgres store adapter instance."""
    from atlas.pg_store import PostgresStoreAdapter

    return PostgresStoreAdapter(
        connection_string=url,
        experiments_root=experiments_root,
    )


def get_store() -> StoreAdapter:
    """
    Dependency that provides the store adapter.

    The store path is read from ATLAS_STORE_PATH environment variable,
    defaulting to "./runs".

    Supports:
    - Local paths: Creates FileStoreAdapter or MultiStoreAdapter
    - Remote SSH URLs: Creates RemoteStoreAdapter (ssh://user@host/path or user@host:/path)
    - Postgres URLs: Creates PostgresStoreAdapter (postgresql://user@host:port/db)

    If the path contains multiple experiment stores in subdirectories,
    a MultiStoreAdapter is returned that aggregates all stores.
    """
    store_path = get_store_path()

    if is_postgres_url(store_path):
        config = get_postgres_config()
        return _get_postgres_store_singleton(
            store_path,
            config["experiments_root"],
        )

    if is_remote_url(store_path):
        config = get_remote_config()
        return _get_remote_store_singleton(
            store_path,
            config["key_path"],
            config["cache_dir"],
        )

    # Local store
    resolved = str(Path(store_path).resolve())
    return _get_local_store_singleton(resolved)


def reset_store_cache() -> None:
    """Reset the store cache (for testing)."""
    _get_local_store_singleton.cache_clear()
    _get_remote_store_singleton.cache_clear()
    _get_postgres_store_singleton.cache_clear()


def refresh_stores() -> int:
    """
    Refresh store discovery to pick up new experiments.

    Returns the number of stores discovered.
    """
    from atlas.capabilities import SupportsRefresh, SupportsStorePaths

    store = get_store()

    # Refresh if supported
    if isinstance(store, SupportsRefresh):
        store.refresh()

    # Return number of store paths if supported
    if isinstance(store, SupportsStorePaths):
        return len(store.get_store_paths())

    return 1  # Single store adapter without SupportsStorePaths
