import ReactECharts from 'echarts-for-react';
import type { AggregateResponse, ChartType, HistogramResponse } from '@/api/types';
import { useNavigate } from 'react-router-dom';
import { useAtlasStore } from '@/store/useAtlasStore';

interface ChartProps {
  data?: AggregateResponse;
  histogramData?: HistogramResponse;
  chartType: ChartType;
}

export function Chart({ data, histogramData, chartType }: ChartProps) {
  const navigate = useNavigate();
  const { darkMode } = useAtlasStore();

  // Text colors for dark/light mode
  const textColor = darkMode ? '#e5e5e5' : '#333';
  const subtextColor = darkMode ? '#a3a3a3' : '#666';
  const lineColor = darkMode ? '#404040' : '#ccc';

  // Common tooltip style
  const tooltipStyle = {
    backgroundColor: darkMode ? '#262626' : '#fff',
    borderColor: darkMode ? '#404040' : '#ccc',
    textStyle: { color: textColor },
  };

  // Common axis style
  const axisStyle = {
    nameTextStyle: { color: textColor },
    axisLabel: { color: subtextColor },
    axisLine: { lineStyle: { color: lineColor } },
    splitLine: { lineStyle: { color: lineColor } },
  };

  // Handle histogram chart type
  if (chartType === 'histogram' && histogramData) {
    const binLabels = histogramData.bins.slice(0, -1).map((b, i) => {
      const next = histogramData.bins[i + 1];
      return `${b.toFixed(2)} - ${next.toFixed(2)}`;
    });

    const option = {
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: { name: string; value: number }[]) => {
          const { name, value } = params[0];
          return `<b>Range</b>: ${name}<br/><b>Count</b>: ${value}`;
        },
      },
      xAxis: {
        type: 'category',
        data: binLabels,
        name: histogramData.field,
        nameLocation: 'middle',
        nameGap: 50,
        ...axisStyle,
        axisLabel: {
          ...axisStyle.axisLabel,
          rotate: 45,
          interval: 0,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Count',
        nameLocation: 'middle',
        nameGap: 40,
        ...axisStyle,
      },
      series: [{
        type: 'bar',
        data: histogramData.counts,
        itemStyle: {
          color: darkMode ? '#3b82f6' : '#2563eb',
        },
      }],
      grid: {
        left: 60,
        right: 20,
        bottom: 80,
        top: 40,
      },
    };

    return (
      <ReactECharts
        option={option}
        style={{ height: '400px', width: '100%' }}
      />
    );
  }

  // For other chart types, we need aggregate data
  if (!data || data.series.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        No data to display
      </div>
    );
  }

  // Determine if X axis is categorical
  const isXCategorical = typeof data.series[0]?.points[0]?.x === 'string';
  const xAxisCategories = isXCategorical
    ? [...new Set(data.series.flatMap((s) => s.points.map((p) => String(p.x))))]
    : undefined;

  // Build chart option based on type
  let option: object;

  switch (chartType) {
    case 'heatmap':
      option = buildHeatmapOption(data, xAxisCategories, textColor, subtextColor, lineColor, darkMode, tooltipStyle, axisStyle);
      break;
    case 'radar':
      option = buildRadarOption(data, textColor, subtextColor, darkMode, tooltipStyle);
      break;
    case 'candlestick':
      option = buildCandlestickOption(data, xAxisCategories, textColor, subtextColor, lineColor, darkMode, tooltipStyle, axisStyle, isXCategorical);
      break;
    case 'line':
    case 'bar':
    case 'scatter':
    default:
      option = buildStandardOption(data, chartType, xAxisCategories, textColor, subtextColor, lineColor, darkMode, tooltipStyle, axisStyle, isXCategorical);
      break;
  }

  const handleClick = (params: { data?: { runIds?: string[] } }) => {
    const runIds = params.data?.runIds;
    if (runIds && runIds.length === 1) {
      navigate(`/runs/${runIds[0]}`);
    }
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: '400px', width: '100%' }}
      onEvents={{ click: handleClick }}
    />
  );
}

