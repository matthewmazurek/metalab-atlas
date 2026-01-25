import { useSearchParams, Link } from 'react-router-dom';
import { useRun } from '@/api/hooks';
import { StatusBadge } from '@/components/runs/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAtlasStore } from '@/store/useAtlasStore';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function RunCompareCard({ runId, isBaseline }: { runId: string; isBaseline: boolean }) {
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
          <div className="text-xs text-primary font-medium mt-2">BASELINE</div>
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
                    <span className="font-mono">
                      {typeof value === 'number' ? value.toFixed(4) : String(value)}
                    </span>
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
                    <span className="font-mono">
                      {typeof value === 'number' ? value.toFixed(4) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Duration</span>
            <span>{run.record.duration_ms}ms</span>
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
  const { selectedRunIds, baselineRunId } = useAtlasStore();

  // Use URL params if provided, otherwise use selected runs from store
  const compareIds = runIds.length > 0 ? runIds : selectedRunIds;

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
          />
        ))}
      </div>
    </div>
  );
}
