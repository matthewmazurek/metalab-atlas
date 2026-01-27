import { useExperiments } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAtlasStore } from '@/store/useAtlasStore';
import type { RunStatus } from '@/api/types';
import { X } from 'lucide-react';

const STATUS_OPTIONS: RunStatus[] = ['success', 'failed', 'cancelled'];

export function FilterPanel() {
  const { filter, updateFilter, setFilter } = useAtlasStore();
  const { data: experimentsData } = useExperiments();

  const handleStatusToggle = (status: RunStatus, checked: boolean) => {
    const currentStatuses = filter.status || [];
    const newStatuses = checked
      ? [...currentStatuses, status]
      : currentStatuses.filter((s) => s !== status);
    updateFilter({ status: newStatuses.length > 0 ? newStatuses : null });
  };

  const clearFilters = () => {
    setFilter({});
  };

  const hasFilters =
    filter.experiment_id ||
    (filter.status && filter.status.length > 0);

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Filters</h3>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Experiment filter */}
      <div className="space-y-2">
        <Label>Experiment</Label>
        <Select
          value={filter.experiment_id || 'all'}
          onValueChange={(value) =>
            updateFilter({ experiment_id: value === 'all' ? null : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="All experiments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All experiments</SelectItem>
            {experimentsData?.experiments.map((exp) => (
              <SelectItem key={exp.experiment_id} value={exp.experiment_id}>
                {exp.experiment_id} ({exp.run_count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status filter */}
      <div className="space-y-2">
        <Label>Status</Label>
        <div className="space-y-2">
          {STATUS_OPTIONS.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <Checkbox
                id={`status-${status}`}
                checked={filter.status?.includes(status) || false}
                onCheckedChange={(checked) =>
                  handleStatusToggle(status, checked as boolean)
                }
              />
              <Label
                htmlFor={`status-${status}`}
                className="capitalize cursor-pointer"
              >
                {status}
              </Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
