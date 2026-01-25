import { useSearchParams, Link } from 'react-router-dom';
import { useRun } from '@/api/hooks';
import { StatusBadge } from '@/components/runs/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAtlasStore } from '@/store/useAtlasStore';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RunResponse } from '@/api/types';

/** Format a numeric delta as a string with +/- prefix and color class */
function formatDelta(current: number, baseline: number): { text: string; className: string } | null {
  const delta = current - baseline;
  if (delta === 0) return null;
  
  const sign = delta > 0 ? '+' : '';
  // Use scientific notation for very small/large deltas, otherwise fixed
  const formatted = Math.abs(delta) < 0.0001 || Math.abs(delta) >= 10000
    ? delta.toExponential(2)
    : delta.toFixed(4);
  
  return {
    text: `${sign}${formatted}`,
    className: delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
  };
}

interface RunCompareCardProps {
  runId: string;
  isBaseline: boolean;
  baselineRun: RunResponse | null;
}

function RunCompareCard({ runId, isBaseline, baselineRun }: RunCompareCardProps) {
  const { data: run, isLoading, isError } = useRun(runId);
  const { setBaselineRunId } = useAtlasStore();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !run) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64 text-destructive">
          Failed to load run: {runId}
        </CardContent>
      </Card>
    );
  }

  // Helper to render a value with optional delta comparison
  const renderValueWithDelta = (
    value: unknown,
    baselineValue: unknown | undefined,
    showDelta: boolean
  ) => {
    const isNumeric = typeof value === 'number';
    const formattedValue = isNumeric ? value.toFixed(4) : String(value);
    
    // Only show delta for numeric values when we have a baseline and this isn't the baseline
    const delta = showDelta && isNumeric && typeof baselineValue === 'number'
      ? formatDelta(value, baselineValue)
      : null;

    return (
      <span className="font-mono flex items-center gap-2">
        {formattedValue}
        {delta && (
          <span className={cn('text-xs', delta.className)}>
            ({delta.text})
          </span>
        )}
      </span>
    );
  };

  const showDeltas = !isBaseline && baselineRun !== null;

  return (
    <Card className={cn(isBaseline && 'border-primary')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Link to={`/runs/${runId}`} className="hover:underline">
            <CardTitle className="font-mono text-sm">{runId.slice(0, 12)}...</CardTitle>
          </Link>
          <StatusBadge status={run.record.status} />
        </div>
        <div className="text-sm text-muted-foreground">{run.record.experiment_id}</div>
        {!isBaseline && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setBaselineRunId(runId)}
          >
            Set as baseline
          </Button>
        )}
        {isBaseline && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-primary font-medium">BASELINE</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => setBaselineRunId(null)}
              title="Clear baseline"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Params */}
          {Object.keys(run.params).length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Parameters</div>
              <div className="space-y-1">
                {Object.entries(run.params).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    {renderValueWithDelta(value, baselineRun?.params[key], showDeltas)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics */}
          {Object.keys(run.metrics).length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Metrics</div>
              <div className="space-y-1">
                {Object.entries(run.metrics).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    {renderValueWithDelta(value, baselineRun?.metrics[key], showDeltas)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Duration</span>
            {renderValueWithDelta(
              run.record.duration_ms,
              baselineRun?.record.duration_ms,
              showDeltas
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ComparePage() {
  const [searchParams] = useSearchParams();
  const runIdsParam = searchParams.get('runs') || '';
  const runIds = runIdsParam ? runIdsParam.split(',').filter(Boolean) : [];
  const { selectedRunIds, baselineRunId, setBaselineRunId } = useAtlasStore();

  // Use URL params if provided, otherwise use selected runs from store
  const compareIds = runIds.length > 0 ? runIds : selectedRunIds;

  // Fetch baseline run data if one is selected
  const { data: baselineRun } = useRun(baselineRunId ?? '');
  const validBaselineRun = baselineRunId && baselineRun ? baselineRun : null;

  if (compareIds.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Compare Runs</h1>
        </div>

        <Card>
          <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
            No runs selected for comparison. Go to the{' '}
            <Link to="/" className="text-primary hover:underline mx-1">
              Runs page
            </Link>{' '}
            and select runs to compare.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">
            Compare Runs ({compareIds.length})
          </h1>
        </div>
        {baselineRunId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBaselineRunId(null)}
          >
            <X className="h-4 w-4 mr-2" />
            Clear baseline
          </Button>
        )}
      </div>

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${Math.min(compareIds.length, 4)}, 1fr)`,
        }}
      >
        {compareIds.map((runId) => (
          <RunCompareCard
            key={runId}
            runId={runId}
            isBaseline={runId === baselineRunId}
            baselineRun={validBaselineRun}
          />
        ))}
      </div>
    </div>
  );
}
