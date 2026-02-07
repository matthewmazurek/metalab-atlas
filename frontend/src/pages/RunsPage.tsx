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
import { useExperiments, useLatestManifest, useStatusCounts } from '@/api/hooks';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { FilterPills, formatFieldFilterDisplay } from '@/components/ui/FilterPills';
import { GitCompare, CheckCircle2, AlertTriangle, CheckSquare, BarChart3 } from 'lucide-react';

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
    filter,
    updateFilter,
    removeFieldFilter,
    clearFieldFilters,
  } = useAtlasStore();
  const selectionSummary = getSelectionSummary();
  const hasActiveSelection = hasSelection();

  const hasFieldFilters = (filter.field_filters && filter.field_filters.length > 0) ?? false;
  const hasStatusFilter = (filter.status && filter.status.length > 0) ?? false;
  const hasActiveFilters = hasFieldFilters || hasStatusFilter;

  // Clear status filter
  const clearStatusFilter = useCallback(() => {
    updateFilter({ status: null });
  }, [updateFilter]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    clearFieldFilters();
    updateFilter({ status: null });
  }, [clearFieldFilters, updateFilter]);

  // Build filter pills for FilterPills component (standardized display)
  const filterPills = useMemo(() => {
    const pills: { key: string; display: string; onRemove: () => void }[] = [];
    if (hasStatusFilter && filter.status) {
      pills.push({
        key: 'status',
        display: `Status: ${filter.status.join(', ')}`,
        onRemove: clearStatusFilter,
      });
    }
    filter.field_filters?.forEach((ff) => {
      pills.push({
        key: ff.field,
        display: formatFieldFilterDisplay(ff),
        onRemove: () => removeFieldFilter(ff.field),
      });
    });
    return pills;
  }, [
    hasStatusFilter,
    filter.status,
    filter.field_filters,
    clearStatusFilter,
    removeFieldFilter,
  ]);

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
    // Store the current filter spec and count - no need to fetch IDs!
    setSelectionFilter(filter, totalFilteredRuns);
  }, [allSelected, totalFilteredRuns, filter, setSelectionFilter]);

  // Fetch experiments for scope selector
  const { data: experimentsData } = useExperiments();
  const { data: manifest } = useLatestManifest(filter.experiment_id ?? '');
  const { data: statusCounts } = useStatusCounts(filter.experiment_id ?? '');
  const successCount = statusCounts?.success ?? 0;
  const failedCount = statusCounts?.failed ?? 0;

  // Sync experiment_id from URL on navigation (keep URL as source of truth for experiment)
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

    // Sync experiment_id and status from URL
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
      navigate('/runs');
    } else {
      updateFilter({ experiment_id: value });
      navigate(`/runs?experiment_id=${encodeURIComponent(value)}`);
    }
  }, [updateFilter, navigate]);

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
            <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
          ) : hasFailures ? (
            <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
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

  const filtersRow = hasActiveFilters ? (
    <FilterPills pills={filterPills} onClearAll={clearAllFilters} />
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
      <RunTable onTotalChange={handleTotalChange} />
    </div>
  );
}
