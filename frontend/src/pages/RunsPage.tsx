import { useCallback, useEffect, useState } from 'react';
import { RunTable } from '@/components/runs/RunTable';
import { ColumnPicker } from '@/components/runs/ColumnPicker';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useAtlasStore } from '@/store/useAtlasStore';
import { useExperiments, useLatestManifest, useRuns } from '@/api/hooks';
import { fetchRuns } from '@/api/client';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { GitCompare, X, CheckCircle2, AlertTriangle, CheckSquare, BarChart3, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    setSelectedRunIds,
    clearSelection,
    columnFilters,
    clearAllColumnFilters,
    filter,
    updateFilter,
    getFieldFilters,
  } = useAtlasStore();
  const hasSelection = selectedRunIds.length > 0;
  const hasActiveFilters = columnFilters.length > 0;

  // Track total count of filtered runs
  const [totalFilteredRuns, setTotalFilteredRuns] = useState(0);
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  const handleTotalChange = useCallback((total: number) => {
    setTotalFilteredRuns(total);
  }, []);

  // Check if all filtered runs are selected
  const allSelected = totalFilteredRuns > 0 && selectedRunIds.length >= totalFilteredRuns;

  // Select all filtered runs (fetches all run IDs from the server with pagination)
  const handleSelectAll = useCallback(async () => {
    if (allSelected || totalFilteredRuns === 0) return;

    setIsSelectingAll(true);
    try {
      // Build the merged filter (same as RunTable uses internally)
      const fieldFilters = getFieldFilters();
      const mergedFilter = fieldFilters.length > 0
        ? {
          ...filter,
          field_filters: [...(filter.field_filters || []), ...fieldFilters],
        }
        : filter;

      // Fetch all run IDs matching the current filter (paginated, max 1000 per request)
      const allRunIds: string[] = [];
      const pageSize = 1000;
      let offset = 0;
      let total = 0;

      do {
        const response = await fetchRuns({
          filter: mergedFilter,
          limit: pageSize,
          offset: offset,
        });

        total = response.total;
        const runIds = response.runs.map((run) => run.record.run_id);
        allRunIds.push(...runIds);
        offset += pageSize;
      } while (offset < total);

      setSelectedRunIds(allRunIds);
    } catch (error) {
      console.error('Failed to select all runs:', error);
    } finally {
      setIsSelectingAll(false);
    }
  }, [allSelected, totalFilteredRuns, filter, getFieldFilters, setSelectedRunIds]);

  // Fetch experiments for the dropdown
  const { data: experimentsData } = useExperiments();
  const { data: manifest } = useLatestManifest(filter.experiment_id ?? '');
  const { successCount, failedCount } = useStatusCounts(filter.experiment_id ?? null);

  // Initialize filter from URL params on mount
  useEffect(() => {
    const experimentId = searchParams.get('experiment_id');
    if (experimentId && experimentId !== filter.experiment_id) {
      updateFilter({ experiment_id: experimentId });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get display name for current experiment
  const currentExperimentName = manifest?.name || filter.experiment_id || 'All experiments';
  const expectedTotal = manifest?.total_runs;

  // Build experiment dropdown items
  const experimentDropdownItems = [
    { label: 'All experiments', value: '_all', href: '/runs' },
    ...(experimentsData?.experiments || []).map((exp) => ({
      label: exp.experiment_id,
      value: exp.experiment_id,
      href: `/runs?experiment_id=${encodeURIComponent(exp.experiment_id)}`,
    })),
  ];

  // Handle experiment selection from dropdown
  const handleExperimentSelect = (value: string) => {
    if (value === '_all') {
      updateFilter({ experiment_id: null });
      navigate('/runs');
    } else {
      updateFilter({ experiment_id: value });
      navigate(`/runs?experiment_id=${encodeURIComponent(value)}`);
    }
  };

  // Build breadcrumb items
  const breadcrumbItems = filter.experiment_id
    ? [
      { label: 'Experiments', href: '/experiments' },
      {
        label: currentExperimentName,
        href: `/experiments/${encodeURIComponent(filter.experiment_id)}`,
        dropdown: {
          items: experimentDropdownItems,
          selectedValue: filter.experiment_id,
          onSelect: handleExperimentSelect,
        },
      },
      { label: 'Runs' },
    ]
    : [
      { label: 'Experiments', href: '/experiments' },
      {
        label: 'All experiments',
        dropdown: {
          items: experimentDropdownItems,
          selectedValue: '_all',
          onSelect: handleExperimentSelect,
        },
      },
      { label: 'Runs' },
    ];

  // Stats display for title area
  // Visual guide: green check = all success, warning = has failures, no icon = in progress
  const completedRuns = successCount + failedCount;
  const isComplete = expectedTotal != null && completedRuns >= expectedTotal;
  const hasFailures = failedCount > 0;
  const isAllSuccess = isComplete && !hasFailures;

  const statsDisplay = filter.experiment_id ? (
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
    </div>
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runs"
        breadcrumb={breadcrumbItems}
        backTo={filter.experiment_id ? `/experiments/${encodeURIComponent(filter.experiment_id)}` : undefined}
        titleExtra={statsDisplay}
      />

      {/* Toolbar row */}
      <div className="flex items-center gap-4">
        {/* Active filters */}
        <div
          className={cn(
            'flex items-center gap-2 flex-wrap text-sm transition-opacity duration-150',
            !hasActiveFilters && 'opacity-0 pointer-events-none'
          )}
        >
          <span className="text-muted-foreground">Filters:</span>
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
            onClick={clearAllColumnFilters}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>

        {/* Right-aligned controls: Selection + Actions + Columns */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Selection count (only when some selected) */}
          {hasSelection && (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {selectedRunIds.length} selected
            </span>
          )}

          {/* Select All button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={totalFilteredRuns === 0 || allSelected || isSelectingAll}
            title={allSelected ? 'All runs selected' : 'Select all filtered runs'}
          >
            {isSelectingAll ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckSquare className="h-4 w-4 mr-2" />
            )}
            Select All
          </Button>

          {/* Clear button (only when some selected) */}
          {hasSelection && (
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          )}

          {/* Plot button (only when some selected) */}
          {hasSelection && (
            <Link to={`/plots?runs=${selectedRunIds.join(',')}`}>
              <Button size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Plot
              </Button>
            </Link>
          )}

          {/* Compare button (only when some selected) */}
          {hasSelection && (
            <Link to={`/compare?runs=${selectedRunIds.join(',')}`}>
              <Button size="sm">
                <GitCompare className="h-4 w-4 mr-2" />
                Compare
              </Button>
            </Link>
          )}

          {/* Column picker */}
          {filter.experiment_id && <ColumnPicker />}
        </div>
      </div>

      {/* Full-width table */}
      <RunTable onTotalChange={handleTotalChange} />
    </div>
  );
}
