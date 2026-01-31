/**
 * React Query hooks for MetaLab Atlas API.
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchRuns,
  fetchRun,
  fetchArtifacts,
  fetchArtifactPreview,
  fetchLog,
  fetchLogsList,
  fetchFields,
  fetchExperiments,
  fetchAggregate,
  fetchHistogram,
  fetchExperimentManifests,
  fetchLatestManifest,
  fetchSlurmStatus,
} from './client';
import type { AggregateRequest, FilterSpec, HistogramRequest } from './types';

// Auto-refresh interval for list views (30 seconds)
const REFETCH_INTERVAL = 30 * 1000;

// Faster refresh for active/running items (5 seconds)
const ACTIVE_REFETCH_INTERVAL = 5 * 1000;

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
  logsList: (runId: string) => ['logsList', runId] as const,
  fields: (experimentId?: string) => ['fields', experimentId] as const,
  experiments: () => ['experiments'] as const,
  aggregate: (request: AggregateRequest) => ['aggregate', request] as const,
  histogram: (request: HistogramRequest) => ['histogram', request] as const,
  experimentManifests: (experimentId: string) =>
    ['experimentManifests', experimentId] as const,
  latestManifest: (experimentId: string) =>
    ['latestManifest', experimentId] as const,
  slurmStatus: (experimentId: string) =>
    ['slurmStatus', experimentId] as const,
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
    // Auto-poll when run is active
    refetchInterval: (query) =>
      query.state.data?.record.status === 'running' ? ACTIVE_REFETCH_INTERVAL : false,
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

export function useLog(runId: string, logName: string, isRunning = false) {
  return useQuery({
    queryKey: queryKeys.log(runId, logName),
    queryFn: () => fetchLog(runId, logName),
    enabled: !!runId && !!logName,
    refetchInterval: isRunning ? ACTIVE_REFETCH_INTERVAL : false,
  });
}

export function useLogsList(runId: string, isRunning = false) {
  return useQuery({
    queryKey: queryKeys.logsList(runId),
    queryFn: () => fetchLogsList(runId),
    enabled: !!runId,
    refetchInterval: isRunning ? ACTIVE_REFETCH_INTERVAL : false,
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

export function useExperimentManifests(experimentId: string) {
  return useQuery({
    queryKey: queryKeys.experimentManifests(experimentId),
    queryFn: () => fetchExperimentManifests(experimentId),
    enabled: !!experimentId,
  });
}

export function useLatestManifest(experimentId: string) {
  return useQuery({
    queryKey: queryKeys.latestManifest(experimentId),
    queryFn: () => fetchLatestManifest(experimentId),
    enabled: !!experimentId,
  });
}

export function useSlurmStatus(experimentId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.slurmStatus(experimentId),
    queryFn: () => fetchSlurmStatus(experimentId),
    enabled: enabled && !!experimentId,
    // Poll every 10 seconds for active experiments
    refetchInterval: REFETCH_INTERVAL / 3, // 10 seconds
    // Don't throw on 404 (experiment might not be SLURM-based)
    retry: false,
  });
}
