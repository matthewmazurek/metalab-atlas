/**
 * EChartsChart - Wrapper around echarts-for-react for rendering charts.
 */

import { useRef, useEffect, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption, ECharts } from 'echarts';

/** Click event data - either a single run or multiple aggregated runs */
export interface PointClickData {
  /** Single run ID (for non-aggregated points) */
  runId?: string;
  /** Multiple run IDs (for aggregated points) */
  runIds?: string[];
}

interface EChartsChartProps {
  /** The ECharts option to render */
  option: EChartsOption;
  /** Callback when a data point is clicked */
  onPointClick?: (data: PointClickData) => void;
  /** Chart container class name */
  className?: string;
  /** Chart height (defaults to 100%) */
  height?: string | number;
}

export function EChartsChart({
  option,
  onPointClick,
  className,
  height = '100%',
}: EChartsChartProps) {
  const chartRef = useRef<ReactECharts>(null);

  // Set up click event handler
  const handleClick = useCallback(
    (params: { data?: { run_id?: string; run_ids?: string[] } }) => {
      if (!onPointClick) return;

      const data = params.data;
      if (!data) return;

      // Check for aggregated points with multiple run IDs first
      if (data.run_ids && Array.isArray(data.run_ids) && data.run_ids.length > 0) {
        if (data.run_ids.length === 1) {
          // Single run in aggregated point - treat as single run click
          onPointClick({ runId: data.run_ids[0] });
        } else {
          // Multiple runs - pass the array
          onPointClick({ runIds: data.run_ids });
        }
        return;
      }

      // Fall back to single run_id (non-aggregated points)
      if (data.run_id && typeof data.run_id === 'string') {
        onPointClick({ runId: data.run_id });
      }
    },
    [onPointClick]
  );

  // Register/unregister click handler when chart instance changes
  useEffect(() => {
    const chartInstance = chartRef.current?.getEchartsInstance();
    if (!chartInstance) return;

    chartInstance.on('click', handleClick as never);

    return () => {
      chartInstance.off('click', handleClick as never);
    };
  }, [handleClick]);

  // Handle chart ready - needed because the instance might not be available immediately
  const onChartReady = useCallback(
    (instance: ECharts) => {
      if (onPointClick) {
        instance.on('click', handleClick as never);
      }
    },
    [onPointClick, handleClick]
  );

  return (
    <div className={className}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height, width: '100%' }}
        notMerge={true}
        lazyUpdate={true}
        onChartReady={onChartReady}
      />
    </div>
  );
}