// Build standard chart option (scatter, line, bar)
function buildStandardOption(
  data: AggregateResponse,
  chartType: ChartType,
  xAxisCategories: string[] | undefined,
  textColor: string,
  subtextColor: string,
  _lineColor: string,
  _darkMode: boolean,
  tooltipStyle: object,
  axisStyle: object,
  isXCategorical: boolean
) {
  const seriesType = chartType === 'scatter' ? 'scatter' : chartType === 'line' ? 'line' : 'bar';

  return {
    tooltip: {
      ...tooltipStyle,
      trigger: chartType === 'bar' ? 'axis' : 'item',
      axisPointer: chartType === 'bar' ? { type: 'shadow' } : undefined,
      formatter: (params: { data: { value: number[]; runIds?: string[] }; seriesName: string } | { data: { value: number[]; runIds?: string[] }; seriesName: string }[]) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p?.data?.value) return '';
        const [x, y] = p.data.value;
        const runIds = p.data.runIds;
        const seriesName = p.seriesName;
        let html = '';
        // Show group if there are multiple series (group_by is active) and not an error bar series
        if (data.series.length > 1 && seriesName && !seriesName.includes('(error)')) {
          html += `<b>Group</b>: ${seriesName}<br/>`;
        }
        html += `<b>${data.x_field}</b>: ${x}<br/><b>${data.y_field}</b>: ${typeof y === 'number' ? y.toFixed(4) : y}`;
        if (runIds && runIds.length > 0) {
          html += `<br/><b>Runs</b>: ${runIds.length}`;
          if (runIds.length <= 3) {
            html += `<br/>${runIds.map((id) => id.slice(0, 8)).join(', ')}`;
          }
        }
        return html;
      },
    },
    legend: {
      data: data.series.map((s) => s.name),
      top: 'top',
      textStyle: { color: textColor },
    },
    xAxis: {
      name: data.x_field,
      nameLocation: 'middle',
      nameGap: 30,
      type: isXCategorical ? 'category' : 'value',
      data: xAxisCategories,
      ...axisStyle,
    },
    yAxis: {
      name: data.y_field,
      nameLocation: 'middle',
      nameGap: 50,
      type: 'value',
      ...axisStyle,
    },
    series: data.series.flatMap((series) => {
      const mainSeries = {
        name: series.name,
        type: seriesType,
        symbolSize: chartType === 'scatter' ? 10 : 6,
        showSymbol: chartType !== 'bar',
        data: series.points.map((p) => ({
          value: [p.x, p.y],
          runIds: p.run_ids,
        })),
      };

      // Add error bars if present
      const hasErrorBars = series.points.some((p) => p.y_low !== null && p.y_high !== null);
      if (hasErrorBars) {
        const errorData = series.points
          .filter((p) => p.y_low !== null && p.y_high !== null)
          .map((p) => ({
            value: [p.x, p.y_low!, p.y_high!],
          }));

        return [
          mainSeries,
          {
            name: `${series.name} (error)`,
            type: 'custom',
            renderItem: createErrorBarRenderer(subtextColor),
            data: errorData,
            z: 10, // Render on top for bar charts
          },
        ];
      }

      return [mainSeries];
    }),
  };
}

// Build heatmap option
function buildHeatmapOption(
  data: AggregateResponse,
  xAxisCategories: string[] | undefined,
  textColor: string,
  _subtextColor: string,
  _lineColor: string,
  darkMode: boolean,
  tooltipStyle: object,
  axisStyle: object
) {
  // For heatmap, X axis is the original X, Y axis is the group names, color is the value
  const groupNames = data.series.map((s) => s.name);
  const xValues = xAxisCategories || [...new Set(data.series.flatMap((s) => s.points.map((p) => String(p.x))))];

  // Build heatmap data: [xIndex, groupIndex, value]
  const heatmapData: [number, number, number][] = [];
  let minVal = Infinity;
  let maxVal = -Infinity;

  data.series.forEach((series, groupIdx) => {
    series.points.forEach((p) => {
      const xIdx = xValues.indexOf(String(p.x));
      if (xIdx >= 0) {
        heatmapData.push([xIdx, groupIdx, p.y]);
        minVal = Math.min(minVal, p.y);
        maxVal = Math.max(maxVal, p.y);
      }
    });
  });

  return {
    tooltip: {
      ...tooltipStyle,
      formatter: (params: { data: [number, number, number] }) => {
        const [xIdx, groupIdx, value] = params.data;
        return `<b>${data.x_field}</b>: ${xValues[xIdx]}<br/><b>Group</b>: ${groupNames[groupIdx]}<br/><b>${data.y_field}</b>: ${value.toFixed(4)}`;
      },
    },
    grid: {
      left: 100,
      right: 80,
      top: 20,
      bottom: 60,
    },
    xAxis: {
      type: 'category',
      data: xValues,
      name: data.x_field,
      nameLocation: 'middle',
      nameGap: 40,
      ...axisStyle,
    },
    yAxis: {
      type: 'category',
      data: groupNames,
      name: 'Group',
      ...axisStyle,
    },
    visualMap: {
      min: minVal,
      max: maxVal,
      calculable: true,
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { color: textColor },
      inRange: {
        color: darkMode
          ? ['#1e3a5f', '#3b82f6', '#93c5fd']
          : ['#dbeafe', '#3b82f6', '#1e40af'],
      },
    },
    series: [{
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: heatmapData.length <= 50,
        formatter: (params: { data: [number, number, number] }) => params.data[2].toFixed(2),
        color: textColor,
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)',
        },
      },
    }],
  };
}

