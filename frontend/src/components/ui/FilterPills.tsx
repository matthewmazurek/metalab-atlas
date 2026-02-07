import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { FieldFilter } from '@/api/types';

export interface FilterPill {
  key: string;
  display: string;
  onRemove: () => void;
}

interface FilterPillsProps {
  pills: FilterPill[];
  onClearAll: () => void;
}

/**
 * Standardized display text for a field filter pill (runs page).
 * - Text contains: "field contains \"value\""
 * - Status: "Status: success, failed"
 * - Discrete in: "field: value1, value2" or "field: [N values]"
 * - Comparison: "field > 0.5"
 * - Run ID from plot: "Runs: 12 from plot"
 */
export function formatFieldFilterDisplay(ff: FieldFilter): string {
  if (ff.field === 'record.run_id' && ff.op === 'in' && Array.isArray(ff.value)) {
    return ff._fromPlot ? `Runs: ${ff.value.length} from plot` : `Runs: ${ff.value.length}`;
  }
  if (ff.op === 'in' && Array.isArray(ff.value)) {
    const maxShow = 3;
    if (ff.value.length <= maxShow) {
      const shown = ff.value.slice(0, maxShow).map(String).join(', ');
      return `${ff.field}: ${shown}`;
    }
    return `${ff.field}: [${ff.value.length} values]`;
  }
  if (ff.op === 'contains' && typeof ff.value === 'string') {
    return `${ff.field} contains "${ff.value}"`;
  }
  if (['eq', 'ne', 'lt', 'le', 'gt', 'ge'].includes(ff.op)) {
    return `${ff.field} ${ff.op} ${ff.value}`;
  }
  return `${ff.field} ${ff.op} ${ff.value}`;
}

export function FilterPills({ pills, onClearAll }: FilterPillsProps) {
  if (pills.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <span className="text-muted-foreground">Filters:</span>
      {pills.map((pill) => (
        <span
          key={pill.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
        >
          {pill.display}
          <button
            type="button"
            onClick={pill.onRemove}
            className="rounded hover:bg-primary/20 p-0.5 ml-0.5"
            aria-label="Remove filter"
            title="Remove filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2"
        onClick={onClearAll}
      >
        <X className="h-3 w-3 mr-1" />
        Clear all
      </Button>
    </div>
  );
}
