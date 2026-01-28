import { useEffect } from 'react';
import { useFields, useAggregate, useHistogram } from '@/api/hooks';
import { useAtlasStore } from '@/store/useAtlasStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldSelector } from './FieldSelector';
import { Chart } from './Chart';
import type { AggFn, ChartType, ErrorBarType } from '@/api/types';
import { Loader2 } from 'lucide-react';

const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'scatter', label: 'Scatter' },
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'radar', label: 'Radar' },
  { value: 'candlestick', label: 'Candlestick' },
  { value: 'histogram', label: 'Histogram' },
];

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

  const isHistogram = plotConfig?.chart_type === 'histogram';

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
        chart_type: 'scatter',
        bin_count: 20,
      });
    }
  }, [plotConfig, setPlotConfig]);

  // Aggregate request for non-histogram charts
  const aggregateRequest = plotConfig && !isHistogram
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

  // Histogram request
  const histogramRequest = plotConfig && isHistogram
    ? {
      filter: filter,
      field: plotConfig.y_field,
      bin_count: plotConfig.bin_count,
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

  const {
    data: histogramData,
    isLoading: histLoading,
    isError: histError,
  } = useHistogram(
    histogramRequest!,
    !!histogramRequest && !!plotConfig?.y_field
  );

  const isLoading = isHistogram ? histLoading : aggLoading;
  const isError = isHistogram ? histError : aggError;
  const hasRequiredFields = isHistogram ? !!plotConfig?.y_field : (!!plotConfig?.x_field && !!plotConfig?.y_field);

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
          <div className="space-y-2">
            <Label>Chart Type</Label>
            <Select
              value={plotConfig?.chart_type || 'scatter'}
              onValueChange={(v) => updatePlotConfig({ chart_type: v as ChartType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHART_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isHistogram && (
            <FieldSelector
              label="X Axis"
              value={plotConfig?.x_field || ''}
              onChange={(v) => updatePlotConfig({ x_field: v })}
              fieldIndex={fieldIndex}
              placeholder="Select X field"
            />
          )}

          <FieldSelector
            label={isHistogram ? 'Field' : 'Y Axis'}
            value={plotConfig?.y_field || ''}
            onChange={(v) => updatePlotConfig({ y_field: v })}
            fieldIndex={fieldIndex}
            placeholder={isHistogram ? 'Select field' : 'Select Y field'}
            filterNumeric
          />

          {isHistogram && (
            <div className="space-y-2">
              <Label>Bin Count</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={plotConfig?.bin_count || 20}
                onChange={(e) => updatePlotConfig({ bin_count: parseInt(e.target.value) || 20 })}
              />
            </div>
          )}

          {!isHistogram && (
            <>
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>
            {isHistogram ? (
              `Distribution of ${plotConfig?.y_field || 'Field'}`
            ) : (
              <>
                {plotConfig?.y_field || 'Y'} vs {plotConfig?.x_field || 'X'}
                {plotConfig?.group_by[0] && ` (by ${plotConfig.group_by[0]})`}
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasRequiredFields ? (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              {isHistogram ? 'Select a field to create a histogram' : 'Select X and Y fields to create a plot'}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-96 text-destructive">
              Failed to load data
            </div>
          ) : (aggregateData || histogramData) ? (
            <Chart
              data={aggregateData}
              histogramData={histogramData}
              chartType={plotConfig?.chart_type || 'scatter'}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
