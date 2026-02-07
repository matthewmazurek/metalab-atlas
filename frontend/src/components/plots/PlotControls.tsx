/**
 * PlotControls - Control panel for configuring plot settings.
 * Reads/writes to useAtlasStore directly.
 */

import { useAtlasStore, type PlotConfig } from '@/store/useAtlasStore';
import { useFields } from '@/api/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldSelect } from './FieldSelect';

const CHART_TYPE_OPTIONS = [
  { value: 'scatter', label: 'Scatter' },
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'histogram', label: 'Histogram' },
] as const;

const AGGREGATION_OPTIONS = [
  { value: 'none', label: 'None (raw points)' },
  { value: 'mean', label: 'Mean' },
  { value: 'median', label: 'Median' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
] as const;

const ERROR_BAR_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'std', label: 'Standard Deviation' },
  { value: 'sem', label: 'Standard Error' },
] as const;

interface PlotControlsProps {
  /** Experiment ID for field lookup */
  experimentId?: string;
}

export function PlotControls({ experimentId }: PlotControlsProps) {
  const plotConfig = useAtlasStore((s) => s.plotConfig);
  const updatePlotConfig = useAtlasStore((s) => s.updatePlotConfig);

  // Fetch field index for the experiment
  const { data: fieldIndex } = useFields(experimentId);

  const isHistogram = plotConfig?.chartType === 'histogram';
  const isAggregating = plotConfig?.aggregation && plotConfig.aggregation !== 'none';

  // Initialize plot config if not set
  if (!plotConfig) {
    return null; // PlotBuilder should handle initialization
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plot Builder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chart Type */}
        <div className="space-y-2">
          <Label>Chart Type</Label>
          <Select
            value={plotConfig.chartType}
            onValueChange={(v) => updatePlotConfig({ chartType: v as PlotConfig['chartType'] })}
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

        {/* X Axis (not shown for histogram) */}
        {!isHistogram && (
          <FieldSelect
            label="X Axis"
            value={plotConfig.xField || null}
            onChange={(v) => updatePlotConfig({ xField: v || '' })}
            fieldIndex={fieldIndex}
            placeholder="Select X field"
          />
        )}

        {/* Y Axis / Field */}
        <FieldSelect
          label={isHistogram ? 'Field' : 'Y Axis'}
          value={plotConfig.yField || null}
          onChange={(v) => updatePlotConfig({ yField: v || '' })}
          fieldIndex={fieldIndex}
          placeholder={isHistogram ? 'Select field' : 'Select Y field'}
          numericOnly
        />

        {/* Bin Count (histogram only) */}
        {isHistogram && (
          <div className="space-y-2">
            <Label>Bin Count</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={plotConfig.binCount}
              onChange={(e) => updatePlotConfig({ binCount: parseInt(e.target.value) || 20 })}
            />
          </div>
        )}

        {/* Group By (not histogram) */}
        {!isHistogram && (
          <FieldSelect
            label="Group By"
            value={plotConfig.groupBy}
            onChange={(v) => updatePlotConfig({ groupBy: v })}
            fieldIndex={fieldIndex}
            placeholder="None"
            allowClear
          />
        )}

        {/* Aggregation (not histogram) */}
        {!isHistogram && (
          <div className="space-y-2">
            <Label>Aggregation</Label>
            <Select
              value={plotConfig.aggregation}
              onValueChange={(v) => updatePlotConfig({ aggregation: v as PlotConfig['aggregation'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGGREGATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Error Bars (only when aggregating) */}
        {!isHistogram && isAggregating && (
          <div className="space-y-2">
            <Label>Error Bars</Label>
            <Select
              value={plotConfig.errorBars}
              onValueChange={(v) => updatePlotConfig({ errorBars: v as PlotConfig['errorBars'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ERROR_BAR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
