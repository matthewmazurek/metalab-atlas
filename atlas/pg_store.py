"""
PostgresStoreAdapter: Direct Postgres backend for Atlas.

Provides SQL pushdown for efficient queries on large datasets (300k+ runs):
- Experiments list: SELECT with GROUP BY
- Runs list: Keyset pagination with efficient sorting
- Field index: From field_catalog table or JSONB introspection
- Aggregations: SQL-based GROUP BY with statistical functions

Connection can be via:
- Direct connection string: postgresql://user@host:port/db
- SSH tunnel (handled externally before calling this adapter)
"""

from __future__ import annotations

import json
import logging
import mimetypes
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Generator
from urllib.parse import parse_qs, urlparse

from atlas.models import (
    ArtifactInfo,
    ArtifactPreview,
    ExperimentInfo,
    FieldIndex,
    FieldInfo,
    FieldType,
    FieldValuesRequest,
    FieldValuesResponse,
    FilterSpec,
    ManifestInfo,
    ManifestResponse,
    OperationInfo,
    PreviewData,
    ProvenanceInfo,
    RecordFields,
    RunResponse,
    RunStatus,
    SearchGroup,
    SearchHit,
    StatusCounts,
)
from metalab.store.layout import safe_experiment_id

if TYPE_CHECKING:
    import psycopg  # type: ignore[import-not-found]

logger = logging.getLogger(__name__)

# Default page size for keyset pagination
DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 1000


class SchemaScope:
    """
    Encapsulates schema resolution for multi-schema PostgreSQL queries.

    metalab stores experiment data in experiment-specific schemas (e.g., 'my_experiment').
    This class handles generating correct table references for queries that may need
    to span one or multiple schemas.

    Usage:
        scope = adapter._scope_for_experiment("my_experiment:1.0.0")
        if scope.is_empty:
            return empty_response()

        cur.execute(f"SELECT * FROM {scope.table('runs')} WHERE ...")
    """

    def __init__(self, schemas: list[str]):
        """Initialize with a list of schema names to query."""
        self._schemas = schemas

    @property
    def schemas(self) -> list[str]:
        """Get the list of schemas in this scope."""
        return self._schemas

    @property
    def is_empty(self) -> bool:
        """Return True if no schemas are in scope (query would return no results)."""
        return len(self._schemas) == 0

    def table(self, name: str, alias: str | None = None) -> str:
        """
        Get SQL table reference for the given table name.

        Returns either a direct schema.table reference (single schema)
        or a UNION ALL subquery (multiple schemas).

        When an alias is provided, it's applied consistently regardless of
        whether this is a single or multi-schema scope. This allows calling
        code to always reference the table by the alias without worrying
        about the underlying schema count.

        Args:
            name: Table name (e.g., 'runs', 'artifacts', 'logs')
            alias: Optional alias for the table. When provided, the returned
                   SQL will include the alias so callers can reference columns
                   as `alias.column`. Required when joining multiple tables.

        Returns:
            SQL fragment suitable for use in FROM clause

        Examples:
            scope.table('runs')           -> 'myschema.runs' or '(...) AS all_runs'
            scope.table('runs', 'r')      -> 'myschema.runs r' or '(...) AS r'
        """
        if len(self._schemas) == 0:
            raise ValueError("Cannot create table reference for empty scope")
        if len(self._schemas) == 1:
            base = f"{self._schemas[0]}.{name}"
            return f"{base} {alias}" if alias else base
        union_parts = [f"SELECT * FROM {s}.{name}" for s in self._schemas]
        table_alias = alias if alias else f"all_{name}"
        return f"({' UNION ALL '.join(union_parts)}) AS {table_alias}"

    def single_schema(self) -> str | None:
        """
        Get single schema name, or None if scope contains multiple schemas.

        Useful when you need to write to a specific schema or perform
        operations that only make sense on a single schema.
        """
        return self._schemas[0] if len(self._schemas) == 1 else None

    def __repr__(self) -> str:
        return f"SchemaScope({self._schemas})"


# Custom query parameters that metalab embeds in the connection URL but
# that are not valid PostgreSQL connection parameters.  These must be
# stripped before the URL is handed to psycopg / libpq.
_CUSTOM_QUERY_PARAMS = {"file_root", "schema"}


def _parse_postgres_url(url: str) -> dict[str, Any]:
    """Parse a Postgres connection URL into components."""
    parsed = urlparse(url)

    params = {}
    if parsed.query:
        for key, values in parse_qs(parsed.query).items():
            params[key] = values[0] if values else ""

    return {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 5432,
        "user": parsed.username,
        "password": parsed.password,
        "dbname": parsed.path.lstrip("/") if parsed.path else "metalab",
        "schema": params.get("schema", "public"),
        "file_root": params.get("file_root"),
    }


def _clean_postgres_url(url: str) -> str:
    """Return a connection URL safe for psycopg (custom params stripped)."""
    parsed = urlparse(url)
    if not parsed.query:
        return url

    # Keep only parameters that are NOT in our custom set
    original = parse_qs(parsed.query)
    cleaned = {k: v for k, v in original.items() if k not in _CUSTOM_QUERY_PARAMS}

    if cleaned:
        from urllib.parse import urlencode

        new_query = urlencode(cleaned, doseq=True)
    else:
        new_query = ""

    return parsed._replace(query=new_query).geturl()


