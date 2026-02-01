/**
 * TypeScript types mirroring backend Pydantic models.
 */

// Enums
export type RunStatus = 'success' | 'failed' | 'cancelled' | 'running';
export type FilterOp = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'contains' | 'in';
export type AggFn = 'none' | 'mean' | 'median' | 'min' | 'max' | 'count';
export type ErrorBarType = 'none' | 'std' | 'sem';
export type FieldType = 'numeric' | 'string' | 'boolean' | 'unknown';
export type ChartType = 'scatter' | 'line' | 'bar' | 'histogram';

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
  derived_metrics: Record<string, unknown>;
  artifacts: ArtifactInfo[];
}

export interface RunListResponse {
  runs: RunResponse[];
  total: number;
  limit: number;
  offset: number;
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
  derived_fields: Record<string, FieldInfo>;
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
  metadata?: Record<string, unknown> | null;
  total_runs: number;
  run_ids?: string[] | null;
  submitted_at?: string | null;
}

// Histogram models
export interface HistogramRequest {
  field: string;
  bin_count?: number;
  filter?: FilterSpec | null;
}

export interface HistogramResponse {
  field: string;
  bins: number[];
  counts: number[];
  total: number;
  run_ids_per_bin?: string[][] | null;
}

// Field values models (for frontend-driven plotting)
export interface FieldValuesRequest {
  filter?: FilterSpec | null;
  fields: string[];
  max_points?: number;
  include_run_ids?: boolean;
  seed?: number | null;
}

export interface FieldValuesResponse {
  fields: Record<string, (number | string | null)[]>;
  run_ids?: string[] | null;
  total: number;
  returned: number;
  sampled: boolean;
}

// SLURM status models
export interface SlurmArrayStatusResponse {
  job_ids: string[];
  total: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
  cancelled: number;
  timeout: number;
  oom: number;
  other: number;
  last_squeue_at?: string | null;
  last_sacct_at?: string | null;
  sacct_stale: boolean;
}

// Lightweight status counts
export interface StatusCounts {
  success: number;
  failed: number;
  running: number;
  cancelled: number;
  total: number;
}
