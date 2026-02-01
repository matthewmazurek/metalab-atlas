import ReactECharts from 'echarts-for-react';
import type { AggFn, ChartType, ErrorBarType, FieldValuesResponse, HistogramResponse } from '@/api/types';
import { useNavigate } from 'react-router-dom';
import { useAtlasStore } from '@/store/useAtlasStore';
import { useMemo } from 'react';
import { buildHistogramChartOption } from './histogram-utils';

interface ChartProps {
  fieldValuesData?: FieldValuesResponse | null;
  histogramData?: HistogramResponse | null;
  chartType: ChartType;
  xField?: string;
  yField?: string;
  groupByField?: string;
  aggFn?: AggFn;
  errorBars?: ErrorBarType;
  aggregateReplicates?: boolean;
  experimentId?: string;
}

// Aggregation helper functions
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const sqDiffs = values.map(v => (v - avg) ** 2);
  // Use sample standard deviation (N-1) for unbiased estimate
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function sem(values: number[], avg: number): number {
  return stdDev(values, avg) / Math.sqrt(values.length);
}

interface AggregatedPoint {
  x: string | number;
  y: number;
  yLow?: number;
  yHigh?: number;
  n: number;
  runIds: string[];
  group?: string;
}

function getThemeColors(darkMode: boolean) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // Fallbacks for non-browser environments
    return {
      foreground: darkMode ? '#e5e5e5' : '#111827',
      mutedForeground: darkMode ? '#a3a3a3' : '#6b7280',
      border: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(17,24,39,0.12)',
      popover: darkMode ? '#111827' : '#ffffff',
      chart: darkMode
        ? ['#7c3aed', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e']
        : ['#4f46e5', '#0891b2', '#db2777', '#d97706', '#16a34a'],
    };
  }

  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();

  const resolveColor = (value: string, type: 'color' | 'background' = 'color') => {
    if (!value) return value;
    try {
      // Force conversion of oklch/var(...) into a concrete rgb(...) string
      const el = document.createElement('span');
      el.style.position = 'absolute';
      el.style.left = '-99999px';
      if (type === 'background') el.style.backgroundColor = value;
      else el.style.color = value;
      document.body.appendChild(el);
      const computed = getComputedStyle(el);
      const resolved = type === 'background' ? computed.backgroundColor : computed.color;
      el.remove();
      return resolved || value;
    } catch {
      return value;
    }
  };

  const foreground = resolveColor(get('--foreground') || (darkMode ? '#e5e5e5' : '#111827'));
  const mutedForeground = resolveColor(get('--muted-foreground') || (darkMode ? '#a3a3a3' : '#6b7280'));
  const border = resolveColor(get('--border') || (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(17,24,39,0.12)'));
  const popover = resolveColor(get('--popover') || (darkMode ? '#111827' : '#ffffff'), 'background');

  const chart = [
    get('--chart-1'),
    get('--chart-2'),
    get('--chart-3'),
    get('--chart-4'),
    get('--chart-5'),
  ].filter(Boolean).map((c) => resolveColor(c));

  return {
    foreground,
    mutedForeground,
    border,
    popover,
    chart: chart.length > 0 ? chart : (darkMode
      ? ['#7c3aed', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e']
      : ['#4f46e5', '#0891b2', '#db2777', '#d97706', '#16a34a']),
  };
}

// Client-side aggregation
function aggregateData(
  xValues: (number | string | null)[],
  yValues: (number | string | null)[],
  runIds: string[],
  groupValues: (number | string | null)[],
  seedFingerprints: (number | string | null)[],
  aggFn: AggFn,
  errorBars: ErrorBarType,
  groupByField?: string,
  aggregateReplicates: boolean = true
): Map<string, AggregatedPoint[]> {
  // Build raw data points
  const rawPoints: { x: string | number; y: number; runId: string; group: string; seedFingerprint: string }[] = [];

  for (let i = 0; i < xValues.length; i++) {
    const x = xValues[i];
    const yRaw = yValues[i];
    const y = typeof yRaw === 'string' ? parseFloat(yRaw) : yRaw;

    if (x === null || y === null || isNaN(y)) continue;

    const xVal = typeof x === 'string' ? (isNaN(parseFloat(x)) ? x : parseFloat(x)) : x;
    const group = groupByField ? String(groupValues[i] ?? 'Other') : 'all';
    const seedFingerprint = String(seedFingerprints[i] ?? 'unknown');

    rawPoints.push({ x: xVal, y, runId: runIds[i] || '', group, seedFingerprint });
  }

  // Group by (group, x) when aggregating - aggregates all runs at same position
  // Group by (group, x, seedFingerprint) when NOT aggregating - shows each seed separately
  // Use "group by" field to keep different parameter configurations separate if needed
  const grouped = new Map<string, Map<string, { ys: number[]; runIds: string[] }>>();

  for (const pt of rawPoints) {
    if (!grouped.has(pt.group)) {
      grouped.set(pt.group, new Map());
    }
    const groupMap = grouped.get(pt.group)!;
    // Include seedFingerprint only if NOT aggregating replicates
    const xKey = aggregateReplicates
      ? String(pt.x)
      : `${pt.x}|||${pt.seedFingerprint}`;

    if (!groupMap.has(xKey)) {
      groupMap.set(xKey, { ys: [], runIds: [] });
    }
    groupMap.get(xKey)!.ys.push(pt.y);
    groupMap.get(xKey)!.runIds.push(pt.runId);
  }

  // Aggregate
  const result = new Map<string, AggregatedPoint[]>();

  for (const [groupName, xMap] of grouped) {
    const points: AggregatedPoint[] = [];

    for (const [xKey, { ys, runIds: rids }] of xMap) {
      // Parse the x value back out (first part before any ||| separator)
      const xPart = xKey.split('|||')[0];
      const x: string | number = isNaN(parseFloat(xPart)) ? xPart : parseFloat(xPart);

      let y: number;
      let yLow: number | undefined;
      let yHigh: number | undefined;

      switch (aggFn) {
        case 'mean':
          y = mean(ys);
          break;
        case 'median':
          y = median(ys);
          break;
        case 'min':
          y = Math.min(...ys);
          break;
        case 'max':
          y = Math.max(...ys);
          break;
        case 'count':
          y = ys.length;
          break;
        default:
          y = mean(ys);
      }

      // Error bars - only meaningful for mean aggregation with multiple samples
      // For other aggregations (median, min, max), error bars don't have a clear interpretation
      if (errorBars !== 'none' && aggFn === 'mean' && ys.length >= 2) {
        const avg = mean(ys);
        if (errorBars === 'std') {
          const sd = stdDev(ys, avg);
          yLow = y - sd;
          yHigh = y + sd;
        } else if (errorBars === 'sem') {
          const se = sem(ys, avg);
          yLow = y - se;
          yHigh = y + se;
        }
      }

      points.push({ x, y, yLow, yHigh, n: ys.length, runIds: rids, group: groupName });
    }

    // Sort by x
    points.sort((a, b) => {
      if (typeof a.x === 'number' && typeof b.x === 'number') return a.x - b.x;
      return String(a.x).localeCompare(String(b.x));
    });

    result.set(groupName, points);
  }

  return result;
}

export function Chart({
  fieldValuesData,
  histogramData,
  chartType,
  xField,
  yField,
  groupByField,
  aggFn = 'none',
  errorBars = 'none',
  aggregateReplicates = true,
  experimentId,
}: ChartProps) {
  const navigate = useNavigate();
  const { darkMode } = useAtlasStore();

  const theme = useMemo(() => getThemeColors(darkMode), [darkMode]);
  const textColor = theme.foreground;
  const subtextColor = theme.mutedForeground;
  const lineColor = theme.border;

  // Common tooltip style
  const tooltipStyle = {
    backgroundColor: theme.popover,
    borderColor: theme.border,
    textStyle: { color: textColor },
  };

  // Common axis style
  const axisStyle = {
    nameTextStyle: { color: textColor },
    axisLabel: { color: subtextColor },
    axisLine: { lineStyle: { color: lineColor } },
    splitLine: { lineStyle: { color: lineColor } },
  };

  // Process data with optional aggregation
  const processedData = useMemo(() => {
    if (!fieldValuesData || !xField || !yField) return null;

    const xValues = fieldValuesData.fields[xField] || [];
    const yValues = fieldValuesData.fields[yField] || [];
    const groupValues = groupByField ? fieldValuesData.fields[groupByField] || [] : [];
    const seedFingerprints = fieldValuesData.fields['record.seed_fingerprint'] || [];
    const runIds = fieldValuesData.run_ids || [];

    if (xValues.length === 0 || yValues.length === 0) return null;

    if (aggFn !== 'none') {
      return aggregateData(xValues, yValues, runIds, groupValues, seedFingerprints, aggFn, errorBars, groupByField, aggregateReplicates);
    }

    // No aggregation - return raw points grouped
    const groups = new Map<string, AggregatedPoint[]>();

    for (let i = 0; i < xValues.length; i++) {
      const x = xValues[i];
      const yRaw = yValues[i];
      const y = typeof yRaw === 'string' ? parseFloat(yRaw) : yRaw;

      if (x === null || y === null || isNaN(y as number)) continue;

      const xVal = typeof x === 'string' ? (isNaN(parseFloat(x)) ? x : parseFloat(x)) : x;
      const group = groupByField ? String(groupValues[i] ?? 'Other') : 'all';

      if (!groups.has(group)) {
        groups.set(group, []);
      }

      groups.get(group)!.push({
        x: xVal,
        y: y as number,
        n: 1,
        runIds: [runIds[i] || ''],
        group,
      });
    }

    return groups;
  }, [fieldValuesData, xField, yField, groupByField, aggFn, errorBars, aggregateReplicates]);

  // Handle histogram chart type
  if (chartType === 'histogram' && histogramData) {
    const option = buildHistogramChartOption({
      histogramData,
      darkMode,
      yField,
      compact: false,
    });

    return (
      <ReactECharts
        option={option}
        style={{ height: '400px', width: '100%' }}
        notMerge={true}
      />
    );
  }

  // For other chart types, we need processed data
  if (!processedData || processedData.size === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        No data to display
      </div>
    );
  }

  // Determine if X axis is categorical
  const firstGroup = processedData.values().next().value as AggregatedPoint[];
  const isXCategorical = typeof firstGroup?.[0]?.x === 'string';
  const allXValues = [...new Set(
    Array.from(processedData.values())
      .flat()
      .map(p => p.x)
  )];
  const xCategories = isXCategorical ? allXValues.map(String).sort() : undefined;

  // Color palette
  const colors = theme.chart;

  const isAggregated = aggFn !== 'none';
  const hasErrorBars = isAggregated && errorBars !== 'none';

  // Build series
  const seriesType = chartType === 'scatter' ? 'scatter' : chartType === 'line' ? 'line' : 'bar';
  const series: object[] = [];
  let colorIdx = 0;

  for (const [groupName, points] of processedData) {
    const color = colors[colorIdx % colors.length];
    colorIdx++;

    // Main series
    series.push({
      name: groupName === 'all' ? (isAggregated ? 'Aggregated' : 'Data') : groupName,
      type: seriesType,
      symbolSize: chartType === 'scatter' ? 8 : 4,
      cursor: 'pointer',
      itemStyle: { color },
      data: points.map(p => ({
        value: isXCategorical && xCategories
          ? [xCategories.indexOf(String(p.x)), p.y]
          : [p.x, p.y],
        runIds: p.runIds,
        n: p.n,
      })),
    });

    // Error bars if aggregated
    if (hasErrorBars) {
      const errorData = points
        .filter(p => p.yLow !== undefined && p.yHigh !== undefined)
        .map(p => ({
          value: isXCategorical && xCategories
            ? [xCategories.indexOf(String(p.x)), p.yLow!, p.yHigh!]
            : [p.x, p.yLow!, p.yHigh!],
        }));

      if (errorData.length > 0) {
        series.push({
          name: `${groupName} (error)`,
          type: 'custom',
          renderItem: createErrorBarRenderer(subtextColor),
          data: errorData,
          z: 10,
          tooltip: { show: false },
          silent: true,
        });
      }
    }
  }

  const option = {
    tooltip: {
      ...tooltipStyle,
      trigger: 'item',
      formatter: (params: { data: { value: (number | string)[]; runIds?: string[]; n?: number }; seriesName: string }) => {
        const { data, seriesName } = params;
        if (!data?.value || seriesName.includes('(error)')) return '';

        const [x, y] = data.value;
        const xVal = isXCategorical && xCategories ? xCategories[x as number] : x;
        const runIds = data.runIds || [];
        const n = data.n || runIds.length;

        let html = '';
        if (processedData.size > 1 && !seriesName.includes('Aggregated') && !seriesName.includes('Data')) {
          html += `<b>${groupByField}</b>: ${seriesName}<br/>`;
        }
        html += `<b>${xField}</b>: ${xVal}<br/><b>${yField}</b>: ${typeof y === 'number' ? y.toFixed(4) : y}`;

        // Show run ID for single-run points, otherwise show count
        if (n === 1 && runIds.length === 1) {
          const shortId = runIds[0].slice(0, 8);
          html += `<br/><b>ID</b>: <code style="font-size:11px">${shortId}</code>`;
        } else if (isAggregated) {
          html += `<br/><b>Runs</b>: ${n}`;
        }

        if (runIds.length > 0) {
          html += `<br/><span style="color:${subtextColor};font-size:11px">Click to view ${runIds.length === 1 ? 'run' : 'runs'}</span>`;
        }
        return html;
      },
    },
    legend: processedData.size > 1 || isAggregated ? {
      data: Array.from(processedData.keys()).map(k => k === 'all' ? (isAggregated ? 'Aggregated' : 'Data') : k),
      top: 'top',
      textStyle: { color: textColor },
    } : undefined,
    xAxis: {
      name: xField,
      nameLocation: 'middle',
      nameGap: 30,
      type: isXCategorical ? 'category' : 'value',
      data: xCategories,
      ...axisStyle,
    },
    yAxis: {
      name: isAggregated && aggFn === 'count' ? 'Count' : yField,
      nameLocation: 'middle',
      nameGap: 50,
      type: 'value',
      ...axisStyle,
    },
    series,
    grid: {
      left: 60,
      right: 20,
      bottom: 50,
      top: processedData.size > 1 || isAggregated ? 50 : 20,
    },
  };

  // Handle click to navigate to run(s)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (params: any) => {
    const runIds = params?.data?.runIds;
    if (!runIds || runIds.length === 0) return;

    if (runIds.length === 1) {
      navigate(`/runs/${runIds[0]}`);
    } else {
      // Multiple runs - navigate to filtered list with experiment context
      const fieldFilters = [{ field: 'record.run_id', op: 'in', value: runIds }];
      const filterParam = encodeURIComponent(JSON.stringify(fieldFilters));
      const expParam = experimentId ? `experiment_id=${encodeURIComponent(experimentId)}&` : '';
      navigate(`/runs?${expParam}field_filters=${filterParam}`);
    }
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: '400px', width: '100%' }}
      notMerge={true}
      onEvents={{ click: handleClick }}
    />
  );
}

