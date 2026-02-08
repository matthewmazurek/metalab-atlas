/**
 * React Query hooks for MetaLab Atlas API.
 */

import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  fetchRuns,
  fetchRun,
  fetchArtifacts,
  fetchArtifactPreview,
  fetchDataList,
  fetchDataEntry,
  fetchLog,
  fetchLogsList,
  fetchFields,
  fetchExperiments,
  fetchFieldValues,
  fetchExperimentManifests,
  fetchLatestManifest,
  fetchManifest,
  fetchSlurmStatus,
  fetchStatusCounts,
  fetchSearch,
  fetchSearchLogs,
} from './client';
import type { FieldValuesRequest, FilterSpec } from './types';

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
  fieldValues: (request: FieldValuesRequest) => ['fieldValues', request] as const,
  experimentManifests: (experimentId: string) =>
    ['experimentManifests', experimentId] as const,
  latestManifest: (experimentId: string) =>
    ['latestManifest', experimentId] as const,
  manifest: (experimentId: string, timestamp: string) =>
    ['manifest', experimentId, timestamp] as const,
  slurmStatus: (experimentId: string) =>
    ['slurmStatus', experimentId] as const,
  statusCounts: (experimentId: string) =>
    ['statusCounts', experimentId] as const,
  dataList: (runId: string) => ['dataList', runId] as const,
  dataEntry: (runId: string, dataName: string) =>
    ['dataEntry', runId, dataName] as const,
  search: (query: string, limit?: number) =>
    ['search', query, limit] as const,
  searchLogs: (query: string, limit?: number) =>
    ['searchLogs', query, limit] as const,
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

export function useDataList(runId: string) {
  return useQuery({
    queryKey: queryKeys.dataList(runId),
    queryFn: () => fetchDataList(runId),
    enabled: !!runId,
  });
}

export function useDataEntry(runId: string, dataName: string) {
  return useQuery({
    queryKey: queryKeys.dataEntry(runId, dataName),
    queryFn: () => fetchDataEntry(runId, dataName),
    enabled: !!runId && !!dataName,
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

export function useFields(experimentId?: string, isInProgress = false) {
  return useQuery({
    queryKey: queryKeys.fields(experimentId),
    queryFn: () => fetchFields(experimentId),
    refetchInterval: isInProgress ? ACTIVE_REFETCH_INTERVAL : REFETCH_INTERVAL,
  });
}

export function useExperiments() {
  return useQuery({
    queryKey: queryKeys.experiments(),
    queryFn: fetchExperiments,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useFieldValues(request: FieldValuesRequest, enabled = true) {
  // Serialize filter for stable query key (objects can have same content but different references)
  const filterKey = request.filter ? JSON.stringify(request.filter) : 'none';

  return useQuery({
    queryKey: ['fieldValues', request.fields, filterKey, request.max_points, request.seed],
    queryFn: () => fetchFieldValues(request),
    enabled: enabled && request.fields.length > 0,
    // Plots don't need auto-refresh - keep data stable
    staleTime: Infinity,
    refetchOnWindowFocus: false,
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

export function useManifest(experimentId: string, timestamp: string) {
  return useQuery({
    queryKey: queryKeys.manifest(experimentId, timestamp),
    queryFn: () => fetchManifest(experimentId, timestamp),
    enabled: !!experimentId && !!timestamp,
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

export function useStatusCounts(experimentId: string) {
  return useQuery({
    queryKey: queryKeys.statusCounts(experimentId),
    queryFn: () => fetchStatusCounts(experimentId),
    enabled: !!experimentId,
    // Auto-poll faster when experiment has running runs
    refetchInterval: (query) =>
      (query.state.data?.running ?? 0) > 0 ? ACTIVE_REFETCH_INTERVAL : REFETCH_INTERVAL,
  });
}

export type StatusCountsMap = Map<
  string,
  { successCount: number; failedCount: number; runningCount: number }
>;

export function useStatusCountsBatch(experimentIds: string[]): { statusMap: StatusCountsMap } {
  const queries = useQueries({
    queries: experimentIds.map((id) => ({
      queryKey: queryKeys.statusCounts(id),
      queryFn: () => fetchStatusCounts(id),
      enabled: !!id,
      refetchInterval: REFETCH_INTERVAL,
    })),
  });

  const statusMap = useMemo(() => {
    const map: StatusCountsMap = new Map();
    experimentIds.forEach((id, index) => {
      const data = queries[index]?.data;
      map.set(id, {
        successCount: data?.success ?? 0,
        failedCount: data?.failed ?? 0,
        runningCount: data?.running ?? 0,
      });
    });
    return map;
  }, [experimentIds, queries]);

  return { statusMap };
}

export function useSearch(query: string, limit = 5) {
  return useQuery({
    queryKey: queryKeys.search(query, limit),
    queryFn: () => fetchSearch(query, limit),
    enabled: query.trim().length >= 2,
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000,
  });
}

export function useSearchLogs(query: string, limit = 5) {
  return useQuery({
    queryKey: queryKeys.searchLogs(query, limit),
    queryFn: () => fetchSearchLogs(query, limit),
    enabled: query.trim().length >= 2,
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000,
  });
}
