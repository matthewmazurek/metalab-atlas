import { useEffect } from 'react';
import { useFields, useAggregate } from '@/api/hooks';
import { useAtlasStore } from '@/store/useAtlasStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldSelector } from './FieldSelector';
import { Chart } from './Chart';
import type { AggFn, ErrorBarType } from '@/api/types';
import { Loader2 } from 'lucide-react';

const AGG_OPTIONS: { value: AggFn; label: string }[] = [
  { value: 'mean', label: 'Mean' },
  { value: 'median', label: 'Median' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
];

const ERROR_OPTIONS: { value: ErrorBarType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'std', label: 'Standard Deviation' },
  { value: 'sem', label: 'Standard Error' },
  { value: 'ci95', label: '95% CI' },
];

export function PlotBuilder() {
  const { filter, plotConfig, setPlotConfig, updatePlotConfig } = useAtlasStore();
  const { data: fieldIndex, isLoading: fieldsLoading } = useFields(filter.experiment_id || undefined);

  // Initialize plot config if not set
  useEffect(() => {
    if (!plotConfig) {
      setPlotConfig({
        x_field: '',
        y_field: '',
        group_by: [],
        agg_fn: 'mean',
        error_bars: 'std',
        reduce_replicates: true,
      });
    }
  }, [plotConfig, setPlotConfig]);

  const aggregateRequest = plotConfig
    ? {
        filter: filter,
        x_field: plotConfig.x_field,
        y_field: plotConfig.y_field,
        group_by: plotConfig.group_by.length > 0 ? plotConfig.group_by : undefined,
        agg_fn: plotConfig.agg_fn,
        error_bars: plotConfig.error_bars,
        reduce_replicates: plotConfig.reduce_replicates,
      }
    : null;

  const {
    data: aggregateData,
    isLoading: aggLoading,
    isError: aggError,
  } = useAggregate(
    aggregateRequest!,
    !!aggregateRequest && !!plotConfig?.x_field && !!plotConfig?.y_field
  );

  if (fieldsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-6">
      {/* Controls */}
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle>Plot Builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldSelector
            label="X Axis"
            value={plotConfig?.x_field || ''}
            onChange={(v) => updatePlotConfig({ x_field: v })}
            fieldIndex={fieldIndex}
            placeholder="Select X field"
          />

          <FieldSelector
            label="Y Axis"
            value={plotConfig?.y_field || ''}
            onChange={(v) => updatePlotConfig({ y_field: v })}
            fieldIndex={fieldIndex}
            placeholder="Select Y field"
            filterNumeric
          />

          <FieldSelector
            label="Group By"
            value={plotConfig?.group_by[0] || ''}
            onChange={(v) => updatePlotConfig({ group_by: v ? [v] : [] })}
            fieldIndex={fieldIndex}
            placeholder="None"
            allowEmpty
          />

          <div className="space-y-2">
            <Label>Aggregation</Label>
            <Select
              value={plotConfig?.agg_fn || 'mean'}
              onValueChange={(v) => updatePlotConfig({ agg_fn: v as AggFn })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGG_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Error Bars</Label>
            <Select
              value={plotConfig?.error_bars || 'none'}
              onValueChange={(v) => updatePlotConfig({ error_bars: v as ErrorBarType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ERROR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="reduce-replicates"
              checked={plotConfig?.reduce_replicates ?? true}
              onCheckedChange={(checked) =>
                updatePlotConfig({ reduce_replicates: checked as boolean })
              }
            />
            <Label htmlFor="reduce-replicates" className="cursor-pointer">
              Aggregate replicates
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>
            {plotConfig?.y_field || 'Y'} vs {plotConfig?.x_field || 'X'}
            {plotConfig?.group_by[0] && ` (by ${plotConfig.group_by[0]})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!plotConfig?.x_field || !plotConfig?.y_field ? (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              Select X and Y fields to create a plot
            </div>
          ) : aggLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : aggError ? (
            <div className="flex items-center justify-center h-96 text-destructive">
              Failed to load data
            </div>
          ) : aggregateData ? (
            <Chart data={aggregateData} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
