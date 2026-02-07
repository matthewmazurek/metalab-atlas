import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTableNavigation } from '@/hooks/useTableNavigation';
import { useQueries } from '@tanstack/react-query';
import { useExperiments, useSearch, useStatusCounts, useStatusCountsBatch, queryKeys } from '@/api/hooks';
import { fetchLatestManifest } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { FilterPills } from '@/components/ui/FilterPills';
import { ExperimentTagList } from '@/components/ui/experiment-tag';
import {
  Table,
  TableBody,
  TableContainer,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ColumnHeader, type SortDirection } from '@/components/runs/ColumnHeader';
import type { ExperimentInfo, ManifestResponse } from '@/api/types';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Loader2, CheckCircle2, AlertTriangle, Beaker } from 'lucide-react';
import { formatRelativeTime, parseApiDate } from '@/lib/datetime';

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
  rowIndex,
  focused,
}: {
  experiment: ExperimentInfo;
  manifest?: ManifestResponse;
  rowIndex?: number;
  focused?: boolean;
}) {
  const navigate = useNavigate();
  const { data: statusCounts } = useStatusCounts(experiment.experiment_id);
  const successCount = statusCounts?.success ?? 0;
  const failedCount = statusCounts?.failed ?? 0;
  const runningCount = statusCounts?.running ?? 0;

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
      rowIndex={rowIndex}
      className="cursor-pointer"
      onClick={handleRowClick}
      data-state={focused ? 'focused' : undefined}
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
                <CheckCircle2 className="h-4 w-4 text-status-success shrink-0" />
              ) : hasFailures ? (
                <AlertTriangle className="h-4 w-4 text-status-warning shrink-0" />
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
        <Badge variant={isComplete ? 'success' : 'info'}>
          {isComplete ? 'Complete' : 'In progress'}
        </Badge>
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('latest_run');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // URL is the source of truth for filters
  const nameFilter = searchParams.get('name') || '';
  const hasParam = searchParams.get('has_param') || '';
  const hasMetric = searchParams.get('has_metric') || '';
  const hasDerived = searchParams.get('has_derived') || '';
  const hasArtifact = searchParams.get('has_artifact') || '';
  const hasTag = searchParams.get('has_tag') || '';
  const selectedTags = useMemo(
    () => searchParams.get('tags')?.split(',').filter(Boolean) || [],
    [searchParams]
  );
  const selectedStatuses = useMemo(
    () => searchParams.get('status')?.split(',').filter(Boolean) || [],
    [searchParams]
  );

  const syncFiltersToUrl = useCallback(
    (
      tags: string[],
      statuses: string[],
      name: string,
      options?: { clearHasField?: boolean }
    ) => {
      const params = new URLSearchParams();
      if (tags.length > 0) params.set('tags', tags.join(','));
      if (statuses.length > 0) params.set('status', statuses.join(','));
      if (name) params.set('name', name);
      if (!options?.clearHasField) {
        if (hasParam) params.set('has_param', hasParam);
        if (hasMetric) params.set('has_metric', hasMetric);
        if (hasDerived) params.set('has_derived', hasDerived);
        if (hasArtifact) params.set('has_artifact', hasArtifact);
        if (hasTag) params.set('has_tag', hasTag);
      }
      setSearchParams(params, { replace: true });
    },
    [setSearchParams, hasParam, hasMetric, hasDerived, hasArtifact, hasTag]
  );

  // Notify parent of filter changes
  useEffect(() => {
    onFiltersChange?.({ nameFilter, selectedTags, selectedStatuses });
  }, [nameFilter, selectedTags, selectedStatuses, onFiltersChange]);

  const { data: experimentsData, isLoading: experimentsLoading } = useExperiments();

  // When linking from search overflow (e.g. "8 matching experiments" for metric "dummy"),
  // filter to experiments that have that param/metric/derived/artifact (from search API).
  const hasFieldQuery =
    hasParam || hasMetric || hasDerived || hasArtifact || hasTag
      ? hasParam || hasMetric || hasDerived || hasArtifact || hasTag
      : '';
  const hasFieldCategory =
    hasParam
      ? 'param_names'
      : hasMetric
        ? 'metric_names'
        : hasDerived
          ? 'derived_names'
          : hasArtifact
            ? 'artifacts'
            : hasTag
              ? 'tags'
              : null;
  const { data: searchData, isFetching: searchFetching } = useSearch(
    hasFieldQuery,
    200
  );
  const hasFieldExperimentIds = useMemo(() => {
    if (!hasFieldCategory) return null;
    if (searchFetching || !searchData?.groups) {
      return new Set<string>(); // loading or no data yet: show nothing until we have results
    }
    const group = searchData.groups.find((g) => g.category === hasFieldCategory);
    if (!group) return new Set<string>();
    return new Set(group.hits.map((h) => h.entity_id));
  }, [searchData?.groups, hasFieldCategory, searchFetching]);

  // Get all experiment IDs
  const experimentIds = useMemo(
    () => experimentsData?.experiments.map((e) => e.experiment_id) || [],
    [experimentsData]
  );

  // Load manifests for all experiments to enable tag filtering
  const { manifestMap, allTags } = useExperimentManifests(experimentIds);

  // Load status counts for all experiments to enable status filtering
  const { statusMap } = useStatusCountsBatch(experimentIds);

  const isLoading =
    experimentsLoading ||
    (hasFieldCategory != null && hasFieldQuery.length >= 2 && searchFetching);

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
      // "Has field" filter (from search overflow: experiments with this param/metric/derived/artifact)
      if (hasFieldExperimentIds !== null) {
        if (!hasFieldExperimentIds.has(exp.experiment_id)) {
          return false;
        }
      } else {
        // Name filter (only when not filtering by "has field")
        if (nameFilter) {
          const lowerFilter = nameFilter.toLowerCase();
          if (!exp.experiment_id.toLowerCase().includes(lowerFilter)) {
            return false;
          }
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
  }, [
    experimentsData,
    nameFilter,
    selectedTags,
    selectedStatuses,
    manifestMap,
    statusMap,
    hasFieldExperimentIds,
  ]);

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
          const aTime = parseApiDate(a.latest_run)?.getTime() ?? 0;
          const bTime = parseApiDate(b.latest_run)?.getTime() ?? 0;
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

  const handleOpenRow = useCallback(
    (index: number) => {
      const exp = paginatedExperiments[index];
      if (exp) {
        navigate(`/experiments/${encodeURIComponent(exp.experiment_id)}`);
      }
    },
    [paginatedExperiments, navigate]
  );

  const { focusedIndex, tableBodyRef } = useTableNavigation({
    rowCount: paginatedExperiments.length,
    onOpen: handleOpenRow,
    page,
    totalPages,
    onPageChange: setPage,
  });

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
    syncFiltersToUrl(selectedTags, selectedStatuses, value);
    setPage(0);
  };

  const handleTagFilter = (tags: string[]) => {
    syncFiltersToUrl(tags, selectedStatuses, nameFilter);
    setPage(0);
  };

  const handleStatusFilter = (statuses: string[]) => {
    syncFiltersToUrl(selectedTags, statuses, nameFilter);
    setPage(0);
  };

  const clearAllFilters = () => {
    syncFiltersToUrl([], [], '', { clearHasField: true });
    setPage(0);
  };

  const clearHasFieldFilter = () => {
    syncFiltersToUrl(selectedTags, selectedStatuses, nameFilter, {
      clearHasField: true,
    });
    setPage(0);
  };

  const hasActiveFilters =
    nameFilter.length > 0 ||
    selectedTags.length > 0 ||
    selectedStatuses.length > 0 ||
    !!(hasParam || hasMetric || hasDerived || hasArtifact || hasTag);

  const hasFieldFilterLabel =
    hasParam
      ? { label: 'Parameter', value: hasParam }
      : hasMetric
        ? { label: 'Metric', value: hasMetric }
        : hasDerived
          ? { label: 'Derived metric', value: hasDerived }
          : hasArtifact
            ? { label: 'Artifact', value: hasArtifact }
            : hasTag
              ? { label: 'Tag', value: hasTag }
              : null;

  const filterPills = useMemo(() => {
    const pills: { key: string; display: string; onRemove: () => void }[] = [];
    if (hasFieldFilterLabel) {
      pills.push({
        key: 'has-field',
        display: `${hasFieldFilterLabel.label}: "${hasFieldFilterLabel.value}"`,
        onRemove: clearHasFieldFilter,
      });
    }
    if (nameFilter) {
      pills.push({
        key: 'name',
        display: `Name contains "${nameFilter}"`,
        onRemove: () => {
          syncFiltersToUrl(selectedTags, selectedStatuses, '', { clearHasField: false });
          setPage(0);
        },
      });
    }
    selectedTags.forEach((tag) => {
      pills.push({
        key: `tag-${tag}`,
        display: `Tag: ${tag}`,
        onRemove: () => {
          handleTagFilter(selectedTags.filter((t) => t !== tag));
        },
      });
    });
    selectedStatuses.forEach((status) => {
      pills.push({
        key: `status-${status}`,
        display: `Status: ${status}`,
        onRemove: () => {
          handleStatusFilter(selectedStatuses.filter((s) => s !== status));
        },
      });
    });
    return pills;
  }, [
    hasFieldFilterLabel,
    nameFilter,
    selectedTags,
    selectedStatuses,
    clearHasFieldFilter,
    syncFiltersToUrl,
    handleTagFilter,
    handleStatusFilter,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasActiveFilters && (
        <FilterPills pills={filterPills} onClearAll={clearAllFilters} />
      )}

      {/* Table */}
      <TableContainer>
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
          <TableBody ref={tableBodyRef}>
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
              paginatedExperiments.map((experiment, i) => (
                <ExperimentRow
                  key={experiment.experiment_id}
                  experiment={experiment}
                  manifest={manifestMap.get(experiment.experiment_id)}
                  rowIndex={i}
                  focused={i === focusedIndex}
                />
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <PaginationBar
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        entityName="experiments"
      />
    </div>
  );
}
