/**
 * PlotBuilder - Main orchestration component for the plots page.
 * Fetches data, builds specs, and renders chart with controls.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAtlasStore, type PlotConfig } from '@/store/useAtlasStore';
import { useFieldValues } from '@/api/hooks';
import type { FilterSpec } from '@/api/types';
import { useEffectiveFilter } from '@/hooks/useEffectiveFilter';
import { buildEChartsOption, getRequiredFields } from '@/lib/echarts-spec';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlotControls } from './PlotControls';
import { EChartsChart, type PointClickData } from './EChartsChart';
import { PlotErrorBoundary } from './PlotErrorBoundary';

interface PlotBuilderProps {
  /** Explicit run IDs to plot (for explicit selection) */
  runIds?: string[];
  /** Filter spec to use (for filter-based selection) */
  selectionFilter?: FilterSpec;
}

/** Default plot configuration */
const DEFAULT_PLOT_CONFIG: PlotConfig = {
  chartType: 'scatter',
  xField: '',
  yField: '',
  groupBy: null,
  aggregation: 'none',
  errorBars: 'none',
  binCount: 20,
};

export function PlotBuilder({ runIds, selectionFilter }: PlotBuilderProps) {
  const navigate = useNavigate();

  // Store state
  const plotConfig = useAtlasStore((s) => s.plotConfig);
  const setPlotConfig = useAtlasStore((s) => s.setPlotConfig);
  const darkMode = useAtlasStore((s) => s.darkMode);
  const filter = useAtlasStore((s) => s.filter);
  const addFieldFilter = useAtlasStore((s) => s.addFieldFilter);

  // Sampling seed for reproducible random samples
  const [sampleSeed, setSampleSeed] = useState(42);

  // Build effective filter from selection
  const effectiveFilter = useEffectiveFilter(runIds, selectionFilter);

  // Initialize plot config if not set
  useEffect(() => {
    if (!plotConfig) {
      setPlotConfig(DEFAULT_PLOT_CONFIG);
    }
  }, [plotConfig, setPlotConfig]);

  // Get required fields for current config
  const fieldsToFetch = useMemo(() => {
    return getRequiredFields(plotConfig);
  }, [plotConfig]);

  // Fetch field values
  const {
    data: fieldValuesData,
    isLoading,
    isError,
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

  // Build ECharts option
  const echartsOption = useMemo(() => {
    if (!plotConfig || !fieldValuesData) return null;

    return buildEChartsOption({
      config: plotConfig,
      data: fieldValuesData,
      theme: darkMode ? 'dark' : 'light',
    });
  }, [plotConfig, fieldValuesData, darkMode]);

  // Check if we have required fields configured
  const hasRequiredFields = useMemo(() => {
    if (!plotConfig) return false;
    if (plotConfig.chartType === 'histogram') {
      return !!plotConfig.yField;
    }
    return !!plotConfig.xField && !!plotConfig.yField;
  }, [plotConfig]);

  // Sampling info
  const isSampled = fieldValuesData?.sampled ?? false;

  // Handle resample
  const handleResample = () => {
    setSampleSeed(Math.floor(Math.random() * 100000));
  };

  // Handle point click - navigate to run detail or filtered runs list
  const handlePointClick = (data: PointClickData) => {
    if (data.runId) {
      // Single run - navigate directly to run detail
      navigate(`/runs/${data.runId}`);
    } else if (data.runIds && data.runIds.length > 0) {
      // Multiple runs - set filter and navigate to runs page
      addFieldFilter({ field: 'record.run_id', op: 'in', value: data.runIds, _fromPlot: true });
      // Preserve experiment context in URL if available
      const expId = selectionFilter?.experiment_id ?? filter.experiment_id;
      if (expId) {
        navigate(`/runs?experiment_id=${encodeURIComponent(expId)}`);
      } else {
        navigate('/runs');
      }
    }
  };

  // Get experiment ID for field lookup
  const experimentId =
    selectionFilter?.experiment_id ?? filter.experiment_id ?? undefined;

  // Chart title
  const chartTitle = useMemo(() => {
    if (!plotConfig) return 'Chart';
    if (plotConfig.chartType === 'histogram') {
      return `Distribution of ${plotConfig.yField || 'Field'}`;
    }
    let title = `${plotConfig.yField || 'Y'} vs ${plotConfig.xField || 'X'}`;
    if (plotConfig.groupBy) {
      title += ` (by ${plotConfig.groupBy})`;
    }
    return title;
  }, [plotConfig]);

  return (
    <div className="grid grid-cols-4 gap-6">
      {/* Controls */}
      <div className="col-span-1">
        <PlotControls experimentId={experimentId} />
      </div>

      {/* Chart */}
      <Card className="col-span-3">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>{chartTitle}</CardTitle>
          {/* Sampling indicator */}
          {isSampled && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-status-warning border-status-warning/50 bg-status-warning/10"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Sampled ({fieldValuesData?.returned?.toLocaleString()} of{' '}
                {fieldValuesData?.total?.toLocaleString()})
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
              {plotConfig?.chartType === 'histogram'
                ? 'Select a field to create a histogram'
                : 'Select X and Y fields to create a plot'}
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
          ) : echartsOption ? (
            <PlotErrorBoundary onRetry={handleResample}>
              <EChartsChart
                option={echartsOption}
                onPointClick={handlePointClick}
                className="h-96"
                height="384px"
              />
            </PlotErrorBoundary>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
