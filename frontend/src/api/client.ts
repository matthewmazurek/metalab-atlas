/**
 * API client for Metalab Atlas backend.
 */

import axios from 'axios';
import type {
  AggregateRequest,
  AggregateResponse,
  ArtifactInfo,
  ArtifactPreview,
  ExperimentsResponse,
  FieldIndex,
  FilterSpec,
  RunListResponse,
  RunResponse,
  RunStatus,
} from './types';

// Base URL for API - defaults to same origin or localhost:8000
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

export async function fetchFields(experimentId?: string): Promise<FieldIndex> {
  const params = experimentId ? `?experiment_id=${experimentId}` : '';
  const response = await api.get<FieldIndex>(`/api/meta/fields${params}`);
  return response.data;
}

export async function fetchExperiments(): Promise<ExperimentsResponse> {
  const response = await api.get<ExperimentsResponse>('/api/meta/experiments');
  return response.data;
}

export async function fetchAggregate(request: AggregateRequest): Promise<AggregateResponse> {
  const response = await api.post<AggregateResponse>('/api/aggregate', request);
  return response.data;
}
