"""
Pydantic models for MetaLab Atlas API.

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
    RUNNING = "running"


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
    """Aggregation functions for plotting."""

    NONE = "none"
    MEAN = "mean"
    MEDIAN = "median"
    MIN = "min"
    MAX = "max"
    COUNT = "count"
    SUM = "sum"


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

    field: str = Field(
        ...,
        description="Dot-notation field path (e.g., 'metrics.best_f', 'params.dim')",
    )
    op: FilterOp = Field(default=FilterOp.EQ, description="Comparison operator")
    value: Any = Field(..., description="Value to compare against")


class FilterSpec(BaseModel):
    """Specification for filtering runs."""

    experiment_id: str | None = Field(
        default=None, description="Filter by experiment ID"
    )
    status: list[RunStatus] | None = Field(
        default=None, description="Filter by status(es)"
    )
    started_after: datetime | None = Field(
        default=None, description="Runs started after this time"
    )
    started_before: datetime | None = Field(
        default=None, description="Runs started before this time"
    )
    field_filters: list[FieldFilter] | None = Field(
        default=None, description="Filters on params/metrics fields"
    )


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
    finished_at: datetime | None = None  # None for RUNNING status
    duration_ms: int | None = None  # None for RUNNING status
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
    params: dict[str, Any] = Field(
        default_factory=dict, description="Resolved parameters (inputs)"
    )
    metrics: dict[str, Any] = Field(
        default_factory=dict, description="Captured metrics (outputs)"
    )
    derived_metrics: dict[str, Any] = Field(
        default_factory=dict,
        description="Post-hoc derived metrics (computed from artifacts)",
    )
    artifacts: list[ArtifactInfo] = Field(default_factory=list)


class RunListResponse(BaseModel):
    """Paginated list of runs."""

    runs: list[RunResponse]
    total: int = Field(
        ..., description="Total count matching filter (before pagination)"
    )
    limit: int
    offset: int


# =============================================================================
# Field Values Models (for flexible frontend plotting)
# =============================================================================


class FieldValuesRequest(BaseModel):
    """Request for raw field values (for frontend-driven plotting)."""

    filter: FilterSpec | None = Field(default=None, description="Filter to apply")
    fields: list[str] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Fields to retrieve (e.g., ['params.expr_val', 'metrics.score'])",
    )
    max_points: int = Field(
        default=10000,
        ge=1,
        le=50000,
        description="Maximum points to return (samples if exceeded)",
    )
    include_run_ids: bool = Field(
        default=True, description="Include run_ids for click-through functionality"
    )
    seed: int | None = Field(
        default=None,
        description="Random seed for reproducible sampling (if None, uses default seed 42)",
    )


class FieldValuesResponse(BaseModel):
    """Raw field values for frontend plotting."""

    fields: dict[str, list[float | str | None]] = Field(
        ..., description="Field values keyed by field name"
    )
    run_ids: list[str] | None = Field(
        default=None, description="Corresponding run IDs (same order as values)"
    )
    total: int = Field(..., description="Total matching runs before sampling")
    returned: int = Field(..., description="Number of points returned")
    sampled: bool = Field(..., description="Whether data was subsampled")


# =============================================================================
# Field Index Models
# =============================================================================


class FieldInfo(BaseModel):
    """Metadata about a field across runs."""

    type: FieldType
    count: int = Field(..., description="Number of runs with this field")
    values: list[str] | None = Field(
        default=None, description="Unique values (for categorical/string fields)"
    )
    min_value: float | None = Field(
        default=None, description="Minimum value (for numeric fields)"
    )
    max_value: float | None = Field(
        default=None, description="Maximum value (for numeric fields)"
    )


class FieldIndex(BaseModel):
    """Index of available fields across runs."""

    version: int = 1
    last_scan: datetime | None = None
    run_count: int = 0
    params_fields: dict[str, FieldInfo] = Field(default_factory=dict)
    metrics_fields: dict[str, FieldInfo] = Field(default_factory=dict)
    derived_fields: dict[str, FieldInfo] = Field(default_factory=dict)
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


# =============================================================================
# Manifest Models
# =============================================================================


class ManifestInfo(BaseModel):
    """Basic manifest metadata for listing."""

    experiment_id: str
    timestamp: str  # "20260127_103000"
    submitted_at: datetime
    total_runs: int


class ManifestListResponse(BaseModel):
    """List of manifest versions."""

    manifests: list[ManifestInfo]


class OperationInfo(BaseModel):
    """Operation reference in manifest."""

    ref: str | None = None
    name: str | None = None
    code_hash: str | None = None


class ManifestResponse(BaseModel):
    """Full experiment manifest."""

    experiment_id: str
    name: str | None = None
    version: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    operation: OperationInfo | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    seeds: dict[str, Any] = Field(default_factory=dict)
    context_fingerprint: str | None = None
    metadata: dict[str, Any] | None = None
    total_runs: int = 0
    run_ids: list[str] | None = None
    submitted_at: datetime | None = None


# =============================================================================
# SLURM Status Models
# =============================================================================


class SlurmArrayStatusResponse(BaseModel):
    """
    SLURM array job status response.

    Provides explicit state buckets for comprehensive job tracking,
    combining squeue (active jobs) and sacct (terminal jobs) data.
    """

    job_ids: list[str] = Field(
        ..., description="SLURM job IDs for the array (one per shard)"
    )
    total: int = Field(..., description="Total number of tasks")

    # Explicit state buckets
    running: int = Field(default=0, description="Tasks currently executing (RUNNING)")
    pending: int = Field(default=0, description="Tasks waiting to start (PENDING)")
    completed: int = Field(
        default=0, description="Successfully finished tasks (COMPLETED)"
    )
    failed: int = Field(default=0, description="Tasks that failed (FAILED)")
    cancelled: int = Field(default=0, description="Cancelled tasks (CANCELLED)")
    timeout: int = Field(default=0, description="Tasks that timed out (TIMEOUT)")
    oom: int = Field(default=0, description="Out of memory tasks (OUT_OF_MEMORY)")
    other: int = Field(
        default=0, description="Other states (HELD, SUSPENDED, REQUEUED, etc.)"
    )

    # Timestamps
    last_squeue_at: datetime | None = Field(
        default=None, description="When squeue was last queried"
    )
    last_sacct_at: datetime | None = Field(
        default=None, description="When sacct was last queried"
    )
    sacct_stale: bool = Field(
        default=False, description="True if sacct cache is > 5 min old"
    )


class StatusCounts(BaseModel):
    """
    Lightweight status counts for an experiment.

    Computed by scanning run record status fields without full record
    conversion, making this efficient for large experiments.
    """

    success: int = Field(default=0, description="Runs with status=success")
    failed: int = Field(default=0, description="Runs with status=failed")
    running: int = Field(default=0, description="Runs with status=running")
    cancelled: int = Field(default=0, description="Runs with status=cancelled")
    total: int = Field(default=0, description="Total runs found in store")


# =============================================================================
# Aggregation / Plot Models
# =============================================================================


class ErrorBarType(str, Enum):
    """Error bar computation methods."""

    NONE = "none"
    STD = "std"  # Standard deviation
    SEM = "sem"  # Standard error of mean
    CI95 = "ci95"  # 95% confidence interval


class DataPoint(BaseModel):
    """Single data point with optional error bounds and quartiles."""

    x: float | str
    y: float
    y_low: float | None = None
    y_high: float | None = None
    n: int = Field(default=1, description="Number of values aggregated")
    run_ids: list[str] = Field(default_factory=list)
    # Quartile data for box plots
    y_min: float | None = None
    y_q1: float | None = None
    y_median: float | None = None
    y_q3: float | None = None
    y_max: float | None = None


class Series(BaseModel):
    """A named series of data points."""

    name: str
    points: list[DataPoint]


class AggregateRequest(BaseModel):
    """Request for aggregated plot data."""

    x_field: str = Field(..., description="X-axis field (e.g., 'params.dim')")
    y_field: str = Field(..., description="Y-axis field (e.g., 'metrics.score')")
    group_by: list[str] = Field(
        default_factory=list,
        description="Fields to group by for multiple series",
    )
    agg_fn: AggFn = Field(default=AggFn.MEAN, description="Aggregation function")
    error_bars: ErrorBarType = Field(
        default=ErrorBarType.NONE, description="Error bar type"
    )
    filter: FilterSpec | None = Field(default=None, description="Filter to apply")


class AggregateResponse(BaseModel):
    """Aggregated plot data response."""

    series: list[Series]
    x_field: str
    y_field: str


# =============================================================================
# Structured Data Models (capture.data)
# =============================================================================


class DataEntryInfo(BaseModel):
    """Summary info for a single capture.data() entry."""

    name: str
    shape: list[int] | None = None
    dtype: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DataListResponse(BaseModel):
    """List of structured data entries for a run."""

    run_id: str
    entries: list[DataEntryInfo]


class DataEntryResponse(BaseModel):
    """Full structured data entry with payload."""

    name: str
    data: Any = Field(..., description="The data payload (JSON-serializable)")
    shape: list[int] | None = None
    dtype: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# Search Models
# =============================================================================


class SearchHit(BaseModel):
    """Single search result item."""

    label: str = Field(..., description="Display text (e.g., experiment id, run id)")
    sublabel: str | None = Field(
        default=None,
        description="Secondary text (e.g., '42 runs', 'in experiment: foo')",
    )
    entity_type: str = Field(..., description="'experiment' or 'run' for navigation")
    entity_id: str = Field(..., description="experiment_id or run_id for navigation")
    field: str | None = Field(
        default=None,
        description="For field-value hits: the field name (e.g., 'params.optimizer')",
    )
    value: str | None = Field(
        default=None,
        description="For field-value hits: the matched value",
    )


class SearchGroup(BaseModel):
    """Categorized group of search hits."""

    category: str = Field(
        ...,
        description="Category key: experiments, runs, param_names, param_values, etc.",
    )
    label: str = Field(..., description="Display label for the group header")
    scope: str = Field(
        ..., description="'experiment' or 'run' -- determines navigation behavior"
    )
    hits: list[SearchHit] = Field(default_factory=list)
    total: int = Field(..., description="Total matches (may exceed len(hits))")


class SearchResponse(BaseModel):
    """Response from search endpoint."""

    query: str = Field(..., description="The search query")
    groups: list[SearchGroup] = Field(default_factory=list)
    truncated: bool = Field(
        default=False,
        description="True if log search was limited before scanning all runs",
    )
