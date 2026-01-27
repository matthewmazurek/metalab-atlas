/**
 * React Query hooks for Metalab Atlas API.
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchRuns,
  fetchRun,
  fetchArtifacts,
  fetchArtifactPreview,
  fetchLog,
  fetchFields,
  fetchExperiments,
  fetchAggregate,
  fetchHistogram,
} from './client';
import type { AggregateRequest, FilterSpec, HistogramRequest } from './types';

// Auto-refresh interval for list views (30 seconds)
const REFETCH_INTERVAL = 30 * 1000;

// Query keys
export const queryKeys = {
  runs: (params: {
    filter?: FilterSpec;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }) => ['runs', params] as const,
  run: (runId: string) => ['run', runId] as const,
  artifacts: (runId: string) => ['artifacts', runId] as const,
  artifactPreview: (runId: string, artifactName: string) =>
    ['artifactPreview', runId, artifactName] as const,
  log: (runId: string, logName: string) => ['log', runId, logName] as const,
  fields: (experimentId?: string) => ['fields', experimentId] as const,
  experiments: () => ['experiments'] as const,
  aggregate: (request: AggregateRequest) => ['aggregate', request] as const,
  histogram: (request: HistogramRequest) => ['histogram', request] as const,
};

// Hooks
export function useRuns(params: {
  filter?: FilterSpec;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: queryKeys.runs(params),
    queryFn: () => fetchRuns(params),
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useRun(runId: string) {
  return useQuery({
    queryKey: queryKeys.run(runId),
    queryFn: () => fetchRun(runId),
    enabled: !!runId,
  });
}

export function useArtifacts(runId: string) {
  return useQuery({
    queryKey: queryKeys.artifacts(runId),
    queryFn: () => fetchArtifacts(runId),
    enabled: !!runId,
  });
}

export function useArtifactPreview(runId: string, artifactName: string) {
  return useQuery({
    queryKey: queryKeys.artifactPreview(runId, artifactName),
    queryFn: () => fetchArtifactPreview(runId, artifactName),
    enabled: !!runId && !!artifactName,
  });
}

export function useLog(runId: string, logName: string) {
  return useQuery({
    queryKey: queryKeys.log(runId, logName),
    queryFn: () => fetchLog(runId, logName),
    enabled: !!runId && !!logName,
  });
}

export function useFields(experimentId?: string) {
  return useQuery({
    queryKey: queryKeys.fields(experimentId),
    queryFn: () => fetchFields(experimentId),
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useExperiments() {
  return useQuery({
    queryKey: queryKeys.experiments(),
    queryFn: fetchExperiments,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useAggregate(request: AggregateRequest, enabled = true) {
  return useQuery({
    queryKey: queryKeys.aggregate(request),
    queryFn: () => fetchAggregate(request),
    enabled: enabled && !!request.x_field && !!request.y_field,
  });
}

export function useHistogram(request: HistogramRequest, enabled = true) {
  return useQuery({
    queryKey: queryKeys.histogram(request),
    queryFn: () => fetchHistogram(request),
    enabled: enabled && !!request.field,
  });
}
