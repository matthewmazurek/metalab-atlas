import { useParams, Link } from 'react-router-dom';
import { useExperiments, useLatestManifest, useExperimentManifests, useRuns } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ExperimentTagList } from '@/components/ui/experiment-tag';
import { ExportModal } from '@/components/experiments/ExportModal';
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
  Cpu,
  Download,
  FileJson,
  Fingerprint,
  Hash,
  Layers,
  Loader2,
  PlayCircle,
  Settings,
  Tag,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// API base URL for downloads
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:8000');

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
            <CheckCircle2 className="h-3 w-3 text-green-600" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Format a date string as relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${Math.round(diffHours)}h ago`;
    if (diffHours < 168) return `${Math.round(diffHours / 24)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return '—';
  }
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return '—';
  }
}

/**
 * Hook to get status counts for an experiment.
 */
function useStatusCounts(experimentId: string) {
  const { data: successData } = useRuns({
    filter: { experiment_id: experimentId, status: ['success'] },
    limit: 1,
  });

  const { data: failedData } = useRuns({
    filter: { experiment_id: experimentId, status: ['failed'] },
    limit: 1,
  });

  const { data: runningData } = useRuns({
    filter: { experiment_id: experimentId, status: ['running'] },
    limit: 1,
  });

  return {
    successCount: successData?.total ?? 0,
    failedCount: failedData?.total ?? 0,
    runningCount: runningData?.total ?? 0,
  };
}

