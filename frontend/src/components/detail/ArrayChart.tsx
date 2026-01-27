import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAtlasStore } from '@/store/useAtlasStore';
import type { ArrayInfo } from '@/api/types';

interface ArrayChartProps {
  name: string;
  info: ArrayInfo;
}

export function ArrayChart({ name, info }: ArrayChartProps) {
  const [logScale, setLogScale] = useState(false);
  const { darkMode } = useAtlasStore();

  // Text colors for dark/light mode
  const textColor = darkMode ? '#e5e5e5' : '#333';
  const subtextColor = darkMode ? '#a3a3a3' : '#666';
  const lineColor = darkMode ? '#404040' : '#ccc';

  // Only render chart if we have 1D array values
  if (!info.values || info.shape.length !== 1) {
    return (
      <div className="p-2 bg-muted rounded">
        <span className="font-mono">{name}</span>: shape={JSON.stringify(info.shape)}, dtype={info.dtype}
        {info.shape.length > 1 && (
          <span className="text-muted-foreground ml-2">(visualization not available for multi-dimensional arrays)</span>
        )}
      </div>
    );
  }

  // Prepare data for ECharts - pair each value with its index
  const chartData = info.values.map((y, x) => [x, y]);

  // Filter out non-positive values for log scale
  const hasNonPositive = info.values.some((v) => v <= 0);
  const effectiveLogScale = logScale && !hasNonPositive;

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: darkMode ? '#262626' : '#fff',
      borderColor: darkMode ? '#404040' : '#ccc',
      textStyle: {
        color: textColor,
      },
      formatter: (params: { data: [number, number] }[]) => {
        const [x, y] = params[0].data;
        return `<b>Index:</b> ${x}<br/><b>Value:</b> ${y.toExponential(4)}`;
      },
    },
    grid: {
      left: 80,
      right: 40,
      top: 40,
      bottom: 60,
    },
    xAxis: {
      type: 'value',
      name: 'Index',
      nameLocation: 'middle',
      nameGap: 30,
      min: 0,
      max: info.values.length - 1,
      nameTextStyle: {
        color: textColor,
      },
      axisLabel: {
        color: subtextColor,
      },
      axisLine: {
        lineStyle: {
          color: lineColor,
        },
      },
      splitLine: {
        lineStyle: {
          color: lineColor,
        },
      },
    },
    yAxis: {
      type: effectiveLogScale ? 'log' : 'value',
      name: name,
      nameLocation: 'middle',
      nameGap: 60,
      scale: true,
      nameTextStyle: {
        color: textColor,
      },
      axisLabel: {
        color: subtextColor,
        formatter: (value: number) => value.toExponential(1),
      },
      axisLine: {
        lineStyle: {
          color: lineColor,
        },
      },
      splitLine: {
        lineStyle: {
          color: lineColor,
        },
      },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'none',
        height: 20,
        bottom: 10,
        textStyle: {
          color: subtextColor,
        },
        borderColor: lineColor,
        fillerColor: darkMode ? 'rgba(80, 80, 80, 0.3)' : 'rgba(150, 150, 150, 0.3)',
        handleStyle: {
          color: darkMode ? '#525252' : '#a3a3a3',
          borderColor: darkMode ? '#737373' : '#666',
        },
        dataBackground: {
          lineStyle: {
            color: darkMode ? '#525252' : '#a3a3a3',
          },
          areaStyle: {
            color: darkMode ? '#404040' : '#ddd',
          },
        },
      },
    ],
    series: [
      {
        type: 'line',
        data: chartData,
        showSymbol: false,
        lineStyle: {
          width: 1.5,
        },
        emphasis: {
          lineStyle: {
            width: 2,
          },
        },
      },
    ],
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-mono font-medium">{name}</span>
          <span className="text-muted-foreground ml-2">
            ({info.values.length.toLocaleString()} points, {info.dtype})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`log-scale-${name}`}
            checked={logScale}
            onCheckedChange={(checked) => setLogScale(checked as boolean)}
            disabled={hasNonPositive}
          />
          <Label
            htmlFor={`log-scale-${name}`}
            className={`cursor-pointer text-sm ${hasNonPositive ? 'text-muted-foreground' : ''}`}
          >
            Log scale
            {hasNonPositive && ' (disabled: non-positive values)'}
          </Label>
        </div>
      </div>
      <ReactECharts
        option={option}
        style={{ height: '300px', width: '100%' }}
        notMerge={true}
      />
    </div>
  );
}
