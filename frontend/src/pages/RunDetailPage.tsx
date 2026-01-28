import { useParams, Link } from 'react-router-dom';
import { useRun } from '@/api/hooks';
import { StatusBadge } from '@/components/runs/StatusBadge';
import { MetricsGrid } from '@/components/detail/MetricsGrid';
import { ArtifactList } from '@/components/detail/ArtifactList';
import { LogViewer } from '@/components/detail/LogViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/ui/typography';
import { ArrowLeft, Loader2 } from 'lucide-react';

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  // Run query auto-polls every 5s when status is 'running'
  const { data: run, isLoading, isError } = useRun(runId || '');

  // Derived state for child components
  const isRunning = run?.record.status === 'running';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !run) {
    return (
      <div className="space-y-4">
        <Link to="/runs">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to runs
          </Button>
        </Link>
        <div className="text-center p-8 text-destructive">
          Run not found: {runId}
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/runs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <PageTitle className="font-mono">{run.record.run_id}</PageTitle>
          <div className="text-muted-foreground">{run.record.experiment_id}</div>
        </div>
        <StatusBadge status={run.record.status} />
      </div>

      {/* Overview card */}
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Started</div>
              <div>{formatDate(run.record.started_at)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Finished</div>
              <div>{run.record.finished_at ? formatDate(run.record.finished_at) : '—'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Duration</div>
              <div>{run.record.duration_ms != null ? formatDuration(run.record.duration_ms) : '—'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Executor</div>
              <div>{run.record.provenance.executor_id || 'Unknown'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error card (if failed) */}
      {run.record.error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="font-semibold">{run.record.error.type}</div>
              <div>{run.record.error.message}</div>
              {run.record.error.traceback && (
                <pre className="p-4 bg-muted rounded text-sm overflow-auto">
                  {run.record.error.traceback}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Params */}
      <MetricsGrid title="Parameters (Inputs)" data={run.params} />

      {/* Metrics */}
      <MetricsGrid title="Metrics (Outputs)" data={run.metrics} />

      {/* Provenance */}
      <Card>
        <CardHeader>
          <CardTitle>Provenance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Code Hash</div>
              <div className="font-mono text-sm">
                {run.record.provenance.code_hash?.slice(0, 12) || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Context FP</div>
              <div className="font-mono text-sm">
                {run.record.context_fingerprint?.slice(0, 12) || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Params FP</div>
              <div className="font-mono text-sm">
                {run.record.params_fingerprint?.slice(0, 12) || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Seed FP</div>
              <div className="font-mono text-sm">
                {run.record.seed_fingerprint?.slice(0, 12) || 'N/A'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Artifacts */}
      <ArtifactList runId={run.record.run_id} artifacts={run.artifacts} />

      {/* Logs - polls every 5s when run is active */}
      <LogViewer runId={run.record.run_id} isRunning={isRunning} />
    </div>
  );
}
