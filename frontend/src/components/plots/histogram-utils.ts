import type { HistogramResponse } from '@/api/types';
import type { EChartsOption } from 'echarts';

interface HistogramChartOptions {
  histogramData: HistogramResponse;
  darkMode: boolean;
  yField?: string;
  height?: number;
  /** Whether to show the full X axis label or simplified version */
  compact?: boolean;
}

/**
 * Shared chart option generator for histogram visualizations.
 * Used by both DistributionCard and PlotBuilder/Chart components.
 */
export function buildHistogramChartOption({
  histogramData,
  darkMode,
  yField,
  compact = false,
}: HistogramChartOptions): EChartsOption {
  const bins = histogramData.bins;
  const counts = histogramData.counts;

  const getTheme = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return {
        foreground: darkMode ? '#e5e5e5' : '#111827',
        mutedForeground: darkMode ? '#a3a3a3' : '#6b7280',
        border: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(17,24,39,0.12)',
        popover: darkMode ? '#111827' : '#ffffff',
        chart: darkMode
          ? ['#7c3aed', '#06b6d4', '#60a5fa', '#a855f7', '#22c55e']
          : ['#4f46e5', '#0891b2', '#2563eb', '#9333ea', '#16a34a'],
      };
    }

    const style = getComputedStyle(document.documentElement);
    const get = (name: string) => style.getPropertyValue(name).trim();

    const resolveColor = (value: string, type: 'color' | 'background' = 'color') => {
      if (!value) return value;
      try {
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

    const chart = [
      get('--chart-1'),
      get('--chart-2'),
      get('--chart-3'),
      get('--chart-4'),
      get('--chart-5'),
    ].filter(Boolean).map((c) => resolveColor(c));

    return {
      foreground: resolveColor(get('--foreground') || (darkMode ? '#e5e5e5' : '#111827')),
      mutedForeground: resolveColor(get('--muted-foreground') || (darkMode ? '#a3a3a3' : '#6b7280')),
      border: resolveColor(get('--border') || (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(17,24,39,0.12)')),
      popover: resolveColor(get('--popover') || (darkMode ? '#111827' : '#ffffff'), 'background'),
      chart: chart.length > 0 ? chart : (darkMode
        ? ['#7c3aed', '#06b6d4', '#60a5fa', '#a855f7', '#22c55e']
        : ['#4f46e5', '#0891b2', '#2563eb', '#9333ea', '#16a34a']),
    };
  };

  const theme = getTheme();
  const textColor = theme.foreground;
  const subtextColor = theme.mutedForeground;
  const lineColor = theme.border;
  const barColor = theme.chart[0];
  const borderColor = theme.border;

  // Build bin labels from bin edges
  // For compact mode, show fewer labels; for full mode, show all but simplify
  const binLabels = bins.slice(0, -1).map((binStart, i) => {
    const binEnd = bins[i + 1];
    // Use consistent precision based on range
    const range = bins[bins.length - 1] - bins[0];
    const precision = range > 100 ? 0 : range > 10 ? 1 : range > 1 ? 2 : 3;
    return `${binStart.toFixed(precision)} - ${binEnd.toFixed(precision)}`;
  });

  // Build bar data with enhanced tooltip info
  const barData = counts.map((count, i) => ({
    value: count,
    binIndex: i,
    binStart: bins[i],
    binEnd: bins[i + 1],
  }));

  // Determine label interval for cleaner display
  const binCount = bins.length - 1;
  const labelInterval = compact
    ? Math.max(0, Math.floor(binCount / 5) - 1) // Show ~5 labels in compact mode
    : Math.max(0, Math.floor(binCount / 10) - 1); // Show ~10 labels in full mode

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.popover,
      borderColor: theme.border,
      textStyle: { color: textColor },
      formatter: (params: unknown) => {
        const p = params as { data: { value: number; binStart: number; binEnd: number } };
        const { value, binStart, binEnd } = p.data;
        const range = bins[bins.length - 1] - bins[0];
        const precision = range > 100 ? 2 : range > 10 ? 3 : 4;
        return `<b>Range</b>: ${binStart.toFixed(precision)} – ${binEnd.toFixed(precision)}<br/><b>Count</b>: ${value.toLocaleString()}`;
      },
    },
    xAxis: {
      type: 'category',
      data: binLabels,
      name: yField || 'Value',
      nameLocation: 'middle',
      nameGap: compact ? 35 : 50,
      nameTextStyle: { color: textColor },
      axisLabel: {
        color: subtextColor,
        interval: labelInterval,
        rotate: compact ? 0 : 30,
        fontSize: compact ? 10 : 11,
        formatter: (value: string) => {
          // For axis labels, just show the bin start value
          const parts = value.split(' - ');
          return parts[0];
        },
      },
      axisLine: { lineStyle: { color: lineColor } },
      axisTick: {
        alignWithLabel: true,
        lineStyle: { color: lineColor },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Count',
      nameLocation: 'middle',
      nameGap: compact ? 30 : 40,
      nameTextStyle: { color: textColor },
      axisLabel: { color: subtextColor },
      axisLine: { lineStyle: { color: lineColor } },
      splitLine: { lineStyle: { color: lineColor, type: 'dashed' } },
    },
    series: [
      {
        type: 'bar',
        data: barData,
        barCategoryGap: '0%', // No gap between bars - true histogram style
        barGap: '0%',
        itemStyle: {
          color: barColor,
          borderColor: borderColor,
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            color: theme.chart[1] || barColor,
          },
        },
      },
    ],
    grid: {
      left: compact ? 45 : 60,
      right: 20,
      bottom: compact ? 50 : 80,
      top: compact ? 20 : 40,
    },
  };
}
