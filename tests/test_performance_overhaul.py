"""
Tests for the Atlas performance overhaul (atlas-side).

Covers:
- SupportsSearch capability protocol dispatch
- Generic search single-pass fixes (no doubled loops)
- TTL cache initialization and invalidation
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest


# =========================================================================
# Phase 4B: SupportsSearch capability protocol
# =========================================================================


class TestSupportsSearchProtocol:
    """Tests for SupportsSearch capability dispatch."""

    def test_protocol_is_runtime_checkable(self):
        """SupportsSearch is a runtime-checkable protocol."""
        from atlas.capabilities import SupportsSearch

        class MockSearchStore:
            def search(self, q: str, limit: int = 5) -> list:
                return []

        store = MockSearchStore()
        assert isinstance(store, SupportsSearch)

    def test_non_search_store_not_instance(self):
        """Objects without search() are not SupportsSearch."""
        from atlas.capabilities import SupportsSearch

        class PlainStore:
            pass

        store = PlainStore()
        assert not isinstance(store, SupportsSearch)


# =========================================================================
# Phase 4C: Generic search fixes
# =========================================================================


class TestGenericSearchSinglePass:
    """Tests that generic search uses single-pass iteration."""

    def test_search_experiments_single_pass(self):
        """_search_experiments computes hits and total in one pass."""
        from atlas.routers.search import _search_experiments

        mock_store = MagicMock()
        # 5 experiments, 3 match "test"
        mock_store.list_experiments.return_value = [
            ("test_exp_1", 10, None),
            ("other_exp", 5, None),
            ("test_exp_2", 20, None),
            ("another", 3, None),
            ("test_exp_3", 15, None),
        ]

        result = _search_experiments(mock_store, "test", limit=2)

        # Should have 2 hits (limited) but total=3 (all matches)
        assert len(result.hits) == 2
        assert result.total == 3

        # Should only call list_experiments once (single pass)
        mock_store.list_experiments.assert_called_once()

    def test_search_experiment_tags_single_pass(self):
        """_search_experiment_tags computes hits and total in one pass."""
        from atlas.routers.search import _search_experiment_tags

        mock_store = MagicMock()
        mock_store.list_experiments.return_value = [
            ("exp_1", 10, None),
            ("exp_2", 5, None),
            ("exp_3", 20, None),
        ]

        mock_manifest_1 = MagicMock()
        mock_manifest_1.tags = ["ml", "benchmark"]
        mock_manifest_2 = MagicMock()
        mock_manifest_2.tags = ["ml", "production"]
        mock_manifest_3 = MagicMock()
        mock_manifest_3.tags = ["other"]

        mock_store.get_experiment_manifest.side_effect = [
            mock_manifest_1,
            mock_manifest_2,
            mock_manifest_3,
        ]

        result = _search_experiment_tags(mock_store, "ml", limit=1)

        # Should have 1 hit (limited) but total=2 (both match "ml")
        assert len(result.hits) == 1
        assert result.total == 2

        # get_experiment_manifest should be called once per experiment (3 times)
        # NOT twice per experiment (6 times) as in the old doubled-loop code
        assert mock_store.get_experiment_manifest.call_count == 3

    def test_search_artifact_names_single_pass(self):
        """_search_artifact_names computes hits and total in one pass."""
        from atlas.routers.search import _search_artifact_names

        mock_store = MagicMock()
        mock_store.list_experiments.return_value = [
            ("exp_1", 10, None),
            ("exp_2", 5, None),
            ("exp_3", 20, None),
        ]

        # Create mock runs with artifacts
        mock_run_1 = MagicMock()
        mock_art_1 = MagicMock()
        mock_art_1.name = "model_checkpoint"
        mock_run_1.artifacts = [mock_art_1]

        mock_run_2 = MagicMock()
        mock_art_2 = MagicMock()
        mock_art_2.name = "model_weights"
        mock_run_2.artifacts = [mock_art_2]

        mock_run_3 = MagicMock()
        mock_art_3 = MagicMock()
        mock_art_3.name = "other_data"
        mock_run_3.artifacts = [mock_art_3]

        mock_store.query_runs.side_effect = [
            ([mock_run_1], 1),
            ([mock_run_2], 1),
            ([mock_run_3], 1),
        ]

        result = _search_artifact_names(mock_store, "model", limit=1)

        # Should have 1 hit (limited) but total=2 (model_checkpoint + model_weights)
        assert len(result.hits) == 1
        assert result.total == 2

        # query_runs should be called 3 times (once per experiment)
        # NOT 6 times (doubled loop)
        assert mock_store.query_runs.call_count == 3
