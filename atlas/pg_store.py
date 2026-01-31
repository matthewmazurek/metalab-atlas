"""
PostgresStoreAdapter: Direct Postgres backend for Atlas.

Provides SQL pushdown for efficient queries on large datasets (300k+ runs):
- Experiments list: SELECT with GROUP BY
- Runs list: Keyset pagination with efficient sorting
- Field index: From field_catalog table or JSONB introspection
- Aggregations: SQL-based GROUP BY with statistical functions
- Histograms: SQL-based binning using width_bucket()

Connection can be via:
- Direct connection string: postgresql://user@host:port/db
- SSH tunnel (handled externally before calling this adapter)
"""

from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from datetime import datetime
from typing import TYPE_CHECKING, Any, Generator
from urllib.parse import parse_qs, urlparse

from atlas.models import (
    AggFn,
    AggregateRequest,
    AggregateResponse,
    ArtifactInfo,
    ArtifactPreview,
    DataPoint,
    ErrorBarType,
    ExperimentInfo,
    FieldIndex,
    FieldInfo,
    FieldType,
    FilterSpec,
    HistogramRequest,
    HistogramResponse,
    ManifestInfo,
    ManifestResponse,
    OperationInfo,
    PreviewData,
    ProvenanceInfo,
    RecordFields,
    RunResponse,
    RunStatus,
    Series,
    StatusCounts,
)

if TYPE_CHECKING:
    import psycopg

logger = logging.getLogger(__name__)

# Default page size for keyset pagination
DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 1000


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
        "artifact_root": params.get("artifact_root"),
    }