// Create error bar renderer function
function createErrorBarRenderer(subtextColor: string) {
  return (
    _params: { coordSys: { x: number; y: number; width: number; height: number } },
    api: {
      value: (idx: number) => number;
      coord: (val: [number, number]) => [number, number];
      size: (val: [number, number]) => [number, number];
      style: () => object;
    }
  ) => {
    const xVal = api.value(0);
    const low = api.value(1);
    const high = api.value(2);
    const highPoint = api.coord([xVal, high]);
    const lowPoint = api.coord([xVal, low]);
    const halfWidth = 4;

    return {
      type: 'group',
      children: [
        {
          type: 'line',
          shape: {
            x1: highPoint[0],
            y1: highPoint[1],
            x2: lowPoint[0],
            y2: lowPoint[1],
          },
          style: { stroke: subtextColor, lineWidth: 1 },
        },
        {
          type: 'line',
          shape: {
            x1: highPoint[0] - halfWidth,
            y1: highPoint[1],
            x2: highPoint[0] + halfWidth,
            y2: highPoint[1],
          },
          style: { stroke: subtextColor, lineWidth: 1 },
        },
        {
          type: 'line',
          shape: {
            x1: lowPoint[0] - halfWidth,
            y1: lowPoint[1],
            x2: lowPoint[0] + halfWidth,
            y2: lowPoint[1],
          },
          style: { stroke: subtextColor, lineWidth: 1 },
        },
      ],
    };
  };
}