export function ExperimentDetailPage() {
  const { experimentId } = useParams<{ experimentId: string }>();
  const decodedExperimentId = experimentId ? decodeURIComponent(experimentId) : '';

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false);

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

  // Get status counts
  const { successCount, failedCount, runningCount } = useStatusCounts(decodedExperimentId);

  // Total expected from manifest
  const expectedTotal = manifest?.total_runs;

  // Display name for breadcrumb
  const displayName = manifest?.name || decodedExperimentId;

  // Computed status values
  const completedRuns = successCount + failedCount;
  const isComplete = expectedTotal != null && completedRuns >= expectedTotal;
  const hasFailures = failedCount > 0;
  const isAllSuccess = isComplete && !hasFailures;

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
        title={displayName}
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

      {/* Overview Card - Progressive Disclosure Layout */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {/* Section 1: At a Glance */}
          <div className="pb-4">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mb-2">At a Glance</div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              {/* Status with completion ratio */}
              <div className="flex items-center gap-3">
                {isAllSuccess ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                    <div>
                      <span className="text-xl font-semibold text-green-600 dark:text-green-400">Complete</span>
                      <span className="text-lg text-muted-foreground ml-2">
                        {completedRuns}/{expectedTotal ?? '?'} runs
                      </span>
                    </div>
                  </>
                ) : isComplete && hasFailures ? (
                  <>
                    <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    <div>
                      <span className="text-xl font-semibold text-amber-600 dark:text-amber-400">Complete</span>
                      <span className="text-sm text-amber-600 dark:text-amber-400 ml-1">(with failures)</span>
                      <span className="text-lg text-muted-foreground ml-2">
                        {completedRuns}/{expectedTotal ?? '?'} runs
                      </span>
                    </div>
                  </>
                ) : hasFailures ? (
                  <>
                    <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    <div>
                      <span className="text-xl font-semibold text-amber-600 dark:text-amber-400">In progress</span>
                      <span className="text-sm text-amber-600 dark:text-amber-400 ml-1">(with failures)</span>
                      <span className="text-lg text-muted-foreground ml-2">
                        {completedRuns}/{expectedTotal ?? '?'} runs
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    <div>
                      <span className="text-xl font-semibold text-blue-600 dark:text-blue-400">In progress</span>
                      <span className="text-lg text-muted-foreground ml-2">
                        {completedRuns}/{expectedTotal ?? '?'} runs
                      </span>
                    </div>
                  </>
                )}
              </div>
              {/* Experiment name + version badge */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono">{decodedExperimentId}</span>
                {manifest?.version && (
                  <span className="px-1.5 py-0.5 bg-muted rounded text-xs font-medium">v{manifest.version}</span>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Progress */}
          <div className="border-t pt-4 pb-4">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mb-3">Progress</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {/* Total Runs */}
              <div>
                <div className="text-muted-foreground text-xs mb-1">Total</div>
                <div className="text-sm font-medium">{expectedTotal ?? '—'}</div>
              </div>

              {/* Successful */}
              <div>
                <div className="text-muted-foreground text-xs mb-1">Success</div>
                <div className={cn(
                  "text-sm font-medium text-green-600 dark:text-green-400",
                  successCount > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                )}>
                  {successCount}
                </div>
              </div>

              {/* Failed */}
              <div>
                <div className="text-muted-foreground text-xs mb-1">Failed</div>
                <div className={cn(
                  'text-sm font-medium',
                  failedCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                )}>
                  {failedCount}
                </div>
              </div>

              {/* In Progress */}
              <div>
                <div className="text-muted-foreground text-xs mb-1">Running</div>
                <div className={cn(
                  'text-sm font-medium',
                  runningCount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                )}>
                  {runningCount}
                </div>
              </div>

              {/* Latest Run */}
              <div>
                <div className="text-muted-foreground text-xs mb-1">Latest</div>
                <div className="text-sm">{formatRelativeTime(experiment?.latest_run)}</div>
              </div>
            </div>

            {/* SLURM scheduler status (only shown for SLURM experiments) */}
            <div className="mt-4">
              <SlurmStatusBadge experimentId={decodedExperimentId} />
            </div>
          </div>

          {/* Section 3: Details */}
          <div className="border-t pt-4">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mb-3">Details</div>
            <div className="space-y-3">
              {/* Experiment ID */}
              <div className="min-w-0">
                <div className="text-muted-foreground text-xs mb-0.5">Experiment ID</div>
                <div className="overflow-x-auto">
                  <div className="text-sm font-mono whitespace-nowrap">{decodedExperimentId}</div>
                </div>
              </div>

              {/* Description */}
              {manifest?.description && (
                <div>
                  <div className="text-muted-foreground text-xs mb-0.5">Description</div>
                  <p className="text-sm">{manifest.description}</p>
                </div>
              )}

              {/* Tags */}
              {manifest?.tags && manifest.tags.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Tags</div>
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <ExperimentTagList tags={manifest.tags} maxVisible={10} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manifest loading state */}
      {manifestLoading && (
        <Card>
          <CardContent className="py-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading manifest...
          </CardContent>
        </Card>
      )}

      {/* Manifest not found - show basic info only */}
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

      {/* Manifest details */}
      {manifest && !manifestError && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Row 1: Executions | Seeds */}
          {/* Executions Card */}
          {manifestsData && manifestsData.manifests.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  Executions ({manifestsData.manifests.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {manifestsData.manifests.map((m) => (
                    <div
                      key={m.timestamp}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <div className="text-sm">{formatTimestamp(m.submitted_at)}</div>
                          <div className="text-xs text-muted-foreground">
                            {m.total_runs} runs planned
                          </div>
                        </div>
                      </div>
                      <a
                        href={`${API_BASE}/api/experiments/${encodeURIComponent(decodedExperimentId)}/manifests/${m.timestamp}?pretty=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        JSON
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Seeds Card */}
          {manifest.seeds && Object.keys(manifest.seeds).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Seeds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {manifest.seeds.base !== undefined && (
                    <CopyableField
                      label="Base seed"
                      value={String(manifest.seeds.base)}
                    />
                  )}
                  {manifest.seeds.replicates !== undefined && (
                    <CopyableField
                      label="Replicates"
                      value={String(manifest.seeds.replicates)}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Row 2: Params | Metadata */}
          {/* Parameters Card */}
          {manifest.params && Object.keys(manifest.params).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4" />
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
          {manifest.metadata &&
            Object.keys(manifest.metadata).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Metadata
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetadataDisplay metadata={manifest.metadata as Record<string, unknown>} />
                </CardContent>
              </Card>
            )}

          {/* Row 3: Operations | Fingerprints */}
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

          {/* Fingerprints Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Fingerprint className="h-4 w-4" />
                Fingerprints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {manifest.context_fingerprint && (
                  <CopyableField
                    label="Context"
                    value={manifest.context_fingerprint}
                  />
                )}
                {manifest.operation?.code_hash && (
                  <CopyableField
                    label="Code Hash"
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

