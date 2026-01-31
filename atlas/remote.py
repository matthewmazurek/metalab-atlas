"""
Remote store adapter: Access metalab stores over SSH/SFTP.

Syncs remote store to a local cache and delegates to FileStoreAdapter
for all business logic. This ensures feature parity with local stores
(including derived metrics, field indexing, filtering, etc.).

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
import json
import logging
import os
import shutil
import stat
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

import paramiko

from atlas.models import (
    ArtifactPreview,
    FieldIndex,
    FilterSpec,
    ManifestInfo,
    ManifestResponse,
    RunResponse,
)
from atlas.store import FileStoreAdapter

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

    def listdir_attr(self, path: str) -> list[paramiko.SFTPAttributes]:
        """List directory contents with attributes."""
        return self.sftp.listdir_attr(path)

    def stat(self, path: str) -> paramiko.SFTPAttributes:
        """Get file stats."""
        return self.sftp.stat(path)

    def exec_command(
        self,
        cmd: str,
        timeout: float = 30.0,
    ) -> tuple[int, str, str]:
        """
        Execute a command over SSH.

        Uses Paramiko's channel-based exec_command for security (not shell=True).
        Includes timeout handling to prevent hung commands from blocking.

        Args:
            cmd: Command string to execute.
            timeout: Command timeout in seconds.

        Returns:
            Tuple of (exit_code, stdout, stderr).

        Security notes:
            - Uses Paramiko's exec_command which doesn't invoke a shell
            - Timeout prevents hung commands from wedging the caller
            - Only use for trusted commands (e.g., squeue, sacct)
        """
        self.ensure_connected()
        assert self._client is not None

        try:
            # Use Paramiko's exec_command (not shell=True)
            stdin, stdout, stderr = self._client.exec_command(
                cmd,
                timeout=timeout,
            )

            # Read output
            stdout_str = stdout.read().decode("utf-8")
            stderr_str = stderr.read().decode("utf-8")
            exit_code = stdout.channel.recv_exit_status()

            return exit_code, stdout_str, stderr_str

        except Exception as e:
            logger.error(f"SSH exec_command failed: {e}")
            return -1, "", str(e)

    def __enter__(self) -> "SSHConnection":
        self.connect()
        return self

    def __exit__(self, *args: Any) -> None:
        self.disconnect()


class StoreMirror:
    """
    Mirrors a remote metalab store to a local directory.

    Uses lazy sync strategy:
    - No sync on initialization (fast startup)
    - Fast count-based staleness check (single listdir call)
    - Incremental sync: only fetches files missing locally
    - Derived metrics synced alongside run records
    """

    def __init__(
        self,
        conn: SSHConnection,
        remote_path: str,
        local_path: Path,
        sync_ttl_seconds: int = 30,
    ) -> None:
        """
        Initialize store mirror.

        Args:
            conn: SSH connection to remote host
            remote_path: Path to store on remote host
            local_path: Local directory to mirror into
            sync_ttl_seconds: Minimum seconds between syncs
        """
        self._conn = conn
        self._remote_path = remote_path.rstrip("/")
        self._local_path = local_path
        self._sync_ttl_seconds = sync_ttl_seconds
        self._last_sync: datetime | None = None

        # Track remote file counts for fast staleness check
        self._remote_counts: dict[str, int] = {}

        # Ensure local directory structure exists (no sync yet)
        self._local_path.mkdir(parents=True, exist_ok=True)

        # Create minimal _meta.json for FileStoreAdapter (required)
        meta_local = self._local_path / "_meta.json"
        if not meta_local.exists():
            meta_local.write_text('{"version": 1}')

    @property
    def local_store_path(self) -> Path:
        """Path to the local mirror of the store."""
        return self._local_path

    def _remote_join(self, *parts: str) -> str:
        """Join path parts for remote filesystem."""
        return "/".join([self._remote_path, *parts])

    def _needs_sync(self) -> bool:
        """Check if sync is needed based on TTL."""
        if self._last_sync is None:
            return True
        age = (datetime.now() - self._last_sync).total_seconds()
        return age >= self._sync_ttl_seconds

    def _fast_count_check(
        self, remote_dir: str, extension: str = ".json"
    ) -> tuple[bool, list[str]]:
        """
        Fast check if remote directory has new files.

        Uses listdir (filenames only) instead of listdir_attr (with stats).

        Returns:
            Tuple of (has_changes, list of remote filenames)
        """
        try:
            remote_files = [
                f for f in self._conn.listdir(remote_dir) if f.endswith(extension)
            ]
        except FileNotFoundError:
            return False, []

        cached_count = self._remote_counts.get(remote_dir, -1)
        has_changes = len(remote_files) != cached_count

        return has_changes, remote_files

    def _sync_directory_incremental(
        self,
        remote_dir: str,
        local_dir: Path,
        remote_files: list[str],
    ) -> int:
        """
        Incrementally sync only missing files.

        Args:
            remote_dir: Remote directory path
            local_dir: Local directory path
            remote_files: List of remote filenames (from fast count check)

        Returns:
            Number of files synced
        """
        local_dir.mkdir(parents=True, exist_ok=True)

        # Get local files
        local_files = {f.name for f in local_dir.iterdir() if f.is_file()}

        # Find missing files
        missing = [f for f in remote_files if f not in local_files]

        if not missing:
            return 0

        synced = 0
        for filename in missing:
            try:
                remote_path = f"{remote_dir}/{filename}"
                content = self._conn.read_file(remote_path)
                local_file = local_dir / filename
                local_file.write_bytes(content)
                synced += 1
                logger.debug(f"Synced: {filename}")
            except Exception as e:
                logger.warning(f"Failed to sync {filename}: {e}")

        return synced

    def sync(self, force: bool = False) -> dict[str, int]:
        """
        Sync the remote store to local mirror.

        Uses lazy incremental strategy:
        1. Fast count check (single listdir per directory)
        2. Only fetch files missing locally
        3. Skip directories with no changes

        Syncs:
        - runs/*.json (run records)
        - derived/*.json (derived metrics)
        - experiments/*.json (manifests)

        Artifacts and logs are NOT synced here (lazy loaded on demand).

        Args:
            force: Force full resync even if TTL hasn't expired

        Returns:
            Dict of directory -> files synced count
        """
        if not force and not self._needs_sync():
            return {}

        results: dict[str, int] = {}

        # Sync _meta.json if needed
        meta_remote = self._remote_join("_meta.json")
        meta_local = self._local_path / "_meta.json"
        if force or not meta_local.exists():
            try:
                if self._conn.file_exists(meta_remote):
                    content = self._conn.read_file(meta_remote)
                    meta_local.write_bytes(content)
                    results["_meta"] = 1
            except Exception as e:
                logger.debug(f"Could not sync _meta.json: {e}")

        # Define directories to sync
        sync_dirs = [
            ("runs", self._remote_join("runs"), self._local_path / "runs"),
            ("derived", self._remote_join("derived"), self._local_path / "derived"),
            (
                "experiments",
                self._remote_join("experiments"),
                self._local_path / "experiments",
            ),
        ]

        total_new = 0
        for name, remote_dir, local_dir in sync_dirs:
            has_changes, remote_files = self._fast_count_check(remote_dir)

            if force or has_changes:
                synced = self._sync_directory_incremental(
                    remote_dir, local_dir, remote_files
                )
                results[name] = synced
                total_new += synced

                # Update cached count
                self._remote_counts[remote_dir] = len(remote_files)

        self._last_sync = datetime.now()

        if total_new > 0:
            logger.info(f"Synced {total_new} new files: {results}")
        else:
            logger.debug("No new files to sync")

        return results

    def sync_artifact(self, run_id: str, artifact_name: str) -> Path | None:
        """
        Sync a specific artifact from remote to local.

        Args:
            run_id: Run ID
            artifact_name: Artifact name (without extension)

        Returns:
            Path to local artifact file, or None if not found
        """
        artifact_dir = self._local_path / "artifacts" / run_id
        artifact_dir.mkdir(parents=True, exist_ok=True)

        remote_dir = self._remote_join("artifacts", run_id)

        # Try common extensions
        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            remote_path = f"{remote_dir}/{artifact_name}{ext}"
            if self._conn.file_exists(remote_path):
                local_path = artifact_dir / f"{artifact_name}{ext}"
                try:
                    content = self._conn.read_file(remote_path)
                    local_path.write_bytes(content)
                    logger.debug(f"Synced artifact: {run_id}/{artifact_name}{ext}")
                    return local_path
                except Exception as e:
                    logger.warning(f"Failed to sync artifact: {e}")
                    return None

        return None

    def sync_log(self, run_id: str, log_name: str) -> str | None:
        """
        Sync a specific log from remote.

        Searches for logs in both new flat format and legacy nested format.

        Args:
            run_id: Run ID
            log_name: Log name

        Returns:
            Log content, or None if not found
        """
        logs_dir = self._remote_join("logs")
        short_id = run_id[:8]

        # Try new flat format first
        try:
            files = self._conn.listdir(logs_dir)
            for f in files:
                if f.endswith(f"_{short_id}_{log_name}.log"):
                    path = f"{logs_dir}/{f}"
                    return self._conn.read_text(path)
                if f == f"{run_id}_{log_name}.log":
                    path = f"{logs_dir}/{f}"
                    return self._conn.read_text(path)
        except FileNotFoundError:
            pass

        # Try legacy nested format
        legacy_path = self._remote_join("logs", run_id, f"{log_name}.txt")
        try:
            return self._conn.read_text(legacy_path)
        except FileNotFoundError:
            return None

    def list_logs(self, run_id: str) -> list[str]:
        """
        List available log names for a run from remote.

        Args:
            run_id: Run ID

        Returns:
            List of log names
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
                filename = f[:-4]
                if f"_{short_id}_" in filename:
                    name = filename.split(f"_{short_id}_", 1)[-1]
                    log_names.add(name)
                elif filename.startswith(f"{run_id}_"):
                    name = filename[len(run_id) + 1 :]
                    log_names.add(name)
        except FileNotFoundError:
            pass

        # Search legacy nested format
        legacy_dir = self._remote_join("logs", run_id)
        try:
            files = self._conn.listdir(legacy_dir)
            for f in files:
                if f.endswith(".txt"):
                    log_names.add(f[:-4])
        except FileNotFoundError:
            pass

        return sorted(log_names)

    def clear(self) -> None:
        """Clear the local mirror."""
        if self._local_path.exists():
            shutil.rmtree(self._local_path)
            self._local_path.mkdir(parents=True)
        self._last_sync = None
        self._synced_counts.clear()
        logger.info("Local mirror cleared")


class RemoteStoreAdapter:
    """
    Store adapter that reads from a remote metalab store via SSH/SFTP.

    Syncs the remote store to a local mirror and delegates all business
    logic to FileStoreAdapter. This ensures complete feature parity with
    local stores, including:
    - Derived metrics
    - Field indexing
    - Filtering and sorting
    - Artifact previews

    Artifacts and logs are fetched lazily on demand.
    """

    def __init__(
        self,
        host: str,
        remote_path: str,
        user: str | None = None,
        port: int = 22,
        key_path: str | None = None,
        password: str | None = None,
        cache_dir: Path | None = None,
        sync_ttl_seconds: int = 30,
        artifact_cache_seconds: int = 3600,
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
            cache_dir: Local cache directory (default: temp)
            sync_ttl_seconds: Minimum seconds between store syncs
            artifact_cache_seconds: TTL for artifact cache
        """
        self.host = host
        self.remote_path = remote_path
        self.user = user
        self.port = port

        # SSH connection
        self._conn = SSHConnection(
            host=host,
            user=user,
            port=port,
            key_path=key_path,
            password=password,
        )

        # Local mirror directory
        if cache_dir is None:
            cache_dir = Path(tempfile.gettempdir()) / "metalab-atlas-cache"
        cache_dir.mkdir(parents=True, exist_ok=True)

        # Create a unique directory for this remote store
        store_key = hashlib.sha256(f"{host}:{port}:{remote_path}".encode()).hexdigest()[
            :12
        ]
        self._mirror_path = cache_dir / f"mirror_{store_key}"

        # Store mirror for syncing
        self._mirror = StoreMirror(
            conn=self._conn,
            remote_path=remote_path,
            local_path=self._mirror_path,
            sync_ttl_seconds=sync_ttl_seconds,
        )

        # Artifact cache settings
        self._artifact_cache_seconds = artifact_cache_seconds
        self._artifact_cache_times: dict[str, datetime] = {}

        # Delegate adapter (created lazily on first query)
        self._delegate: FileStoreAdapter | None = None

        # No sync on init - lazy sync on first query

    def _ensure_synced(self, force: bool = False) -> None:
        """Ensure store is synced and delegate is ready."""
        # Only sync if TTL expired or forced
        sync_results = self._mirror.sync(force=force)

        # Create delegate if needed
        if self._delegate is None:
            self._delegate = FileStoreAdapter(self._mirror.local_store_path)
        elif sync_results:
            # New files synced - clear delegate's cache to pick them up
            self._delegate._cache_time = None

    def _get_delegate(self) -> FileStoreAdapter:
        """Get the delegate adapter, syncing if needed (lazy)."""
        self._ensure_synced()
        assert self._delegate is not None
        return self._delegate

    # =========================================================================
    # Delegated methods - all business logic handled by FileStoreAdapter
    # =========================================================================

    def query_runs(
        self,
        filter: FilterSpec | None = None,
        sort_by: str | None = None,
        sort_order: str = "desc",
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[RunResponse], int]:
        """Query runs with filtering, sorting, and pagination."""
        return self._get_delegate().query_runs(
            filter=filter,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            offset=offset,
        )

    def get_run(self, run_id: str) -> RunResponse | None:
        """Get a single run by ID."""
        return self._get_delegate().get_run(run_id)

    def get_field_index(self, filter: FilterSpec | None = None) -> FieldIndex:
        """Return field metadata index."""
        return self._get_delegate().get_field_index(filter=filter)

    def list_experiments(self) -> list[tuple[str, int, datetime | None]]:
        """Return list of (experiment_id, run_count, latest_run)."""
        return self._get_delegate().list_experiments()

    def list_experiment_manifests(self, experiment_id: str) -> list[ManifestInfo]:
        """Return list of manifest info for an experiment."""
        return self._get_delegate().list_experiment_manifests(experiment_id)

    def get_experiment_manifest(
        self, experiment_id: str, timestamp: str | None = None
    ) -> ManifestResponse | None:
        """Get experiment manifest content."""
        return self._get_delegate().get_experiment_manifest(experiment_id, timestamp)

    # =========================================================================
    # Lazy-loaded methods - artifacts and logs fetched on demand
    # =========================================================================

    def get_artifact_content(
        self, run_id: str, artifact_name: str
    ) -> tuple[bytes, str]:
        """Get artifact content by run_id and artifact name."""
        import mimetypes

        # Check if artifact is already in local mirror
        artifact_dir = self._mirror.local_store_path / "artifacts" / run_id

        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            local_path = artifact_dir / f"{artifact_name}{ext}"
            if local_path.exists():
                # Check cache validity
                cache_key = f"{run_id}/{artifact_name}"
                cache_time = self._artifact_cache_times.get(cache_key)
                if cache_time is not None:
                    age = (datetime.now() - cache_time).total_seconds()
                    if age < self._artifact_cache_seconds:
                        content = local_path.read_bytes()
                        content_type, _ = mimetypes.guess_type(str(local_path))
                        return content, content_type or "application/octet-stream"

        # Fetch from remote
        local_path = self._mirror.sync_artifact(run_id, artifact_name)
        if local_path is None:
            raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

        # Update cache time
        cache_key = f"{run_id}/{artifact_name}"
        self._artifact_cache_times[cache_key] = datetime.now()

        content = local_path.read_bytes()
        content_type, _ = mimetypes.guess_type(str(local_path))
        return content, content_type or "application/octet-stream"

    def get_artifact_preview(self, run_id: str, artifact_name: str) -> ArtifactPreview:
        """Return safe artifact preview."""
        # Ensure artifact is synced locally
        artifact_dir = self._mirror.local_store_path / "artifacts" / run_id
        local_path = None

        for ext in ["", ".json", ".npz", ".txt", ".png", ".jpg", ".csv"]:
            path = artifact_dir / f"{artifact_name}{ext}"
            if path.exists():
                local_path = path
                break

        if local_path is None:
            # Fetch from remote
            local_path = self._mirror.sync_artifact(run_id, artifact_name)
            if local_path is None:
                raise FileNotFoundError(f"Artifact not found: {run_id}/{artifact_name}")

        # Delegate to FileStoreAdapter for preview generation
        return self._get_delegate().get_artifact_preview(run_id, artifact_name)

    def get_log(self, run_id: str, log_name: str) -> str | None:
        """Return log content."""
        # Logs are always fetched from remote (not cached in mirror)
        return self._mirror.sync_log(run_id, log_name)

    def list_logs(self, run_id: str) -> list[str]:
        """Return list of available log names for a run."""
        return self._mirror.list_logs(run_id)

    # =========================================================================
    # Control methods
    # =========================================================================

    def refresh(self) -> None:
        """Force refresh of cached data."""
        self._ensure_synced(force=True)
        self._artifact_cache_times.clear()

    def disconnect(self) -> None:
        """Close the SSH connection."""
        self._conn.disconnect()

    def clear_cache(self) -> None:
        """Clear all local cached data."""
        self._mirror.clear()
        self._delegate = None
        self._artifact_cache_times.clear()


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
    sync_ttl_seconds: int = 30,
) -> RemoteStoreAdapter:
    """
    Create a RemoteStoreAdapter from a URL.

    Args:
        url: Remote URL (ssh://user@host/path or user@host:/path)
        key_path: Optional SSH key path
        password: Optional SSH password
        cache_dir: Optional local cache directory
        sync_ttl_seconds: Minimum seconds between store syncs

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
        sync_ttl_seconds=sync_ttl_seconds,
    )
