import { FilterPanel } from '@/components/runs/FilterPanel';
import { PlotBuilder } from '@/components/plots/PlotBuilder';

export function PlotsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Plots</h1>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-1">
          <FilterPanel />
        </div>
        <div className="col-span-4">
          <PlotBuilder />
        </div>
      </div>
    </div>
  );
}