class PostgresStoreAdapter:
    """
    Store adapter that queries Postgres directly.

    Implements the StoreAdapter protocol with SQL pushdown for efficiency.
    All heavy operations (list, filter, aggregate) are done in SQL.
    """

    def __init__(
        self,
        connection_string: str,
        *,
        connect_timeout: float = 10.0,
        file_root: str | None = None,
    ) -> None:
        """
        Initialize with Postgres connection.

        Args:
            connection_string: PostgreSQL connection URL.
            connect_timeout: Connection timeout in seconds.
            file_root: Root directory for files (logs, artifacts).
        """
        try:
            import psycopg  # type: ignore[import-not-found]
        except ImportError:
            raise ImportError(
                "PostgresStoreAdapter requires psycopg. "
                "Install with: pip install metalab-atlas[postgres]"
            )

        self._connection_string = _clean_postgres_url(connection_string)
        self._connect_timeout = connect_timeout

        # Parse URL for config (uses original URL so custom params are visible)
        config = _parse_postgres_url(connection_string)
        self._schema = config["schema"]
        self._file_root = file_root or config.get("file_root")

        # Connection pool (lazy)
        self._pool: psycopg.ConnectionPool | None = None

        # Cache of experiment_id -> schema mapping
        self._experiment_schemas: dict[str, str] = {}

        # TTL caches to avoid redundant DB queries from frontend polling
        self._field_index_cache: dict[str | None, tuple[datetime, FieldIndex]] = {}
        self._experiments_cache: tuple[datetime, list[tuple[str, int, datetime | None]]] | None = None
        self._cache_ttl = 60  # seconds

        # Verify connection
        self._ensure_connected()

        # Build initial schema cache
        self._refresh_schema_cache()

        logger.info(
            f"Connected to Postgres: {config['host']}:{config['port']}/{config['dbname']}"
        )

    def _ensure_connected(self) -> None:
        """Ensure connection pool is initialized."""
        if self._pool is not None:
            return

        import psycopg  # type: ignore[import-not-found]
        from psycopg_pool import ConnectionPool  # type: ignore[import-not-found]

        self._pool = ConnectionPool(
            self._connection_string,
            min_size=1,
            max_size=5,
            timeout=self._connect_timeout,
        )

    @contextmanager
    def _get_conn(self) -> Generator["psycopg.Connection", None, None]:
        """Get a connection from the pool."""
        self._ensure_connected()
        assert self._pool is not None
        with self._pool.connection() as conn:
            yield conn

    def _discover_metalab_schemas(self) -> list[str]:
        """
        Discover all schemas that contain metalab run data.

        Returns list of schema names that have a 'runs' table.
        """
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT table_schema 
                    FROM information_schema.tables 
                    WHERE table_name = 'runs'
                    AND table_schema NOT IN ('pg_catalog', 'information_schema')
                    ORDER BY table_schema
                """
                )
                return [row[0] for row in cur.fetchall()]

    def _refresh_schema_cache(self) -> None:
        """Build cache of experiment_id -> schema mapping."""
        schemas = self._discover_metalab_schemas()
        self._experiment_schemas.clear()

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                for schema in schemas:
                    cur.execute(
                        f"""
                        SELECT DISTINCT experiment_id FROM {schema}.runs
                    """
                    )
                    for (exp_id,) in cur.fetchall():
                        self._experiment_schemas[exp_id] = schema

        logger.info(
            f"Discovered {len(self._experiment_schemas)} experiments across {len(schemas)} schemas"
        )

    def _get_schema_for_experiment(self, experiment_id: str) -> str | None:
        """Get the schema containing an experiment."""
        if experiment_id not in self._experiment_schemas:
            # Refresh cache in case it's a new experiment
            self._refresh_schema_cache()
        return self._experiment_schemas.get(experiment_id)

    def _get_all_schemas(self) -> list[str]:
        """Get all known metalab schemas."""
        if not self._experiment_schemas:
            self._refresh_schema_cache()
        return list(set(self._experiment_schemas.values()))

    def _find_schema_for_run(self, run_id: str) -> str | None:
        """Find which schema contains a given run_id."""
        schemas = self._get_all_schemas()
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                for schema in schemas:
                    cur.execute(
                        f"SELECT 1 FROM {schema}.runs WHERE run_id = %s LIMIT 1",
                        [run_id],
                    )
                    if cur.fetchone():
                        return schema
        return None

    # =========================================================================
    # Schema scope factory methods
    # =========================================================================

    def _scope_for_experiment(self, experiment_id: str | None) -> SchemaScope:
        """
        Get a SchemaScope for querying by experiment.

        Args:
            experiment_id: If provided, scope to that experiment's schema.
                          If None, scope to all schemas.

        Returns:
            SchemaScope configured for the appropriate schema(s)
        """
        if experiment_id:
            schema = self._get_schema_for_experiment(experiment_id)
            return SchemaScope([schema] if schema else [])
        return SchemaScope(self._get_all_schemas())

    def _scope_for_run(self, run_id: str) -> SchemaScope:
        """
        Get a SchemaScope for querying by run_id.

        Args:
            run_id: The run ID to find

        Returns:
            SchemaScope configured for the schema containing this run,
            or empty scope if run not found.
        """
        schema = self._find_schema_for_run(run_id)
        return SchemaScope([schema] if schema else [])

    def _get_experiment_id_for_run(self, run_id: str) -> str | None:
        """Get experiment_id for a run_id."""
        scope = self._scope_for_run(run_id)
        schema = scope.single_schema()
        if not schema:
            return None

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT experiment_id FROM {schema}.runs WHERE run_id = %s",
                    [run_id],
                )
                row = cur.fetchone()
                return row[0] if row else None

    def _scope_all(self) -> SchemaScope:
        """
        Get a SchemaScope for all known schemas.

        Returns:
            SchemaScope configured to query across all metalab schemas
        """
        return SchemaScope(self._get_all_schemas())

    # =========================================================================
    # Core query methods
    # =========================================================================

    def query_runs(
        self,
        filter: FilterSpec | None = None,
        sort_by: str | None = None,
        sort_order: str = "desc",
        limit: int = DEFAULT_PAGE_SIZE,
        offset: int = 0,
        *,
        cursor: str | None = None,
    ) -> tuple[list[RunResponse], int]:
        """
        Query runs with filtering, sorting, and pagination.

        Uses keyset pagination by default for efficiency.
        Falls back to offset pagination if cursor not provided.
        Queries across all metalab schemas (or specific schema if experiment_id filtered).
        """
        limit = min(limit, MAX_PAGE_SIZE)

        # Get scope for this query
        scope = self._scope_for_experiment(filter.experiment_id if filter else None)
        if scope.is_empty:
            return [], 0

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Build WHERE clause (with r. prefix since SELECT joins with derived table)
                where_clauses = []
                params: list[Any] = []

                if filter:
                    if filter.experiment_id:
                        where_clauses.append("r.experiment_id = %s")
                        params.append(filter.experiment_id)

                    if filter.status:
                        placeholders = ", ".join(["%s"] * len(filter.status))
                        where_clauses.append(f"r.status IN ({placeholders})")
                        params.extend(s.value for s in filter.status)

                    if filter.started_after:
                        where_clauses.append("r.started_at >= %s")
                        params.append(filter.started_after)

                    if filter.started_before:
                        where_clauses.append("r.started_at <= %s")
                        params.append(filter.started_before)

                    # Field filters on JSONB
                    if filter.field_filters:
                        for ff in filter.field_filters:
                            clause, fparams = self._build_field_filter(ff)
                            if clause:
                                # Add r. prefix for record.* table columns (clause is "col op %s")
                                # record_json paths are returned as full "r.record_json->..." and need no prefix
                                if ff.field.startswith(
                                    "record."
                                ) and not clause.startswith("(r."):
                                    clause = "r." + clause
                                where_clauses.append(clause)
                                params.extend(fparams)

                where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

                # Get table reference (handles single or multi-schema)
                runs_table = scope.table("runs", alias="r")

                # Count total (use r alias to match WHERE clause)
                count_sql = f"""
                    SELECT COUNT(*) FROM {runs_table}
                    WHERE {where_sql}
                """
                cur.execute(count_sql, params)
                total = cur.fetchone()[0]

                # Determine sort column
                sort_col = "started_at"
                if sort_by:
                    if sort_by.startswith("record."):
                        sort_col = sort_by.split(".", 1)[1]
                    elif sort_by.startswith("params."):
                        key = sort_by.split(".", 1)[1]
                        sort_col = f"(record_json->'params_resolved'->>'{key}')"
                    elif sort_by.startswith("metrics."):
                        key = sort_by.split(".", 1)[1]
                        sort_col = f"(record_json->'metrics'->>'{key}')::float"

                sort_dir = "DESC" if sort_order == "desc" else "ASC"

                # Query with pagination and LEFT JOIN for derived metrics.
                # Use column projection instead of fetching full record_json
                # blobs — avoids TOAST decompression of artifacts and other
                # large fields that the list view doesn't need.
                derived_table = scope.table("derived", alias="d")

                query_sql = f"""
                    SELECT
                        r.run_id, r.experiment_id, r.status,
                        r.started_at, r.finished_at, r.duration_ms,
                        r.context_fingerprint, r.params_fingerprint,
                        r.seed_fingerprint,
                        r.record_json->'params_resolved' AS params,
                        r.record_json->'metrics' AS metrics,
                        r.record_json->'tags' AS tags,
                        r.record_json->'error' AS error,
                        r.record_json->'provenance' AS provenance,
                        r.record_json->'warnings' AS warnings,
                        r.record_json->'notes' AS notes,
                        d.derived_json
                    FROM {runs_table}
                    LEFT JOIN {derived_table} ON r.run_id = d.run_id
                    WHERE {where_sql}
                    ORDER BY {sort_col} {sort_dir}, r.run_id {sort_dir}
                    LIMIT %s OFFSET %s
                """
                params.extend([limit, offset])

                cur.execute(query_sql, params)
                rows = cur.fetchall()

                runs = [self._slim_row_to_run_response(row) for row in rows]

                return runs, total

    # Record fields that exist as table columns (same as metalab postgres runs table).
    # Other record fields (tags, warnings, notes, error, provenance) live only in record_json.
    _RECORD_TABLE_COLUMNS = frozenset(
        {
            "run_id",
            "experiment_id",
            "status",
            "context_fingerprint",
            "params_fingerprint",
            "seed_fingerprint",
            "started_at",
            "finished_at",
            "duration_ms",
        }
    )

    def _build_field_filter(self, ff: Any) -> tuple[str, list[Any]]:
        """Build SQL clause for a field filter."""
        field_path = ff.field
        op = ff.op.value
        value = ff.value

        # Parse field path
        parts = field_path.split(".", 1)
        if len(parts) != 2:
            return "", []

        namespace, key = parts

        # Map to JSONB path
        if namespace == "record":
            if key in self._RECORD_TABLE_COLUMNS:
                col = key
                if op == "eq":
                    return f"{col} = %s", [value]
                elif op == "ne":
                    return f"{col} != %s", [value]
                elif op == "lt":
                    return f"{col} < %s", [value]
                elif op == "le":
                    return f"{col} <= %s", [value]
                elif op == "gt":
                    return f"{col} > %s", [value]
                elif op == "ge":
                    return f"{col} >= %s", [value]
                elif op == "contains":
                    return f"{col}::text ILIKE %s", [f"%{value}%"]
                elif op == "in":
                    placeholders = ", ".join(["%s"] * len(value))
                    return f"{col} IN ({placeholders})", list(value)
            else:
                # Field lives in record_json (e.g. tags, warnings, notes, error, provenance)
                # Return full expression with r. so caller does not prepend again
                jsonb_path = "(r.record_json->'" + key.replace("'", "''") + "')::text"
                if op == "eq":
                    return f"{jsonb_path} = %s", [str(value)]
                elif op == "ne":
                    return f"{jsonb_path} != %s", [str(value)]
                elif op == "contains":
                    return f"{jsonb_path} ILIKE %s", [f"%{value}%"]
                elif op == "in":
                    placeholders = ", ".join(["%s"] * len(value))
                    return f"{jsonb_path} IN ({placeholders})", [str(v) for v in value]
                # lt/le/gt/ge not meaningful for JSONB tags/warnings
                return "", []
        elif namespace == "params":
            jsonb_path = f"record_json->'params_resolved'->>'{key}'"
        elif namespace == "metrics":
            jsonb_path = f"record_json->'metrics'->>'{key}'"
        elif namespace == "derived":
            # Derived metrics are in a separate table
            return "", []  # TODO: Join with derived table
        else:
            return "", []

        # JSONB comparison
        if op == "eq":
            if isinstance(value, (int, float)):
                # Use numeric cast to avoid int/float text mismatch
                # (e.g., JSON -80 extracts as '-80' but str(-80.0) == '-80.0')
                return f"({jsonb_path})::numeric = %s", [value]
            return f"{jsonb_path} = %s", [str(value)]
        elif op == "ne":
            if isinstance(value, (int, float)):
                return f"({jsonb_path})::numeric != %s", [value]
            return f"{jsonb_path} != %s", [str(value)]
        elif op == "lt":
            return f"({jsonb_path})::float < %s", [float(value)]
        elif op == "le":
            return f"({jsonb_path})::float <= %s", [float(value)]
        elif op == "gt":
            return f"({jsonb_path})::float > %s", [float(value)]
        elif op == "ge":
            return f"({jsonb_path})::float >= %s", [float(value)]
        elif op == "contains":
            return f"{jsonb_path} ILIKE %s", [f"%{value}%"]
        elif op == "in":
            placeholders = ", ".join(["%s"] * len(value))
            return f"{jsonb_path} IN ({placeholders})", [str(v) for v in value]

        return "", []

    def _row_to_run_response(
        self, row: tuple, derived_json: dict | None = None
    ) -> RunResponse:
        """Convert a database row to RunResponse.

        Args:
            row: Tuple of (run_id, record_json)
            derived_json: Optional derived metrics dict (from derived table)
        """
        run_id, record_json = row

        # record_json is the full serialized RunRecord
        data = record_json if isinstance(record_json, dict) else json.loads(record_json)

        # Build provenance
        prov_data = data.get("provenance", {})
        provenance = ProvenanceInfo(
            code_hash=prov_data.get("code_hash"),
            python_version=prov_data.get("python_version"),
            metalab_version=prov_data.get("metalab_version"),
            executor_id=prov_data.get("executor_id"),
            host=prov_data.get("host"),
            extra=prov_data.get("extra", {}),
        )

        # Build artifacts
        artifacts = [
            ArtifactInfo(
                artifact_id=a.get("artifact_id", ""),
                name=a.get("name", ""),
                kind=a.get("kind", ""),
                format=a.get("format", ""),
                content_hash=a.get("content_hash"),
                size_bytes=a.get("size_bytes"),
                metadata={
                    k: v
                    for k, v in a.get("metadata", {}).items()
                    if not k.startswith("_")
                },
            )
            for a in data.get("artifacts", [])
        ]

        # Parse timestamps
        started_at = data.get("started_at")
        if isinstance(started_at, str):
            started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        elif started_at is None:
            # started_at is required in API models; fall back to epoch if missing/corrupt
            started_at = datetime.fromtimestamp(0, tz=timezone.utc)

        finished_at = data.get("finished_at")
        if isinstance(finished_at, str):
            finished_at = datetime.fromisoformat(finished_at.replace("Z", "+00:00"))

        status = data.get("status", "success")
        is_running = status == "running"

        record = RecordFields(
            run_id=data.get("run_id", run_id),
            experiment_id=data.get("experiment_id", ""),
            status=RunStatus(status),
            context_fingerprint=data.get("context_fingerprint", ""),
            params_fingerprint=data.get("params_fingerprint", ""),
            seed_fingerprint=data.get("seed_fingerprint", ""),
            started_at=started_at,
            finished_at=None if is_running else finished_at,
            duration_ms=None if is_running else data.get("duration_ms"),
            provenance=provenance,
            error=data.get("error"),
            tags=data.get("tags", []),
            warnings=data.get("warnings", []),
            notes=data.get("notes"),
        )

        return RunResponse(
            record=record,
            params=data.get("params_resolved", {}),
            metrics=data.get("metrics", {}),
            derived_metrics=derived_json or {},
            artifacts=artifacts,
        )

    def _slim_row_to_run_response(self, row: tuple) -> RunResponse:
        """Convert a projected (slim) database row to RunResponse.

        Used by query_runs() to avoid fetching full record_json blobs.
        The SELECT projects individual columns and JSONB sub-paths instead
        of the entire record_json, skipping artifacts and other large fields.

        Column order must match the SELECT in query_runs():
            run_id, experiment_id, status, started_at, finished_at,
            duration_ms, context_fingerprint, params_fingerprint,
            seed_fingerprint, params, metrics, tags, error, provenance,
            warnings, notes, derived_json
        """
        (
            run_id,
            experiment_id,
            status,
            started_at,
            finished_at,
            duration_ms,
            context_fingerprint,
            params_fingerprint,
            seed_fingerprint,
            params_json,
            metrics_json,
            tags_json,
            error_json,
            provenance_json,
            warnings_json,
            notes_json,
            derived_json,
        ) = row

        # Parse JSONB sub-paths (psycopg returns dicts for jsonb columns)
        def _ensure_dict(val: Any) -> dict:
            if val is None:
                return {}
            if isinstance(val, dict):
                return val
            return json.loads(val)

        def _ensure_list(val: Any) -> list:
            if val is None:
                return []
            if isinstance(val, list):
                return val
            return json.loads(val)

        params = _ensure_dict(params_json)
        metrics = _ensure_dict(metrics_json)
        tags = _ensure_list(tags_json)
        error = error_json if isinstance(error_json, dict) else (
            json.loads(error_json) if error_json else None
        )
        prov_data = _ensure_dict(provenance_json)
        warnings = _ensure_list(warnings_json)
        notes = notes_json if isinstance(notes_json, str) else (
            str(notes_json) if notes_json is not None else None
        )
        derived_dict = _ensure_dict(derived_json)

        # Parse timestamps
        if isinstance(started_at, str):
            started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        elif started_at is None:
            started_at = datetime.fromtimestamp(0, tz=timezone.utc)

        if isinstance(finished_at, str):
            finished_at = datetime.fromisoformat(finished_at.replace("Z", "+00:00"))

        is_running = status == "running"

        provenance = ProvenanceInfo(
            code_hash=prov_data.get("code_hash"),
            python_version=prov_data.get("python_version"),
            metalab_version=prov_data.get("metalab_version"),
            executor_id=prov_data.get("executor_id"),
            host=prov_data.get("host"),
            extra=prov_data.get("extra", {}),
        )

        record = RecordFields(
            run_id=run_id,
            experiment_id=experiment_id or "",
            status=RunStatus(status),
            context_fingerprint=context_fingerprint or "",
            params_fingerprint=params_fingerprint or "",
            seed_fingerprint=seed_fingerprint or "",
            started_at=started_at,
            finished_at=None if is_running else finished_at,
            duration_ms=None if is_running else duration_ms,
            provenance=provenance,
            error=error,
            tags=tags,
            warnings=warnings,
            notes=notes,
        )

        return RunResponse(
            record=record,
            params=params,
            metrics=metrics,
            derived_metrics=derived_dict,
            artifacts=[],  # List queries skip artifacts; use get_run() for full detail
        )

    def get_run(self, run_id: str) -> RunResponse | None:
        """Get a single run by ID, searching across all schemas."""
        scope = self._scope_for_run(run_id)
        if scope.is_empty:
            return None

        # We know the schema from _scope_for_run, so query directly
        schema = scope.single_schema()
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Fetch run with derived metrics
                cur.execute(
                    f"""SELECT r.run_id, r.record_json, d.derived_json 
                        FROM {schema}.runs r 
                        LEFT JOIN {schema}.derived d ON r.run_id = d.run_id 
                        WHERE r.run_id = %s""",
                    [run_id],
                )
                row = cur.fetchone()
                if not row:
                    return None
                run_id, record_json, derived_json = row
                derived_dict = (
                    derived_json
                    if isinstance(derived_json, dict)
                    else (json.loads(derived_json) if derived_json else None)
                )
                return self._row_to_run_response((run_id, record_json), derived_dict)

    def get_field_index(self, filter: FilterSpec | None = None) -> FieldIndex:
        """
        Return field metadata index.

        Uses a TTL cache (60s) to avoid redundant queries from frontend polling.
        Tries the pre-computed field_catalog table first (fast path).
        Falls back to JSONB introspection only if the catalog is empty
        or not yet populated.
        """
        cache_key = filter.experiment_id if filter else None
        now = datetime.now(timezone.utc)

        # Check TTL cache
        if cache_key in self._field_index_cache:
            cached_time, cached_result = self._field_index_cache[cache_key]
            if (now - cached_time).total_seconds() < self._cache_ttl:
                return cached_result

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Fast path: use pre-computed field_catalog if available
                result = None
                try:
                    result = self._get_field_index_from_catalog(cur, filter)
                    if not (result.run_count > 0 or result.params_fields or result.metrics_fields):
                        result = None
                except Exception:
                    # Catalog table may not exist yet — fall through
                    pass

                # Slow path: JSONB introspection (for stores without catalog)
                if result is None:
                    result = self._get_field_index_from_jsonb(cur, filter)

                # Cache the result
                self._field_index_cache[cache_key] = (now, result)
                return result

    def _get_field_index_from_catalog(
        self,
        cur: Any,
        filter: FilterSpec | None,
    ) -> FieldIndex:
        """Get field index from pre-computed catalog table."""
        experiment_id = filter.experiment_id if filter else None

        # Determine which schemas to query
        if experiment_id:
            schema = self._get_schema_for_experiment(experiment_id)
            schemas = [schema] if schema else []
        else:
            schemas = self._get_all_schemas()

        if not schemas:
            return FieldIndex(
                version=1,
                last_scan=datetime.now(),
                run_count=0,
                params_fields={},
                metrics_fields={},
                derived_fields={},
                record_fields={},
            )

        params_fields: dict[str, FieldInfo] = {}
        metrics_fields: dict[str, FieldInfo] = {}
        derived_fields: dict[str, FieldInfo] = {}
        record_fields: dict[str, FieldInfo] = {}
        run_count = 0

        for schema in schemas:
            # Check if this schema has field_catalog
            cur.execute(
                """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = %s AND table_name = 'field_catalog'
                )
            """,
                [schema],
            )
            if not cur.fetchone()[0]:
                continue

            cur.execute(
                f"""
                SELECT namespace, field_name, field_type, count, values, min_value, max_value
                FROM {schema}.field_catalog
            """
            )

            for row in cur.fetchall():
                namespace, field_name, field_type, count, values, min_val, max_val = row

                info = FieldInfo(
                    type=FieldType(field_type) if field_type else FieldType.UNKNOWN,
                    count=count or 0,
                    values=values,
                    min_value=min_val,
                    max_value=max_val,
                )

                if namespace == "params":
                    params_fields[field_name] = info
                elif namespace == "metrics":
                    metrics_fields[field_name] = info
                elif namespace == "derived":
                    derived_fields[field_name] = info
                elif namespace == "record":
                    record_fields[field_name] = info

            # Count runs filtered by experiment_id when specified
            if experiment_id:
                cur.execute(
                    f"SELECT COUNT(*) FROM {schema}.runs WHERE experiment_id = %s",
                    [experiment_id],
                )
            else:
                cur.execute(f"SELECT COUNT(*) FROM {schema}.runs")
            run_count += cur.fetchone()[0]

        return FieldIndex(
            version=1,
            last_scan=datetime.now(),
            run_count=run_count,
            params_fields=params_fields,
            metrics_fields=metrics_fields,
            derived_fields=derived_fields,
            record_fields=record_fields,
        )

    def _get_field_index_from_jsonb(
        self,
        cur: Any,
        filter: FilterSpec | None,
    ) -> FieldIndex:
        """Introspect fields from JSONB (slower, for stores without catalog)."""
        scope = self._scope_for_experiment(filter.experiment_id if filter else None)
        experiment_id = filter.experiment_id if filter else None

        if scope.is_empty:
            return FieldIndex(
                version=1,
                last_scan=datetime.now(),
                run_count=0,
                params_fields={},
                metrics_fields={},
                derived_fields={},
                record_fields={},
            )

        # Build optional WHERE clause for experiment_id filtering within schema
        if experiment_id:
            where_clause = "WHERE experiment_id = %s"
            where_params: list[Any] = [experiment_id]
        else:
            where_clause = ""
            where_params = []

        params_stats: dict[str, dict] = {}
        metrics_stats: dict[str, dict] = {}
        derived_stats: dict[str, dict] = {}
        run_count = 0

        for schema in scope.schemas:
            # Sample runs from this schema (filtered by experiment_id)
            cur.execute(
                f"""
                SELECT record_json
                FROM {schema}.runs
                {where_clause}
                ORDER BY started_at DESC
                LIMIT 1000
            """,
                where_params,
            )

            for (record_json,) in cur.fetchall():
                data = (
                    record_json
                    if isinstance(record_json, dict)
                    else json.loads(record_json)
                )

                # Params
                for key, value in data.get("params_resolved", {}).items():
                    if key not in params_stats:
                        params_stats[key] = self._init_stats(value)
                    self._update_stats(params_stats[key], value)

                # Metrics
                for key, value in data.get("metrics", {}).items():
                    if key not in metrics_stats:
                        metrics_stats[key] = self._init_stats(value)
                    self._update_stats(metrics_stats[key], value)

            # Sample derived metrics from derived table (filtered by experiment_id
            # via JOIN on runs to respect the experiment scope)
            if experiment_id:
                cur.execute(
                    f"""
                    SELECT d.derived_json
                    FROM {schema}.derived d
                    JOIN {schema}.runs r ON d.run_id = r.run_id
                    WHERE r.experiment_id = %s
                    LIMIT 1000
                """,
                    [experiment_id],
                )
            else:
                cur.execute(
                    f"""
                    SELECT derived_json
                    FROM {schema}.derived
                    LIMIT 1000
                """
                )

            for (derived_json,) in cur.fetchall():
                data = (
                    derived_json
                    if isinstance(derived_json, dict)
                    else json.loads(derived_json)
                )
                for key, value in data.items():
                    if key not in derived_stats:
                        derived_stats[key] = self._init_stats(value)
                    self._update_stats(derived_stats[key], value)

            cur.execute(
                f"SELECT COUNT(*) FROM {schema}.runs {where_clause}",
                where_params,
            )
            run_count += cur.fetchone()[0]

        return FieldIndex(
            version=1,
            last_scan=datetime.now(),
            run_count=run_count,
            params_fields={
                k: self._stats_to_field_info(v) for k, v in params_stats.items()
            },
            metrics_fields={
                k: self._stats_to_field_info(v) for k, v in metrics_stats.items()
            },
            derived_fields={
                k: self._stats_to_field_info(v) for k, v in derived_stats.items()
            },
            record_fields={},
        )

    def _init_stats(self, value: Any) -> dict:
        """Initialize field statistics."""
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
            if len(stats["values"]) < 100:
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

    # =========================================================================
    # Experiment methods
    # =========================================================================

    def list_experiments(self) -> list[tuple[str, int, datetime | None]]:
        """
        Return list of (experiment_id, run_count, latest_run).

        Discovers all metalab schemas and aggregates experiments across them.
        Uses a TTL cache (60s) to avoid redundant queries from frontend polling.
        """
        now = datetime.now(timezone.utc)

        # Check TTL cache
        if self._experiments_cache is not None:
            cached_time, cached_result = self._experiments_cache
            if (now - cached_time).total_seconds() < self._cache_ttl:
                return cached_result

        scope = self._scope_all()
        if scope.is_empty:
            return []

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT 
                        experiment_id,
                        COUNT(*) as run_count,
                        -- Prefer the timestamp embedded in record_json for "latest run".
                        -- This avoids timezone skew when legacy writers inserted naive local
                        -- datetimes into TIMESTAMPTZ columns (Postgres interprets them in the
                        -- session timezone, often UTC).
                        MAX((record_json->>'started_at')::timestamp) as latest_run
                    FROM {scope.table('runs')}
                    GROUP BY experiment_id
                    ORDER BY latest_run DESC NULLS LAST
                """
                )
                result = [(row[0], row[1], row[2]) for row in cur.fetchall()]

        # Cache the result
        self._experiments_cache = (now, result)
        return result

    def get_status_counts(self, experiment_id: str | None = None) -> StatusCounts:
        """Get lightweight status counts across all schemas."""
        scope = self._scope_for_experiment(experiment_id)
        if scope.is_empty:
            return StatusCounts()

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                where = ""
                params: list[Any] = []
                if experiment_id:
                    where = "WHERE experiment_id = %s"
                    params = [experiment_id]

                cur.execute(
                    f"""
                    SELECT 
                        status,
                        COUNT(*) as cnt
                    FROM {scope.table('runs')}
                    {where}
                    GROUP BY status
                """,
                    params,
                )

                counts = {row[0]: row[1] for row in cur.fetchall()}

                return StatusCounts(
                    success=counts.get("success", 0),
                    failed=counts.get("failed", 0),
                    running=counts.get("running", 0),
                    cancelled=counts.get("cancelled", 0),
                    total=sum(counts.values()),
                )

    # =========================================================================
    # Manifest methods
    # =========================================================================

    def list_experiment_manifests(self, experiment_id: str) -> list[ManifestInfo]:
        """Return list of manifest info for an experiment."""
        scope = self._scope_for_experiment(experiment_id)
        schema = scope.single_schema()
        if not schema:
            return []

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT 
                        experiment_id,
                        timestamp,
                        submitted_at,
                        total_runs
                    FROM {schema}.experiment_manifests
                    WHERE experiment_id = %s
                    ORDER BY submitted_at DESC
                """,
                    [experiment_id],
                )

                return [
                    ManifestInfo(
                        experiment_id=row[0],
                        timestamp=row[1],
                        submitted_at=row[2],
                        total_runs=row[3],
                    )
                    for row in cur.fetchall()
                ]

    def get_experiment_manifest(
        self,
        experiment_id: str,
        timestamp: str | None = None,
    ) -> ManifestResponse | None:
        """Get experiment manifest content."""
        scope = self._scope_for_experiment(experiment_id)
        schema = scope.single_schema()
        if not schema:
            return None

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                if timestamp:
                    cur.execute(
                        f"""
                        SELECT manifest_json
                        FROM {schema}.experiment_manifests
                        WHERE experiment_id = %s AND timestamp = %s
                    """,
                        [experiment_id, timestamp],
                    )
                else:
                    cur.execute(
                        f"""
                        SELECT manifest_json
                        FROM {schema}.experiment_manifests
                        WHERE experiment_id = %s
                        ORDER BY submitted_at DESC
                        LIMIT 1
                    """,
                        [experiment_id],
                    )

                row = cur.fetchone()
                if row is None:
                    return None

                data = row[0] if isinstance(row[0], dict) else json.loads(row[0])

                operation_data = data.get("operation", {})
                operation = (
                    OperationInfo(
                        ref=operation_data.get("ref"),
                        name=operation_data.get("name"),
                        code_hash=operation_data.get("code_hash"),
                    )
                    if operation_data
                    else None
                )

                submitted_at_str = data.get("submitted_at")
                submitted_at = (
                    datetime.fromisoformat(submitted_at_str)
                    if submitted_at_str
                    else None
                )

                return ManifestResponse(
                    experiment_id=data.get("experiment_id", experiment_id),
                    name=data.get("name"),
                    version=data.get("version"),
                    description=data.get("description"),
                    tags=data.get("tags", []),
                    operation=operation,
                    params=data.get("params", {}),
                    seeds=data.get("seeds", {}),
                    context_fingerprint=data.get("context_fingerprint"),
                    metadata=data.get("metadata", data.get("runtime_hints")),
                    total_runs=data.get("total_runs", 0),
                    run_ids=data.get("run_ids"),
                    submitted_at=submitted_at,
                )

    # =========================================================================
    # Artifact/log methods
    # =========================================================================

    def _get_artifact_info(
        self,
        run_id: str,
        artifact_name: str,
    ) -> tuple[str, str, int] | None:
        """
        Get artifact metadata from run record.

        Returns (uri, format, size_bytes) or None if not found.
        """
        scope = self._scope_for_run(run_id)
        schema = scope.single_schema()
        if not schema:
            return None

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Get artifacts from the run record JSON
                cur.execute(
                    f"SELECT record_json->'artifacts' FROM {schema}.runs WHERE run_id = %s",
                    [run_id],
                )
                row = cur.fetchone()
                if not row or not row[0]:
                    return None

                artifacts = row[0]
                for artifact in artifacts:
                    if artifact.get("name") == artifact_name:
                        uri = artifact.get("uri", "")
                        fmt = artifact.get("format", "")
                        size = artifact.get("size_bytes", 0)
                        return uri, fmt, size

        return None

    def _get_blob_content(self, artifact_id: str, schema: str) -> bytes | None:
        """Get artifact content from pgblob storage."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT content FROM {schema}.artifact_blobs
                    WHERE artifact_id = %s
                """,
                    [artifact_id],
                )
                row = cur.fetchone()
                if row:
                    return bytes(row[0])
        return None

    def _resolve_artifact_path(
        self, uri: str, experiment_id: str | None = None
    ) -> Path | None:
        """Resolve artifact URI to filesystem path."""
        path = Path(uri)

        # Absolute path
        if path.is_absolute():
            return path if path.exists() else None

        # Relative path: {file_root}/{safe_exp_id}/{uri}
        if self._file_root and experiment_id:
            safe_id = safe_experiment_id(experiment_id)
            resolved = Path(self._file_root) / safe_id / uri
            return resolved if resolved.exists() else None

        return None

    def get_artifact_content(
        self,
        run_id: str,
        artifact_name: str,
    ) -> tuple[bytes, str]:
        """Get artifact content from database or filesystem."""
        # Look up artifact metadata from database
        info = self._get_artifact_info(run_id, artifact_name)
        if not info:
            raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

        uri, format_, size_bytes = info
        content_type = (
            mimetypes.guess_type(f"file.{format_}")[0] or "application/octet-stream"
        )

        if uri.startswith("pgblob://"):
            # Inline blob in database
            artifact_id = uri.replace("pgblob://", "")
            scope = self._scope_for_run(run_id)
            schema = scope.single_schema()
            if schema:
                content = self._get_blob_content(artifact_id, schema)
                if content:
                    return content, content_type
        else:
            # Filesystem path from URI - need experiment_id to resolve subdirectory
            experiment_id = self._get_experiment_id_for_run(run_id)
            path = self._resolve_artifact_path(uri, experiment_id)
            if path:
                return path.read_bytes(), content_type

        raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

    def get_artifact_preview(
        self,
        run_id: str,
        artifact_name: str,
    ) -> ArtifactPreview:
        """Get artifact preview from database or filesystem."""
        import io

        # Look up artifact metadata from run record
        info = self._get_artifact_info(run_id, artifact_name)
        if not info:
            raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

        uri, artifact_format, size_bytes = info
        content: bytes | None = None

        if uri.startswith("pgblob://"):
            # Inline blob in database
            artifact_id = uri.replace("pgblob://", "")
            scope = self._scope_for_run(run_id)
            schema = scope.single_schema()
            if schema:
                content = self._get_blob_content(artifact_id, schema)
        else:
            # Filesystem path from URI - need experiment_id to resolve subdirectory
            experiment_id = self._get_experiment_id_for_run(run_id)
            path = self._resolve_artifact_path(uri, experiment_id)
            if path:
                content = path.read_bytes()
                size_bytes = path.stat().st_size

        if content is None:
            raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

        preview = PreviewData()
        truncated = False

        # Generate preview based on format
        if artifact_format == "json" and size_bytes <= 100 * 1024:
            try:
                preview.json_content = json.loads(content.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
        elif artifact_format == "npz":
            try:
                import numpy as np

                from atlas.models import ArrayInfo, NumpyInfo

                with np.load(io.BytesIO(content), allow_pickle=False) as data:
                    arrays = {}
                    for name in data.files:
                        arr = data[name]
                        values = None
                        if len(arr.shape) == 1 and arr.shape[0] <= 10000:
                            values = arr.astype(float).tolist()
                        arrays[name] = ArrayInfo(
                            shape=list(arr.shape),
                            dtype=str(arr.dtype),
                            values=values,
                        )
                    preview.numpy_info = NumpyInfo(arrays=arrays)
            except Exception:
                pass
        elif artifact_format in ("txt", "csv", "log"):
            try:
                text = content.decode()
                if len(text) <= 10 * 1024:
                    preview.text_content = text
                else:
                    preview.text_content = text[: 10 * 1024]
                    truncated = True
            except UnicodeDecodeError:
                pass
        elif artifact_format in ("png", "jpg", "jpeg", "gif", "webp"):
            if size_bytes <= 5 * 1024 * 1024:  # 5MB limit for images
                import base64

                preview.image_thumbnail = base64.b64encode(content).decode()

        # Determine kind from format
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
        """Get log content from filesystem.

        Logs are stored on the filesystem via FileStore composition.
        Path: {file_root}/{safe_exp_id}/logs/{run_id}_{log_name}.log
        """
        if not self._file_root:
            return None

        exp_root = Path(self._file_root)
        experiment_id = self._get_experiment_id_for_run(run_id)
        if not experiment_id:
            return None

        safe_id = safe_experiment_id(experiment_id)
        log_path = exp_root / safe_id / "logs" / f"{run_id}_{log_name}.log"
        if log_path.exists():
            return log_path.read_text()

        return None

    def list_logs(self, run_id: str) -> list[str]:
        """List available log names for a run.

        Scans filesystem for logs stored via FileStore composition.
        Path: {file_root}/{safe_exp_id}/logs/{run_id}_*.log
        """
        log_names: set[str] = set()

        if not self._file_root:
            return []

        exp_root = Path(self._file_root)
        experiment_id = self._get_experiment_id_for_run(run_id)
        if not experiment_id:
            return []

        safe_id = safe_experiment_id(experiment_id)
        log_dir = exp_root / safe_id / "logs"
        if log_dir.exists():
            for log_file in log_dir.glob(f"{run_id}_*.log"):
                filename = log_file.stem  # Remove .log
                if filename.startswith(f"{run_id}_"):
                    name = filename[len(run_id) + 1 :]
                    log_names.add(name)

        return sorted(log_names)

    # =========================================================================
    # Structured results (for future Atlas visualization)
    # =========================================================================

    def get_result(self, run_id: str, name: str) -> dict[str, Any] | None:
        """
        Get structured result data for a run.

        Results are stored via capture.data() and contain arrays, matrices,
        or other structured data used by derived metrics.

        Args:
            run_id: The run identifier.
            name: The result name.

        Returns:
            Dict with keys: data, dtype, shape, metadata. Or None if not found.
        """
        scope = self._scope_for_run(run_id)
        schema = scope.single_schema()
        if not schema:
            return None

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT data, dtype, shape, metadata
                    FROM {schema}.results
                    WHERE run_id = %s AND name = %s
                """,
                    [run_id, name],
                )
                row = cur.fetchone()
                if row is None:
                    return None

                return {
                    "data": (
                        row[0]
                        if isinstance(row[0], (dict, list))
                        else json.loads(row[0])
                    ),
                    "dtype": row[1],
                    "shape": list(row[2]) if row[2] else None,
                    "metadata": (
                        row[3]
                        if isinstance(row[3], dict)
                        else json.loads(row[3] or "{}")
                    ),
                }

    def list_results(self, run_id: str) -> list[str]:
        """
        List result names for a run.

        Args:
            run_id: The run identifier.

        Returns:
            List of result names.
        """
        scope = self._scope_for_run(run_id)
        schema = scope.single_schema()
        if not schema:
            return []

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT name FROM {schema}.results
                    WHERE run_id = %s
                """,
                    [run_id],
                )
                return [row[0] for row in cur.fetchall()]

    # =========================================================================
    # Field values for frontend-driven plotting
    # =========================================================================

    def get_field_values(
        self,
        request: FieldValuesRequest,
    ) -> FieldValuesResponse:
        """
        Get raw field values for frontend plotting.

        Returns values for requested fields, with random sampling if the
        total exceeds max_points. This allows the frontend to build any
        visualization without backend-specific plot logic.
        """
        scope = self._scope_for_experiment(
            request.filter.experiment_id if request.filter else None
        )
        if scope.is_empty:
            return FieldValuesResponse(
                fields={f: [] for f in request.fields},
                run_ids=[] if request.include_run_ids else None,
                total=0,
                returned=0,
                sampled=False,
            )

        # Check if any derived fields are requested (needed early for table aliasing)
        has_derived = any(f.startswith("derived.") for f in request.fields)

        # Get table references with aliases when joining
        runs_table = scope.table("runs", "r" if has_derived else None)
        derived_table = scope.table("derived", "d") if has_derived else None

        # Build FROM clause with optional derived join
        if has_derived:
            from_clause = (
                f"{runs_table} LEFT JOIN {derived_table} ON r.run_id = d.run_id"
            )
        else:
            from_clause = runs_table

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Build WHERE clause
                where_clauses = ["1=1"]
                params: list[Any] = []

                if request.filter:
                    if request.filter.experiment_id:
                        col_prefix = "r." if has_derived else ""
                        where_clauses.append(f"{col_prefix}experiment_id = %s")
                        params.append(request.filter.experiment_id)
                    if request.filter.status:
                        col_prefix = "r." if has_derived else ""
                        placeholders = ", ".join(["%s"] * len(request.filter.status))
                        where_clauses.append(f"{col_prefix}status IN ({placeholders})")
                        params.extend(s.value for s in request.filter.status)
                    # Apply field filters (e.g., filtering by specific run_ids)
                    if request.filter.field_filters:
                        for ff in request.filter.field_filters:
                            clause, fparams = self._build_field_filter(ff)
                            if clause:
                                # Add table alias for record.* columns when joining with derived
                                # record_json paths already include "r." in the clause
                                if (
                                    has_derived
                                    and ff.field.startswith("record.")
                                    and not clause.startswith("(r.")
                                ):
                                    clause = "r." + clause
                                where_clauses.append(clause)
                                params.extend(fparams)

                where_sql = " AND ".join(where_clauses)

                # Get total count
                cur.execute(
                    f"SELECT COUNT(*) FROM {from_clause} WHERE {where_sql}", params
                )
                total = cur.fetchone()[0]

                # Determine if sampling is needed
                sampled = total > request.max_points

                # Build field accessors
                field_accessors = []
                for field in request.fields:
                    accessor = self._field_to_sql(field, use_derived_alias=has_derived)
                    field_accessors.append(f"({accessor}) as {field.replace('.', '_')}")

                select_fields = ", ".join(field_accessors)
                if request.include_run_ids:
                    select_fields = (
                        f"r.run_id, {select_fields}"
                        if has_derived
                        else f"run_id, {select_fields}"
                    )

                # Build query with optional sampling
                if sampled:
                    # Use seed for reproducible sampling (default to 42)
                    seed = request.seed if request.seed is not None else 42
                    # PostgreSQL setseed takes a value between -1 and 1
                    pg_seed = (seed % 10000) / 10000.0
                    cur.execute(f"SELECT setseed({pg_seed})")

                    # Use TABLESAMPLE for efficient random sampling
                    # Calculate approximate percentage needed
                    sample_pct = min(
                        100, (request.max_points / total) * 100 * 1.2
                    )  # 20% buffer

                    # For single schema, use TABLESAMPLE REPEATABLE; for union, use ORDER BY random()
                    if scope.single_schema() and not has_derived:
                        sql = f"""
                            SELECT {select_fields}
                            FROM {scope.single_schema()}.runs TABLESAMPLE BERNOULLI({sample_pct}) REPEATABLE({seed})
                            WHERE {where_sql}
                            LIMIT %s
                        """
                        cur.execute(sql, params + [request.max_points])
                    else:
                        # For multi-schema or derived joins, use seeded random() via setseed above
                        sql = f"""
                            SELECT {select_fields}
                            FROM {from_clause}
                            WHERE {where_sql}
                            ORDER BY random()
                            LIMIT %s
                        """
                        cur.execute(sql, params + [request.max_points])
                else:
                    sql = f"""
                        SELECT {select_fields}
                        FROM {from_clause}
                        WHERE {where_sql}
                    """
                    cur.execute(sql, params)

                rows = cur.fetchall()

                # Parse results
                fields_data: dict[str, list[float | str | None]] = {
                    f: [] for f in request.fields
                }
                run_ids: list[str] = []

                for row in rows:
                    if request.include_run_ids:
                        run_ids.append(row[0])
                        values = row[1:]
                    else:
                        values = row

                    for i, field in enumerate(request.fields):
                        fields_data[field].append(values[i])

                return FieldValuesResponse(
                    fields=fields_data,
                    run_ids=run_ids if request.include_run_ids else None,
                    total=total,
                    returned=len(rows),
                    sampled=sampled,
                )

    def _field_to_sql(
        self, field_path: str, numeric: bool = False, use_derived_alias: bool = False
    ) -> str:
        """Convert field path to SQL accessor.

        Args:
            field_path: Field path like "params.gene" or "derived.score"
            numeric: If True, cast to float
            use_derived_alias: If True, use table aliases (r. for runs, d. for derived)
        """
        parts = field_path.split(".", 1)
        if len(parts) != 2:
            return "''"

        namespace, key = parts

        # Prefix for table alias when joining with derived
        runs_prefix = "r." if use_derived_alias else ""

        if namespace == "record":
            return f"{runs_prefix}{key}" if use_derived_alias else key
        elif namespace == "params":
            accessor = f"{runs_prefix}record_json->'params_resolved'->>'{key}'"
        elif namespace == "metrics":
            accessor = f"{runs_prefix}record_json->'metrics'->>'{key}'"
        elif namespace == "derived":
            # Access from derived table (joined as 'd')
            accessor = f"d.derived_json->>'{key}'"
        else:
            return "''"

        return accessor

    # =========================================================================
    # Native search (SupportsSearch protocol)
    # =========================================================================

    def search(self, q: str, limit: int = 5) -> list[SearchGroup]:
        """
        SQL-native search across experiments, runs, fields, and fingerprints.

        Replaces the generic Python-loop search with ~5 targeted SQL queries,
        each using appropriate indexes (trigram, GIN, btree).

        Args:
            q: Search query string.
            limit: Maximum hits per category.

        Returns:
            List of non-empty SearchGroup results.
        """
        groups: list[SearchGroup] = []

        # 1. Experiments (from cached list — tiny, substring match in Python)
        groups.append(self._search_experiments_native(q, limit))

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # 2. Field names (single query against field_catalog)
                groups.append(self._search_field_catalog_native(cur, q, limit))

                # 3. Run IDs (single query with trgm index)
                groups.append(self._search_run_ids_native(cur, q, limit))

                # 4. Fingerprints (single query, 3 columns OR'd)
                groups.append(self._search_fingerprints_native(cur, q, limit))

                # 5. Experiment tags (from manifests table)
                groups.append(self._search_experiment_tags_native(cur, q, limit))

                # 6. Run tags (JSONB array search)
                groups.append(self._search_run_tags_native(cur, q, limit))

        return [g for g in groups if g.hits or g.total > 0]

    def _search_experiments_native(self, q: str, limit: int) -> SearchGroup:
        """Search experiment IDs by substring (uses cached list)."""
        experiments = self.list_experiments()
        q_lower = q.lower()
        hits: list[SearchHit] = []
        total = 0
        for exp_id, run_count, _ in experiments:
            if q_lower in exp_id.lower():
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

    def _search_field_catalog_native(
        self, cur: Any, q: str, limit: int
    ) -> SearchGroup:
        """Search field names in field_catalog via SQL ILIKE."""
        scope = self._scope_all()
        if scope.is_empty:
            return SearchGroup(
                category="field_names",
                label="Field names",
                scope="experiment",
                hits=[],
                total=0,
            )

        pattern = f"%{q}%"
        cur.execute(
            f"""
            SELECT namespace, field_name, count
            FROM {scope.table('field_catalog')}
            WHERE field_name ILIKE %s
            ORDER BY count DESC
            LIMIT %s
            """,
            [pattern, limit],
        )
        rows = cur.fetchall()

        # Also get total
        cur.execute(
            f"""
            SELECT COUNT(*)
            FROM {scope.table('field_catalog')}
            WHERE field_name ILIKE %s
            """,
            [pattern],
        )
        total = cur.fetchone()[0]

        hits = [
            SearchHit(
                label=field_name,
                sublabel=f"{namespace} · {count} runs",
                entity_type="experiment",
                entity_id="",  # Field names aren't experiment-specific in catalog
                field=f"{namespace}.{field_name}",
            )
            for namespace, field_name, count in rows
        ]

        return SearchGroup(
            category="field_names",
            label="Field names",
            scope="experiment",
            hits=hits,
            total=total,
        )

    def _search_run_ids_native(self, cur: Any, q: str, limit: int) -> SearchGroup:
        """Search run IDs via SQL ILIKE (uses trigram index if available)."""
        scope = self._scope_all()
        if scope.is_empty:
            return SearchGroup(
                category="runs", label="Runs", scope="run", hits=[], total=0
            )

        pattern = f"%{q}%"
        runs_table = scope.table("runs")

        # Count total matches
        cur.execute(
            f"SELECT COUNT(*) FROM {runs_table} WHERE run_id ILIKE %s",
            [pattern],
        )
        total = cur.fetchone()[0]

        # Fetch limited results
        cur.execute(
            f"""
            SELECT run_id, experiment_id
            FROM {runs_table}
            WHERE run_id ILIKE %s
            ORDER BY started_at DESC
            LIMIT %s
            """,
            [pattern, limit],
        )
        rows = cur.fetchall()

        hits = [
            SearchHit(
                label=run_id,
                sublabel=experiment_id,
                entity_type="run",
                entity_id=run_id,
            )
            for run_id, experiment_id in rows
        ]

        return SearchGroup(
            category="runs",
            label="Runs",
            scope="run",
            hits=hits,
            total=total,
        )

    def _search_fingerprints_native(
        self, cur: Any, q: str, limit: int
    ) -> SearchGroup:
        """Search fingerprints via SQL ILIKE with OR across 3 columns."""
        scope = self._scope_all()
        if scope.is_empty:
            return SearchGroup(
                category="fingerprints",
                label="Fingerprints",
                scope="run",
                hits=[],
                total=0,
            )

        pattern = f"%{q}%"
        runs_table = scope.table("runs")

        cur.execute(
            f"""
            SELECT run_id, experiment_id
            FROM {runs_table}
            WHERE seed_fingerprint ILIKE %s
               OR params_fingerprint ILIKE %s
               OR context_fingerprint ILIKE %s
            ORDER BY started_at DESC
            LIMIT %s
            """,
            [pattern, pattern, pattern, limit],
        )
        rows = cur.fetchall()

        hits = [
            SearchHit(
                label=run_id,
                sublabel=experiment_id,
                entity_type="run",
                entity_id=run_id,
            )
            for run_id, experiment_id in rows
        ]

        total = len(hits) + 1 if len(hits) >= limit else len(hits)

        return SearchGroup(
            category="fingerprints",
            label="Fingerprints",
            scope="run",
            hits=hits,
            total=total,
        )

    def _search_experiment_tags_native(
        self, cur: Any, q: str, limit: int
    ) -> SearchGroup:
        """Search experiment tags from manifests via SQL."""
        scope = self._scope_all()
        if scope.is_empty:
            return SearchGroup(
                category="tags",
                label="Tags",
                scope="experiment",
                hits=[],
                total=0,
            )

        pattern = f"%{q}%"
        manifests_table = scope.table("experiment_manifests")

        # Search tags in the manifest JSONB — tags is an array of strings.
        # We look for manifests where any tag matches, using LATERAL unnest.
        cur.execute(
            f"""
            SELECT DISTINCT ON (m.experiment_id)
                m.experiment_id, t.tag
            FROM {manifests_table} m,
                 LATERAL jsonb_array_elements_text(
                    COALESCE(m.manifest_json->'tags', '[]'::jsonb)
                 ) AS t(tag)
            WHERE t.tag ILIKE %s
            ORDER BY m.experiment_id
            LIMIT %s
            """,
            [pattern, limit],
        )
        rows = cur.fetchall()

        hits = [
            SearchHit(
                label=exp_id,
                sublabel=f"tag: {tag}",
                entity_type="experiment",
                entity_id=exp_id,
            )
            for exp_id, tag in rows
        ]

        total = len(hits) + 1 if len(hits) >= limit else len(hits)

        return SearchGroup(
            category="tags",
            label="Tags",
            scope="experiment",
            hits=hits,
            total=total,
        )

    def _search_run_tags_native(self, cur: Any, q: str, limit: int) -> SearchGroup:
        """Search run tags via JSONB array containment."""
        scope = self._scope_all()
        if scope.is_empty:
            return SearchGroup(
                category="run_tags",
                label="Run tags",
                scope="run",
                hits=[],
                total=0,
            )

        pattern = f"%{q}%"
        runs_table = scope.table("runs")

        # Search tags in the record_json JSONB — tags is an array of strings.
        cur.execute(
            f"""
            SELECT r.run_id, r.experiment_id
            FROM {runs_table} r,
                 LATERAL jsonb_array_elements_text(
                    COALESCE(r.record_json->'tags', '[]'::jsonb)
                 ) AS t(tag)
            WHERE t.tag ILIKE %s
            ORDER BY r.started_at DESC
            LIMIT %s
            """,
            [pattern, limit],
        )
        rows = cur.fetchall()

        # Count total
        cur.execute(
            f"""
            SELECT COUNT(DISTINCT r.run_id)
            FROM {runs_table} r,
                 LATERAL jsonb_array_elements_text(
                    COALESCE(r.record_json->'tags', '[]'::jsonb)
                 ) AS t(tag)
            WHERE t.tag ILIKE %s
            """,
            [pattern],
        )
        total = cur.fetchone()[0]

        hits = [
            SearchHit(
                label=run_id,
                sublabel=experiment_id,
                entity_type="run",
                entity_id=run_id,
            )
            for run_id, experiment_id in rows
        ]

        return SearchGroup(
            category="run_tags",
            label="Run tags",
            scope="run",
            hits=hits,
            total=total,
        )

    # =========================================================================
    # Control methods
    # =========================================================================

    def refresh(self) -> None:
        """Refresh connection and invalidate caches."""
        self._field_index_cache.clear()
        self._experiments_cache = None
        self._refresh_schema_cache()

    def disconnect(self) -> None:
        """Close the connection pool."""
        if self._pool:
            self._pool.close()
            self._pool = None


def is_postgres_url(url: str) -> bool:
    """Check if a URL is a PostgreSQL connection string."""
    return url.startswith("postgresql://") or url.startswith("postgres://")
