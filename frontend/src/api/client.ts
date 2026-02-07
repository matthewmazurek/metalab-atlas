/**
 * API client for MetaLab Atlas backend.
 */

import axios from 'axios';
import type {
  ArtifactInfo,
  ArtifactPreview,
  ExperimentsResponse,
  FieldIndex,
  FieldValuesRequest,
  FieldValuesResponse,
  FilterSpec,
  ManifestListResponse,
  ManifestResponse,
  RunListResponse,
  RunResponse,
  SearchResponse,
  SlurmArrayStatusResponse,
  StatusCounts,
} from './types';

// Base URL for API
// In production (bundled), use same origin. In dev, use localhost:8000
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:8000');

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Query params helper
function buildRunsParams(params: {
  filter?: FilterSpec;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (params.filter?.experiment_id) {
    searchParams.set('experiment_id', params.filter.experiment_id);
  }
  if (params.filter?.status && params.filter.status.length > 0) {
    params.filter.status.forEach((s) => searchParams.append('status', s));
  }
  if (params.filter?.started_after) {
    searchParams.set('started_after', params.filter.started_after);
  }
  if (params.filter?.started_before) {
    searchParams.set('started_before', params.filter.started_before);
  }
  // Pass field_filters as JSON-encoded query param (strip UI-only _fromPlot)
  if (params.filter?.field_filters && params.filter.field_filters.length > 0) {
    const serializable = params.filter.field_filters.map(({ field, op, value }) => ({ field, op, value }));
    searchParams.set('field_filters', JSON.stringify(serializable));
  }
  if (params.sort_by) {
    searchParams.set('sort_by', params.sort_by);
  }
  if (params.sort_order) {
    searchParams.set('sort_order', params.sort_order);
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params.offset !== undefined) {
    searchParams.set('offset', params.offset.toString());
  }

  return searchParams;
}

// API functions
export async function fetchRuns(params: {
  filter?: FilterSpec;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<RunListResponse> {
  const searchParams = buildRunsParams(params);
  const response = await api.get<RunListResponse>(`/api/runs?${searchParams}`);
  return response.data;
}

export async function fetchRun(runId: string): Promise<RunResponse> {
  const response = await api.get<RunResponse>(`/api/runs/${runId}`);
  return response.data;
}

export async function fetchArtifacts(runId: string): Promise<ArtifactInfo[]> {
  const response = await api.get<ArtifactInfo[]>(`/api/runs/${runId}/artifacts`);
  return response.data;
}

export async function fetchArtifactPreview(
  runId: string,
  artifactName: string
): Promise<ArtifactPreview> {
  const response = await api.get<ArtifactPreview>(
    `/api/runs/${runId}/artifacts/${artifactName}/preview`
  );
  return response.data;
}

export function getArtifactDownloadUrl(runId: string, artifactName: string): string {
  return `${API_BASE}/api/runs/${runId}/artifacts/${artifactName}`;
}

export async function fetchLog(
  runId: string,
  logName: string
): Promise<{ content: string; exists: boolean }> {
  const response = await api.get<{ content: string; exists: boolean }>(
    `/api/runs/${runId}/logs/${logName}`
  );
  return response.data;
}

export async function fetchLogsList(
  runId: string
): Promise<{ logs: string[] }> {
  const response = await api.get<{ logs: string[] }>(
    `/api/runs/${runId}/logs`
  );
  return response.data;
}

export async function fetchFields(experimentId?: string): Promise<FieldIndex> {
  const params = experimentId ? `?experiment_id=${experimentId}` : '';
  const response = await api.get<FieldIndex>(`/api/meta/fields${params}`);
  return response.data;
}

export async function fetchExperiments(): Promise<ExperimentsResponse> {
  const response = await api.get<ExperimentsResponse>('/api/meta/experiments');
  return response.data;
}

export async function fetchFieldValues(request: FieldValuesRequest): Promise<FieldValuesResponse> {
  const response = await api.post<FieldValuesResponse>('/api/fields/values', request);
  return response.data;
}

export async function refreshStores(): Promise<{ stores_discovered: number; message: string }> {
  const response = await api.post<{ stores_discovered: number; message: string }>('/api/meta/refresh');
  return response.data;
}

export async function fetchExperimentManifests(
  experimentId: string
): Promise<ManifestListResponse> {
  const response = await api.get<ManifestListResponse>(
    `/api/experiments/${encodeURIComponent(experimentId)}/manifests`
  );
  return response.data;
}

export async function fetchLatestManifest(
  experimentId: string
): Promise<ManifestResponse | null> {
  const response = await api.get<ManifestResponse | null>(
    `/api/experiments/${encodeURIComponent(experimentId)}/manifests/latest`
  );
  return response.data;
}

export async function fetchManifest(
  experimentId: string,
  timestamp: string
): Promise<ManifestResponse> {
  const response = await api.get<ManifestResponse>(
    `/api/experiments/${encodeURIComponent(experimentId)}/manifests/${timestamp}`
  );
  return response.data;
}

export function getExportUrl(
  experimentId: string,
  options: {
    format?: 'csv' | 'parquet';
    include_params?: boolean;
    include_metrics?: boolean;
    include_derived?: boolean;
    include_record?: boolean;
    include_data?: boolean;
  } = {}
): string {
  const params = new URLSearchParams();

  if (options.format) {
    params.set('format', options.format);
  }
  if (options.include_params !== undefined) {
    params.set('include_params', String(options.include_params));
  }
  if (options.include_metrics !== undefined) {
    params.set('include_metrics', String(options.include_metrics));
  }
  if (options.include_derived !== undefined) {
    params.set('include_derived', String(options.include_derived));
  }
  if (options.include_record !== undefined) {
    params.set('include_record', String(options.include_record));
  }
  if (options.include_data !== undefined) {
    params.set('include_data', String(options.include_data));
  }

  const queryString = params.toString();
  const path = `/api/experiments/${encodeURIComponent(experimentId)}/export`;

  return `${API_BASE}${path}${queryString ? `?${queryString}` : ''}`;
}

export async function fetchSlurmStatus(
  experimentId: string
): Promise<SlurmArrayStatusResponse> {
  const response = await api.get<SlurmArrayStatusResponse>(
    `/api/experiments/${encodeURIComponent(experimentId)}/slurm-status`
  );
  return response.data;
}

export async function fetchStatusCounts(
  experimentId: string
): Promise<StatusCounts> {
  const response = await api.get<StatusCounts>(
    `/api/experiments/${encodeURIComponent(experimentId)}/status-counts`
  );
  return response.data;
}

export async function fetchSearch(
  q: string,
  limit = 5
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  const response = await api.get<SearchResponse>(`/api/search?${params}`);
  return response.data;
}

export async function fetchSearchLogs(
  q: string,
  limit = 5
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  const response = await api.get<SearchResponse>(`/api/search/logs?${params}`);
  return response.data;
}
