"""
Dependency injection for Metalab Atlas.

Provides store adapter instances based on configuration.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from atlas.store import FileStoreAdapter


def get_store_path() -> Path:
    """Get store path from environment or default."""
    store_path = os.environ.get("ATLAS_STORE_PATH", "./runs")
    return Path(store_path).resolve()


@lru_cache(maxsize=1)
def _get_store_singleton(store_path: str) -> FileStoreAdapter:
    """Create cached store adapter instance."""
    return FileStoreAdapter(store_path)


def get_store() -> FileStoreAdapter:
    """
    Dependency that provides the store adapter.

    The store path is read from ATLAS_STORE_PATH environment variable,
    defaulting to "./runs".
    """
    store_path = get_store_path()
    return _get_store_singleton(str(store_path))


def reset_store_cache() -> None:
    """Reset the store cache (for testing)."""
    _get_store_singleton.cache_clear()
