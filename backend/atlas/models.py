"""
Pydantic models for Metalab Atlas API.

Namespacing convention:
- record.*: Core run fields (run_id, experiment_id, status, timestamps, etc.)
- params.*: Resolved experiment parameters (inputs)
- metrics.*: Captured metrics (outputs)
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================


class RunStatus(str, Enum):
    """Run completion status."""

    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FilterOp(str, Enum):
    """Filter comparison operators."""

    EQ = "eq"
    NE = "ne"
    LT = "lt"
    LE = "le"
    GT = "gt"
    GE = "ge"
    CONTAINS = "contains"
    IN = "in"


class AggFn(str, Enum):
    """Aggregation functions."""

    MEAN = "mean"
    MEDIAN = "median"
    MIN = "min"
    MAX = "max"
    COUNT = "count"
    SUM = "sum"


class ErrorBarType(str, Enum):
    """Error bar computation methods."""

    NONE = "none"
    STD = "std"
    SEM = "sem"
    CI95 = "ci95"


class FieldType(str, Enum):
    """Inferred field types."""

    NUMERIC = "numeric"
    STRING = "string"
    BOOLEAN = "boolean"
    UNKNOWN = "unknown"


# =============================================================================
# Filter Models
# =============================================================================


class FieldFilter(BaseModel):
    """Filter for any namespaced field."""

    field: str = Field(..., description="Dot-notation field path (e.g., 'metrics.best_f', 'params.dim')")
    op: FilterOp = Field(default=FilterOp.EQ, description="Comparison operator")
    value: Any = Field(..., description="Value to compare against")


class FilterSpec(BaseModel):
    """Specification for filtering runs."""

    experiment_id: str | None = Field(default=None, description="Filter by experiment ID")
    status: list[RunStatus] | None = Field(default=None, description="Filter by status(es)")
    started_after: datetime | None = Field(default=None, description="Runs started after this time")
    started_before: datetime | None = Field(default=None, description="Runs started before this time")
    field_filters: list[FieldFilter] | None = Field(default=None, description="Filters on params/metrics fields")


# =============================================================================
# Record Fields (core run metadata)
# =============================================================================


class ProvenanceInfo(BaseModel):
    """Code and environment provenance."""

    code_hash: str | None = None
    python_version: str | None = None
    metalab_version: str | None = None
    executor_id: str | None = None
    host: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class RecordFields(BaseModel):
    """Core run record fields (the 'record.*' namespace)."""

    run_id: str
    experiment_id: str
    status: RunStatus
    context_fingerprint: str
    params_fingerprint: str
    seed_fingerprint: str
    started_at: datetime
    finished_at: datetime
    duration_ms: int
    provenance: ProvenanceInfo
    error: dict[str, Any] | None = None
    tags: list[str] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)
    notes: str | None = None


# =============================================================================
# Artifact Models
# =============================================================================


class ArtifactInfo(BaseModel):
    """Artifact descriptor for API responses."""

    artifact_id: str
    name: str
    kind: str
    format: str
    content_hash: str | None = None
    size_bytes: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArrayInfo(BaseModel):
    """NumPy array metadata for preview."""

    shape: list[int]
    dtype: str
    values: list[float] | None = Field(
        default=None,
        description="Array values for 1D arrays (for visualization)",
    )


class NumpyInfo(BaseModel):
    """NumPy file metadata for preview."""

    arrays: dict[str, ArrayInfo] = Field(default_factory=dict)


class PreviewData(BaseModel):
    """Preview content for different artifact types."""

    json_content: dict[str, Any] | list | None = None
    numpy_info: NumpyInfo | None = None
    text_content: str | None = None
    image_thumbnail: str | None = None  # Base64 encoded


class ArtifactPreview(BaseModel):
    """Safe artifact preview response."""

    name: str
    kind: str
    format: str
    size_bytes: int | None = None
    preview: PreviewData | None = None
    preview_truncated: bool = False


# =============================================================================
# Run Response Models
# =============================================================================


class RunResponse(BaseModel):
    """Complete run response with namespaced fields."""

    record: RecordFields
    params: dict[str, Any] = Field(default_factory=dict, description="Resolved parameters (inputs)")
    metrics: dict[str, Any] = Field(default_factory=dict, description="Captured metrics (outputs)")
    artifacts: list[ArtifactInfo] = Field(default_factory=list)


class RunListResponse(BaseModel):
    """Paginated list of runs."""

    runs: list[RunResponse]
    total: int = Field(..., description="Total count matching filter (before pagination)")
    limit: int
    offset: int


# =============================================================================
# Aggregation Models
# =============================================================================


class AggregateRequest(BaseModel):
    """Request for aggregated plot data."""

    filter: FilterSpec | None = Field(default=None, description="Filter to apply before aggregation")
    x_field: str = Field(..., description="Field for X axis (e.g., 'params.dim')")
    y_field: str = Field(..., description="Field for Y axis (e.g., 'metrics.best_f')")
    group_by: list[str] | None = Field(default=None, description="Fields to group by (e.g., ['params.algorithm'])")

    # Replicate handling
    replicate_field: str = Field(
        default="record.seed_fingerprint",
        description="Field that identifies replicates",
    )
    reduce_replicates: bool = Field(
        default=True,
        description="Whether to aggregate over replicates",
    )

    # Aggregation settings
    agg_fn: AggFn = Field(default=AggFn.MEAN, description="Aggregation function")
    error_bars: ErrorBarType = Field(default=ErrorBarType.STD, description="Error bar computation method")


class DataPoint(BaseModel):
    """A single aggregated data point."""

    x: float | str | int | bool
    y: float
    y_low: float | None = None
    y_high: float | None = None
    n: int = Field(..., description="Number of runs aggregated")
    run_ids: list[str] | None = Field(default=None, description="IDs of runs in this aggregate")


class Series(BaseModel):
    """A series of data points for one group."""

    name: str = Field(..., description="Group label (e.g., 'adam')")
    points: list[DataPoint]


class AggregateResponse(BaseModel):
    """Aggregated plot data response."""

    series: list[Series]
    x_field: str
    y_field: str
    agg_fn: AggFn
    total_runs: int = Field(..., description="Total runs included in aggregation")


# =============================================================================
# Field Index Models
# =============================================================================


class FieldInfo(BaseModel):
    """Metadata about a field across runs."""

    type: FieldType
    count: int = Field(..., description="Number of runs with this field")
    values: list[str] | None = Field(default=None, description="Unique values (for categorical/string fields)")
    min_value: float | None = Field(default=None, description="Minimum value (for numeric fields)")
    max_value: float | None = Field(default=None, description="Maximum value (for numeric fields)")


class FieldIndex(BaseModel):
    """Index of available fields across runs."""

    version: int = 1
    last_scan: datetime | None = None
    run_count: int = 0
    params_fields: dict[str, FieldInfo] = Field(default_factory=dict)
    metrics_fields: dict[str, FieldInfo] = Field(default_factory=dict)
    record_fields: dict[str, FieldInfo] = Field(default_factory=dict)


# =============================================================================
# Meta API Models
# =============================================================================


class ExperimentInfo(BaseModel):
    """Information about an experiment."""

    experiment_id: str
    run_count: int
    latest_run: datetime | None = None


class ExperimentsResponse(BaseModel):
    """List of experiments."""

    experiments: list[ExperimentInfo]
