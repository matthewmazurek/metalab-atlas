/**
 * TypeScript types mirroring backend Pydantic models.
 */

// Enums
export type RunStatus = 'success' | 'failed' | 'cancelled' | 'running';
export type FilterOp = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'contains' | 'in';
export type AggFn = 'mean' | 'median' | 'min' | 'max' | 'count' | 'sum';
export type ErrorBarType = 'none' | 'std' | 'sem' | 'ci95';
export type FieldType = 'numeric' | 'string' | 'boolean' | 'unknown';
export type ChartType = 'scatter' | 'line' | 'bar' | 'heatmap' | 'radar' | 'candlestick' | 'histogram';

// Filter models
export interface FieldFilter {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface FilterSpec {
  experiment_id?: string | null;
  status?: RunStatus[] | null;
  started_after?: string | null;
  started_before?: string | null;
  field_filters?: FieldFilter[] | null;
}

// Error info
export interface ErrorInfo {
  type: string;
  message: string;
  traceback?: string | null;
}

// Provenance
export interface ProvenanceInfo {
  code_hash?: string | null;
  python_version?: string | null;
  metalab_version?: string | null;
  executor_id?: string | null;
  host?: string | null;
  extra: Record<string, unknown>;
}

// Record fields
export interface RecordFields {
  run_id: string;
  experiment_id: string;
  status: RunStatus;
  context_fingerprint: string;
  params_fingerprint: string;
  seed_fingerprint: string;
  started_at: string;
  finished_at?: string | null;  // null for RUNNING status
  duration_ms?: number | null;  // null for RUNNING status
  provenance: ProvenanceInfo;
  error?: ErrorInfo | null;
  tags: string[];
  warnings: Record<string, unknown>[];
  notes?: string | null;
}

// Artifact models
export interface ArtifactInfo {
  artifact_id: string;
  name: string;
  kind: string;
  format: string;
  content_hash?: string | null;
  size_bytes?: number | null;
  metadata: Record<string, unknown>;
}

export interface ArrayInfo {
  shape: number[];
  dtype: string;
  values?: number[] | null;
}

export interface NumpyInfo {
  arrays: Record<string, ArrayInfo>;
}

export interface PreviewData {
  json_content?: Record<string, unknown> | unknown[] | null;
  numpy_info?: NumpyInfo | null;
  text_content?: string | null;
  image_thumbnail?: string | null;
}

export interface ArtifactPreview {
  name: string;
  kind: string;
  format: string;
  size_bytes?: number | null;
  preview?: PreviewData | null;
  preview_truncated: boolean;
}

// Run response
export interface RunResponse {
  record: RecordFields;
  params: Record<string, unknown>;
  metrics: Record<string, unknown>;
  artifacts: ArtifactInfo[];
}

export interface RunListResponse {
  runs: RunResponse[];
  total: number;
  limit: number;
  offset: number;
}

// Aggregation models
export interface AggregateRequest {
  filter?: FilterSpec | null;
  x_field: string;
  y_field: string;
  group_by?: string[] | null;
  replicate_field?: string;
  reduce_replicates?: boolean;
  agg_fn?: AggFn;
  error_bars?: ErrorBarType;
}

export interface DataPoint {
  x: number | string | boolean;
  y: number;
  y_low?: number | null;
  y_high?: number | null;
  n: number;
  run_ids?: string[] | null;
  // Quartile fields for distribution visualization
  y_min?: number | null;
  y_q1?: number | null;
  y_median?: number | null;
  y_q3?: number | null;
  y_max?: number | null;
}

export interface Series {
  name: string;
  points: DataPoint[];
}

export interface AggregateResponse {
  series: Series[];
  x_field: string;
  y_field: string;
  agg_fn: AggFn;
  total_runs: number;
}

// Field index models
export interface FieldInfo {
  type: FieldType;
  count: number;
  values?: string[] | null;
  min_value?: number | null;
  max_value?: number | null;
}

export interface FieldIndex {
  version: number;
  last_scan?: string | null;
  run_count: number;
  params_fields: Record<string, FieldInfo>;
  metrics_fields: Record<string, FieldInfo>;
  record_fields: Record<string, FieldInfo>;
}

// Experiment models
export interface ExperimentInfo {
  experiment_id: string;
  run_count: number;
  latest_run?: string | null;
}

export interface ExperimentsResponse {
  experiments: ExperimentInfo[];
}

// Manifest models
export interface ManifestInfo {
  experiment_id: string;
  timestamp: string;
  submitted_at: string;
  total_runs: number;
}

export interface ManifestListResponse {
  manifests: ManifestInfo[];
}

export interface OperationInfo {
  ref?: string | null;
  name?: string | null;
  code_hash?: string | null;
}

export interface ManifestResponse {
  experiment_id: string;
  name?: string | null;
  version?: string | null;
  description?: string | null;
  tags: string[];
  operation?: OperationInfo | null;
  params: Record<string, unknown>;
  seeds: Record<string, unknown>;
  context_fingerprint?: string | null;
  runtime_hints?: Record<string, unknown> | null;
  total_runs: number;
  run_ids?: string[] | null;
  submitted_at?: string | null;
}

// Histogram models
export interface HistogramRequest {
  filter?: FilterSpec | null;
  field: string;
  bin_count?: number;
}

export interface HistogramResponse {
  field: string;
  bins: number[];
  counts: number[];
  total: number;
}
