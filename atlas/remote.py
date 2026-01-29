"""
Remote store adapter: Access metalab stores over SSH/SFTP.

Provides the same interface as FileStoreAdapter but reads from a remote
filesystem. Includes local caching for run records and artifacts.

Usage:
    adapter = RemoteStoreAdapter(
        host="hpc.cluster.edu",
        remote_path="/scratch/user/experiment_runs",
        user="username",
        # Optional: key_path="~/.ssh/id_rsa"
    )
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import stat
import tempfile
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import paramiko
from atlas.models import (
    ArrayInfo,
    ArtifactInfo,
    ArtifactPreview,
    FieldIndex,
    FieldInfo,
    FieldType,
    FilterSpec,
    NumpyInfo,
    PreviewData,
    ProvenanceInfo,
    RecordFields,
    RunResponse,
    RunStatus,
)

logger = logging.getLogger(__name__)


class SSHConnection:
    """
    Manages an SSH/SFTP connection to a remote host.

    Handles connection lifecycle, reconnection, and provides
    both SSH command execution and SFTP file operations.
    """

    def __init__(
        self,
        host: str,
        user: str | None = None,
        port: int = 22,
        key_path: str | None = None,
        password: str | None = None,
        connect_timeout: float = 30.0,
    ) -> None:
        """
        Initialize SSH connection parameters.

        Args:
            host: Remote hostname or IP
            user: SSH username (defaults to current user)
            port: SSH port (default 22)
            key_path: Path to private key file (optional)
            password: Password for auth (optional, key preferred)
            connect_timeout: Connection timeout in seconds
        """
        self.host = host
        self.user = user or os.environ.get("USER", "")
        self.port = port
        self.key_path = key_path
        self.password = password
        self.connect_timeout = connect_timeout

        self._client: paramiko.SSHClient | None = None
        self._sftp: paramiko.SFTPClient | None = None

    def connect(self) -> None:
        """Establish SSH connection."""
        if self._client is not None:
            return

        logger.info(f"Connecting to {self.user}@{self.host}:{self.port}")

        self._client = paramiko.SSHClient()
        self._client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        # Build connection kwargs
        connect_kwargs: dict[str, Any] = {
            "hostname": self.host,
            "port": self.port,
            "username": self.user,
            "timeout": self.connect_timeout,
            "allow_agent": True,
            "look_for_keys": True,
        }

        if self.key_path:
            key_path = Path(self.key_path).expanduser()
            connect_kwargs["key_filename"] = str(key_path)

        if self.password:
            connect_kwargs["password"] = self.password

        try:
            self._client.connect(**connect_kwargs)
            self._sftp = self._client.open_sftp()
            logger.info(f"Connected to {self.host}")
        except Exception as e:
            self._client = None
            self._sftp = None
            raise ConnectionError(f"Failed to connect to {self.host}: {e}") from e

    def disconnect(self) -> None:
        """Close SSH connection."""
        if self._sftp:
            self._sftp.close()
            self._sftp = None
        if self._client:
            self._client.close()
            self._client = None

    def ensure_connected(self) -> None:
        """Ensure connection is active, reconnect if needed."""
        if self._client is None or self._sftp is None:
            self.connect()
            return

        # Check if connection is still alive
        try:
            self._sftp.stat(".")
        except Exception:
            logger.warning("Connection lost, reconnecting...")
            self.disconnect()
            self.connect()

    @property
    def sftp(self) -> paramiko.SFTPClient:
        """Get SFTP client, connecting if needed."""
        self.ensure_connected()
        assert self._sftp is not None
        return self._sftp

    def read_file(self, path: str) -> bytes:
        """Read a file from the remote filesystem."""
        with self.sftp.open(path, "rb") as f:
            return f.read()

    def read_text(self, path: str, encoding: str = "utf-8") -> str:
        """Read a text file from the remote filesystem."""
        return self.read_file(path).decode(encoding)

    def read_json(self, path: str) -> dict:
        """Read and parse a JSON file from the remote filesystem."""
        return json.loads(self.read_text(path))

    def file_exists(self, path: str) -> bool:
        """Check if a file exists on the remote filesystem."""
        try:
            self.sftp.stat(path)
            return True
        except FileNotFoundError:
            return False

    def is_dir(self, path: str) -> bool:
        """Check if path is a directory."""
        try:
            return stat.S_ISDIR(self.sftp.stat(path).st_mode)
        except FileNotFoundError:
            return False

    def listdir(self, path: str) -> list[str]:
        """List directory contents."""
        return self.sftp.listdir(path)

    def stat(self, path: str) -> paramiko.SFTPAttributes:
        """Get file stats."""
        return self.sftp.stat(path)

    def __enter__(self) -> "SSHConnection":
        self.connect()
        return self

    def __exit__(self, *args: Any) -> None:
        self.disconnect()


class LocalCache:
    """
    Local filesystem cache for remote data.

    Caches run records and artifacts locally with configurable TTL.
    Cache is stored in a temporary directory and can be persisted.
    """

    def __init__(
        self,
        cache_dir: Path | None = None,
        record_ttl_seconds: int = 60,
        artifact_ttl_seconds: int = 3600,
    ) -> None:
        """
        Initialize local cache.

        Args:
            cache_dir: Directory for cache files (default: temp dir)
            record_ttl_seconds: TTL for run record cache
            artifact_ttl_seconds: TTL for artifact cache
        """
        if cache_dir is None:
            # Use a persistent temp directory
            cache_dir = Path(tempfile.gettempdir()) / "metalab-atlas-cache"

        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.record_ttl_seconds = record_ttl_seconds
        self.artifact_ttl_seconds = artifact_ttl_seconds

        # Subdirectories
        self.records_dir = self.cache_dir / "records"
        self.artifacts_dir = self.cache_dir / "artifacts"
        self.records_dir.mkdir(exist_ok=True)
        self.artifacts_dir.mkdir(exist_ok=True)

        logger.info(f"Local cache initialized at {self.cache_dir}")

    def _cache_key(self, *parts: str) -> str:
        """Generate a cache key from parts."""
        combined = "/".join(parts)
        return hashlib.sha256(combined.encode()).hexdigest()[:16]

    def _is_valid(self, path: Path, ttl_seconds: int) -> bool:
        """Check if cached file is still valid."""
        if not path.exists():
            return False

        mtime = datetime.fromtimestamp(path.stat().st_mtime)
        age = (datetime.now() - mtime).total_seconds()
        return age < ttl_seconds

    # Record cache

    def get_record(self, host: str, remote_path: str, run_id: str) -> dict | None:
        """Get cached run record."""
        key = self._cache_key(host, remote_path, "record", run_id)
        path = self.records_dir / f"{key}.json"

        if self._is_valid(path, self.record_ttl_seconds):
            try:
                return json.loads(path.read_text())
            except Exception:
                return None
        return None

    def put_record(self, host: str, remote_path: str, run_id: str, data: dict) -> None:
        """Cache a run record."""
        key = self._cache_key(host, remote_path, "record", run_id)
        path = self.records_dir / f"{key}.json"
        path.write_text(json.dumps(data))

    def get_all_records(self, host: str, remote_path: str) -> list[dict] | None:
        """Get cached list of all records."""
        key = self._cache_key(host, remote_path, "all_records")
        path = self.records_dir / f"{key}.json"

        if self._is_valid(path, self.record_ttl_seconds):
            try:
                return json.loads(path.read_text())
            except Exception:
                return None
        return None

    def put_all_records(self, host: str, remote_path: str, records: list[dict]) -> None:
        """Cache all records."""
        key = self._cache_key(host, remote_path, "all_records")
        path = self.records_dir / f"{key}.json"
        path.write_text(json.dumps(records))

    # Artifact cache

    def get_artifact(
        self, host: str, remote_path: str, run_id: str, name: str
    ) -> bytes | None:
        """Get cached artifact."""
        key = self._cache_key(host, remote_path, "artifact", run_id, name)
        path = self.artifacts_dir / key

        if self._is_valid(path, self.artifact_ttl_seconds):
            try:
                return path.read_bytes()
            except Exception:
                return None
        return None

    def put_artifact(
        self, host: str, remote_path: str, run_id: str, name: str, data: bytes
    ) -> Path:
        """Cache an artifact and return local path."""
        key = self._cache_key(host, remote_path, "artifact", run_id, name)
        path = self.artifacts_dir / key
        path.write_bytes(data)
        return path

    def get_artifact_path(
        self, host: str, remote_path: str, run_id: str, name: str
    ) -> Path | None:
        """Get path to cached artifact if valid."""
        key = self._cache_key(host, remote_path, "artifact", run_id, name)
        path = self.artifacts_dir / key

        if self._is_valid(path, self.artifact_ttl_seconds):
            return path
        return None

    def clear(self) -> None:
        """Clear all cached data."""
        import shutil

        if self.records_dir.exists():
            shutil.rmtree(self.records_dir)
            self.records_dir.mkdir()

        if self.artifacts_dir.exists():
            shutil.rmtree(self.artifacts_dir)
            self.artifacts_dir.mkdir()

        logger.info("Cache cleared")


class RemoteStoreAdapter:
    """
    Store adapter that reads from a remote metalab store via SSH/SFTP.

    Implements the same interface as FileStoreAdapter but fetches data
    from a remote filesystem. Uses local caching for performance.
    """

    # Preview size limits (same as FileStoreAdapter)
    JSON_PREVIEW_MAX_BYTES = 100 * 1024  # 100KB
    TEXT_PREVIEW_MAX_BYTES = 10 * 1024  # 10KB
    IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024  # 10MB

    def __init__(
        self,
        host: str,
        remote_path: str,
        user: str | None = None,
        port: int = 22,
        key_path: str | None = None,
        password: str | None = None,
        cache_dir: Path | None = None,
        record_ttl_seconds: int = 60,
        artifact_ttl_seconds: int = 3600,
    ) -> None:
        """
        Initialize remote store adapter.

        Args:
            host: Remote hostname
            remote_path: Path to metalab store on remote host
            user: SSH username
            port: SSH port
            key_path: Path to SSH private key
            password: SSH password (key preferred)
            cache_dir: Local cache directory
            record_ttl_seconds: TTL for record cache
            artifact_ttl_seconds: TTL for artifact cache
        """
        self.host = host
        self.remote_path = remote_path
        self.user = user
        self.port = port

        self._conn = SSHConnection(
            host=host,
            user=user,
            port=port,
            key_path=key_path,
            password=password,
        )

        self._cache = LocalCache(
            cache_dir=cache_dir,
            record_ttl_seconds=record_ttl_seconds,
            artifact_ttl_seconds=artifact_ttl_seconds,
        )

        # In-memory cache for converted records
        self._records_cache: list[Any] | None = None
        self._cache_time: datetime | None = None

    def _remote_join(self, *parts: str) -> str:
        """Join path parts for remote filesystem."""
        return "/".join([self.remote_path.rstrip("/"), *parts])

    def _load_run_record_schema(self, data: dict) -> Any:
        """Load a run record from JSON data (mimics metalab schema loading)."""
        # Import metalab schema loader if available, otherwise return raw dict
        try:
            from metalab.schema import load_run_record

            return load_run_record(data)
        except ImportError:
            # Fallback: return raw dict, convert in _convert_record
            return data

    def _get_cached_records(self) -> list[Any]:
        """Get run records, using cache when available."""
        # Check in-memory cache first
        now = datetime.now()
        if (
            self._records_cache is not None
            and self._cache_time is not None
            and (now - self._cache_time).total_seconds()
            < self._cache.record_ttl_seconds
        ):
            return self._records_cache

        # Check local file cache
        cached = self._cache.get_all_records(self.host, self.remote_path)
        if cached is not None:
            self._records_cache = [self._load_run_record_schema(r) for r in cached]
            self._cache_time = now
            return self._records_cache

        # Fetch from remote
        logger.info(f"Fetching run records from {self.host}:{self.remote_path}")
        records = []
        raw_records = []

        runs_dir = self._remote_join("runs")

        try:
            for filename in self._conn.listdir(runs_dir):
                if not filename.endswith(".json"):
                    continue

                try:
                    path = f"{runs_dir}/{filename}"
                    data = self._conn.read_json(path)
                    raw_records.append(data)
                    records.append(self._load_run_record_schema(data))
                except Exception as e:
                    logger.warning(f"Failed to load {filename}: {e}")
        except FileNotFoundError:
            logger.warning(f"Runs directory not found: {runs_dir}")

        # Update caches
        self._cache.put_all_records(self.host, self.remote_path, raw_records)
        self._records_cache = records
        self._cache_time = now

        logger.info(f"Loaded {len(records)} run records")
        return records

    def _convert_record(self, record: Any) -> RunResponse:
        """Convert metalab RunRecord to API RunResponse."""
        # Handle both metalab RunRecord objects and raw dicts
        if isinstance(record, dict):
            # Raw dict fallback
            prov_data = record.get("provenance", {})
            provenance = ProvenanceInfo(
                code_hash=prov_data.get("code_hash"),
                python_version=prov_data.get("python_version"),
                metalab_version=prov_data.get("metalab_version"),
                executor_id=prov_data.get("executor_id"),
                host=prov_data.get("host"),
                extra=prov_data.get("extra", {}),
            )

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
                for a in record.get("artifacts", [])
            ]

            # Parse timestamps
            started_at = record.get("started_at", "")
            finished_at = record.get("finished_at", "")
            if isinstance(started_at, str):
                started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            if isinstance(finished_at, str):
                finished_at = datetime.fromisoformat(finished_at.replace("Z", "+00:00"))

            record_fields = RecordFields(
                run_id=record.get("run_id", ""),
                experiment_id=record.get("experiment_id", ""),
                status=RunStatus(record.get("status", "success")),
                context_fingerprint=record.get("context_fingerprint", ""),
                params_fingerprint=record.get("params_fingerprint", ""),
                seed_fingerprint=record.get("seed_fingerprint", ""),
                started_at=started_at,
                finished_at=finished_at,
                duration_ms=record.get("duration_ms", 0),
                provenance=provenance,
                error=record.get("error"),
                tags=record.get("tags", []),
                warnings=record.get("warnings", []),
                notes=record.get("notes"),
            )

            return RunResponse(
                record=record_fields,
                params=record.get("params_resolved") or {},
                metrics=record.get("metrics") or {},
                artifacts=artifacts,
            )

        # metalab RunRecord object
        prov = record.provenance
        provenance = ProvenanceInfo(
            code_hash=prov.code_hash,
            python_version=prov.python_version,
            metalab_version=prov.metalab_version,
            executor_id=prov.executor_id,
            host=prov.host,
            extra=prov.extra,
        )

        artifacts = [
            ArtifactInfo(
                artifact_id=a.artifact_id,
                name=a.name,
                kind=a.kind,
                format=a.format,
                content_hash=a.content_hash,
                size_bytes=a.size_bytes,
                metadata={k: v for k, v in a.metadata.items() if not k.startswith("_")},
            )
            for a in record.artifacts
        ]

        record_fields = RecordFields(
            run_id=record.run_id,
            experiment_id=record.experiment_id,
            status=RunStatus(record.status.value),
            context_fingerprint=record.context_fingerprint,
            params_fingerprint=record.params_fingerprint,
            seed_fingerprint=record.seed_fingerprint,
            started_at=record.started_at,
            finished_at=record.finished_at,
            duration_ms=record.duration_ms,
            provenance=provenance,
            error=record.error,
            tags=record.tags,
            warnings=record.warnings,
            notes=record.notes,
        )

        return RunResponse(
            record=record_fields,
            params=record.params_resolved or {},
            metrics=record.metrics or {},
            artifacts=artifacts,
        )

    def _get_field_value(self, run: RunResponse, field_path: str) -> Any:
        """Get a value from a run using dot-notation field path."""
        parts = field_path.split(".", 1)

        if field_path == "metrics":
            return " ".join(f"{k}:{v}" for k, v in run.metrics.items())

        if field_path == "params":
            return " ".join(f"{k}:{v}" for k, v in run.params.items())

        if len(parts) != 2:
            return None

        namespace, key = parts

        if namespace == "record":
            return getattr(run.record, key, None)
        elif namespace == "params":
            return run.params.get(key)
        elif namespace == "metrics":
            return run.metrics.get(key)

        return None

    def _apply_filter(
        self, runs: list[RunResponse], filter: FilterSpec
    ) -> list[RunResponse]:
        """Apply FilterSpec to a list of runs."""
        from atlas.models import FilterOp

        result = runs

        if filter.experiment_id:
            result = [
                r for r in result if r.record.experiment_id == filter.experiment_id
            ]

        if filter.status:
            status_set = set(filter.status)
            result = [r for r in result if r.record.status in status_set]

        if filter.started_after:
            after = filter.started_after
            if after.tzinfo is not None:
                after = after.astimezone().replace(tzinfo=None)
            result = [r for r in result if r.record.started_at >= after]

        if filter.started_before:
            before = filter.started_before
            if before.tzinfo is not None:
                before = before.astimezone().replace(tzinfo=None)
            result = [r for r in result if r.record.started_at <= before]

        if filter.field_filters:
            for ff in filter.field_filters:
                filtered = []
                for run in result:
                    value = self._get_field_value(run, ff.field)
                    if value is None:
                        continue

                    match = False
                    try:
                        if ff.op == FilterOp.EQ:
                            match = value == ff.value
                        elif ff.op == FilterOp.NE:
                            match = value != ff.value
                        elif ff.op == FilterOp.LT:
                            match = value < ff.value
                        elif ff.op == FilterOp.LE:
                            match = value <= ff.value
                        elif ff.op == FilterOp.GT:
                            match = value > ff.value
                        elif ff.op == FilterOp.GE:
                            match = value >= ff.value
                        elif ff.op == FilterOp.CONTAINS:
                            match = str(ff.value).lower() in str(value).lower()
                        elif ff.op == FilterOp.IN:
                            # Get comparable value: use .value for enums, str() for others
                            # Field index stores values as strings (e.g., bool True -> "True")
                            cmp_value = value.value if hasattr(value, 'value') else str(value)
                            match = cmp_value in ff.value
                    except (TypeError, ValueError):
                        continue

                    if match:
                        filtered.append(run)
                result = filtered

        return result

    def query_runs(
        self,
        filter: FilterSpec | None = None,
        sort_by: str | None = None,
        sort_order: str = "desc",
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[RunResponse], int]:
        """Query runs with filtering, sorting, and pagination."""
        records = self._get_cached_records()
        runs = [self._convert_record(r) for r in records]

        if filter:
            runs = self._apply_filter(runs, filter)

        total = len(runs)

        if sort_by:
            reverse = sort_order == "desc"
            try:
                runs.sort(
                    key=lambda r: self._get_field_value(r, sort_by) or "",
                    reverse=reverse,
                )
            except (TypeError, ValueError):
                pass
        else:
            runs.sort(key=lambda r: r.record.started_at, reverse=True)

        runs = runs[offset : offset + limit]

        return runs, total

    def get_run(self, run_id: str) -> RunResponse | None:
        """Get a single run by ID."""
        # Check cache first
        cached = self._cache.get_record(self.host, self.remote_path, run_id)
        if cached is not None:
            return self._convert_record(self._load_run_record_schema(cached))

        # Fetch from remote
        path = self._remote_join("runs", f"{run_id}.json")
        try:
            data = self._conn.read_json(path)
            self._cache.put_record(self.host, self.remote_path, run_id, data)
            return self._convert_record(self._load_run_record_schema(data))
        except FileNotFoundError:
            return None

    # Record fields to index (discrete categorical fields)
    RECORD_FIELDS_TO_INDEX = ["status", "experiment_id", "seed_fingerprint"]

    def get_field_index(self, filter: FilterSpec | None = None) -> FieldIndex:
        """Build field index from runs."""
        records = self._get_cached_records()
        runs = [self._convert_record(r) for r in records]

        if filter:
            runs = self._apply_filter(runs, filter)

        params_fields: dict[str, dict] = {}
        metrics_fields: dict[str, dict] = {}
        record_fields: dict[str, dict] = {}

        for run in runs:
            for key, value in run.params.items():
                if key not in params_fields:
                    params_fields[key] = {
                        "type": self._infer_type(value),
                        "count": 0,
                        "values": set(),
                        "min": None,
                        "max": None,
                    }
                self._update_field_stats(params_fields[key], value)

            for key, value in run.metrics.items():
                if key not in metrics_fields:
                    metrics_fields[key] = {
                        "type": self._infer_type(value),
                        "count": 0,
                        "values": set(),
                        "min": None,
                        "max": None,
                    }
                self._update_field_stats(metrics_fields[key], value)

            # Index record fields (status, experiment_id, etc.)
            for key in self.RECORD_FIELDS_TO_INDEX:
                value = getattr(run.record, key, None)
                if value is not None:
                    # Convert enum values to their string value
                    if hasattr(value, "value"):
                        value = value.value
                    if key not in record_fields:
                        record_fields[key] = {
                            "type": self._infer_type(value),
                            "count": 0,
                            "values": set(),
                            "min": None,
                            "max": None,
                        }
                    self._update_field_stats(record_fields[key], value)

        return FieldIndex(
            version=1,
            last_scan=datetime.now(),
            run_count=len(runs),
            params_fields={k: self._to_field_info(v) for k, v in params_fields.items()},
            metrics_fields={
                k: self._to_field_info(v) for k, v in metrics_fields.items()
            },
            record_fields={k: self._to_field_info(v) for k, v in record_fields.items()},
        )

    def _infer_type(self, value: Any) -> FieldType:
        """Infer field type from a value."""
        if isinstance(value, bool):
            return FieldType.BOOLEAN
        elif isinstance(value, (int, float)):
            return FieldType.NUMERIC
        elif isinstance(value, str):
            return FieldType.STRING
        return FieldType.UNKNOWN

    def _update_field_stats(self, stats: dict, value: Any) -> None:
        """Update field statistics with a new value."""
        stats["count"] += 1

        if stats["type"] == FieldType.NUMERIC and isinstance(value, (int, float)):
            if stats["min"] is None or value < stats["min"]:
                stats["min"] = value
            if stats["max"] is None or value > stats["max"]:
                stats["max"] = value
        elif stats["type"] == FieldType.STRING:
            stats["values"].add(str(value))
        elif stats["type"] == FieldType.BOOLEAN:
            stats["values"].add(str(value))

    def _to_field_info(self, stats: dict) -> FieldInfo:
        """Convert stats dict to FieldInfo."""
        values = None
        if stats["type"] in (FieldType.STRING, FieldType.BOOLEAN):
            values = sorted(stats["values"])[:100]

        return FieldInfo(
            type=stats["type"],
            count=stats["count"],
            values=values,
            min_value=stats.get("min"),
            max_value=stats.get("max"),
        )

    def get_artifact_content(
        self, run_id: str, artifact_name: str
    ) -> tuple[bytes, str]:
        """Get artifact content by run_id and artifact name."""
        import mimetypes

        # Check local cache first
        cached = self._cache.get_artifact(
            self.host, self.remote_path, run_id, artifact_name
        )
        if cached is not None:
            # Guess content type from name
            content_type, _ = mimetypes.guess_type(artifact_name)
            return cached, content_type or "application/octet-stream"

        # Find artifact on remote
        artifact_dir = self._remote_join("artifacts", run_id)

        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            path = f"{artifact_dir}/{artifact_name}{ext}"
            if self._conn.file_exists(path):
                content = self._conn.read_file(path)
                # Cache locally
                self._cache.put_artifact(
                    self.host, self.remote_path, run_id, artifact_name, content
                )
                content_type, _ = mimetypes.guess_type(path)
                return content, content_type or "application/octet-stream"

        raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

    def get_artifact_preview(self, run_id: str, artifact_name: str) -> ArtifactPreview:
        """Get safe artifact preview."""
        artifact_dir = self._remote_join("artifacts", run_id)
        artifact_path = None
        artifact_format = ""

        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            path = f"{artifact_dir}/{artifact_name}{ext}"
            if self._conn.file_exists(path):
                artifact_path = path
                artifact_format = ext.lstrip(".") or "binary"
                break

        if artifact_path is None:
            raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

        size_bytes = self._conn.stat(artifact_path).st_size
        preview = PreviewData()
        truncated = False

        # Check local cache for artifact data
        cached_path = self._cache.get_artifact_path(
            self.host, self.remote_path, run_id, artifact_name
        )

        if artifact_format == "json":
            if size_bytes <= self.JSON_PREVIEW_MAX_BYTES:
                try:
                    if cached_path:
                        preview.json_content = json.loads(cached_path.read_text())
                    else:
                        content = self._conn.read_text(artifact_path)
                        preview.json_content = json.loads(content)
                except json.JSONDecodeError:
                    pass
            else:
                truncated = True

        elif artifact_format == "npz":
            try:
                import numpy as np

                MAX_ARRAY_ELEMENTS = 10000

                # Need to download to read npz
                if cached_path:
                    local_path = cached_path
                else:
                    content = self._conn.read_file(artifact_path)
                    local_path = self._cache.put_artifact(
                        self.host, self.remote_path, run_id, artifact_name, content
                    )

                with np.load(local_path, allow_pickle=False) as data:
                    arrays = {}
                    for name in data.files:
                        arr = data[name]
                        values = None
                        if len(arr.shape) == 1 and arr.shape[0] <= MAX_ARRAY_ELEMENTS:
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
            if size_bytes <= self.TEXT_PREVIEW_MAX_BYTES:
                if cached_path:
                    preview.text_content = cached_path.read_text()
                else:
                    preview.text_content = self._conn.read_text(artifact_path)
            else:
                # Read partial
                content = self._conn.read_file(artifact_path)[
                    : self.TEXT_PREVIEW_MAX_BYTES
                ]
                preview.text_content = content.decode("utf-8", errors="replace")
                truncated = True

        elif artifact_format in ("png", "jpg", "jpeg", "gif", "webp"):
            if size_bytes <= self.IMAGE_PREVIEW_MAX_BYTES:
                import base64

                if cached_path:
                    content = cached_path.read_bytes()
                else:
                    content = self._conn.read_file(artifact_path)
                    self._cache.put_artifact(
                        self.host, self.remote_path, run_id, artifact_name, content
                    )

                preview.image_thumbnail = base64.b64encode(content).decode()

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
        """
        Get log content.

        Searches for logs in both new flat format and legacy nested format:
        - New: logs/{label}_{short_id}_{name}.log or logs/{run_id}_{name}.log
        - Legacy: logs/{run_id}/{name}.txt
        """
        logs_dir = self._remote_join("logs")
        short_id = run_id[:8]

        # Try new flat format first - search for matching files
        try:
            files = self._conn.listdir(logs_dir)
            # Look for files ending with _{short_id}_{log_name}.log
            for f in files:
                if f.endswith(f"_{short_id}_{log_name}.log"):
                    path = self._remote_join("logs", f)
                    return self._conn.read_text(path)
                # Also check for {run_id}_{log_name}.log (no label)
                if f == f"{run_id}_{log_name}.log":
                    path = self._remote_join("logs", f)
                    return self._conn.read_text(path)
        except FileNotFoundError:
            pass  # logs dir might not exist

        # Fall back to legacy nested format
        legacy_path = self._remote_join("logs", run_id, f"{log_name}.txt")
        try:
            return self._conn.read_text(legacy_path)
        except FileNotFoundError:
            return None

    def list_logs(self, run_id: str) -> list[str]:
        """
        List available log names for a run.

        Searches for logs in both new flat format and legacy nested format.
        """
        logs_dir = self._remote_join("logs")
        short_id = run_id[:8]
        log_names: set[str] = set()

        # Search new flat format
        try:
            files = self._conn.listdir(logs_dir)
            for f in files:
                if not f.endswith(".log"):
                    continue
                filename = f[:-4]  # Remove .log extension
                # Pattern: {label}_{short_id}_{name} or {run_id}_{name}
                if f"_{short_id}_" in filename:
                    name = filename.split(f"_{short_id}_", 1)[-1]
                    log_names.add(name)
                elif filename.startswith(f"{run_id}_"):
                    name = filename[len(run_id) + 1 :]
                    log_names.add(name)
        except FileNotFoundError:
            pass  # logs dir might not exist

        # Search legacy nested format
        legacy_dir = self._remote_join("logs", run_id)
        try:
            files = self._conn.listdir(legacy_dir)
            for f in files:
                if f.endswith(".txt"):
                    log_names.add(f[:-4])  # Remove .txt extension
        except FileNotFoundError:
            pass

        return sorted(log_names)

    def list_experiments(self) -> list[tuple[str, int, datetime | None]]:
        """List all experiments with counts."""
        records = self._get_cached_records()

        experiments: dict[str, tuple[int, datetime | None]] = {}
        for record in records:
            # Handle both dict and object
            if isinstance(record, dict):
                exp_id = record.get("experiment_id", "")
                started_at = record.get("started_at", "")
                if isinstance(started_at, str):
                    started_at = datetime.fromisoformat(
                        started_at.replace("Z", "+00:00")
                    )
            else:
                exp_id = record.experiment_id
                started_at = record.started_at

            if exp_id not in experiments:
                experiments[exp_id] = (0, None)

            count, latest = experiments[exp_id]
            count += 1
            if latest is None or started_at > latest:
                latest = started_at
            experiments[exp_id] = (count, latest)

        return [
            (exp_id, count, latest) for exp_id, (count, latest) in experiments.items()
        ]

    def refresh(self) -> None:
        """Force refresh of cached data."""
        self._records_cache = None
        self._cache_time = None

    def disconnect(self) -> None:
        """Close the SSH connection."""
        self._conn.disconnect()


def parse_remote_url(url: str) -> dict[str, Any]:
    """
    Parse a remote store URL into connection parameters.

    Supported formats:
        ssh://user@host:port/path
        user@host:/path
        host:/path

    Returns:
        Dict with keys: host, user, port, path
    """
    import re

    # SSH URL format: ssh://user@host:port/path
    ssh_match = re.match(
        r"^ssh://(?:([^@]+)@)?([^:/]+)(?::(\d+))?(/.*)?$",
        url,
    )
    if ssh_match:
        user, host, port, path = ssh_match.groups()
        return {
            "host": host,
            "user": user,
            "port": int(port) if port else 22,
            "path": path or "/",
        }

    # SCP-style format: user@host:/path or host:/path
    scp_match = re.match(
        r"^(?:([^@]+)@)?([^:/]+):(.+)$",
        url,
    )
    if scp_match:
        user, host, path = scp_match.groups()
        return {
            "host": host,
            "user": user,
            "port": 22,
            "path": path,
        }

    raise ValueError(f"Invalid remote URL format: {url}")


def create_remote_adapter(
    url: str,
    key_path: str | None = None,
    password: str | None = None,
    cache_dir: Path | None = None,
) -> RemoteStoreAdapter:
    """
    Create a RemoteStoreAdapter from a URL.

    Args:
        url: Remote URL (ssh://user@host/path or user@host:/path)
        key_path: Optional SSH key path
        password: Optional SSH password
        cache_dir: Optional local cache directory

    Returns:
        Configured RemoteStoreAdapter
    """
    params = parse_remote_url(url)

    return RemoteStoreAdapter(
        host=params["host"],
        remote_path=params["path"],
        user=params["user"],
        port=params["port"],
        key_path=key_path,
        password=password,
        cache_dir=cache_dir,
    )
