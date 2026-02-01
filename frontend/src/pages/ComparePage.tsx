import { Link } from 'react-router-dom';
import { CompareTable } from '@/components/runs/CompareTable';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useAtlasStore } from '@/store/useAtlasStore';
import { useQuery } from '@tanstack/react-query';
import { fetchRuns } from '@/api/client';
import { queryKeys } from '@/api/hooks';
import { AlertCircle, Loader2, X, GitCompare } from 'lucide-react';

const MAX_COMPARE_RUNS = 100;

export function ComparePage() {
  const {
    selectedRunIds,
    selectionFilter,
    baselineRunId,
    setBaselineRunId,
    hasSelection,
    getSelectionSummary,
    tableSort,
  } = useAtlasStore();

  const hasActiveSelection = hasSelection();
  const selectionSummary = getSelectionSummary();

  const sort_by = tableSort?.field || 'record.started_at';
  const sort_order = tableSort?.order || 'desc';

  const shouldFetchFilterSelection =
    selectionFilter !== null && selectionFilter.count <= MAX_COMPARE_RUNS;

  const filterSelectionQuery = useQuery({
    queryKey: queryKeys.runs({
      filter: selectionFilter?.filter,
      limit: MAX_COMPARE_RUNS,
      offset: 0,
      sort_by,
      sort_order,
    }),
    queryFn: () =>
      fetchRuns({
        filter: selectionFilter!.filter,
        limit: MAX_COMPARE_RUNS,
        offset: 0,
        sort_by,
        sort_order,
      }),
    enabled: shouldFetchFilterSelection,
  });

  const compareRunIds =
    selectionFilter !== null
      ? (filterSelectionQuery.data?.runs.map((r) => r.record.run_id) ?? [])
      : selectedRunIds;

  // Compare page only works with explicit selection (reasonable number of runs)
  // Filter-based selection (potentially 300k+ runs) isn't suitable for comparison
  if (!hasActiveSelection) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compare Runs" />

        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GitCompare className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No runs selected</h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            Select runs from the Runs page to compare them side by side.
          </p>
          <Link to="/runs">
            <Button>Go to Runs</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Filter-based selection isn't practical for comparison when it exceeds our cap.
  // But if the filter selection is small (<= MAX_COMPARE_RUNS), we can safely
  // fetch the matching run IDs and compare them.
  if (selectionFilter !== null && selectionFilter.count > MAX_COMPARE_RUNS) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compare Runs" />

        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GitCompare className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Too many runs to compare</h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            You have {selectionSummary.count.toLocaleString()} runs selected via "Select All".
            Comparison works best with a smaller set of runs (up to {MAX_COMPARE_RUNS}).
            Please select specific runs individually.
          </p>
          <Link to="/runs">
            <Button>Go to Runs</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Loading state for small filter-based selection.
  if (selectionFilter !== null && filterSelectionQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compare" />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (selectionFilter !== null && filterSelectionQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compare" />
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <AlertCircle className="h-12 w-12 mb-4 opacity-70" />
          <h3 className="text-lg font-medium mb-2 text-foreground">Failed to load selected runs</h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            Your selection is based on a filter. We couldn't fetch the selected run IDs for comparison.
          </p>
          <Link to="/runs">
            <Button>Go to Runs</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Too many explicit runs selected
  if (selectionFilter === null && selectedRunIds.length > MAX_COMPARE_RUNS) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compare Runs" />

        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GitCompare className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Too many runs to compare</h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            You have {selectedRunIds.length} runs selected.
            Comparison works best with up to {MAX_COMPARE_RUNS} runs.
          </p>
          <Link to="/runs">
            <Button>Go to Runs</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Context: selection summary
  const contextRow = (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        Comparing <span className="font-medium text-foreground">{compareRunIds.length}</span> run{compareRunIds.length !== 1 ? 's' : ''}
      </span>
    </div>
  );

  // Actions: baseline controls
  const actionsRow = baselineRunId ? (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setBaselineRunId(null)}
    >
      <X className="h-4 w-4 mr-2" />
      Clear baseline
    </Button>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compare"
        context={contextRow}
        actions={actionsRow}
      />

      <CompareTable runIds={compareRunIds} />
    </div>
  );
}
