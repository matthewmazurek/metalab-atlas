"""
Search API router: global search across experiments, runs, fields, artifacts, logs.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from atlas.capabilities import SupportsSearch
from atlas.deps import StoreAdapter, get_store
from atlas.models import (
    FieldFilter,
    FilterOp,
    FilterSpec,
    SearchGroup,
    SearchHit,
    SearchResponse,
)

router = APIRouter(prefix="/api/search", tags=["search"])

# Max runs to scan for log content search (bounds latency)
LOG_SEARCH_MAX_RUNS = 500


def _matches(q: str, text: str) -> bool:
    """Case-insensitive substring match."""
    if not q or not text:
        return False
    return q.lower() in str(text).lower()


def _search_experiments(store: StoreAdapter, q: str, limit: int) -> SearchGroup:
    """Search experiment IDs by substring.

    Single-pass: computes hits and total in one loop.
    """
    experiments = store.list_experiments()
    hits: list[SearchHit] = []
    total = 0
    for exp_id, run_count, _ in experiments:
        if _matches(q, exp_id):
            total += 1
            if len(hits) < limit:
                hits.append(
                    SearchHit(
                        label=exp_id,
                        sublabel=f"{run_count} runs",
                        entity_type="experiment",
                        entity_id=exp_id,
                    )
                )
    return SearchGroup(
        category="experiments",
        label="Experiments",
        scope="experiment",
        hits=hits,
        total=total,
    )


def _search_field_names(
    store: StoreAdapter,
    q: str,
    limit: int,
    namespace: str,
    category: str,
    group_label: str,
) -> SearchGroup:
    """Find experiments that define a param/metric/derived field whose name contains q."""
    return _search_field_names_cached(
        store, q, limit, namespace, category, group_label,
        lambda exp_id: store.get_field_index(
            FilterSpec(experiment_id=exp_id) if exp_id else None
        ),
    )


def _search_field_names_cached(
    store: StoreAdapter,
    q: str,
    limit: int,
    namespace: str,
    category: str,
    group_label: str,
    get_field_index: object,
) -> SearchGroup:
    """Find experiments that define a param/metric/derived field whose name contains q.

    Single-pass: computes hits and total in one loop to avoid doubled iteration.
    Uses a callable get_field_index for request-scoped caching.
    """
    experiments = store.list_experiments()
    hits: list[SearchHit] = []
    total = 0
    for exp_id, run_count, _ in experiments:
        index = get_field_index(exp_id)
        if namespace == "params":
            fields = index.params_fields
        elif namespace == "metrics":
            fields = index.metrics_fields
        else:
            fields = index.derived_fields
        for field_name in fields:
            if _matches(q, field_name):
                total += 1
                if len(hits) < limit:
                    hits.append(
                        SearchHit(
                            label=exp_id,
                            sublabel=f"{field_name} · {run_count} runs",
                            entity_type="experiment",
                            entity_id=exp_id,
                        )
                    )
                break  # One hit per experiment for this group
    return SearchGroup(
        category=category,
        label=group_label,
        scope="experiment",
        hits=hits,
        total=total,
    )


def _search_field_values(
    store: StoreAdapter,
    q: str,
    limit: int,
    namespace: str,
    category: str,
    group_label: str,
) -> SearchGroup:
    """Find runs where a param/metric/derived value matches q (categorical or numeric)."""
    index = store.get_field_index()
    if namespace == "params":
        fields = index.params_fields
    elif namespace == "metrics":
        fields = index.metrics_fields
    else:
        fields = index.derived_fields

    hits: list[SearchHit] = []
    seen_run_ids: set[str] = set()
    try:
        q_num = float(q)
    except (ValueError, TypeError):
        q_num = None

    for field_name, info in fields.items():
        if len(hits) >= limit:
            break
        # Categorical: check values list
        if info.values:
            for v in info.values:
                if v and _matches(q, v):
                    runs, total = store.query_runs(
                        filter=FilterSpec(
                            field_filters=[
                                FieldFilter(
                                    field=f"{namespace}.{field_name}",
                                    op=FilterOp.CONTAINS,
                                    value=q,
                                )
                            ]
                        ),
                        limit=limit - len(hits),
                        offset=0,
                    )
                    for run in runs:
                        if run.record.run_id not in seen_run_ids:
                            seen_run_ids.add(run.record.run_id)
                            hits.append(
                                SearchHit(
                                    label=run.record.run_id,
                                    sublabel=f"{field_name}={v}",
                                    entity_type="run",
                                    entity_id=run.record.run_id,
                                    field=f"{namespace}.{field_name}",
                                    value=v,
                                )
                            )
                            if len(hits) >= limit:
                                break
                    break
        # Numeric: check if q parses as number in range
        elif (
            q_num is not None
            and info.min_value is not None
            and info.max_value is not None
        ):
            if info.min_value <= q_num <= info.max_value:
                runs, _ = store.query_runs(
                    filter=FilterSpec(
                        field_filters=[
                            FieldFilter(
                                field=f"{namespace}.{field_name}",
                                op=FilterOp.EQ,
                                value=q_num,
                            )
                        ]
                    ),
                    limit=limit - len(hits),
                    offset=0,
                )
                for run in runs:
                    if run.record.run_id not in seen_run_ids:
                        seen_run_ids.add(run.record.run_id)
                        val = (
                            run.params.get(field_name)
                            if namespace == "params"
                            else (
                                run.metrics.get(field_name)
                                if namespace == "metrics"
                                else run.derived_metrics.get(field_name)
                            )
                        )
                        hits.append(
                            SearchHit(
                                label=run.record.run_id,
                                sublabel=f"{field_name}={val}",
                                entity_type="run",
                                entity_id=run.record.run_id,
                                field=f"{namespace}.{field_name}",
                                value=str(val) if val is not None else None,
                            )
                        )
                        if len(hits) >= limit:
                            break

    # Total count: we don't compute exact total for field values (expensive)
    return SearchGroup(
        category=category,
        label=group_label,
        scope="run",
        hits=hits,
        total=len(hits) if len(hits) < limit else len(hits) + 1,
    )


def _search_run_ids(store: StoreAdapter, q: str, limit: int) -> SearchGroup:
    """Search run IDs by substring."""
    runs, total = store.query_runs(
        filter=FilterSpec(
            field_filters=[
                FieldFilter(field="record.run_id", op=FilterOp.CONTAINS, value=q)
            ]
        ),
        limit=limit,
        offset=0,
    )
    hits = [
        SearchHit(
            label=r.record.run_id,
            sublabel=r.record.experiment_id,
            entity_type="run",
            entity_id=r.record.run_id,
        )
        for r in runs
    ]
    return SearchGroup(
        category="runs",
        label="Runs",
        scope="run",
        hits=hits,
        total=total,
    )


def _search_fingerprints(store: StoreAdapter, q: str, limit: int) -> SearchGroup:
    """Search context/params/seed fingerprint by substring; deduplicate by run_id."""
    seen: set[str] = set()
    hits: list[SearchHit] = []
    for field in [
        "record.context_fingerprint",
        "record.params_fingerprint",
        "record.seed_fingerprint",
    ]:
        if len(hits) >= limit:
            break
        runs, _ = store.query_runs(
            filter=FilterSpec(
                field_filters=[FieldFilter(field=field, op=FilterOp.CONTAINS, value=q)]
            ),
            limit=limit * 2,  # fetch extra to fill after dedupe
            offset=0,
        )
        for r in runs:
            if r.record.run_id in seen:
                continue
            seen.add(r.record.run_id)
            hits.append(
                SearchHit(
                    label=r.record.run_id,
                    sublabel=r.record.experiment_id,
                    entity_type="run",
                    entity_id=r.record.run_id,
                )
            )
            if len(hits) >= limit:
                break
    total = len(hits) + 1 if len(hits) >= limit else len(hits)
    return SearchGroup(
        category="fingerprints",
        label="Fingerprints",
        scope="run",
        hits=hits,
        total=total,
    )


def _search_artifact_names(store: StoreAdapter, q: str, limit: int) -> SearchGroup:
    """Find experiments that produce an artifact whose name contains q (one run per experiment).

    Single-pass: computes hits and total in one loop to avoid doubled iteration
    and doubled query_runs calls.
    """
    experiments = store.list_experiments()
    hits: list[SearchHit] = []
    total = 0
    for exp_id, run_count, _ in experiments:
        runs, _ = store.query_runs(
            filter=FilterSpec(experiment_id=exp_id),
            limit=1,
            offset=0,
        )
        if not runs:
            continue
        for art in runs[0].artifacts:
            if _matches(q, art.name):
                total += 1
                if len(hits) < limit:
                    hits.append(
                        SearchHit(
                            label=exp_id,
                            sublabel=f"{art.name} · {run_count} runs",
                            entity_type="experiment",
                            entity_id=exp_id,
                        )
                    )
                break
    return SearchGroup(
        category="artifacts",
        label="Artifacts",
        scope="experiment",
        hits=hits,
        total=total,
    )


def _search_experiment_tags(store: StoreAdapter, q: str, limit: int) -> SearchGroup:
    """Find experiments whose manifest has a tag containing q.

    Single-pass: computes hits and total in one loop to avoid doubled iteration
    and doubled get_experiment_manifest calls.
    """
    experiments = store.list_experiments()
    hits: list[SearchHit] = []
    total = 0
    for exp_id, run_count, _ in experiments:
        manifest = store.get_experiment_manifest(exp_id, timestamp=None)
        if not manifest or not manifest.tags:
            continue
        for tag in manifest.tags:
            if _matches(q, tag):
                total += 1
                if len(hits) < limit:
                    hits.append(
                        SearchHit(
                            label=exp_id,
                            sublabel=f"tag: {tag} · {run_count} runs",
                            entity_type="experiment",
                            entity_id=exp_id,
                        )
                    )
                break
    return SearchGroup(
        category="tags",
        label="Tags",
        scope="experiment",
        hits=hits,
        total=total,
    )


def _search_run_tags(store: StoreAdapter, q: str, limit: int) -> SearchGroup:
    """Find runs whose record.tags contains q."""
    runs, total = store.query_runs(
        filter=FilterSpec(
            field_filters=[
                FieldFilter(field="record.tags", op=FilterOp.CONTAINS, value=q)
            ]
        ),
        limit=limit,
        offset=0,
    )
    hits = [
        SearchHit(
            label=r.record.run_id,
            sublabel=r.record.experiment_id,
            entity_type="run",
            entity_id=r.record.run_id,
        )
        for r in runs
    ]
    return SearchGroup(
        category="run_tags",
        label="Run tags",
        scope="run",
        hits=hits,
        total=total,
    )


@router.get("", response_model=SearchResponse)
async def search(
    store: Annotated[StoreAdapter, Depends(get_store)],
    q: str = Query(..., min_length=1),
    limit: int = Query(default=5, ge=1, le=200),
) -> SearchResponse:
    """
    Fast search across experiments, runs, field names/values, fingerprints, artifacts.

    Does not include log content search; use GET /api/search/logs for that.

    When the store supports native search (e.g. PostgresStoreAdapter), dispatches
    to SQL-native search with ~5 targeted queries instead of 100+ sequential ones.
    """
    q = q.strip()
    if not q:
        return SearchResponse(query=q, groups=[])

    # Fast path: SQL-native search for Postgres stores
    if isinstance(store, SupportsSearch):
        groups = store.search(q, limit)
        return SearchResponse(query=q, groups=groups)

    # Generic path: Python-loop search for FileStore and other backends
    groups = _generic_search(store, q, limit)
    return SearchResponse(query=q, groups=groups)


def _generic_search(
    store: StoreAdapter, q: str, limit: int
) -> list[SearchGroup]:
    """
    Generic search implementation for non-Postgres backends.

    Uses a request-scoped field index cache to avoid fetching the same
    experiment's field index multiple times across search groups.
    """
    # Request-scoped cache: avoid fetching the same experiment's field index 6 times
    _field_index_cache: dict[str | None, object] = {}

    def _cached_field_index(experiment_id: str | None = None) -> object:
        if experiment_id not in _field_index_cache:
            _field_index_cache[experiment_id] = store.get_field_index(
                FilterSpec(experiment_id=experiment_id) if experiment_id else None
            )
        return _field_index_cache[experiment_id]

    groups: list[SearchGroup] = []

    # Experiment names
    groups.append(_search_experiments(store, q, limit))

    # Field names (experiment-scoped) — use cached field index
    groups.append(
        _search_field_names_cached(store, q, limit, "params", "param_names", "Parameter names", _cached_field_index)
    )
    groups.append(
        _search_field_names_cached(store, q, limit, "metrics", "metric_names", "Metric names", _cached_field_index)
    )
    groups.append(
        _search_field_names_cached(
            store, q, limit, "derived", "derived_names", "Derived metric names", _cached_field_index
        )
    )

    # Field values (run-scoped)
    groups.append(
        _search_field_values(
            store, q, limit, "params", "param_values", "Parameter values"
        )
    )
    groups.append(
        _search_field_values(
            store, q, limit, "metrics", "metric_values", "Metric values"
        )
    )
    groups.append(
        _search_field_values(
            store, q, limit, "derived", "derived_values", "Derived metric values"
        )
    )

    # Run IDs
    groups.append(_search_run_ids(store, q, limit))

    # Fingerprints
    groups.append(_search_fingerprints(store, q, limit))

    # Artifact names (experiment-scoped)
    groups.append(_search_artifact_names(store, q, limit))

    # Experiment tags (from manifest)
    groups.append(_search_experiment_tags(store, q, limit))

    # Run tags (from record.tags)
    groups.append(_search_run_tags(store, q, limit))

    # Drop empty groups
    return [g for g in groups if g.hits or g.total > 0]


@router.get("/logs", response_model=SearchResponse)
async def search_logs(
    store: Annotated[StoreAdapter, Depends(get_store)],
    q: str = Query(..., min_length=1),
    limit: int = Query(default=5, ge=1, le=200),
) -> SearchResponse:
    """
    Full-text search in log contents. Slower; scans up to LOG_SEARCH_MAX_RUNS runs.

    Returns run-scoped hits with a snippet of the matching line.
    Sets truncated=True if the run limit was reached before finishing.
    """
    q = q.strip()
    if not q:
        return SearchResponse(query=q, groups=[], truncated=False)

    q_lower = q.lower()
    hits: list[SearchHit] = []
    runs, total_available = store.query_runs(
        filter=None,
        sort_by="record.started_at",
        sort_order="desc",
        limit=LOG_SEARCH_MAX_RUNS,
        offset=0,
    )
    truncated = total_available > LOG_SEARCH_MAX_RUNS

    for run in runs:
        if len(hits) >= limit:
            break
        log_names = store.list_logs(run.record.run_id)
        for log_name in log_names:
            if len(hits) >= limit:
                break
            content = store.get_log(run.record.run_id, log_name)
            if not content:
                continue
            for line in content.splitlines():
                if q_lower in line.lower():
                    snippet = line.strip()[:80] + (
                        "..." if len(line.strip()) > 80 else ""
                    )
                    hits.append(
                        SearchHit(
                            label=run.record.run_id,
                            sublabel=f"{log_name}: {snippet}",
                            entity_type="run",
                            entity_id=run.record.run_id,
                        )
                    )
                    break  # One hit per run per log file

    return SearchResponse(
        query=q,
        groups=[
            SearchGroup(
                category="logs",
                label="Log contents",
                scope="run",
                hits=hits,
                total=len(hits) if len(hits) < limit else len(hits) + 1,
            )
        ],
        truncated=truncated,
    )
