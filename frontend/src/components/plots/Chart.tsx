import ReactECharts from 'echarts-for-react';
import type { AggregateResponse } from '@/api/types';
import { useNavigate } from 'react-router-dom';
import { useAtlasStore } from '@/store/useAtlasStore';

interface ChartProps {
  data: AggregateResponse;
}

export function Chart({ data }: ChartProps) {
  const navigate = useNavigate();
  const { darkMode } = useAtlasStore();

  // Text colors for dark/light mode
  const textColor = darkMode ? '#e5e5e5' : '#333';
  const subtextColor = darkMode ? '#a3a3a3' : '#666';
  const lineColor = darkMode ? '#404040' : '#ccc';

  if (data.series.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        No data to display
      </div>
    );
  }

  // Build ECharts option
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: darkMode ? '#262626' : '#fff',
      borderColor: darkMode ? '#404040' : '#ccc',
      textStyle: {
        color: textColor,
      },
      formatter: (params: { data: { value: number[]; runIds?: string[] } }) => {
        const [x, y] = params.data.value;
        const runIds = params.data.runIds;
        let html = `<b>${data.x_field}</b>: ${x}<br/><b>${data.y_field}</b>: ${y.toFixed(4)}`;
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
      textStyle: {
        color: textColor,
      },
    },
    xAxis: {
      name: data.x_field,
      nameLocation: 'middle',
      nameGap: 30,
      type: typeof data.series[0]?.points[0]?.x === 'string' ? 'category' : 'value',
      data: typeof data.series[0]?.points[0]?.x === 'string'
        ? [...new Set(data.series.flatMap((s) => s.points.map((p) => p.x)))]
        : undefined,
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
      name: data.y_field,
      nameLocation: 'middle',
      nameGap: 50,
      type: 'value',
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
    series: data.series.flatMap((series) => {
      const mainSeries = {
        name: series.name,
        type: 'scatter',
        symbolSize: 10,
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
            renderItem: (
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
            },
            data: errorData,
            z: -1,
          },
        ];
      }

      return [mainSeries];
    }),
  };

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
