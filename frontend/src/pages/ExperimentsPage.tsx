import { FilterPanel } from '@/components/runs/FilterPanel';
import { ExperimentDetailPanel } from '@/components/experiments/ExperimentDetailPanel';
import { PageTitle } from '@/components/ui/typography';
import { useAtlasStore } from '@/store/useAtlasStore';
import { cn } from '@/lib/utils';

export function ExperimentsPage() {
  const { filter, sidebarCollapsed } = useAtlasStore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageTitle>Experiments</PageTitle>

      {/* Main content with master-detail layout */}
      <div className="flex gap-4 h-[calc(100vh-12rem)]">
        {/* Left panel: Reuse FilterPanel from RunsPage */}
        <div
          className={cn(
            'shrink-0 transition-all duration-200',
            sidebarCollapsed ? 'w-10' : 'w-64'
          )}
        >
          <FilterPanel />
        </div>

        {/* Right panel: Experiment detail */}
        <div className="flex-1 border rounded-lg bg-card overflow-hidden">
          <ExperimentDetailPanel
            experimentId={filter.experiment_id ?? null}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
