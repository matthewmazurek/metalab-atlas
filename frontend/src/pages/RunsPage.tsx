import { useCallback, useEffect, useMemo, useState } from 'react';
import { RunTable } from '@/components/runs/RunTable';
import { ColumnPicker } from '@/components/runs/ColumnPicker';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAtlasStore } from '@/store/useAtlasStore';
import { useExperiments, useLatestManifest, useRuns } from '@/api/hooks';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { GitCompare, X, CheckCircle2, AlertTriangle, CheckSquare, BarChart3 } from 'lucide-react';
import type { FieldFilter, FilterOp } from '@/api/types';

function isFilterOp(op: unknown): op is FilterOp {
  return op === 'eq' || op === 'ne' || op === 'lt' || op === 'le' || op === 'gt' || op === 'ge'
    || op === 'contains' || op === 'in';
}

function isFieldFilter(v: unknown): v is FieldFilter {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as { field?: unknown; op?: unknown; value?: unknown };
  return typeof obj.field === 'string' && isFilterOp(obj.op) && 'value' in obj;
}

/**
 * Hook to get status counts for an experiment
 */
function useStatusCounts(experimentId: string | null) {
  const { data: successData } = useRuns({
    filter: {
      experiment_id: experimentId ?? undefined,
      status: ['success'],
    },
    limit: 1,
  });

  const { data: failedData } = useRuns({
    filter: {
      experiment_id: experimentId ?? undefined,
      status: ['failed'],
    },
    limit: 1,
  });

  return {
    successCount: successData?.total ?? 0,
    failedCount: failedData?.total ?? 0,
  };
}

