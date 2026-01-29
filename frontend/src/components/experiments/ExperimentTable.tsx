import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useExperiments, useRuns, queryKeys } from '@/api/hooks';
import { fetchLatestManifest, fetchRuns } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ExperimentTagList } from '@/components/ui/experiment-tag';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ColumnHeader, type SortDirection } from '@/components/runs/ColumnHeader';
import type { ExperimentInfo, ManifestResponse } from '@/api/types';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Beaker,
  X,
} from 'lucide-react';

const PAGE_SIZE = 25;

/**
 * Hook to fetch manifests for multiple experiments in parallel
 */
function useExperimentManifests(experimentIds: string[]) {
  const queries = useQueries({
    queries: experimentIds.map((id) => ({
      queryKey: queryKeys.latestManifest(id),
      queryFn: () => fetchLatestManifest(id),
      enabled: !!id,
      staleTime: 30 * 1000,
    })),
  });

  // Build a map of experiment_id -> manifest
  const manifestMap = useMemo(() => {
    const map = new Map<string, ManifestResponse>();
    queries.forEach((query, index) => {
      if (query.data) {
        map.set(experimentIds[index], query.data);
      }
    });
    return map;
  }, [queries, experimentIds]);

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    queries.forEach((query) => {
      if (query.data?.tags) {
        query.data.tags.forEach((tag) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [queries]);

  return { manifestMap, allTags };
}

/**
 * Hook to fetch status counts for multiple experiments in parallel
 */
function useExperimentStatuses(experimentIds: string[]) {
  // Fetch success counts for all experiments
  const successQueries = useQueries({
    queries: experimentIds.map((id) => ({
      queryKey: ['experiment-status', id, 'success'],
      queryFn: async () => {
        const result = await fetchRuns({
          filter: { experiment_id: id, status: ['success'] },
          limit: 1,
        });
        return { experimentId: id, count: result.total ?? 0 };
      },
      enabled: !!id,
      staleTime: 30 * 1000,
    })),
  });

  // Fetch failed counts for all experiments
  const failedQueries = useQueries({
    queries: experimentIds.map((id) => ({
      queryKey: ['experiment-status', id, 'failed'],
      queryFn: async () => {
        const result = await fetchRuns({
          filter: { experiment_id: id, status: ['failed'] },
          limit: 1,
        });
        return { experimentId: id, count: result.total ?? 0 };
      },
      enabled: !!id,
      staleTime: 30 * 1000,
    })),
  });

  // Fetch running counts for all experiments
  const runningQueries = useQueries({
    queries: experimentIds.map((id) => ({
      queryKey: ['experiment-status', id, 'running'],
      queryFn: async () => {
        const result = await fetchRuns({
          filter: { experiment_id: id, status: ['running'] },
          limit: 1,
        });
        return { experimentId: id, count: result.total ?? 0 };
      },
      enabled: !!id,
      staleTime: 30 * 1000,
    })),
  });

  // Build a map of experiment_id -> status counts
  const statusMap = useMemo(() => {
    const map = new Map<string, { successCount: number; failedCount: number; runningCount: number }>();
    experimentIds.forEach((id, index) => {
      const successData = successQueries[index]?.data;
      const failedData = failedQueries[index]?.data;
      const runningData = runningQueries[index]?.data;
      map.set(id, {
        successCount: successData?.count ?? 0,
        failedCount: failedData?.count ?? 0,
        runningCount: runningData?.count ?? 0,
      });
    });
    return map;
  }, [experimentIds, successQueries, failedQueries, runningQueries]);

  return { statusMap };
}

/**
 * Format a date string as relative time for recent dates
 */
function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${Math.round(diffHours)}h ago`;
  if (diffHours < 168) return `${Math.round(diffHours / 24)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/**
 * Hook to get status counts for an experiment
 */
function useExperimentStatus(experimentId: string) {
  const { data: successData } = useRuns({
    filter: { experiment_id: experimentId, status: ['success'] },
    limit: 1,
  });

  const { data: failedData } = useRuns({
    filter: { experiment_id: experimentId, status: ['failed'] },
    limit: 1,
  });

  const { data: runningData } = useRuns({
    filter: { experiment_id: experimentId, status: ['running'] },
    limit: 1,
  });

  return {
    successCount: successData?.total ?? 0,
    failedCount: failedData?.total ?? 0,
    runningCount: runningData?.total ?? 0,
  };
}

// Status values for filtering
const STATUS_VALUES = ['Complete', 'In progress'];

/**
 * Row component that displays an experiment
 * 
 * Status visual guide:
 * - Green check (CheckCircle2): All runs complete with 100% success (shown next to name)
 * - Warning triangle (AlertTriangle): Has any failed runs (shown next to name)
 * - No icon: In progress (runs not complete)
 */
function ExperimentRow({
  experiment,
  manifest,
}: {
  experiment: ExperimentInfo;
  manifest?: ManifestResponse;
}) {
  const navigate = useNavigate();
  const { successCount, failedCount, runningCount } = useExperimentStatus(experiment.experiment_id);

  const displayName = manifest?.name || experiment.experiment_id;
  const totalRuns = manifest?.total_runs;
  const completedRuns = successCount + failedCount;
  const isComplete = totalRuns != null && completedRuns >= totalRuns;
  const hasFailures = failedCount > 0;
  const isAllSuccess = isComplete && !hasFailures;

  const handleRowClick = () => {
    navigate(`/experiments/${encodeURIComponent(experiment.experiment_id)}`);
  };

  return (
    <TableRow
      className="cursor-pointer hover:bg-accent/50"
      onClick={handleRowClick}
    >
      {/* Name with status indicator */}
      <TableCell>
        <div className="flex items-center gap-2">
          <Beaker className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link
                to={`/experiments/${encodeURIComponent(experiment.experiment_id)}`}
                className="font-medium text-sm hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {displayName}
              </Link>
              {isAllSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              ) : hasFailures ? (
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : null}
            </div>
            {manifest?.name && manifest.name !== experiment.experiment_id && (
              <span className="text-xs text-muted-foreground font-mono truncate block">
                {experiment.experiment_id}
              </span>
            )}
          </div>
        </div>
      </TableCell>

      {/* Tags */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <ExperimentTagList tags={manifest?.tags || []} maxVisible={3} />
      </TableCell>

      {/* Status badge */}
      <TableCell>
        {isComplete ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Complete
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            In progress
          </span>
        )}
      </TableCell>

      {/* Total */}
      <TableCell>
        <span className="text-sm text-muted-foreground tabular-nums">
          {totalRuns ?? '—'}
        </span>
      </TableCell>

      {/* Success */}
      <TableCell>
        <span className="text-sm tabular-nums text-muted-foreground">
          {successCount}
        </span>
      </TableCell>

      {/* Failed */}
      <TableCell>
        <span className="text-sm tabular-nums text-muted-foreground">
          {failedCount}
        </span>
      </TableCell>

      {/* Running */}
      <TableCell>
        <span className="text-sm tabular-nums text-muted-foreground">
          {runningCount}
        </span>
      </TableCell>

      {/* Latest Run */}
      <TableCell>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(experiment.latest_run)}
        </span>
      </TableCell>
    </TableRow>
  );
}

// Sort functions for client-side sorting
type SortField = 'name' | 'status' | 'total' | 'success' | 'failed' | 'running' | 'latest_run';

export interface ExperimentFilters {
  nameFilter: string;
  selectedTags: string[];
  selectedStatuses: string[];
}

export interface ExperimentTableProps {
  /** Callback when filters change, useful for parent component to show filter UI */
  onFiltersChange?: (filters: ExperimentFilters) => void;
}

export function ExperimentTable({ onFiltersChange }: ExperimentTableProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('latest_run');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Initialize filters from URL params synchronously to avoid race conditions
  const [nameFilter, setNameFilter] = useState(() => searchParams.get('name') || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const tagsParam = searchParams.get('tags');
    return tagsParam ? tagsParam.split(',').filter(Boolean) : [];
  });
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => {
    const statusParam = searchParams.get('status');
    return statusParam ? statusParam.split(',').filter(Boolean) : [];
  });

  // Track whether we're updating URL from state (to avoid sync loops)
  const isUpdatingUrl = useRef(false);

  // Sync state FROM URL when URL changes externally (e.g., clicking tag links)
  useEffect(() => {
    // Skip if we're the ones who just updated the URL
    if (isUpdatingUrl.current) {
      isUpdatingUrl.current = false;
      return;
    }

    const urlTags = searchParams.get('tags')?.split(',').filter(Boolean) || [];
    const urlStatuses = searchParams.get('status')?.split(',').filter(Boolean) || [];
    const urlName = searchParams.get('name') || '';

    // Update state to match URL
    setSelectedTags(urlTags);
    setSelectedStatuses(urlStatuses);
    setNameFilter(urlName);
  }, [searchParams]);

  // Sync filters TO URL when state changes from user interaction
  const syncFiltersToUrl = useCallback((
    tags: string[],
    statuses: string[],
    name: string
  ) => {
    const params = new URLSearchParams();
    if (tags.length > 0) {
      params.set('tags', tags.join(','));
    }
    if (statuses.length > 0) {
      params.set('status', statuses.join(','));
    }
    if (name) {
      params.set('name', name);
    }
    isUpdatingUrl.current = true;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  // Notify parent of filter changes
  useEffect(() => {
    onFiltersChange?.({ nameFilter, selectedTags, selectedStatuses });
  }, [nameFilter, selectedTags, selectedStatuses, onFiltersChange]);

  const { data: experimentsData, isLoading: experimentsLoading } = useExperiments();

  // Get all experiment IDs
  const experimentIds = useMemo(
    () => experimentsData?.experiments.map((e) => e.experiment_id) || [],
    [experimentsData]
  );

  // Load manifests for all experiments to enable tag filtering
  const { manifestMap, allTags } = useExperimentManifests(experimentIds);

  // Load status counts for all experiments to enable status filtering
  const { statusMap } = useExperimentStatuses(experimentIds);

  const isLoading = experimentsLoading;

  // Apply filtering (name, tags, and status)
  const filteredExperiments = useMemo(() => {
    if (!experimentsData?.experiments) return [];

    // Helper to check if experiment matches selected statuses
    // Status logic:
    // - "Complete": all expected runs are done (success + failed >= total_runs)
    // - "In progress": not all runs are done yet
    const matchesStatusFilter = (experimentId: string): boolean => {
      if (selectedStatuses.length === 0) return true;

      const manifest = manifestMap.get(experimentId);
      const status = statusMap.get(experimentId);
      const totalRuns = manifest?.total_runs;
      const successCount = status?.successCount ?? 0;
      const failedCount = status?.failedCount ?? 0;

      const isComplete = totalRuns != null && (successCount + failedCount) >= totalRuns;

      // Check if experiment matches ANY of the selected statuses
      for (const selectedStatus of selectedStatuses) {
        if (selectedStatus === 'Complete' && isComplete) return true;
        if (selectedStatus === 'In progress' && !isComplete) return true;
      }

      return false;
    };

    return experimentsData.experiments.filter((exp) => {
      // Name filter
      if (nameFilter) {
        const lowerFilter = nameFilter.toLowerCase();
        if (!exp.experiment_id.toLowerCase().includes(lowerFilter)) {
          return false;
        }
      }

      // Tag filter
      if (selectedTags.length > 0) {
        const manifest = manifestMap.get(exp.experiment_id);
        const experimentTags = manifest?.tags || [];
        // Check if experiment has any of the selected tags
        const hasSelectedTag = selectedTags.some((tag) => experimentTags.includes(tag));
        if (!hasSelectedTag) {
          return false;
        }
      }

      // Status filter
      if (!matchesStatusFilter(exp.experiment_id)) {
        return false;
      }

      return true;
    });
  }, [experimentsData, nameFilter, selectedTags, selectedStatuses, manifestMap, statusMap]);

  // Apply sorting (client-side for now since we don't have server-side sorting for experiments)
  const sortedExperiments = useMemo(() => {
    const sorted = [...filteredExperiments];

    sorted.sort((a, b) => {
      let comparison = 0;

      const aStatus = statusMap.get(a.experiment_id);
      const bStatus = statusMap.get(b.experiment_id);
      const aManifest = manifestMap.get(a.experiment_id);
      const bManifest = manifestMap.get(b.experiment_id);

      switch (sortField) {
        case 'name':
          comparison = a.experiment_id.localeCompare(b.experiment_id);
          break;
        case 'status': {
          // Sort by completion status (complete first when desc)
          const aTotal = aManifest?.total_runs ?? 0;
          const bTotal = bManifest?.total_runs ?? 0;
          const aComplete = aTotal > 0 && ((aStatus?.successCount ?? 0) + (aStatus?.failedCount ?? 0)) >= aTotal;
          const bComplete = bTotal > 0 && ((bStatus?.successCount ?? 0) + (bStatus?.failedCount ?? 0)) >= bTotal;
          comparison = (aComplete ? 1 : 0) - (bComplete ? 1 : 0);
          break;
        }
        case 'total':
          comparison = (aManifest?.total_runs ?? 0) - (bManifest?.total_runs ?? 0);
          break;
        case 'success':
          comparison = (aStatus?.successCount ?? 0) - (bStatus?.successCount ?? 0);
          break;
        case 'failed':
          comparison = (aStatus?.failedCount ?? 0) - (bStatus?.failedCount ?? 0);
          break;
        case 'running':
          comparison = (aStatus?.runningCount ?? 0) - (bStatus?.runningCount ?? 0);
          break;
        case 'latest_run': {
          const aTime = a.latest_run ? new Date(a.latest_run).getTime() : 0;
          const bTime = b.latest_run ? new Date(b.latest_run).getTime() : 0;
          comparison = aTime - bTime;
          break;
        }
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }, [filteredExperiments, sortField, sortDirection, statusMap, manifestMap]);

  // Paginate
  const paginatedExperiments = useMemo(() => {
    const start = page * PAGE_SIZE;
    return sortedExperiments.slice(start, start + PAGE_SIZE);
  }, [sortedExperiments, page]);

  const total = sortedExperiments.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSort = (field: SortField) => (direction: SortDirection) => {
    if (direction === null) {
      setSortField('latest_run');
      setSortDirection('desc');
    } else {
      setSortField(field);
      setSortDirection(direction);
    }
    setPage(0);
  };

  const handleFilter = (value: string) => {
    setNameFilter(value);
    syncFiltersToUrl(selectedTags, selectedStatuses, value);
    setPage(0);
  };

  const handleTagFilter = (tags: string[]) => {
    setSelectedTags(tags);
    syncFiltersToUrl(tags, selectedStatuses, nameFilter);
    setPage(0);
  };

  const handleStatusFilter = (statuses: string[]) => {
    setSelectedStatuses(statuses);
    syncFiltersToUrl(selectedTags, statuses, nameFilter);
    setPage(0);
  };

  const clearAllFilters = () => {
    setNameFilter('');
    setSelectedTags([]);
    setSelectedStatuses([]);
    syncFiltersToUrl([], [], '');
    setPage(0);
  };

  const hasActiveFilters = nameFilter.length > 0 || selectedTags.length > 0 || selectedStatuses.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active filters bar */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-muted-foreground">Filters:</span>
          {nameFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
              Name: "{nameFilter}"
            </span>
          )}
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
            >
              Tag: {tag}
            </span>
          ))}
          {selectedStatuses.map((status) => (
            <span
              key={status}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
            >
              Status: {status}
            </span>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={clearAllFilters}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">
                <ColumnHeader
                  title="Name"
                  sortable
                  filterable
                  sortDirection={sortField === 'name' ? sortDirection : null}
                  filterValue={nameFilter}
                  onSort={handleSort('name')}
                  onFilter={handleFilter}
                />
              </TableHead>
              <TableHead className="min-w-[150px]">
                <ColumnHeader
                  title="Tags"
                  filterable
                  discreteValues={allTags}
                  selectedValues={selectedTags}
                  onFilterValues={handleTagFilter}
                />
              </TableHead>
              <TableHead className="min-w-[100px]">
                <ColumnHeader
                  title="Status"
                  sortable
                  filterable
                  sortDirection={sortField === 'status' ? sortDirection : null}
                  onSort={handleSort('status')}
                  discreteValues={STATUS_VALUES}
                  selectedValues={selectedStatuses}
                  onFilterValues={handleStatusFilter}
                />
              </TableHead>
              <TableHead className="min-w-[60px]">
                <ColumnHeader
                  title="Total"
                  sortable
                  sortDirection={sortField === 'total' ? sortDirection : null}
                  onSort={handleSort('total')}
                />
              </TableHead>
              <TableHead className="min-w-[70px]">
                <ColumnHeader
                  title="Success"
                  sortable
                  sortDirection={sortField === 'success' ? sortDirection : null}
                  onSort={handleSort('success')}
                />
              </TableHead>
              <TableHead className="min-w-[60px]">
                <ColumnHeader
                  title="Failed"
                  sortable
                  sortDirection={sortField === 'failed' ? sortDirection : null}
                  onSort={handleSort('failed')}
                />
              </TableHead>
              <TableHead className="min-w-[70px]">
                <ColumnHeader
                  title="Running"
                  sortable
                  sortDirection={sortField === 'running' ? sortDirection : null}
                  onSort={handleSort('running')}
                />
              </TableHead>
              <TableHead className="min-w-[100px]">
                <ColumnHeader
                  title="Latest Run"
                  sortable
                  sortDirection={sortField === 'latest_run' ? sortDirection : null}
                  onSort={handleSort('latest_run')}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedExperiments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  <Beaker className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No experiments found</p>
                  {hasActiveFilters && (
                    <p className="text-xs mt-1">
                      Try adjusting your filters
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              paginatedExperiments.map((experiment) => (
                <ExperimentRow
                  key={experiment.experiment_id}
                  experiment={experiment}
                  manifest={manifestMap.get(experiment.experiment_id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {total > 0 ? (
            <>
              Showing {page * PAGE_SIZE + 1}-
              {Math.min((page + 1) * PAGE_SIZE, total)} of {total} experiments
            </>
          ) : (
            'No experiments'
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
