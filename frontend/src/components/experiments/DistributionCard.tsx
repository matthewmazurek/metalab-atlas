/**
 * DistributionCard - Shows histogram distribution for a metric on the experiment page.
 * Delegates chart building to the shared buildEChartsOption spec builder.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFields, useFieldValues, useStatusCounts } from '@/api/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowRight, BarChart3, Loader2 } from 'lucide-react';
import { useAtlasStore, type PlotConfig } from '@/store/useAtlasStore';
import { buildEChartsOption } from '@/lib/echarts-spec';
import { EChartsChart, type PointClickData } from '@/components/plots/EChartsChart';
import { toNumericArray } from '@/lib/stats';

interface DistributionCardProps {
  experimentId: string;
  selectedField?: string;
  onFieldChange?: (field: string) => void;
  /** When true, polls data more frequently (for in-progress experiments) */
  isInProgress?: boolean;
  /** When set, overlay a vertical marker line at this value */
  runValue?: number | null;
}

export function DistributionCard({
  experimentId,
  selectedField: controlledField,
  onFieldChange,
  isInProgress = false,
  runValue,
}: DistributionCardProps) {
  const navigate = useNavigate();
  const { darkMode, setSelectionFilter, setPlotConfig, addFieldFilter } = useAtlasStore();
  const { data: fieldsData, isLoading: fieldsLoading } = useFields(experimentId, isInProgress);
  const { data: statusCounts } = useStatusCounts(experimentId);
  const [internalField, setInternalField] = useState<string>('');

  // Use controlled or internal state
  const selectedField = controlledField ?? internalField;
  const setSelectedField = (field: string) => {
    if (onFieldChange) {
      onFieldChange(field);
    } else {
      setInternalField(field);
    }
  };

  // Get numeric fields for histogram (metrics and derived only)
  const numericFields = useMemo(() => {
    if (!fieldsData) return [];

    const metrics = Object.entries(fieldsData.metrics_fields || {})
      .filter(([, info]) => info.type === 'numeric')
      .map(([name, info]) => ({ name, prefix: 'metrics', label: name, info }));

    const derived = Object.entries(fieldsData.derived_fields || {})
      .filter(([, info]) => info.type === 'numeric')
      .map(([name, info]) => ({ name, prefix: 'derived', label: name, info }));

    return [...metrics, ...derived];
  }, [fieldsData]);

  // Auto-select first numeric field if none selected
  const effectiveField = selectedField || (numericFields[0] ? `${numericFields[0].prefix}.${numericFields[0].name}` : '');

  // Get field info for the selected field to determine bin count
  const selectedFieldInfo = useMemo(() => {
    if (!effectiveField || !fieldsData) return null;
    const [prefix, name] = effectiveField.split('.');
    if (prefix === 'metrics') {
      return fieldsData.metrics_fields?.[name] || null;
    } else if (prefix === 'derived') {
      return fieldsData.derived_fields?.[name] || null;
    }
    return null;
  }, [effectiveField, fieldsData]);

  // Calculate optimal bin count using Sturges' rule
  const optimalBinCount = useMemo(() => {
    const n = selectedFieldInfo?.count || 0;
    if (n <= 1) return 10;
    const sturges = Math.ceil(1 + Math.log2(n));
    const sqrtRule = Math.ceil(Math.sqrt(n));
    const computed = Math.min(sturges, sqrtRule);
    return Math.max(5, Math.min(50, computed));
  }, [selectedFieldInfo]);

  // Fetch field values for histogram
  const { data: fieldValuesData, isLoading: valuesLoading } = useFieldValues(
    {
      filter: { experiment_id: experimentId },
      fields: effectiveField ? [effectiveField] : [],
      max_points: 10000,
      include_run_ids: true,
    },
    !!effectiveField
  );

  // Build ECharts option via shared spec builder
  const echartsOption = useMemo(() => {
    if (!fieldValuesData || !effectiveField) return null;

    const config: PlotConfig = {
      chartType: 'histogram',
      xField: '',
      yField: effectiveField,
      groupBy: null,
      aggregation: 'none',
      errorBars: 'none',
      binCount: optimalBinCount,
    };

    return buildEChartsOption({
      config,
      data: fieldValuesData,
      theme: darkMode ? 'dark' : 'light',
      overrides: {
        grid: { left: 50, right: 20, top: 20, bottom: 40 },
        markLineValue: runValue != null && Number.isFinite(runValue)
          ? { value: runValue, label: `This run: ${runValue.toPrecision(4)}` }
          : undefined,
      },
    });
  }, [fieldValuesData, effectiveField, optimalBinCount, darkMode, runValue]);

  // Count numeric values for summary display
  const numericCount = useMemo(() => {
    if (!fieldValuesData || !effectiveField) return 0;
    const values = fieldValuesData.fields[effectiveField];
    return values ? toNumericArray(values).length : 0;
  }, [fieldValuesData, effectiveField]);

  // Handle histogram bar click - navigate to run detail or filtered runs list
  const handlePointClick = (data: PointClickData) => {
    if (data.runId) {
      navigate(`/runs/${data.runId}`);
    } else if (data.runIds && data.runIds.length > 0) {
      addFieldFilter({ field: 'record.run_id', op: 'in', value: data.runIds, _fromPlot: true });
      navigate(`/runs?experiment_id=${encodeURIComponent(experimentId)}`);
    }
  };

  // Loading state
  if (fieldsLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No numeric fields available
  if (numericFields.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="py-16 text-center text-muted-foreground text-sm">
          No numeric metrics available for histogram
        </CardContent>
      </Card>
    );
  }

  // Group fields by type for dropdown
  const metricsOptions = numericFields
    .filter((f) => f.prefix === 'metrics')
    .map((f) => `${f.prefix}.${f.name}`);
  const derivedOptions = numericFields
    .filter((f) => f.prefix === 'derived')
    .map((f) => `${f.prefix}.${f.name}`);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Field selector */}
        <Select
          value={effectiveField}
          onValueChange={setSelectedField}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent>
            {metricsOptions.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Metrics (outputs)
                </div>
                {metricsOptions.map((field) => (
                  <SelectItem key={field} value={field}>
                    {field}
                  </SelectItem>
                ))}
              </>
            )}
            {derivedOptions.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Derived (computed)
                </div>
                {derivedOptions.map((field) => (
                  <SelectItem key={field} value={field}>
                    {field}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>

        {/* Histogram chart */}
        <div className="relative min-h-[200px]">
          {valuesLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : echartsOption ? (
            <EChartsChart
              option={echartsOption}
              onPointClick={handlePointClick}
              height="180px"
            />
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              No data for histogram
            </div>
          )}
        </div>

        {/* Summary stats */}
        {numericCount > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            {numericCount.toLocaleString()} values across {optimalBinCount} bins
            {runValue != null && Number.isFinite(runValue) && (
              <> | This run: {runValue.toPrecision(4)}</>
            )}
          </div>
        )}

        {/* Footer link */}
        <div className="pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between"
            onClick={() => {
              // Set filter-based selection for all runs in this experiment
              // Use status counts (experiment-scoped) for accurate run count
              const runCount = statusCounts?.total ?? fieldsData?.run_count ?? 0;
              setSelectionFilter({ experiment_id: experimentId }, runCount);

              // Pre-configure the plot with histogram chart type and selected field
              setPlotConfig({
                chartType: 'histogram',
                xField: '',
                yField: effectiveField || '',
                groupBy: null,
                aggregation: 'none',
                errorBars: 'none',
                binCount: optimalBinCount,
              });

              // Navigate to plots page
              navigate('/plots');
            }}
          >
            Open in Plots
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
