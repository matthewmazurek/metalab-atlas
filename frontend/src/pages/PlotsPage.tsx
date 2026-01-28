import { FilterPanel } from '@/components/runs/FilterPanel';
import { PlotBuilder } from '@/components/plots/PlotBuilder';
import { PageTitle } from '@/components/ui/typography';
import { useAtlasStore } from '@/store/useAtlasStore';
import { cn } from '@/lib/utils';

export function PlotsPage() {
  const { sidebarCollapsed } = useAtlasStore();

  return (
    <div className="space-y-4">
      {/* Header - fixed height for consistency */}
      <div className="flex items-center justify-between h-10">
        <PageTitle>Plots</PageTitle>
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

        {/* Plot builder */}
        <div className="flex-1 min-w-0">
          <PlotBuilder />
        </div>
      </div>
    </div>
  );
}
