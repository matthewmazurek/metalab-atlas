import { useMemo } from 'react';
import { useFields } from '@/api/hooks';
import { useAtlasStore } from '@/store/useAtlasStore';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Settings2 } from 'lucide-react';

export function ColumnPicker() {
  const { filter, setVisibleColumns, visibleColumns } = useAtlasStore();
  const experimentId = filter.experiment_id ?? '_all';
  const { data: fieldsData } = useFields(filter.experiment_id ?? undefined);

  // Get available fields from the field index
  const availableFields = useMemo(() => {
    if (!fieldsData) return { params: [], metrics: [] };
    return {
      params: Object.keys(fieldsData.params_fields || {}),
      metrics: Object.keys(fieldsData.metrics_fields || {}),
    };
  }, [fieldsData]);

  // Get current visible columns, or default to first 2 params + first 2 metrics
  // Note: We subscribe to visibleColumns directly (not via getVisibleColumns)
  // because Zustand's get() doesn't trigger re-renders
  const currentVisible = useMemo(() => {
    const stored = visibleColumns[experimentId];
    if (stored) return stored;
    // Default selection
    return [
      ...availableFields.params.slice(0, 2),
      ...availableFields.metrics.slice(0, 2),
    ];
  }, [experimentId, availableFields, visibleColumns]);

  const toggleColumn = (columnId: string) => {
    const newVisible = currentVisible.includes(columnId)
      ? currentVisible.filter((c) => c !== columnId)
      : [...currentVisible, columnId];
    setVisibleColumns(experimentId, newVisible);
  };

  const selectAll = () => {
    setVisibleColumns(experimentId, [
      ...availableFields.params,
      ...availableFields.metrics,
    ]);
  };

  const clearAll = () => {
    setVisibleColumns(experimentId, []);
  };

  const hasFields = availableFields.params.length > 0 || availableFields.metrics.length > 0;

  // Don't show if no experiment selected (no dynamic columns)
  if (!filter.experiment_id) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" title="Configure columns">
          <Settings2 className="h-4 w-4 mr-2" />
          Columns
          {currentVisible.length > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({currentVisible.length})
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Visible Columns</span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={selectAll}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={clearAll}
            >
              None
            </Button>
          </div>
        </DropdownMenuLabel>

        {!hasFields ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No fields available
          </div>
        ) : (
          <ScrollArea className="h-64">
            {/* Params section */}
            {availableFields.params.length > 0 && (
              <div className="px-2 py-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Parameters
                </div>
                <div className="space-y-1">
                  {availableFields.params.map((field) => (
                    <label
                      key={field}
                      className="flex items-center gap-2 px-1 py-1 hover:bg-accent rounded cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={currentVisible.includes(field)}
                        onCheckedChange={() => toggleColumn(field)}
                      />
                      <span className="truncate" title={field}>
                        {field}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {availableFields.params.length > 0 && availableFields.metrics.length > 0 && (
              <Separator className="my-2" />
            )}

            {/* Metrics section */}
            {availableFields.metrics.length > 0 && (
              <div className="px-2 py-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Metrics
                </div>
                <div className="space-y-1">
                  {availableFields.metrics.map((field) => (
                    <label
                      key={field}
                      className="flex items-center gap-2 px-1 py-1 hover:bg-accent rounded cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={currentVisible.includes(field)}
                        onCheckedChange={() => toggleColumn(field)}
                      />
                      <span className="truncate" title={field}>
                        {field}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
