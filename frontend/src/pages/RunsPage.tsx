import { FilterPanel } from '@/components/runs/FilterPanel';
import { RunTable } from '@/components/runs/RunTable';
import { Button } from '@/components/ui/button';
import { useAtlasStore } from '@/store/useAtlasStore';
import { Link } from 'react-router-dom';
import { GitCompare } from 'lucide-react';

export function RunsPage() {
  const { selectedRunIds, clearSelection } = useAtlasStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Runs</h1>
        {selectedRunIds.length > 0 && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {selectedRunIds.length} run{selectedRunIds.length > 1 ? 's' : ''} selected
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
        )}
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1">
          <FilterPanel />
        </div>
        <div className="col-span-3">
          <RunTable />
        </div>
      </div>
    </div>
  );
}
