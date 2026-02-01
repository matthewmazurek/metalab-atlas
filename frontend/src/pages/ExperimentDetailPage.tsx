import { useParams, Link } from 'react-router-dom';
import { useExperiments, useLatestManifest, useExperimentManifests, useStatusCounts, useFields } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ExperimentTagList } from '@/components/ui/experiment-tag';
import { ExportModal } from '@/components/experiments/ExportModal';
import { MetricsSummaryCard } from '@/components/experiments/MetricsSummaryCard';
import { DistributionCard } from '@/components/experiments/DistributionCard';
import { ParamsDisplay, MetadataDisplay } from '@/components/detail/KeyValueDisplay';
import { SlurmStatusBadge } from '@/components/experiments/SlurmStatusBadge';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Download,
  FileJson,
  Fingerprint,
  Info,
  Layers,
  Loader2,
  PlayCircle,
  Sliders,
  Tag,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeTime, formatTimestamp } from '@/lib/datetime';

// API base URL for downloads
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:8000');

const SECTION_HEADING_CLASS =
  'text-[11px] font-medium tracking-wider text-muted-foreground uppercase';

/**
 * Copyable field component with click-to-copy functionality
 */
function CopyableField({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group min-w-0">
      <div className="text-muted-foreground text-xs mb-0.5">{label}</div>
      <div className="flex items-start gap-1">
        <div className="overflow-x-auto min-w-0 flex-1">
          <button
            onClick={handleCopy}
            className={cn(
              'text-sm text-left hover:bg-muted/50 px-1 -mx-1 rounded transition-colors whitespace-nowrap',
              mono && 'font-mono'
            )}
            title="Click to copy"
          >
            {value}
          </button>
        </div>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded shrink-0"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}

function getParamCombinations(params: Record<string, unknown> | null | undefined): number | null {
  if (!params) return null;
  const totalCases = params.total_cases;
  if (typeof totalCases === 'number' && Number.isFinite(totalCases)) {
    return totalCases;
  }
  if (params.type === 'RandomSource') {
    const nTrials = params.n_trials;
    if (typeof nTrials === 'number' && Number.isFinite(nTrials)) {
      return nTrials;
    }
  }
  return null;
}

function getSeedReplicates(seeds: Record<string, unknown> | null | undefined): number | null {
  if (!seeds) return null;
  const replicates = seeds.replicates;
  if (typeof replicates === 'number' && Number.isFinite(replicates)) {
    return replicates;
  }
  return null;
}


export function ExperimentDetailPage() {
  const { experimentId } = useParams<{ experimentId: string }>();
  const decodedExperimentId = experimentId ? decodeURIComponent(experimentId) : '';

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false);

  // Selected metric field for distribution card (shared between summary and distribution)
  const [selectedMetricField, setSelectedMetricField] = useState<string>('');

  const { data: experimentsData } = useExperiments();
  const {
    data: manifest,
    isLoading: manifestLoading,
    error: manifestError,
  } = useLatestManifest(decodedExperimentId);

  // Fetch all manifests for this experiment (for execution history)
  const { data: manifestsData } = useExperimentManifests(decodedExperimentId);

  // Find experiment info
  const experiment = experimentsData?.experiments.find(
    (e) => e.experiment_id === decodedExperimentId
  );

  // Get status counts (single efficient API call)
  const { data: statusCounts } = useStatusCounts(decodedExperimentId);
  const successCount = statusCounts?.success ?? 0;
  const failedCount = statusCounts?.failed ?? 0;
  const runningCount = statusCounts?.running ?? 0;

  // Get field index for metrics section
  const { data: fieldsData } = useFields(decodedExperimentId);
  const hasMetrics = fieldsData &&
    (Object.keys(fieldsData.metrics_fields || {}).length > 0 ||
      Object.keys(fieldsData.derived_fields || {}).length > 0);

  // Total expected from manifest
  const expectedTotal = manifest?.total_runs;
  const paramCombinations = getParamCombinations(manifest?.params);
  const seedReplicates = getSeedReplicates(manifest?.seeds);
  const calculatedTotal = paramCombinations != null && seedReplicates != null
    ? paramCombinations * seedReplicates
    : null;

  // Display name for breadcrumb
  const displayName = manifest?.name || decodedExperimentId;

  // Computed status values
  const completedRuns = successCount + failedCount;
  const isComplete = expectedTotal != null && completedRuns >= expectedTotal;
  const hasFailures = failedCount > 0;
  const isAllSuccess = isComplete && !hasFailures;

  // Progress percentages (for visual bar)
  const totalForPercent = expectedTotal ?? completedRuns;
  const successPercent = totalForPercent > 0 ? (successCount / totalForPercent) * 100 : 0;
  const failedPercent = totalForPercent > 0 ? (failedCount / totalForPercent) * 100 : 0;
  const runningPercent = totalForPercent > 0 ? (runningCount / totalForPercent) * 100 : 0;
  const completedPercent = totalForPercent > 0 ? Math.round((completedRuns / totalForPercent) * 100) : 0;

  // Failure rate (only meaningful when there are completed runs)
  const failureRate = completedRuns > 0 ? ((failedCount / completedRuns) * 100).toFixed(1) : null;

  if (!experimentId) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Experiment not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="truncate">{displayName}</span>
            {manifest?.version && (
              <span className="px-2 py-0.5 bg-card/70 rounded text-sm font-normal text-muted-foreground shrink-0">
                v{manifest.version}
              </span>
            )}
          </span>
        }
        breadcrumb={[
          { label: 'Experiments', href: '/experiments' },
          { label: displayName },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Link to={`/plots?experiment_id=${encodeURIComponent(decodedExperimentId)}`}>
              <Button variant="outline">
                <BarChart3 className="mr-2 h-4 w-4" />
                View Plots
              </Button>
            </Link>
            <Link to={`/runs?experiment_id=${encodeURIComponent(decodedExperimentId)}`}>
              <Button>
                View Runs
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </>
        }
      />

      {/* Overview Card - Streamlined Layout */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Overview
          </CardTitle>
          <CardAction>
            <SlurmStatusBadge experimentId={decodedExperimentId} compact />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status + Progress Bar */}
          <div className="space-y-3">
            {/* Status indicator */}
            <div className="flex items-center gap-3">
              {isAllSuccess ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">Complete</span>
                    <span className="text-sm text-muted-foreground">
                      {completedRuns}/{expectedTotal ?? '—'} runs
                    </span>
                  </div>
                </>
              ) : isComplete && hasFailures ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-violet-600 dark:text-violet-400">Complete</span>
                    <span className="text-sm text-violet-600 dark:text-violet-400">(with failures)</span>
                    <span className="text-sm text-muted-foreground">
                      {completedRuns}/{expectedTotal ?? '—'} runs
                    </span>
                  </div>
                </>
              ) : hasFailures ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-violet-600 dark:text-violet-400">In progress</span>
                    <span className="text-sm text-violet-600 dark:text-violet-400">(with failures)</span>
                    <span className="text-sm text-muted-foreground">
                      {completedRuns}/{expectedTotal ?? '—'} runs
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <PlayCircle className="h-5 w-5 text-cyan-700 dark:text-cyan-300 shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-cyan-700 dark:text-cyan-300">In progress</span>
                    <span className="text-sm text-muted-foreground">
                      {completedRuns}/{expectedTotal ?? '—'} runs
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Progress bar */}
            {expectedTotal != null && expectedTotal > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden flex">
                  {successPercent > 0 && (
                    <div
                      className="h-full bg-emerald-500 dark:bg-emerald-400"
                      style={{ width: `${successPercent}%` }}
                    />
                  )}
                  {failedPercent > 0 && (
                    <div
                      className="h-full bg-rose-500 dark:bg-rose-400"
                      style={{ width: `${failedPercent}%` }}
                    />
                  )}
                  {runningPercent > 0 && (
                    <div
                      className="h-full bg-cyan-500 dark:bg-cyan-400"
                      style={{ width: `${runningPercent}%` }}
                    />
                  )}
                </div>
                <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">
                  {completedPercent}%
                </span>
              </div>
            )}
          </div>

          {/* Summary stats (compact pills) */}
          <div className="border-t pt-4 space-y-3">
            <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              Summary
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Total */}
              <div
                className="rounded-lg border border-border/50 bg-card/70 px-3 py-2"
              >
                <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Total
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {expectedTotal ?? calculatedTotal ?? '—'}
                </div>
                {paramCombinations != null && seedReplicates != null && (
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {paramCombinations.toLocaleString()} params × {seedReplicates.toLocaleString()} seeds
                  </div>
                )}
              </div>

              {/* Success */}
              <Link
                to={`/runs?experiment_id=${encodeURIComponent(decodedExperimentId)}&status=success`}
                className="rounded-lg border border-border/50 bg-card/70 px-3 py-2 transition-colors hover:bg-card/95"
              >
                <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Success
                </div>
                <div
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    successCount > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
                  )}
                >
                  {successCount}
                </div>
              </Link>

              {/* Failed */}
              <Link
                to={`/runs?experiment_id=${encodeURIComponent(decodedExperimentId)}&status=failed`}
                className="rounded-lg border border-border/50 bg-card/70 px-3 py-2 transition-colors hover:bg-card/95"
              >
                <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Failed
                </div>
                <div
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    failedCount > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground'
                  )}
                >
                  {failedCount}
                </div>
              </Link>

              {/* Running */}
              <Link
                to={`/runs?experiment_id=${encodeURIComponent(decodedExperimentId)}&status=running`}
                className="rounded-lg border border-border/50 bg-card/70 px-3 py-2 transition-colors hover:bg-card/95"
              >
                <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Running
                </div>
                <div
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    runningCount > 0 ? 'text-cyan-700 dark:text-cyan-300' : 'text-muted-foreground'
                  )}
                >
                  {runningCount}
                </div>
              </Link>

              {/* Failure rate */}
              {hasFailures && failureRate && (
                <div className="rounded-lg border border-border/50 bg-card/70 px-3 py-2">
                  <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    Failure rate
                  </div>
                  <div className="text-sm font-medium tabular-nums text-rose-700 dark:text-rose-300">
                    {failureRate}%
                  </div>
                </div>
              )}

              {/* Latest */}
              <div
                className="rounded-lg border border-border/50 bg-card/70 px-3 py-2"
              >
                <div className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Latest
                </div>
                <div className="text-sm font-medium">
                  {formatRelativeTime(experiment?.latest_run)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {experiment?.latest_run ? formatTimestamp(experiment.latest_run) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Metadata strip + description + tags */}
          <div className="border-t pt-4 space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                {displayName}
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {manifest?.description || '—'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span
                className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-card/70 px-2 py-0.5 text-xs text-muted-foreground min-w-0"
                title="Experiment ID"
              >
                <span className="shrink-0">ID</span>
                <span className="font-mono truncate">{decodedExperimentId}</span>
              </span>

              <span
                className="inline-flex items-center rounded-md border border-border/50 bg-card/70 px-2 py-0.5 text-xs text-muted-foreground"
                title="Version"
              >
                {manifest?.version ? `v${manifest.version}` : '—'}
              </span>
            </div>

            {manifest?.tags && manifest.tags.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <ExperimentTagList tags={manifest.tags} maxVisible={10} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 2: Manifest (loading/error)
          ═══════════════════════════════════════════════════════════════════ */}
      {/* Manifest loading state */}
      {manifestLoading && (
        <Card>
          <CardContent className="py-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading manifest...
          </CardContent>
        </Card>
      )}

      {/* Manifest not found */}
      {!manifestLoading && manifestError && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>No manifest available</p>
            <p className="text-xs mt-1">
              Run the experiment to generate a manifest
            </p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 3: Parameters + Metadata
          ═══════════════════════════════════════════════════════════════════ */}
      {manifest && !manifestError && (
        <>
          <div className="space-y-3">
            <h2 className={SECTION_HEADING_CLASS}>Parameters & Metadata</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Parameters Card */}
              {manifest.params && Object.keys(manifest.params).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Sliders className="h-4 w-4" />
                      Parameters
                      {manifest.params.type != null && (
                        <span className="text-xs text-muted-foreground font-normal">
                          ({String(manifest.params.type)})
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ParamsDisplay params={manifest.params} />
                  </CardContent>
                </Card>
              )}

              {/* Metadata Card */}
              {manifest.metadata && Object.keys(manifest.metadata).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Metadata
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MetadataDisplay metadata={manifest.metadata as Record<string, unknown>} />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 4: Outcomes (Metrics)
          ═══════════════════════════════════════════════════════════════════ */}
      {hasMetrics && (
        <div className="space-y-3">
          <h2 className={SECTION_HEADING_CLASS}>Outcomes</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <MetricsSummaryCard
              experimentId={decodedExperimentId}
              selectedField={selectedMetricField}
              onFieldSelect={setSelectedMetricField}
            />
            <DistributionCard
              experimentId={decodedExperimentId}
              selectedField={selectedMetricField}
              onFieldChange={setSelectedMetricField}
            />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 5: Operation + History
          ═══════════════════════════════════════════════════════════════════ */}
      {manifest && !manifestError && (
        <div className="space-y-3">
          <h2 className={SECTION_HEADING_CLASS}>Operation & History</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Operation Card */}
            {manifest.operation && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Operation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {manifest.operation.name && (
                      <CopyableField
                        label="Name"
                        value={manifest.operation.name}
                      />
                    )}
                    {manifest.operation.ref && (
                      <CopyableField
                        label="Ref"
                        value={manifest.operation.ref}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* History Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  History
                  {manifestsData && manifestsData.manifests.length > 0 && (
                    <span className="text-xs text-muted-foreground font-normal">
                      ({manifestsData.manifests.length} {manifestsData.manifests.length === 1 ? 'run' : 'runs'})
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {manifestsData && manifestsData.manifests.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {manifestsData.manifests.map((m) => (
                      <div
                        key={m.timestamp}
                        className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm truncate">{formatTimestamp(m.submitted_at)}</div>
                            <div className="text-xs text-muted-foreground">{m.total_runs} runs</div>
                          </div>
                        </div>
                        <a
                          href={`${API_BASE}/api/experiments/${encodeURIComponent(decodedExperimentId)}/manifests/${m.timestamp}?pretty=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                        >
                          <Download className="h-3 w-3" />
                          JSON
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No execution history</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 6: Provenance
          ═══════════════════════════════════════════════════════════════════ */}
      {manifest && !manifestError && (
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
                {manifest.seeds?.base !== undefined && (
                  <CopyableField
                    label="Base seed"
                    value={String(manifest.seeds.base)}
                  />
                )}
                {manifest.seeds?.replicates !== undefined && (
                  <CopyableField
                    label="Replicates"
                    value={String(manifest.seeds.replicates)}
                  />
                )}
                {manifest.context_fingerprint && (
                  <CopyableField
                    label="Context fingerprint"
                    value={manifest.context_fingerprint}
                  />
                )}
                {manifest.operation?.code_hash && (
                  <CopyableField
                    label="Code hash"
                    value={manifest.operation.code_hash}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 7: Footer (cardless)
          ═══════════════════════════════════════════════════════════════════ */}
      {manifest && !manifestError && (
        <div className="text-xs text-muted-foreground/70 text-center pt-2">
          Experiment ID: <span className="font-mono">{decodedExperimentId}</span>
          {manifest.version && <> · v{manifest.version}</>}
          {manifest.context_fingerprint && (
            <> · Context: <span className="font-mono">{manifest.context_fingerprint.slice(0, 8)}</span></>
          )}
        </div>
      )}

      {/* Export Modal */}
      <ExportModal
        experimentId={decodedExperimentId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </div>
  );
}

