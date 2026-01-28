import { useExperiments, useLatestManifest, useRuns } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  Beaker,
  CheckCircle2,
  Clock,
  Code,
  Cpu,
  Hash,
  Layers,
  Settings,
  Tag,
} from 'lucide-react';
import { Link } from 'react-router-dom';

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
 * Truncate a hash string for display
 */
function truncateHash(hash: string | null | undefined, length = 8): string {
  if (!hash) return '—';
  return hash.slice(0, length) + '...';
}

/**
 * Hook to get status counts for an experiment.
 * Returns 0 counts when no experiment is selected.
 */
function useStatusCounts(experimentId: string | null) {
  // Query for success count
  const { data: successData } = useRuns({
    filter: {
      experiment_id: experimentId ?? undefined,
      status: ['success'],
    },
    limit: 1,
  });

  // Query for failed count
  const { data: failedData } = useRuns({
    filter: {
      experiment_id: experimentId ?? undefined,
      status: ['failed'],
    },
    limit: 1,
  });

  // Query for running count
  const { data: runningData } = useRuns({
    filter: {
      experiment_id: experimentId ?? undefined,
      status: ['running'],
    },
    limit: 1,
  });

  // Only return counts when an experiment is selected
  if (!experimentId) {
    return { successCount: 0, failedCount: 0, runningCount: 0 };
  }

  return {
    successCount: successData?.total ?? 0,
    failedCount: failedData?.total ?? 0,
    runningCount: runningData?.total ?? 0,
  };
}

interface ExperimentDetailPanelProps {
  experimentId: string | null;
  className?: string;
}

