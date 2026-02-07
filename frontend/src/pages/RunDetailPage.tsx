import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRun, useLatestManifest } from '@/api/hooks';
import { useAtlasStore } from '@/store/useAtlasStore';
import { StatusBadge } from '@/components/runs/StatusBadge';
import { MetricsSummaryCard } from '@/components/experiments/MetricsSummaryCard';
import { DistributionCard } from '@/components/experiments/DistributionCard';
import { KeyValueDisplay } from '@/components/detail/KeyValueDisplay';
import { CopyableField } from '@/components/detail/CopyableField';
import { ArtifactList } from '@/components/detail/ArtifactList';
import { LogViewer } from '@/components/detail/LogViewer';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ExperimentTagList } from '@/components/ui/experiment-tag';
import { TruncatedId } from '@/components/ui/truncated-id';
import { SECTION_HEADING_CLASS } from '@/lib/styles';
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  Layers,
  Loader2,
  PlayCircle,
  Sliders,
  Tag,
  XCircle,
} from 'lucide-react';
import { formatRelativeTime, formatTimestamp, formatDuration } from '@/lib/datetime';

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  // Run query auto-polls every 5s when status is 'running'
  const { data: run, isLoading, isError } = useRun(runId || '');

  // Get manifest to get experiment display name
  const experimentId = run?.record.experiment_id || '';
  const { data: manifest } = useLatestManifest(experimentId);
  // Derived state
  const isRunning = run?.record.status === 'running';
  const isFailed = run?.record.status === 'failed';
  const isSuccess = run?.record.status === 'success';

  const hasMetrics = run ? Object.keys(run.metrics).length > 0 : false;
  const hasDerived = run ? Object.keys(run.derived_metrics).length > 0 : false;
  const hasParams = run ? Object.keys(run.params).length > 0 : false;

  // Full identifiers (used by TruncatedId for tooltip)
  const fullRunId = run?.record.run_id ?? runId ?? '';
  const fullSeed = run?.record.seed_fingerprint;

  // Compact param pills for the page title (e.g. GENE Gene_0001  SEED a1b2c3d4…)
  const MAX_TITLE_PARAMS = 3;
  const paramTitle = useMemo(() => {
    if (!run || !hasParams) return null;
    const entries = Object.entries(run.params);
    const visible = entries.slice(0, MAX_TITLE_PARAMS);
    const rest = entries.length - MAX_TITLE_PARAMS;
    return (
      <div className="flex flex-wrap items-end divide-x divide-border/40">
        {visible.map(([k, v]) => {
          const display = typeof v === 'string' ? v : JSON.stringify(v);
          return (
            <div key={k} className="px-4 first:pl-0 last:pr-0">
              <div className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {k}
              </div>
              <div className="text-3xl font-bold leading-tight tracking-tight text-foreground font-sans">
                <TruncatedId value={display} chars={20} mono={false} />
              </div>
            </div>
          );
        })}
        {fullSeed && (
          <div className="px-4 first:pl-0 last:pr-0">
            <div className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              seed
            </div>
            <div className="text-3xl font-bold leading-tight tracking-tight text-foreground">
              <TruncatedId value={fullSeed} />
            </div>
          </div>
        )}
        {rest > 0 && (
          <div className="px-4 self-end pb-1">
            <span className="text-sm text-muted-foreground font-normal">+{rest} more</span>
          </div>
        )}
      </div>
    );
  }, [run, hasParams, fullSeed]);

  // Merged metrics + derived for MetricsSummaryCard (run-context mode)
  const runValues = useMemo(
    () => (run ? { ...run.metrics, ...run.derived_metrics } : {}),
    [run]
  );
  const { selectedMetricField, setSelectedMetricField } = useAtlasStore();

  // Available numeric field names for this run
  const availableNumericFields = useMemo(() => {
    if (!run) return new Set<string>();
    const fields = new Set<string>();
    for (const [name, value] of Object.entries(run.metrics)) {
      if (typeof value === 'number') fields.add(`metrics.${name}`);
    }
    for (const [name, value] of Object.entries(run.derived_metrics)) {
      if (typeof value === 'number') fields.add(`derived.${name}`);
    }
    return fields;
  }, [run]);

  // If the stored field isn't available in this run, fall back to the first numeric field
  useEffect(() => {
    if (!run || availableNumericFields.size === 0) return;
    if (selectedMetricField && availableNumericFields.has(selectedMetricField)) return;
    // Pick the first available numeric field as default
    const first = availableNumericFields.values().next().value;
    if (first) setSelectedMetricField(first);
  }, [run, availableNumericFields, selectedMetricField, setSelectedMetricField]);
  const currentRunValue = useMemo(() => {
    if (!run || !selectedMetricField) return null;
    const [prefix, name] = selectedMetricField.split('.');
    const source = prefix === 'derived' ? run.derived_metrics : run.metrics;
    const v = source[name];
    return typeof v === 'number' ? v : null;
  }, [run, selectedMetricField]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={paramTitle ?? <TruncatedId value={fullRunId} className="text-4xl font-bold tracking-tight" />}
        breadcrumb={[
          { label: 'Experiments', href: '/experiments' },
          { label: experimentId, href: `/experiments/${encodeURIComponent(experimentId)}` },
          { label: 'Runs', href: `/runs?experiment_id=${encodeURIComponent(experimentId)}` },
          { label: <TruncatedId value={fullRunId} /> },
        ]}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          Row 1: Overview + Parameters (side-by-side)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Overview Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Overview
            </CardTitle>
            <CardAction>
              <StatusBadge status={run.record.status} />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status indicator */}
            <div className="flex items-center gap-3">
              {isSuccess ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-status-success shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-status-success">Success</span>
                    {run.record.duration_ms != null && (
                      <span className="text-sm text-muted-foreground">
                        in {formatDuration(run.record.duration_ms)}
                      </span>
                    )}
                  </div>
                </>
              ) : isFailed ? (
                <>
                  <XCircle className="h-5 w-5 text-status-failure shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-status-failure">Failed</span>
                    {run.record.error?.type && (
                      <span className="text-sm text-status-failure">
                        ({run.record.error.type})
                      </span>
                    )}
                  </div>
                </>
              ) : isRunning ? (
                <>
                  <PlayCircle className="h-5 w-5 text-status-running shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-status-running">Running</span>
                    <span className="text-sm text-muted-foreground">
                      {formatRelativeTime(run.record.started_at)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-muted-foreground capitalize">{run.record.status}</span>
                  </div>
                </>
              )}
            </div>

            {/* Run ID (copyable) */}
            <div className="border-t pt-4">
              <CopyableField label="Run ID" value={run.record.run_id} />
            </div>

            {/* Summary pills */}
            <div className="border-t pt-4 space-y-3">
              <div className="font-sans text-xs font-medium uppercase tracking-wide text-brand-tertiary">
                Summary
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Started */}
                <div className="rounded-lg border border-border/50 bg-card/70 px-3 py-2">
                  <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Started
                  </div>
                  <div className="text-sm font-medium">
                    {formatRelativeTime(run.record.started_at)}
                  </div>
                  <div className="font-sans text-xs text-muted-foreground">
                    {formatTimestamp(run.record.started_at)}
                  </div>
                </div>

                {/* Finished */}
                <div className="rounded-lg border border-border/50 bg-card/70 px-3 py-2">
                  <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Finished
                  </div>
                  <div className="text-sm font-medium">
                    {run.record.finished_at ? formatRelativeTime(run.record.finished_at) : '—'}
                  </div>
                  <div className="font-sans text-xs text-muted-foreground">
                    {run.record.finished_at ? formatTimestamp(run.record.finished_at) : '—'}
                  </div>
                </div>

                {/* Executor */}
                <div className="rounded-lg border border-border/50 bg-card/70 px-3 py-2">
                  <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Executor
                  </div>
                  <div className="text-sm font-medium">
                    {run.record.provenance.executor_id || 'Unknown'}
                  </div>
                </div>

                {/* Host (if available) */}
                {run.record.provenance.host && (
                  <div className="rounded-lg border border-border/50 bg-card/70 px-3 py-2">
                    <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Host
                    </div>
                    <div className="text-sm font-medium font-mono">
                      {run.record.provenance.host}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tags (from experiment manifest) */}
            {manifest?.tags && manifest.tags.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <ExperimentTagList tags={manifest.tags} maxVisible={10} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Parameters Card */}
        {hasParams ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sliders className="h-4 w-4" />
                Parameters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValueDisplay data={run.params} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sliders className="h-4 w-4" />
                Parameters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No parameters recorded.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          Error Card (promoted to top when failed)
          ═══════════════════════════════════════════════════════════════════ */}
      {run.record.error && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold">{run.record.error.type}</div>
                <div className="text-sm text-muted-foreground mt-1">{run.record.error.message}</div>
              </div>
              {run.record.error.traceback && (
                <pre className="p-4 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-64">
                  {run.record.error.traceback}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Outcomes (Metrics Summary + Distribution)
          ═══════════════════════════════════════════════════════════════════ */}
      {(hasMetrics || hasDerived) && experimentId && (
        <div className="space-y-3">
          <h2 className={SECTION_HEADING_CLASS}>Outcomes</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <MetricsSummaryCard
              experimentId={experimentId}
              selectedField={selectedMetricField}
              onFieldSelect={setSelectedMetricField}
              runValues={runValues}
              isInProgress={isRunning}
            />
            <DistributionCard
              experimentId={experimentId}
              selectedField={selectedMetricField}
              onFieldChange={setSelectedMetricField}
              runValue={currentRunValue}
              isInProgress={isRunning}
            />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Artifacts
          ═══════════════════════════════════════════════════════════════════ */}
      {run.artifacts.length > 0 && (
        <div className="space-y-3">
          <h2 className={SECTION_HEADING_CLASS}>Artifacts</h2>
          <ArtifactList runId={run.record.run_id} artifacts={run.artifacts} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Logs (full width)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h2 className={SECTION_HEADING_CLASS}>Logs</h2>
        <LogViewer runId={run.record.run_id} isRunning={isRunning} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          Provenance (low-priority, always last)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h2 className={SECTION_HEADING_CLASS}>Provenance</h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Fingerprint className="h-4 w-4" />
              Reproducibility
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {run.record.provenance.code_hash && (
                <CopyableField
                  label="Code hash"
                  value={run.record.provenance.code_hash}
                />
              )}
              {run.record.context_fingerprint && (
                <CopyableField
                  label="Context fingerprint"
                  value={run.record.context_fingerprint}
                />
              )}
              {run.record.params_fingerprint && (
                <CopyableField
                  label="Params fingerprint"
                  value={run.record.params_fingerprint}
                />
              )}
              {run.record.seed_fingerprint && (
                <CopyableField
                  label="Seed fingerprint"
                  value={run.record.seed_fingerprint}
                />
              )}
              {run.record.provenance.python_version && (
                <CopyableField
                  label="Python version"
                  value={run.record.provenance.python_version}
                  mono={false}
                />
              )}
              {run.record.provenance.metalab_version && (
                <CopyableField
                  label="metalab version"
                  value={run.record.provenance.metalab_version}
                  mono={false}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