export function RunsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    selectedRunIds,
    selectionFilter,
    setSelectionFilter,
    clearSelection,
    hasSelection,
    getSelectionSummary,
    columnFilters,
    clearAllColumnFilters,
    filter,
    updateFilter,
    getFieldFilters,
  } = useAtlasStore();
  const selectionSummary = getSelectionSummary();
  const hasActiveSelection = hasSelection();

  // URL-based field filters (derived from URL, NOT stored in global filter)
  // This prevents pollution of the global filter state when navigating from plots.
  const urlFieldFilters = useMemo((): FieldFilter[] => {
    const fieldFiltersParam = searchParams.get('field_filters');
    if (!fieldFiltersParam) return [];
    try {
      const parsedFilters = JSON.parse(fieldFiltersParam);
      return Array.isArray(parsedFilters) ? parsedFilters.filter(isFieldFilter) : [];
    } catch {
      return [];
    }
  }, [searchParams]);

  const hasUrlFilters = urlFieldFilters.length > 0;
  const hasColumnFilters = columnFilters.length > 0;
  const hasStatusFilter = (filter.status && filter.status.length > 0) ?? false;
  const hasActiveFilters = hasUrlFilters || hasColumnFilters || hasStatusFilter;

  // Clear a specific URL field filter
  const clearUrlFilter = useCallback((index: number) => {
    const newFieldFilters = urlFieldFilters.filter((_, i) => i !== index);
    // Update URL
    const newParams = new URLSearchParams(searchParams);
    if (newFieldFilters.length > 0) {
      newParams.set('field_filters', JSON.stringify(newFieldFilters));
    } else {
      newParams.delete('field_filters');
    }
    // Preserve experiment_id if present
    const experimentId = searchParams.get('experiment_id');
    if (experimentId && !newParams.has('experiment_id')) {
      newParams.set('experiment_id', experimentId);
    }
    navigate(`/runs${newParams.toString() ? `?${newParams.toString()}` : ''}`);
  }, [urlFieldFilters, searchParams, navigate]);

  // Clear status filter
  const clearStatusFilter = useCallback(() => {
    updateFilter({ status: null });
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('status');
    navigate(`/runs${newParams.toString() ? `?${newParams.toString()}` : ''}`);
  }, [searchParams, navigate, updateFilter]);

  // Clear all filters (both URL and column)
  const clearAllFilters = useCallback(() => {
    clearAllColumnFilters();
    updateFilter({ status: null });
    // Preserve experiment_id
    const experimentId = searchParams.get('experiment_id');
    navigate(experimentId ? `/runs?experiment_id=${encodeURIComponent(experimentId)}` : '/runs');
  }, [clearAllColumnFilters, searchParams, navigate, updateFilter]);

  // Format a field filter for display
  const formatUrlFilter = (ff: typeof urlFieldFilters[0]) => {
    if (ff.field === 'record.run_id' && ff.op === 'in' && Array.isArray(ff.value)) {
      return `${ff.value.length} runs from plot`;
    }
    if (ff.op === 'in' && Array.isArray(ff.value)) {
      return `${ff.field}: [${ff.value.length}]`;
    }
    return `${ff.field} ${ff.op} ${ff.value}`;
  };

  // Track total count of filtered runs
  const [totalFilteredRuns, setTotalFilteredRuns] = useState(0);

  const handleTotalChange = useCallback((total: number) => {
    setTotalFilteredRuns(total);
  }, []);

  // Check if all filtered runs are selected (either via filter or explicit IDs)
  const allSelected = selectionFilter !== null ||
    (totalFilteredRuns > 0 && selectedRunIds.length >= totalFilteredRuns);

  // Select all filtered runs - stores the filter spec instead of fetching IDs
  // This is instant even for 300k+ runs
  const handleSelectAll = useCallback(() => {
    if (allSelected || totalFilteredRuns === 0) return;

    // Build the merged filter (same as RunTable uses internally)
    // Include: global filter + URL field filters + column filters
    const columnFieldFilters = getFieldFilters();
    const allFieldFilters = [...urlFieldFilters, ...columnFieldFilters];
    const mergedFilter = allFieldFilters.length > 0
      ? {
        ...filter,
        field_filters: [...(filter.field_filters || []), ...allFieldFilters],
      }
      : filter;

    // Store the filter spec and count - no need to fetch IDs!
    setSelectionFilter(mergedFilter, totalFilteredRuns);
  }, [allSelected, totalFilteredRuns, filter, urlFieldFilters, getFieldFilters, setSelectionFilter]);

  // Fetch experiments for scope selector
  const { data: experimentsData } = useExperiments();
  const { data: manifest } = useLatestManifest(filter.experiment_id ?? '');
  const { successCount, failedCount } = useStatusCounts(filter.experiment_id ?? null);

  // Sync filter state from URL params
  // URL is source of truth for experiment_id and status when present
  // Note: field_filters are handled separately via local state (urlFieldFilters)
  useEffect(() => {
    const experimentId = searchParams.get('experiment_id');
    const statusParam = searchParams.get('status');

    // Parse status param (can be single value or comma-separated)
    let statusFilter: ('success' | 'failed' | 'running' | 'cancelled')[] | null = null;
    if (statusParam) {
      const statuses = statusParam.split(',').filter(s =>
        ['success', 'failed', 'running', 'cancelled'].includes(s)
      ) as ('success' | 'failed' | 'running' | 'cancelled')[];
      if (statuses.length > 0) {
        statusFilter = statuses;
      }
    }

    // Always sync both experiment_id and status from URL
    // This ensures URL is the source of truth on navigation
    updateFilter({
      experiment_id: experimentId || null,
      status: statusFilter,
    });
  }, [searchParams, updateFilter]);

  // Get display name for current experiment
  const currentExperimentName = manifest?.name || filter.experiment_id;
  const expectedTotal = manifest?.total_runs;

  // Handle scope change
  const handleScopeChange = useCallback((value: string) => {
    if (value === '_all') {
      updateFilter({ experiment_id: null });
      // Update URL, preserving other params
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('experiment_id');
      navigate(`/runs${newParams.toString() ? `?${newParams.toString()}` : ''}`);
    } else {
      updateFilter({ experiment_id: value });
      const newParams = new URLSearchParams(searchParams);
      newParams.set('experiment_id', value);
      navigate(`/runs?${newParams.toString()}`);
    }
  }, [updateFilter, searchParams, navigate]);

  // Stats display (only when scoped to experiment)
  const completedRuns = successCount + failedCount;
  const isComplete = expectedTotal != null && completedRuns >= expectedTotal;
  const hasFailures = failedCount > 0;
  const isAllSuccess = isComplete && !hasFailures;

  // Context: Scope selector + stats
  const contextRow = (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Scope:</span>
      <Select
        value={filter.experiment_id ?? '_all'}
        onValueChange={handleScopeChange}
      >
        <SelectTrigger className="w-[280px]" size="sm">
          <SelectValue placeholder="All experiments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All experiments</SelectItem>
          {experimentsData?.experiments.map((exp) => (
            <SelectItem key={exp.experiment_id} value={exp.experiment_id}>
              {exp.experiment_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Stats (only when scoped to experiment) */}
      {filter.experiment_id && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {isAllSuccess ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          ) : hasFailures ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          ) : null}
          <span className="font-medium text-foreground">{completedRuns}</span>
          {expectedTotal != null && (
            <>
              <span>/</span>
              <span>{expectedTotal}</span>
            </>
          )}
          {currentExperimentName && currentExperimentName !== filter.experiment_id && (
            <span className="text-muted-foreground ml-1">({currentExperimentName})</span>
          )}
        </div>
      )}
    </div>
  );

  // Filters: URL + column + status filters
  const filtersRow = hasActiveFilters ? (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <span className="text-muted-foreground">Filters:</span>
      {/* Status filter (from URL) */}
      {hasStatusFilter && filter.status && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
        >
          status: {filter.status.join(', ')}
          <button
            onClick={clearStatusFilter}
            className="ml-1 hover:text-primary/70"
            title="Remove filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
      {/* URL-based field filters (e.g., from plot click-through) */}
      {urlFieldFilters.map((ff, index) => (
        <span
          key={`url-${index}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
        >
          {formatUrlFilter(ff)}
          <button
            onClick={() => clearUrlFilter(index)}
            className="ml-1 hover:text-primary/70"
            title="Remove filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {/* Column filters */}
      {columnFilters.map((cf) => (
        <span
          key={cf.columnId}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
        >
          {cf.columnId}:{' '}
          {cf.values && cf.values.length > 0
            ? `[${cf.values.length}]`
            : `"${cf.value}"`}
        </span>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2"
        onClick={clearAllFilters}
      >
        <X className="h-3 w-3 mr-1" />
        Clear all
      </Button>
    </div>
  ) : null;

  // Actions: Selection controls + column picker
  const actionsRow = (
    <div className="flex items-center gap-2">
      {/* Selection count (only when some selected) */}
      {hasActiveSelection && (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {selectionSummary.count.toLocaleString()} selected
          {selectionSummary.type === 'filter' && ' (all)'}
        </span>
      )}

      {/* Select All button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSelectAll}
        disabled={totalFilteredRuns === 0 || allSelected}
        title={allSelected ? 'All runs selected' : 'Select all filtered runs'}
      >
        <CheckSquare className="h-4 w-4 mr-2" />
        Select All
      </Button>

      {/* Clear button (only when some selected) */}
      {hasActiveSelection && (
        <Button variant="outline" size="sm" onClick={clearSelection}>
          Clear
        </Button>
      )}

      {/* Plot button (only when some selected) */}
      {hasActiveSelection && (
        <Link to="/plots">
          <Button size="sm">
            <BarChart3 className="h-4 w-4 mr-2" />
            Plot
          </Button>
        </Link>
      )}

      {/* Compare button (only when some selected) */}
      {hasActiveSelection && (
        <Link to="/compare">
          <Button size="sm">
            <GitCompare className="h-4 w-4 mr-2" />
            Compare
          </Button>
        </Link>
      )}

      {/* Column picker */}
      {filter.experiment_id && <ColumnPicker />}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runs"
        actions={actionsRow}
        context={contextRow}
        filters={filtersRow}
      />

      {/* Full-width table */}
      <RunTable onTotalChange={handleTotalChange} urlFieldFilters={urlFieldFilters} />
    </div>
  );
}