export function ExperimentDetailPanel({
  experimentId,
  className,
}: ExperimentDetailPanelProps) {
  const { data: experimentsData } = useExperiments();
  const {
    data: manifest,
    isLoading: manifestLoading,
    error: manifestError,
  } = useLatestManifest(experimentId ?? '');

  // Find experiment info
  const experiment = experimentsData?.experiments.find(
    (e) => e.experiment_id === experimentId
  );

  // Get status counts
  const { successCount, failedCount, runningCount } = useStatusCounts(experimentId);

  // Total expected from manifest
  const expectedTotal = manifest?.total_runs;

  // Empty state
  if (!experimentId) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center h-full text-muted-foreground p-6',
          className
        )}
      >
        <Beaker className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Select an experiment</p>
        <p className="text-sm">Choose an experiment from the list to view details</p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="p-6 space-y-6 min-h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            {/* Show name prominently if different from experiment_id */}
            {manifest?.name && manifest.name !== experimentId ? (
              <>
                <h2 className="text-2xl font-bold">{manifest.name}</h2>
                <p className="text-sm text-muted-foreground font-mono">
                  {experimentId}
                </p>
              </>
            ) : (
              <h2 className="text-2xl font-bold">{experimentId}</h2>
            )}
            {manifest?.version && (
              <p className="text-sm text-muted-foreground">
                Version {manifest.version}
              </p>
            )}
            {manifest?.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {manifest.description}
              </p>
            )}
            {/* Tags */}
            {manifest?.tags && manifest.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                {manifest.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Link to={`/runs?experiment_id=${encodeURIComponent(experimentId)}`}>
            <Button>
              View Runs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Overview Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Run counts: "17 runs ✓ / 72 total" */}
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-medium">{successCount} runs</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              {expectedTotal != null && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">
                    {expectedTotal} total
                  </span>
                </>
              )}
            </div>

            {/* Active runs or Latest run */}
            <div className="flex justify-between text-sm text-muted-foreground">
              {runningCount > 0 ? (
                <>
                  <span>Active runs</span>
                  <span>{runningCount}</span>
                </>
              ) : (
                <>
                  <span>Latest run</span>
                  <span>{formatRelativeTime(experiment?.latest_run)}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Manifest loading state */}
        {manifestLoading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
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
          <>
            {/* Parameters Card */}
            {manifest.params && Object.keys(manifest.params).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Parameters
                    {manifest.params.type && (
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
                  <div className="space-y-2 text-sm">
                    {manifest.seeds.base !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Base seed</span>
                        <span className="font-mono">{String(manifest.seeds.base)}</span>
                      </div>
                    )}
                    {manifest.seeds.replicates !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Replicates</span>
                        <span className="font-mono">{String(manifest.seeds.replicates)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

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
                  <div className="space-y-2 text-sm">
                    {manifest.operation.name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name</span>
                        <span className="font-mono">{manifest.operation.name}</span>
                      </div>
                    )}
                    {manifest.operation.ref && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ref</span>
                        <span className="font-mono text-xs">
                          {manifest.operation.ref}
                        </span>
                      </div>
                    )}
                    {manifest.operation.code_hash && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Code hash</span>
                        <span className="font-mono text-xs">
                          {truncateHash(manifest.operation.code_hash)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Runtime Hints Card */}
            {manifest.runtime_hints &&
              Object.keys(manifest.runtime_hints).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      Runtime Hints
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {Object.entries(manifest.runtime_hints).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground">{key}</span>
                          <span className="font-mono">
                            {typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Provenance Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Provenance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted</span>
                    <span>{formatTimestamp(manifest.submitted_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total runs planned</span>
                    <span className="font-mono">{manifest.total_runs}</span>
                  </div>
                  {manifest.context_fingerprint && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Context</span>
                      <span className="font-mono text-xs">
                        {truncateHash(manifest.context_fingerprint)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * Display parameters based on their structure
 */
function ParamsDisplay({ params }: { params: Record<string, unknown> }) {
  const type = params.type as string | undefined;

  // GridSource display
  if (type === 'GridSource' && params.spec) {
    const spec = params.spec as Record<string, unknown[]>;
    return (
      <div className="space-y-2">
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(spec).map(([key, values]) => (
              <tr key={key} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 text-muted-foreground">{key}</td>
                <td className="py-1.5 text-right font-mono">
                  {Array.isArray(values) ? values.join(', ') : String(values)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {params.total_cases && (
          <div className="text-xs text-muted-foreground pt-1">
            {params.total_cases} total combinations
          </div>
        )}
      </div>
    );
  }

  // RandomSource display
  if (type === 'RandomSource' && params.space) {
    const space = params.space as Record<string, Record<string, unknown>>;
    return (
      <div className="space-y-2">
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(space).map(([key, dist]) => (
              <tr key={key} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 text-muted-foreground">{key}</td>
                <td className="py-1.5 text-right font-mono text-xs">
                  {formatDistribution(dist)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs text-muted-foreground pt-1">
          {params.n_trials} trials, seed: {String(params.seed)}
        </div>
      </div>
    );
  }

  // ManualSource display
  if (type === 'ManualSource') {
    return (
      <div className="text-sm">
        <span className="text-muted-foreground">
          {params.total_cases} manually specified cases
        </span>
      </div>
    );
  }

  // Fallback: show as JSON
  return (
    <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-x-auto">
      {JSON.stringify(params, null, 2)}
    </pre>
  );
}

/**
 * Format a distribution specification
 */
function formatDistribution(dist: Record<string, unknown>): string {
  const type = dist.type as string | undefined;

  if (type === 'Uniform') {
    return `Uniform(${dist.low}, ${dist.high})`;
  }
  if (type === 'LogUniform') {
    return `LogUniform(${dist.low}, ${dist.high})`;
  }
  if (type === 'IntUniform') {
    return `IntUniform(${dist.low}, ${dist.high})`;
  }
  if (type === 'Choice') {
    const choices = dist.choices as unknown[];
    return `Choice([${choices.slice(0, 3).join(', ')}${choices.length > 3 ? '...' : ''}])`;
  }

  return JSON.stringify(dist);
}
