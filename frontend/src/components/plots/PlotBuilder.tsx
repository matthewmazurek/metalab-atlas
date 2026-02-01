import { useEffect, useMemo, useState } from 'react';
import { useFields, useFieldValues } from '@/api/hooks';
import { useAtlasStore } from '@/store/useAtlasStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FieldSelector } from './FieldSelector';
import { Chart } from './Chart';
import type { AggFn, ChartType, ErrorBarType, FilterSpec, HistogramResponse } from '@/api/types';
import { AlertCircle, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'scatter', label: 'Scatter' },
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'histogram', label: 'Histogram' },
];

const AGG_OPTIONS: { value: AggFn; label: string }[] = [
  { value: 'none', label: 'None (raw points)' },
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
];

// Compute histogram bins from raw values (client-side)
function computeHistogram(
  values: (number | string | null)[],
  binCount: number
): HistogramResponse {
  const numericValues = values
    .map(v => typeof v === 'string' ? parseFloat(v) : v)
    .filter((v): v is number => v !== null && !isNaN(v));

  if (numericValues.length === 0) {
    return { field: '', bins: [0, 1], counts: [0], total: 0 };
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const binWidth = (max - min) / binCount || 1;

  const bins: number[] = [];
  for (let i = 0; i <= binCount; i++) {
    bins.push(min + i * binWidth);
  }

  const counts = new Array(binCount).fill(0);
  for (const v of numericValues) {
    const binIndex = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
    counts[binIndex]++;
  }

  return { field: '', bins, counts, total: numericValues.length };
}

interface PlotBuilderProps {
  /** Optional list of run IDs to filter the plot data to (for explicit selection) */
  runIds?: string[];
  /** Optional filter spec to use directly (for filter-based selection) */
  selectionFilter?: FilterSpec;
}

export function PlotBuilder({ runIds, selectionFilter }: PlotBuilderProps) {
  const { filter, plotConfig, setPlotConfig, updatePlotConfig } = useAtlasStore();
  const { data: fieldIndex, isLoading: fieldsLoading } = useFields(filter.experiment_id || undefined);

  // Seed for reproducible sampling
  const [sampleSeed, setSampleSeed] = useState(42);

  // Build filter with optional run ID or filter-based selection
  const effectiveFilter: FilterSpec = useMemo(() => {
    // If we have a selection filter (from "Select All"), use it directly
    // This is much more efficient than passing 300k+ run IDs
    if (selectionFilter) {
      return selectionFilter;
    }

    // If we have explicit run IDs, add them as a field filter
    if (runIds && runIds.length > 0) {
      return {
        ...filter,
        field_filters: [
          ...(filter.field_filters || []),
          {
            field: 'record.run_id',
            op: 'in',
            value: runIds,
          },
        ],
      };
    }

    // Fallback to global filter (shouldn't happen with mandatory selection)
    return filter;
  }, [filter, runIds, selectionFilter]);

  const isHistogram = plotConfig?.chart_type === 'histogram';
  const isAggregating = plotConfig?.agg_fn && plotConfig.agg_fn !== 'none';

  // Initialize plot config if not set
  useEffect(() => {
    if (!plotConfig) {
      setPlotConfig({
        x_field: '',
        y_field: '',
        group_by: [],
        chart_type: 'scatter',
        bin_count: 20,
        agg_fn: 'none',
        error_bars: 'none',
        aggregate_replicates: true,
      });
    }
  }, [plotConfig, setPlotConfig]);

  // Determine which fields to fetch
  const fieldsToFetch = useMemo(() => {
    if (!plotConfig) return [];
    if (isHistogram) {
      return plotConfig.y_field ? [plotConfig.y_field] : [];
    }
    const fields: string[] = [];
    if (plotConfig.x_field) fields.push(plotConfig.x_field);
    if (plotConfig.y_field) fields.push(plotConfig.y_field);
    if (plotConfig.group_by?.[0]) fields.push(plotConfig.group_by[0]);
    // When NOT aggregating replicates, we need seed_fingerprint to show individual seeds
    if (isAggregating && !plotConfig.aggregate_replicates) {
      fields.push('record.seed_fingerprint');
    }
    return fields;
  }, [plotConfig, isHistogram, isAggregating]);

  // Fetch field values
  const {
    data: fieldValuesData,
    isLoading: valuesLoading,
    isError: valuesError,
  } = useFieldValues(
    {
      filter: effectiveFilter,
      fields: fieldsToFetch,
      max_points: 10000,
      include_run_ids: true,
      seed: sampleSeed,
    },
    fieldsToFetch.length > 0
  );

  // Handler to resample with a new random seed
  const handleResample = () => {
    setSampleSeed(Math.floor(Math.random() * 100000));
  };

  // Compute histogram data client-side
  const histogramData = useMemo((): HistogramResponse | null => {
    if (!isHistogram || !fieldValuesData || !plotConfig?.y_field) return null;
    const values = fieldValuesData.fields[plotConfig.y_field] || [];
    return computeHistogram(values, plotConfig.bin_count || 20);
  }, [isHistogram, fieldValuesData, plotConfig]);

  const isLoading = valuesLoading;
  const isError = valuesError;
  const hasRequiredFields = isHistogram ? !!plotConfig?.y_field : (!!plotConfig?.x_field && !!plotConfig?.y_field);
  const isSampled = fieldValuesData?.sampled ?? false;

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
                  value={plotConfig?.agg_fn || 'none'}
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

              {isAggregating && (
                <>
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
                      id="aggregate-replicates"
                      checked={plotConfig?.aggregate_replicates ?? true}
                      onCheckedChange={(checked) =>
                        updatePlotConfig({ aggregate_replicates: checked as boolean })
                      }
                    />
                    <Label htmlFor="aggregate-replicates" className="cursor-pointer text-sm">
                      Aggregate replicates
                    </Label>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="col-span-3">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          {/* Sampling indicator with resample button */}
          {isSampled && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Sampled ({fieldValuesData?.returned?.toLocaleString()} of {fieldValuesData?.total?.toLocaleString()})
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResample}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Draw a new random sample"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Resample
              </Button>
            </div>
          )}
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
            <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>Failed to load plot data</p>
            </div>
          ) : (fieldValuesData || histogramData) ? (
            <Chart
              fieldValuesData={fieldValuesData}
              histogramData={histogramData}
              chartType={plotConfig?.chart_type || 'scatter'}
              xField={plotConfig?.x_field}
              yField={plotConfig?.y_field}
              groupByField={plotConfig?.group_by?.[0]}
              aggFn={plotConfig?.agg_fn || 'none'}
              errorBars={plotConfig?.error_bars || 'none'}
              aggregateReplicates={plotConfig?.aggregate_replicates ?? true}
              experimentId={filter.experiment_id || undefined}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
