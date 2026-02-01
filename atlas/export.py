"""
Export utilities for Atlas experiment data.

Provides functions to convert run data to tabular formats (CSV, Parquet)
with optional metadata embedding for provenance tracking.
"""

from __future__ import annotations

import json
from datetime import datetime
from io import BytesIO
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import pandas as pd

from atlas.models import RunResponse
from atlas.store import StoreAdapter


def collect_captured_data_json(
    store: StoreAdapter,
    run_ids: list[str],
) -> dict[str, str | None]:
    """
    Collect capture.data() structured results for a set of runs.

    Returns a mapping of run_id -> JSON string (or None if no structured results).
    """
    out: dict[str, str | None] = {}
    for run_id in run_ids:
        names = store.list_results(run_id)
        if not names:
            out[run_id] = None
            continue

        payload: dict[str, Any] = {}
        for name in sorted(names):
            result = store.get_result(run_id, name)
            if result is None:
                continue
            payload[name] = result

        out[run_id] = (
            json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
            if payload
            else None
        )

    return out


def runs_to_dataframe(
    runs: list[RunResponse],
    include_params: bool = True,
    include_metrics: bool = True,
    include_derived: bool = True,
    include_record: bool = True,
    include_data: bool = True,
    captured_data_json: dict[str, str | None] | None = None,
) -> "pd.DataFrame":
    """
    Flatten runs to a pandas DataFrame.

    Follows metalab convention:
    - Record fields are unprefixed (run_id, status, etc.)
    - Params are prefixed with 'param_'
    - Metrics are unprefixed
    - Derived metrics are prefixed with 'derived_'

    Args:
        runs: List of RunResponse objects to convert.
        include_params: Include params columns (prefixed with 'param_').
        include_metrics: Include metrics columns.
        include_derived: Include derived metrics columns (prefixed with 'derived_').
        include_record: Include record fields (run_id, status, timestamps, etc.).
        include_data: Include capture.data() structured results as JSON string column.
        captured_data_json: Optional mapping of run_id -> JSON string (or None).

    Returns:
        pandas DataFrame with flattened run data.

    Raises:
        ImportError: If pandas is not installed.
    """
    try:
        import pandas as pd
    except ImportError as e:
        raise ImportError(
            "pandas is required for export. Install with: pip install pandas"
        ) from e

    rows = []
    for run in runs:
        row: dict[str, Any] = {}

        if include_record:
            row["run_id"] = run.record.run_id
            row["experiment_id"] = run.record.experiment_id
            row["status"] = run.record.status.value
            row["duration_ms"] = run.record.duration_ms
            row["started_at"] = run.record.started_at.isoformat()
            row["finished_at"] = (
                run.record.finished_at.isoformat() if run.record.finished_at else None
            )

        if include_data:
            mapping = captured_data_json or {}
            row["captured_data"] = mapping.get(run.record.run_id)

        if include_params:
            for key, value in run.params.items():
                row[f"param_{key}"] = value

        if include_metrics:
            for key, value in run.metrics.items():
                row[key] = value

        if include_derived:
            for key, value in run.derived_metrics.items():
                row[f"derived_{key}"] = value

        rows.append(row)

    return pd.DataFrame(rows)


def dataframe_to_csv_bytes(df: "pd.DataFrame") -> bytes:
    """
    Export DataFrame to CSV bytes.

    Args:
        df: pandas DataFrame to export.

    Returns:
        CSV content as bytes.
    """
    return df.to_csv(index=False).encode("utf-8")


def dataframe_to_parquet_bytes(
    df: "pd.DataFrame",
    metadata: dict[str, str],
) -> bytes:
    """
    Export DataFrame to Parquet with embedded metadata.

    Uses PyArrow to write Parquet with custom schema metadata,
    enabling self-documenting files with provenance information.

    Args:
        df: pandas DataFrame to export.
        metadata: Dict of metadata key-value pairs to embed.
            Keys and values should be strings.

    Returns:
        Parquet file content as bytes.

    Raises:
        ImportError: If pyarrow is not installed.
    """
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as e:
        raise ImportError(
            "pyarrow is required for Parquet export. "
            "Install with: pip install pyarrow"
        ) from e

    # Convert DataFrame to Arrow Table
    table = pa.Table.from_pandas(df)

    # Embed custom metadata (keys/values must be bytes)
    custom_meta = {k.encode(): v.encode() for k, v in metadata.items()}
    existing_meta = table.schema.metadata or {}
    table = table.replace_schema_metadata({**existing_meta, **custom_meta})

    # Write to buffer
    buffer = BytesIO()
    pq.write_table(table, buffer)
    return buffer.getvalue()


def build_export_metadata(
    experiment_id: str,
    total_runs: int,
    context_fingerprint: str | None = None,
) -> dict[str, str]:
    """
    Build metadata dict for Parquet export.

    Args:
        experiment_id: Full experiment ID (e.g., 'optbench:v1').
        total_runs: Number of runs in the export.
        context_fingerprint: Optional context fingerprint from manifest.

    Returns:
        Dict of metadata key-value pairs.
    """
    # Parse experiment_id into name and version
    if ":" in experiment_id:
        name, version = experiment_id.split(":", 1)
    else:
        name, version = experiment_id, ""

    metadata = {
        "experiment_id": experiment_id,
        "experiment_name": name,
        "experiment_version": version,
        "total_runs": str(total_runs),
        "exported_at": datetime.now().isoformat(),
        "atlas_version": "0.1.0",
    }

    if context_fingerprint:
        metadata["context_fingerprint"] = context_fingerprint

    return metadata
