import { useEffect } from 'react';
import { FilterPanel } from '@/components/runs/FilterPanel';
import { RunTable } from '@/components/runs/RunTable';
import { ColumnPicker } from '@/components/runs/ColumnPicker';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/ui/typography';
import { useAtlasStore } from '@/store/useAtlasStore';
import { Link, useSearchParams } from 'react-router-dom';
import { GitCompare, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RunsPage() {
  const [searchParams] = useSearchParams();
  const {
    selectedRunIds,
    clearSelection,
    sidebarCollapsed,
    columnFilters,
    clearAllColumnFilters,
    filter,
    updateFilter,
  } = useAtlasStore();
  const hasSelection = selectedRunIds.length > 0;
  const hasActiveFilters = columnFilters.length > 0;

  // Initialize filter from URL params on mount
  useEffect(() => {
    const experimentId = searchParams.get('experiment_id');
    if (experimentId && experimentId !== filter.experiment_id) {
      updateFilter({ experiment_id: experimentId });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Header row - mirrors main content layout for alignment */}
      <div className="flex gap-4">
        {/* Left: Title (matches sidebar width) */}
        <div
          className={cn(
            'shrink-0 transition-all duration-200',
            sidebarCollapsed ? 'w-10' : 'w-64'
          )}
        >
          <PageTitle>Runs</PageTitle>
        </div>

        {/* Right: Toolbar aligned with table */}
        <div className="flex-1 min-w-0 flex items-center gap-4">
          {/* Active filters - left aligned with table */}
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

          {/* Selection controls + column picker - right aligned */}
          <div className="flex items-center gap-4 ml-auto">
            {/* Selection controls */}
            <div
              className={cn(
                'flex items-center gap-2 transition-opacity duration-150',
                !hasSelection && 'opacity-0 pointer-events-none'
              )}
            >
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {selectedRunIds.length} selected
              </span>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Link to={`/compare?runs=${selectedRunIds.join(',')}`}>
                <Button size="sm">
                  <GitCompare className="h-4 w-4 mr-2" />
                  Compare
                </Button>
              </Link>
            </div>

            {/* Column picker */}
            {filter.experiment_id && <ColumnPicker />}
          </div>
        </div>
      </div>

      {/* Main content with sidebar */}
      <div className="flex gap-4">
        {/* Sidebar */}
        <div
          className={cn(
            'shrink-0 overflow-hidden transition-all duration-200',
            sidebarCollapsed ? 'w-10' : 'w-64'
          )}
        >
          <FilterPanel />
        </div>

        {/* Table */}
        <div className="flex-1 min-w-0">
          <RunTable />
        </div>
      </div>
    </div>
  );
}