// Build radar option
function buildRadarOption(
  data: AggregateResponse,
  textColor: string,
  subtextColor: string,
  darkMode: boolean,
  tooltipStyle: object
) {
  // For radar, each series becomes a radar polygon
  // The X values become the radar axes (indicators)
  const xValues = [...new Set(data.series.flatMap((s) => s.points.map((p) => String(p.x))))];

  // Find max value for each X (indicator)
  const maxValues: Record<string, number> = {};
  data.series.forEach((series) => {
    series.points.forEach((p) => {
      const key = String(p.x);
      maxValues[key] = Math.max(maxValues[key] || 0, p.y);
    });
  });

  const indicators = xValues.map((x) => ({
    name: x,
    max: maxValues[x] * 1.2, // Add 20% padding
  }));

  const radarData = data.series.map((series) => {
    // Map points to indicator order
    const valueMap: Record<string, number> = {};
    series.points.forEach((p) => {
      valueMap[String(p.x)] = p.y;
    });
    return {
      name: series.name,
      value: xValues.map((x) => valueMap[x] || 0),
    };
  });

  return {
    tooltip: {
      ...tooltipStyle,
    },
    legend: {
      data: data.series.map((s) => s.name),
      top: 'top',
      textStyle: { color: textColor },
    },
    radar: {
      indicator: indicators,
      axisName: {
        color: subtextColor,
      },
      axisLine: {
        lineStyle: { color: darkMode ? '#404040' : '#ccc' },
      },
      splitLine: {
        lineStyle: { color: darkMode ? '#404040' : '#ccc' },
      },
      splitArea: {
        areaStyle: {
          color: darkMode
            ? ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)']
            : ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.05)'],
        },
      },
    },
    series: [{
      type: 'radar',
      data: radarData,
    }],
  };
}

// Build candlestick option
function buildCandlestickOption(
  data: AggregateResponse,
  _xAxisCategories: string[] | undefined,
  textColor: string,
  _subtextColor: string,
  _lineColor: string,
  darkMode: boolean,
  tooltipStyle: object,
  axisStyle: object,
  _isXCategorical: boolean
) {
  // Candlestick uses quartile data: [open, close, low, high] = [q1, q3, min, max]
  // We'll show all series combined or just the first one
  const series = data.series[0];
  if (!series) {
    return {};
  }

  const xValues = series.points.map((p) => String(p.x));
  const candleData = series.points.map((p) => [
    p.y_q1 ?? p.y,
    p.y_q3 ?? p.y,
    p.y_min ?? p.y,
    p.y_max ?? p.y,
  ]);

  // Also show median as a line
  const medianData = series.points.map((p) => p.y_median ?? p.y);

  return {
    tooltip: {
      ...tooltipStyle,
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: { dataIndex: number }[]) => {
        const idx = params[0]?.dataIndex;
        if (idx === undefined) return '';
        const p = series.points[idx];
        let html = '';
        // Show group if there are multiple series
        if (data.series.length > 1) {
          html += `<b>Group</b>: ${series.name}<br/>`;
        }
        html += `<b>${data.x_field}</b>: ${p.x}<br/>
                <b>Max</b>: ${p.y_max?.toFixed(4) ?? '-'}<br/>
                <b>Q3</b>: ${p.y_q3?.toFixed(4) ?? '-'}<br/>
                <b>Median</b>: ${p.y_median?.toFixed(4) ?? '-'}<br/>
                <b>Q1</b>: ${p.y_q1?.toFixed(4) ?? '-'}<br/>
                <b>Min</b>: ${p.y_min?.toFixed(4) ?? '-'}<br/>
                <b>Runs</b>: ${p.n}`;
        return html;
      },
    },
    legend: {
      data: [series.name, 'Median'],
      top: 'top',
      textStyle: { color: textColor },
    },
    xAxis: {
      type: 'category',
      data: xValues,
      name: data.x_field,
      nameLocation: 'middle',
      nameGap: 30,
      ...axisStyle,
    },
    yAxis: {
      name: data.y_field,
      nameLocation: 'middle',
      nameGap: 50,
      type: 'value',
      ...axisStyle,
    },
    series: [
      {
        name: series.name,
        type: 'candlestick',
        data: candleData,
        itemStyle: {
          color: darkMode ? '#22c55e' : '#16a34a',
          color0: darkMode ? '#ef4444' : '#dc2626',
          borderColor: darkMode ? '#22c55e' : '#16a34a',
          borderColor0: darkMode ? '#ef4444' : '#dc2626',
        },
      },
      {
        name: 'Median',
        type: 'line',
        data: medianData,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: darkMode ? '#f59e0b' : '#d97706',
          width: 2,
        },
        itemStyle: {
          color: darkMode ? '#f59e0b' : '#d97706',
        },
      },
    ],
  };
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
