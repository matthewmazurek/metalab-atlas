import { useParams, Link } from 'react-router-dom';
import { useExperiments, useLatestManifest, useExperimentManifests, useManifest, useStatusCounts, useFields } from '@/api/hooks';
import type { ManifestInfo } from '@/api/types';
import { useAtlasStore } from '@/store/useAtlasStore';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { ExperimentTagList } from '@/components/ui/experiment-tag';
import { ExportModal } from '@/components/experiments/ExportModal';
import { MetricsSummaryCard } from '@/components/experiments/MetricsSummaryCard';
import { DistributionCard } from '@/components/experiments/DistributionCard';
import { ParamsDisplay, MetadataDisplay } from '@/components/detail/KeyValueDisplay';
import { CopyableField } from '@/components/detail/CopyableField';
import { SlurmStatusBadge } from '@/components/experiments/SlurmStatusBadge';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code,
  Download,
  Eye,
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
import { SECTION_HEADING_CLASS } from '@/lib/styles';

// API base URL for downloads
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:8000');

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


function ManifestPreviewDialog({
  experimentId,
  manifest,
  open,
  onClose,
}: {
  experimentId: string;
  manifest: ManifestInfo;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useManifest(experimentId, manifest.timestamp);
  const downloadUrl = `${API_BASE}/api/experiments/${encodeURIComponent(experimentId)}/manifests/${manifest.timestamp}?pretty=true`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            manifest-{manifest.timestamp}.json
            <span className="text-xs text-muted-foreground font-normal">
              ({manifest.total_runs} runs)
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="min-w-0 max-h-[60vh] overflow-auto rounded bg-muted">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading...</div>
          ) : data ? (
            <pre className="p-4 text-sm w-fit min-w-full">
              {JSON.stringify(data, null, 2)}
            </pre>
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              Unable to load manifest
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={downloadUrl} download={`manifest-${manifest.timestamp}.json`}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExperimentDetailPage() {
  const { experimentId } = useParams<{ experimentId: string }>();
  const decodedExperimentId = experimentId ? decodeURIComponent(experimentId) : '';

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false);

  // Manifest preview state
  const [previewManifest, setPreviewManifest] = useState<ManifestInfo | null>(null);

  // Selected metric field for distribution card (shared between summary and distribution)
  // Persisted in store so the selection carries over to run detail pages
  const { selectedMetricField, setSelectedMetricField } = useAtlasStore();

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
  const isInProgress = runningCount > 0;

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
          { label: decodedExperimentId },
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
                  <CheckCircle2 className="h-5 w-5 text-status-success shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-status-success">Complete</span>
                    <span className="text-sm text-muted-foreground">
                      {completedRuns}/{expectedTotal ?? '—'} runs
                    </span>
                  </div>
                </>
              ) : isComplete && hasFailures ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-status-warning shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-status-warning">Complete</span>
                    <span className="text-sm text-status-warning">(with failures)</span>
                    <span className="text-sm text-muted-foreground">
                      {completedRuns}/{expectedTotal ?? '—'} runs
                    </span>
                  </div>
                </>
              ) : hasFailures ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-status-warning shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-status-warning">In progress</span>
                    <span className="text-sm text-status-warning">(with failures)</span>
                    <span className="text-sm text-muted-foreground">
                      {completedRuns}/{expectedTotal ?? '—'} runs
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <PlayCircle className="h-5 w-5 text-status-running shrink-0" />
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-status-running">In progress</span>
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
                  {/* Filled progress segments with shimmer overlay */}
                  {(successPercent > 0 || failedPercent > 0 || runningPercent > 0) && (
                    <div
                      className="relative h-full flex overflow-hidden"
                      style={{ width: `${successPercent + failedPercent + runningPercent}%` }}
                    >
                      {successPercent > 0 && (
                        <div
                          className="h-full bg-status-success"
                          style={{ width: `${(successPercent / (successPercent + failedPercent + runningPercent)) * 100}%` }}
                        />
                      )}
                      {failedPercent > 0 && (
                        <div
                          className="h-full bg-status-failure"
                          style={{ width: `${(failedPercent / (successPercent + failedPercent + runningPercent)) * 100}%` }}
                        />
                      )}
                      {runningPercent > 0 && (
                        <div
                          className="h-full bg-status-running"
                          style={{ width: `${(runningPercent / (successPercent + failedPercent + runningPercent)) * 100}%` }}
                        />
                      )}
                      {/* Animated shimmer overlay for in-progress experiments */}
                      {isInProgress && (
                        <div className="absolute inset-0 overflow-hidden">
                          <div
                            className="progress-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                          />
                        </div>
                      )}
                    </div>
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
            <div className="font-sans text-xs font-medium uppercase tracking-wide text-brand-tertiary">
              Summary
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Total */}
              <div
                className="rounded-lg border border-border/50 bg-card/70 px-3 py-2"
              >
                <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {expectedTotal ?? calculatedTotal ?? '—'}
                </div>
                {paramCombinations != null && seedReplicates != null && (
                  <div className="font-sans text-xs text-muted-foreground tabular-nums">
                    {paramCombinations.toLocaleString()} params × {seedReplicates.toLocaleString()} seeds
                  </div>
                )}
              </div>

              {/* Success */}
              <Link
                to={`/runs?experiment_id=${encodeURIComponent(decodedExperimentId)}&status=success`}
                className="rounded-lg border border-border/50 bg-card/70 px-3 py-2 transition-colors hover:bg-card/95"
              >
                <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Success
                </div>
                <div
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    successCount > 0 ? 'text-status-success' : 'text-muted-foreground'
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
                <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Failed
                </div>
                <div
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    failedCount > 0 ? 'text-status-failure' : 'text-muted-foreground'
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
                <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Running
                </div>
                <div
                  className={cn(
                    'text-sm font-medium tabular-nums',
                    runningCount > 0 ? 'text-status-running' : 'text-muted-foreground'
                  )}
                >
                  {runningCount}
                </div>
              </Link>

              {/* Failure rate */}
              {hasFailures && failureRate && (
                <div className="rounded-lg border border-border/50 bg-card/70 px-3 py-2">
                  <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Failure rate
                  </div>
                  <div className="text-sm font-medium tabular-nums text-status-failure">
                    {failureRate}%
                  </div>
                </div>
              )}

              {/* Latest */}
              <div
                className="rounded-lg border border-border/50 bg-card/70 px-3 py-2"
              >
                <div className="font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Latest
                </div>
                <div className="text-sm font-medium">
                  {formatRelativeTime(experiment?.latest_run)}
                </div>
                <div className="font-sans text-xs text-muted-foreground">
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
              isInProgress={isInProgress}
            />
            <DistributionCard
              experimentId={decodedExperimentId}
              selectedField={selectedMetricField}
              onFieldChange={setSelectedMetricField}
              isInProgress={isInProgress}
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
                  <div className="grid gap-2 grid-cols-1 max-h-[13rem] overflow-y-auto">
                    {manifestsData.manifests.map((m) => (
                      <div
                        key={m.timestamp}
                        className="flex items-center justify-between p-3 border rounded-lg min-w-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileJson className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">manifest-{m.timestamp}.json</div>
                            <div className="text-sm text-muted-foreground truncate">
                              {m.total_runs} runs &middot; {formatTimestamp(m.submitted_at)}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewManifest(m)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={`${API_BASE}/api/experiments/${encodeURIComponent(decodedExperimentId)}/manifests/${m.timestamp}?pretty=true`}
                              download={`manifest-${m.timestamp}.json`}
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No execution history</div>
                )}
              </CardContent>
            </Card>

            {previewManifest && (
              <ManifestPreviewDialog
                experimentId={decodedExperimentId}
                manifest={previewManifest}
                open={!!previewManifest}
                onClose={() => setPreviewManifest(null)}
              />
            )}
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

      {/* Export Modal */}
      <ExportModal
        experimentId={decodedExperimentId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </div>
  );
}

