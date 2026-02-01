import { useParams } from 'react-router-dom';
import { useRun, useLatestManifest } from '@/api/hooks';
import { StatusBadge } from '@/components/runs/StatusBadge';
import { MetricsGrid } from '@/components/detail/MetricsGrid';
import { ArtifactList } from '@/components/detail/ArtifactList';
import { LogViewer } from '@/components/detail/LogViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
  AlertCircle,
  BarChart3,
  Calculator,
  Fingerprint,
  Layers,
  Loader2,
  Settings,
} from 'lucide-react';
import { formatTimestamp } from '@/lib/datetime';

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  // Run query auto-polls every 5s when status is 'running'
  const { data: run, isLoading, isError } = useRun(runId || '');

  // Get manifest to get experiment display name
  const experimentId = run?.record.experiment_id || '';
  const { data: manifest } = useLatestManifest(experimentId);
  const experimentDisplayName = manifest?.name || experimentId;

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
      <div className="space-y-6">
        <PageHeader title={runId || 'Unknown'} />
        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p className="font-medium">Run not found</p>
          <p className="text-sm font-mono">{runId}</p>
        </div>
      </div>
    );
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="font-mono">{run.record.run_id}</span>}
        subtitle={<span className="font-mono text-xs">{experimentId}</span>}
        breadcrumb={[
          { label: 'Experiments', href: '/experiments' },
          { label: experimentDisplayName, href: `/experiments/${encodeURIComponent(experimentId)}` },
          { label: 'Runs', href: `/runs?experiment_id=${encodeURIComponent(experimentId)}` },
          { label: run.record.run_id.slice(0, 8) + '...' },
        ]}
        actions={<StatusBadge status={run.record.status} />}
      />

      {/* Overview card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Started</div>
              <div>{formatTimestamp(run.record.started_at)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Finished</div>
              <div>{run.record.finished_at ? formatTimestamp(run.record.finished_at) : '—'}</div>
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

      {/* Params */}
      <MetricsGrid title="Parameters (Inputs)" data={run.params} icon={Settings} />

      {/* Metrics */}
      <MetricsGrid title="Metrics (Outputs)" data={run.metrics} icon={BarChart3} />

      {/* Derived Metrics (only show if there are any) */}
      {run.derived_metrics && Object.keys(run.derived_metrics).length > 0 && (
        <MetricsGrid title="Derived Metrics" data={run.derived_metrics} icon={Calculator} />
      )}

      {/* Fingerprints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4" />
            Fingerprints
          </CardTitle>
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

      {/* Error card (if failed) */}
      {run.record.error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Error
            </CardTitle>
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

      {/* Logs - polls every 5s when run is active */}
      <LogViewer runId={run.record.run_id} isRunning={isRunning} />
    </div>
  );
}
