import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { useFields, useHistogram } from '@/api/hooks';
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
import { useAtlasStore } from '@/store/useAtlasStore';
import { buildHistogramChartOption } from '@/components/plots/histogram-utils';

interface DistributionCardProps {
  experimentId: string;
  selectedField?: string;
  onFieldChange?: (field: string) => void;
  /** When true, polls data more frequently (for in-progress experiments) */
  isInProgress?: boolean;
}

export function DistributionCard({
  experimentId,
  selectedField: controlledField,
  onFieldChange,
  isInProgress = false,
}: DistributionCardProps) {
  const navigate = useNavigate();
  const { darkMode, setSelectionFilter, setPlotConfig } = useAtlasStore();
  const { data: fieldsData, isLoading: fieldsLoading } = useFields(experimentId, isInProgress);
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

  // Calculate optimal bin count using Freedman-Diaconis-inspired heuristic
  // Falls back to Sturges' rule: k = ceil(1 + log2(n))
  const optimalBinCount = useMemo(() => {
    const n = selectedFieldInfo?.count || 0;
    if (n <= 1) return 10; // Minimum default

    // Sturges' rule as base
    const sturges = Math.ceil(1 + Math.log2(n));

    // Square root rule as alternative
    const sqrtRule = Math.ceil(Math.sqrt(n));

    // Use the smaller of the two, but clamp to reasonable range
    const computed = Math.min(sturges, sqrtRule);

    // Clamp between 5 and 50 bins
    return Math.max(5, Math.min(50, computed));
  }, [selectedFieldInfo]);

  // Fetch histogram data
  const histogramRequest = effectiveField
    ? {
      field: effectiveField,
      bin_count: optimalBinCount,
      filter: { experiment_id: experimentId },
    }
    : null;

  const { data: histogramData, isLoading: histogramLoading } = useHistogram(
    histogramRequest,
    !!effectiveField,
    isInProgress
  );

  // Build chart option using shared utility
  const chartOption = useMemo(() => {
    if (!histogramData || histogramData.bins.length === 0) return null;

    return buildHistogramChartOption({
      histogramData,
      darkMode,
      yField: effectiveField,
      compact: true, // Compact mode for the card view
    });
  }, [histogramData, darkMode, effectiveField]);

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
          {histogramLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : chartOption ? (
            <ReactECharts
              option={chartOption}
              style={{ height: '200px', width: '100%' }}
              notMerge={true}
            />
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              No data for histogram
            </div>
          )}
        </div>

        {/* Summary stats */}
        {histogramData && (
          <div className="text-xs text-muted-foreground text-center">
            {histogramData.total} values across {histogramData.bins.length - 1} bins
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
              const runCount = fieldsData?.run_count || 0;
              setSelectionFilter({ experiment_id: experimentId }, runCount);

              // Pre-configure the plot with histogram chart type and selected field
              setPlotConfig({
                x_field: '',
                y_field: effectiveField || '',
                group_by: [],
                chart_type: 'histogram',
                bin_count: optimalBinCount,
                agg_fn: 'none',
                error_bars: 'none',
                aggregate_replicates: true,
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