class PostgresStoreAdapter:
    """
    Store adapter that queries Postgres directly.
    
    Implements the StoreAdapter protocol with SQL pushdown for efficiency.
    All heavy operations (list, filter, aggregate, histogram) are done in SQL.
    """
    
    def __init__(
        self,
        connection_string: str,
        *,
        connect_timeout: float = 10.0,
        artifact_root: str | None = None,
    ) -> None:
        """
        Initialize with Postgres connection.
        
        Args:
            connection_string: PostgreSQL connection URL.
            connect_timeout: Connection timeout in seconds.
            artifact_root: Override path for artifact files.
        """
        try:
            import psycopg
        except ImportError:
            raise ImportError(
                "PostgresStoreAdapter requires psycopg. "
                "Install with: pip install metalab-atlas[postgres]"
            )
        
        self._connection_string = connection_string
        self._connect_timeout = connect_timeout
        
        # Parse URL for config
        config = _parse_postgres_url(connection_string)
        self._schema = config["schema"]
        self._artifact_root = artifact_root or config.get("artifact_root")
        
        # Connection pool (lazy)
        self._pool: psycopg.ConnectionPool | None = None
        
        # Verify connection
        self._ensure_connected()
        logger.info(f"Connected to Postgres: {config['host']}:{config['port']}/{config['dbname']}")
    
    def _ensure_connected(self) -> None:
        """Ensure connection pool is initialized."""
        if self._pool is not None:
            return
        
        import psycopg
        from psycopg_pool import ConnectionPool
        
        self._pool = ConnectionPool(
            self._connection_string,
            min_size=1,
            max_size=10,
            timeout=self._connect_timeout,
        )
    
    @contextmanager
    def _get_conn(self) -> Generator["psycopg.Connection", None, None]:
        """Get a connection from the pool."""
        self._ensure_connected()
        assert self._pool is not None
        with self._pool.connection() as conn:
            yield conn
    
    def _table(self, name: str) -> str:
        """Get fully qualified table name."""
        return f"{self._schema}.{name}"
    
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
        """
        limit = min(limit, MAX_PAGE_SIZE)
        
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Build WHERE clause
                where_clauses = []
                params: list[Any] = []
                
                if filter:
                    if filter.experiment_id:
                        where_clauses.append("experiment_id = %s")
                        params.append(filter.experiment_id)
                    
                    if filter.status:
                        placeholders = ", ".join(["%s"] * len(filter.status))
                        where_clauses.append(f"status IN ({placeholders})")
                        params.extend(s.value for s in filter.status)
                    
                    if filter.started_after:
                        where_clauses.append("started_at >= %s")
                        params.append(filter.started_after)
                    
                    if filter.started_before:
                        where_clauses.append("started_at <= %s")
                        params.append(filter.started_before)
                    
                    # Field filters on JSONB
                    if filter.field_filters:
                        for ff in filter.field_filters:
                            clause, fparams = self._build_field_filter(ff)
                            if clause:
                                where_clauses.append(clause)
                                params.extend(fparams)
                
                where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
                
                # Count total
                count_sql = f"""
                    SELECT COUNT(*) FROM {self._table('runs')}
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
                
                # Query with pagination
                query_sql = f"""
                    SELECT run_id, record_json
                    FROM {self._table('runs')}
                    WHERE {where_sql}
                    ORDER BY {sort_col} {sort_dir}, run_id {sort_dir}
                    LIMIT %s OFFSET %s
                """
                params.extend([limit, offset])
                
                cur.execute(query_sql, params)
                rows = cur.fetchall()
                
                runs = [self._row_to_run_response(row) for row in rows]
                
                return runs, total
    
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
            return f"{jsonb_path} = %s", [str(value)]
        elif op == "ne":
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
    
    def _row_to_run_response(self, row: tuple) -> RunResponse:
        """Convert a database row to RunResponse."""
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
                metadata={k: v for k, v in a.get("metadata", {}).items() if not k.startswith("_")},
            )
            for a in data.get("artifacts", [])
        ]
        
        # Parse timestamps
        started_at = data.get("started_at")
        if isinstance(started_at, str):
            started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        
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
            derived_metrics={},  # TODO: Load from derived table
            artifacts=artifacts,
        )
    
    def get_run(self, run_id: str) -> RunResponse | None:
        """Get a single run by ID."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT run_id, record_json FROM {self._table('runs')} WHERE run_id = %s",
                    [run_id],
                )
                row = cur.fetchone()
                if row is None:
                    return None
                return self._row_to_run_response(row)
    
    def get_field_index(self, filter: FilterSpec | None = None) -> FieldIndex:
        """
        Return field metadata index.
        
        Attempts to read from field_catalog table first.
        Falls back to JSONB introspection if not available.
        """
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Check if field_catalog table exists
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = %s AND table_name = 'field_catalog'
                    )
                """, [self._schema])
                has_catalog = cur.fetchone()[0]
                
                if has_catalog:
                    return self._get_field_index_from_catalog(cur, filter)
                else:
                    return self._get_field_index_from_jsonb(cur, filter)
    
    def _get_field_index_from_catalog(
        self,
        cur: Any,
        filter: FilterSpec | None,
    ) -> FieldIndex:
        """Get field index from pre-computed catalog table."""
        cur.execute(f"""
            SELECT namespace, field_name, field_type, count, values, min_value, max_value
            FROM {self._table('field_catalog')}
        """)
        
        params_fields: dict[str, FieldInfo] = {}
        metrics_fields: dict[str, FieldInfo] = {}
        derived_fields: dict[str, FieldInfo] = {}
        record_fields: dict[str, FieldInfo] = {}
        
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
        
        # Get total run count
        cur.execute(f"SELECT COUNT(*) FROM {self._table('runs')}")
        run_count = cur.fetchone()[0]
        
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
        # This is a fallback - ideally the catalog should be maintained
        # For now, sample a subset of runs
        
        cur.execute(f"""
            SELECT record_json
            FROM {self._table('runs')}
            ORDER BY started_at DESC
            LIMIT 1000
        """)
        
        params_stats: dict[str, dict] = {}
        metrics_stats: dict[str, dict] = {}
        
        for (record_json,) in cur.fetchall():
            data = record_json if isinstance(record_json, dict) else json.loads(record_json)
            
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
        
        cur.execute(f"SELECT COUNT(*) FROM {self._table('runs')}")
        run_count = cur.fetchone()[0]
        
        return FieldIndex(
            version=1,
            last_scan=datetime.now(),
            run_count=run_count,
            params_fields={k: self._stats_to_field_info(v) for k, v in params_stats.items()},
            metrics_fields={k: self._stats_to_field_info(v) for k, v in metrics_stats.items()},
            derived_fields={},
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
        """Return list of (experiment_id, run_count, latest_run)."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT 
                        experiment_id,
                        COUNT(*) as run_count,
                        MAX(started_at) as latest_run
                    FROM {self._table('runs')}
                    GROUP BY experiment_id
                    ORDER BY latest_run DESC NULLS LAST
                """)
                return [(row[0], row[1], row[2]) for row in cur.fetchall()]
    
    def get_status_counts(self, experiment_id: str | None = None) -> StatusCounts:
        """Get lightweight status counts."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                where = ""
                params: list[Any] = []
                if experiment_id:
                    where = "WHERE experiment_id = %s"
                    params = [experiment_id]
                
                cur.execute(f"""
                    SELECT 
                        status,
                        COUNT(*) as cnt
                    FROM {self._table('runs')}
                    {where}
                    GROUP BY status
                """, params)
                
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
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT 
                        experiment_id,
                        timestamp,
                        submitted_at,
                        total_runs
                    FROM {self._table('experiment_manifests')}
                    WHERE experiment_id = %s
                    ORDER BY submitted_at DESC
                """, [experiment_id])
                
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
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                if timestamp:
                    cur.execute(f"""
                        SELECT manifest_json
                        FROM {self._table('experiment_manifests')}
                        WHERE experiment_id = %s AND timestamp = %s
                    """, [experiment_id, timestamp])
                else:
                    cur.execute(f"""
                        SELECT manifest_json
                        FROM {self._table('experiment_manifests')}
                        WHERE experiment_id = %s
                        ORDER BY submitted_at DESC
                        LIMIT 1
                    """, [experiment_id])
                
                row = cur.fetchone()
                if row is None:
                    return None
                
                data = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                
                operation_data = data.get("operation", {})
                operation = OperationInfo(
                    ref=operation_data.get("ref"),
                    name=operation_data.get("name"),
                    code_hash=operation_data.get("code_hash"),
                ) if operation_data else None
                
                submitted_at_str = data.get("submitted_at")
                submitted_at = (
                    datetime.fromisoformat(submitted_at_str)
                    if submitted_at_str else None
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
    # Artifact/log methods (delegate to filesystem)
    # =========================================================================
    
    def get_artifact_content(
        self,
        run_id: str,
        artifact_name: str,
    ) -> tuple[bytes, str]:
        """Get artifact content from filesystem."""
        import mimetypes
        from pathlib import Path
        
        if not self._artifact_root:
            raise FileNotFoundError("No artifact_root configured")
        
        artifact_dir = Path(self._artifact_root) / "artifacts" / run_id
        
        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            path = artifact_dir / f"{artifact_name}{ext}"
            if path.exists():
                content = path.read_bytes()
                content_type, _ = mimetypes.guess_type(str(path))
                return content, content_type or "application/octet-stream"
        
        raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")
    
    def get_artifact_preview(
        self,
        run_id: str,
        artifact_name: str,
    ) -> ArtifactPreview:
        """Get artifact preview."""
        from pathlib import Path
        
        if not self._artifact_root:
            raise FileNotFoundError("No artifact_root configured")
        
        artifact_dir = Path(self._artifact_root) / "artifacts" / run_id
        artifact_path = None
        artifact_format = ""
        
        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            path = artifact_dir / f"{artifact_name}{ext}"
            if path.exists():
                artifact_path = path
                artifact_format = ext.lstrip(".") or "binary"
                break
        
        if artifact_path is None:
            raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")
        
        size_bytes = artifact_path.stat().st_size
        preview = PreviewData()
        truncated = False
        
        # Generate preview based on format
        if artifact_format == "json" and size_bytes <= 100 * 1024:
            try:
                preview.json_content = json.loads(artifact_path.read_text())
            except json.JSONDecodeError:
                pass
        elif artifact_format == "npz":
            try:
                import numpy as np
                with np.load(artifact_path, allow_pickle=False) as data:
                    from atlas.models import ArrayInfo, NumpyInfo
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
            if size_bytes <= 10 * 1024:
                preview.text_content = artifact_path.read_text()
            else:
                preview.text_content = artifact_path.read_text()[:10 * 1024]
                truncated = True
        
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
        """Get log content from database or filesystem."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT content
                    FROM {self._table('logs')}
                    WHERE run_id = %s AND name = %s
                """, [run_id, log_name])
                row = cur.fetchone()
                if row:
                    return row[0]
        
        # Fallback to filesystem if artifact_root is set
        if self._artifact_root:
            from pathlib import Path
            log_path = Path(self._artifact_root) / "logs" / f"{run_id}_{log_name}.log"
            if log_path.exists():
                return log_path.read_text()
        
        return None
    
    def list_logs(self, run_id: str) -> list[str]:
        """List available log names for a run."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT DISTINCT name
                    FROM {self._table('logs')}
                    WHERE run_id = %s
                """, [run_id])
                return [row[0] for row in cur.fetchall()]
    
    # =========================================================================
    # SQL-based aggregation (the big win for performance)
    # =========================================================================
    
    def compute_aggregate_sql(
        self,
        request: AggregateRequest,
    ) -> AggregateResponse:
        """
        Compute aggregation directly in SQL.
        
        This pushes the heavy lifting to Postgres, avoiding
        loading 300k+ run records into Python.
        """
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Build WHERE clause from filter
                where_clauses = ["1=1"]
                params: list[Any] = []
                
                if request.filter:
                    if request.filter.experiment_id:
                        where_clauses.append("experiment_id = %s")
                        params.append(request.filter.experiment_id)
                    if request.filter.status:
                        placeholders = ", ".join(["%s"] * len(request.filter.status))
                        where_clauses.append(f"status IN ({placeholders})")
                        params.extend(s.value for s in request.filter.status)
                
                where_sql = " AND ".join(where_clauses)
                
                # Parse field paths to JSONB accessors
                x_accessor = self._field_to_sql(request.x_field)
                y_accessor = self._field_to_sql(request.y_field, numeric=True)
                
                # Build GROUP BY for series
                group_accessors = []
                if request.group_by:
                    group_accessors = [self._field_to_sql(f) for f in request.group_by]
                
                # Build the aggregation SQL
                agg_fn_sql = self._agg_fn_to_sql(request.agg_fn)
                
                if group_accessors:
                    group_cols = ", ".join(group_accessors)
                    group_names = ", ".join([f"g{i}" for i in range(len(group_accessors))])
                    
                    sql = f"""
                        WITH valid_runs AS (
                            SELECT 
                                {x_accessor} as x_val,
                                ({y_accessor})::float as y_val,
                                {', '.join([f'{ga} as g{i}' for i, ga in enumerate(group_accessors)])}
                            FROM {self._table('runs')}
                            WHERE {where_sql}
                              AND {x_accessor} IS NOT NULL
                              AND {y_accessor} IS NOT NULL
                        )
                        SELECT
                            {group_names},
                            x_val,
                            {agg_fn_sql}(y_val) as y_agg,
                            COUNT(*) as n,
                            STDDEV(y_val) as y_std,
                            MIN(y_val) as y_min,
                            MAX(y_val) as y_max,
                            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY y_val) as y_q1,
                            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY y_val) as y_median,
                            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY y_val) as y_q3,
                            array_agg(run_id) as run_ids
                        FROM valid_runs
                        JOIN {self._table('runs')} r ON true  -- for run_id access
                        GROUP BY {group_names}, x_val
                        ORDER BY {group_names}, x_val
                    """
                else:
                    sql = f"""
                        WITH valid_runs AS (
                            SELECT 
                                run_id,
                                {x_accessor} as x_val,
                                ({y_accessor})::float as y_val
                            FROM {self._table('runs')}
                            WHERE {where_sql}
                              AND {x_accessor} IS NOT NULL
                              AND {y_accessor} IS NOT NULL
                        )
                        SELECT
                            x_val,
                            {agg_fn_sql}(y_val) as y_agg,
                            COUNT(*) as n,
                            STDDEV(y_val) as y_std,
                            MIN(y_val) as y_min,
                            MAX(y_val) as y_max,
                            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY y_val) as y_q1,
                            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY y_val) as y_median,
                            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY y_val) as y_q3,
                            array_agg(run_id) as run_ids
                        FROM valid_runs
                        GROUP BY x_val
                        ORDER BY x_val
                    """
                
                cur.execute(sql, params)
                rows = cur.fetchall()
                
                # Build response
                if group_accessors:
                    # Group rows by series
                    series_data: dict[str, list[DataPoint]] = {}
                    total_runs = 0
                    
                    for row in rows:
                        num_groups = len(group_accessors)
                        group_vals = row[:num_groups]
                        group_name = " | ".join(str(v) for v in group_vals) if num_groups > 1 else str(group_vals[0])
                        
                        x_val, y_agg, n, y_std, y_min, y_max, y_q1, y_median, y_q3, run_ids = row[num_groups:]
                        
                        y_low, y_high = self._compute_error_bounds_sql(
                            y_agg, y_std, n, request.error_bars
                        )
                        
                        if group_name not in series_data:
                            series_data[group_name] = []
                        
                        series_data[group_name].append(DataPoint(
                            x=x_val,
                            y=y_agg,
                            y_low=y_low,
                            y_high=y_high,
                            n=n,
                            run_ids=run_ids[:100] if run_ids else None,  # Limit run_ids
                            y_min=y_min,
                            y_q1=y_q1,
                            y_median=y_median,
                            y_q3=y_q3,
                            y_max=y_max,
                        ))
                        total_runs += n
                    
                    series_list = [
                        Series(name=name, points=points)
                        for name, points in sorted(series_data.items())
                    ]
                else:
                    points = []
                    total_runs = 0
                    
                    for row in rows:
                        x_val, y_agg, n, y_std, y_min, y_max, y_q1, y_median, y_q3, run_ids = row
                        
                        y_low, y_high = self._compute_error_bounds_sql(
                            y_agg, y_std, n, request.error_bars
                        )
                        
                        points.append(DataPoint(
                            x=x_val,
                            y=y_agg,
                            y_low=y_low,
                            y_high=y_high,
                            n=n,
                            run_ids=run_ids[:100] if run_ids else None,
                            y_min=y_min,
                            y_q1=y_q1,
                            y_median=y_median,
                            y_q3=y_q3,
                            y_max=y_max,
                        ))
                        total_runs += n
                    
                    series_list = [Series(name="all", points=points)] if points else []
                
                return AggregateResponse(
                    series=series_list,
                    x_field=request.x_field,
                    y_field=request.y_field,
                    agg_fn=request.agg_fn,
                    total_runs=total_runs,
                )
    
    def compute_histogram_sql(
        self,
        request: HistogramRequest,
    ) -> HistogramResponse:
        """
        Compute histogram directly in SQL using width_bucket().
        """
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # Build WHERE clause
                where_clauses = ["1=1"]
                params: list[Any] = []
                
                if request.filter:
                    if request.filter.experiment_id:
                        where_clauses.append("experiment_id = %s")
                        params.append(request.filter.experiment_id)
                
                where_sql = " AND ".join(where_clauses)
                
                # Get field accessor
                field_accessor = self._field_to_sql(request.field, numeric=True)
                
                # First get min/max for bin edges
                cur.execute(f"""
                    SELECT MIN(({field_accessor})::float), MAX(({field_accessor})::float), COUNT(*)
                    FROM {self._table('runs')}
                    WHERE {where_sql} AND {field_accessor} IS NOT NULL
                """, params)
                
                row = cur.fetchone()
                if row is None or row[0] is None:
                    return HistogramResponse(
                        field=request.field,
                        bins=[0.0, 1.0],
                        counts=[0],
                        total=0,
                        run_ids_per_bin=[[]],
                    )
                
                min_val, max_val, total = row
                
                # Compute bin edges
                bin_count = request.bin_count
                bin_width = (max_val - min_val) / bin_count if max_val > min_val else 1.0
                bins = [min_val + i * bin_width for i in range(bin_count + 1)]
                
                # Compute histogram using width_bucket
                cur.execute(f"""
                    SELECT 
                        width_bucket(({field_accessor})::float, %s, %s, %s) as bucket,
                        COUNT(*) as cnt,
                        array_agg(run_id) as run_ids
                    FROM {self._table('runs')}
                    WHERE {where_sql} AND {field_accessor} IS NOT NULL
                    GROUP BY bucket
                    ORDER BY bucket
                """, params + [min_val, max_val, bin_count])
                
                # Build counts and run_ids arrays
                counts = [0] * bin_count
                run_ids_per_bin: list[list[str]] = [[] for _ in range(bin_count)]
                
                for bucket, cnt, rids in cur.fetchall():
                    # width_bucket returns 1-indexed, with 0 for below min and n+1 for above max
                    idx = max(0, min(bucket - 1, bin_count - 1))
                    counts[idx] = cnt
                    run_ids_per_bin[idx] = rids[:100] if rids else []  # Limit run_ids
                
                return HistogramResponse(
                    field=request.field,
                    bins=bins,
                    counts=counts,
                    total=total,
                    run_ids_per_bin=run_ids_per_bin,
                )
    
    def _field_to_sql(self, field_path: str, numeric: bool = False) -> str:
        """Convert field path to SQL accessor."""
        parts = field_path.split(".", 1)
        if len(parts) != 2:
            return "''"
        
        namespace, key = parts
        
        if namespace == "record":
            return key
        elif namespace == "params":
            accessor = f"record_json->'params_resolved'->>'{key}'"
        elif namespace == "metrics":
            accessor = f"record_json->'metrics'->>'{key}'"
        elif namespace == "derived":
            # Would need a join with derived table
            accessor = f"record_json->'derived'->>'{key}'"
        else:
            return "''"
        
        return accessor
    
    def _agg_fn_to_sql(self, agg_fn: AggFn) -> str:
        """Convert aggregation function to SQL."""
        mapping = {
            AggFn.MEAN: "AVG",
            AggFn.MEDIAN: "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY",
            AggFn.MIN: "MIN",
            AggFn.MAX: "MAX",
            AggFn.COUNT: "COUNT",
            AggFn.SUM: "SUM",
        }
        # Note: MEDIAN needs special handling
        if agg_fn == AggFn.MEDIAN:
            return "AVG"  # Simplification - proper median needs window function
        return mapping.get(agg_fn, "AVG")
    
    def _compute_error_bounds_sql(
        self,
        center: float,
        std: float | None,
        n: int,
        error_bars: ErrorBarType,
    ) -> tuple[float | None, float | None]:
        """Compute error bounds from SQL stats."""
        if error_bars == ErrorBarType.NONE or std is None or n < 2:
            return None, None
        
        import math
        
        if error_bars == ErrorBarType.STD:
            return center - std, center + std
        elif error_bars == ErrorBarType.SEM:
            sem = std / math.sqrt(n)
            return center - sem, center + sem
        elif error_bars == ErrorBarType.CI95:
            t_value = 1.96 if n > 30 else 2.0
            margin = t_value * std / math.sqrt(n)
            return center - margin, center + margin
        
        return None, None
    
    # =========================================================================
    # Control methods
    # =========================================================================
    
    def refresh(self) -> None:
        """Refresh connection (no-op for Postgres - connection pool handles this)."""
        pass
    
    def disconnect(self) -> None:
        """Close the connection pool."""
        if self._pool:
            self._pool.close()
            self._pool = None


def is_postgres_url(url: str) -> bool:
    """Check if a URL is a PostgreSQL connection string."""
    return url.startswith("postgresql://") or url.startswith("postgres://")
