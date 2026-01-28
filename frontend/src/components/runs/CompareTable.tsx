import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { fetchRun } from '@/api/client';
import { queryKeys } from '@/api/hooks';
import { StatusBadge } from './StatusBadge';
import { ArtifactPreviewDialog, getArtifactIcon } from '@/components/detail/ArtifactList';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAtlasStore } from '@/store/useAtlasStore';
import type { RunResponse, ArtifactInfo } from '@/api/types';
import { Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompareTableProps {
  runIds: string[];
}

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

/** Format duration in ms with appropriate unit */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Format a value for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    if (Math.abs(value) < 0.0001 || Math.abs(value) >= 10000) return value.toExponential(3);
    return value.toFixed(4);
  }
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

/** Format duration delta (inverted: slower is bad) */
function formatDurationDelta(current: number, baseline: number): { text: string; className: string } | null {
  const delta = current - baseline;
  if (delta === 0) return null;

  return {
    text: `${delta > 0 ? '+' : ''}${formatDuration(Math.abs(delta))}`,
    // Inverted: longer duration is bad (red), shorter is good (green)
    className: delta > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
  };
}

/** Cell content with value and optional delta */
function ValueCell({
  value,
  baselineValue,
  showDelta,
  isDuration = false,
}: {
  value: unknown;
  baselineValue: unknown;
  showDelta: boolean;
  isDuration?: boolean;
}) {
  const isNumeric = typeof value === 'number';
  const formattedValue = isDuration && isNumeric
    ? formatDuration(value)
    : formatValue(value);

  let delta: { text: string; className: string } | null = null;
  if (showDelta && isNumeric && typeof baselineValue === 'number') {
    delta = isDuration
      ? formatDurationDelta(value, baselineValue)
      : formatDelta(value, baselineValue);
  }

  return (
    <div className="flex items-center gap-2 font-mono text-sm">
      <span>{formattedValue}</span>
      {/* Fixed-width delta container to prevent layout shift */}
      <span className={cn('text-xs min-w-[5rem]', delta?.className)}>
        {delta ? `(${delta.text})` : ''}
      </span>
    </div>
  );
}

/** Section header row with sticky first cell */
function SectionRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      {/* Sticky label cell */}
      <TableCell
        className="py-1.5 font-medium text-xs uppercase tracking-wide text-muted-foreground sticky left-0 z-10 bg-muted/30 !border-r !border-r-border"
      >
        {label}
      </TableCell>
      {/* Empty cells for remaining columns */}
      {colSpan > 1 && (
        <TableCell
          colSpan={colSpan - 1}
          className="py-1.5 bg-muted/30"
        />
      )}
    </TableRow>
  );
}

export function CompareTable({ runIds }: CompareTableProps) {
  const { baselineRunId, setBaselineRunId } = useAtlasStore();
  const [previewArtifact, setPreviewArtifact] = useState<{ runId: string; artifact: ArtifactInfo } | null>(null);

  // Fetch all runs in parallel using useQueries
  const runQueries = useQueries({
    queries: runIds.map((runId) => ({
      queryKey: queryKeys.run(runId),
      queryFn: () => fetchRun(runId),
      enabled: !!runId,
    })),
  });

  // Check loading/error states
  const isLoading = runQueries.some((q) => q.isLoading);
  const isError = runQueries.some((q) => q.isError);
  const runs = runQueries.map((q) => q.data).filter((r): r is RunResponse => !!r);

  // Find baseline run data
  const baselineRun = runs.find((r) => r.record.run_id === baselineRunId) ?? null;

  // Collect all unique param, metric, and artifact keys across all runs
  const { paramKeys, metricKeys, allArtifactNames } = useMemo(() => {
    const paramSet = new Set<string>();
    const metricSet = new Set<string>();
    const artifactSet = new Set<string>();

    for (const run of runs) {
      Object.keys(run.params).forEach((k) => paramSet.add(k));
      Object.keys(run.metrics).forEach((k) => metricSet.add(k));
      run.artifacts?.forEach((a) => artifactSet.add(a.name));
    }

    return {
      paramKeys: Array.from(paramSet).sort(),
      metricKeys: Array.from(metricSet).sort(),
      allArtifactNames: Array.from(artifactSet).sort(),
    };
  }, [runs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center p-8 text-destructive">
        Failed to load one or more runs.
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No run data available.
      </div>
    );
  }

  // Total columns = field name column + run columns
  const totalCols = runs.length + 1;

  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table className="border-separate border-spacing-0">
        <TableHeader>
          <TableRow className="h-16">
            {/* Sticky field name column header - empty to avoid confusion */}
            <TableHead className="sticky left-0 z-20 bg-background min-w-[120px] !border-r !border-r-border">
              {/* Intentionally empty */}
            </TableHead>
            {/* Run column headers */}
            {runs.map((run) => {
              const isBaseline = run.record.run_id === baselineRunId;
              return (
                <TableHead
                  key={run.record.run_id}
                  className={cn(
                    'min-w-[180px] align-top py-3',
                    isBaseline && 'bg-primary/5'
                  )}
                >
                  <div className="space-y-1">
                    {/* Run ID link */}
                    <Link
                      to={`/runs/${run.record.run_id}`}
                      className="font-mono text-sm text-primary hover:underline font-semibold"
                    >
                      {run.record.run_id.slice(0, 8)}...
                    </Link>
                    {/* Experiment ID */}
                    <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                      {run.record.experiment_id}
                    </div>
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Baseline row */}
          <TableRow>
            <TableCell className="sticky left-0 z-10 bg-background text-muted-foreground font-medium !border-r !border-r-border">
              Baseline
            </TableCell>
            {runs.map((run) => {
              const isBaseline = run.record.run_id === baselineRunId;
              return (
                <TableCell
                  key={run.record.run_id}
                  className={cn(isBaseline && 'bg-primary/5')}
                >
                  <div className="h-6 flex items-center">
                    {isBaseline ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">
                        <Star className="h-3 w-3 mr-0.5 fill-current" />
                        BASELINE
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setBaselineRunId(run.record.run_id)}
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Set baseline
                      </Button>
                    )}
                  </div>
                </TableCell>
              );
            })}
          </TableRow>

          {/* Status row */}
          <TableRow>
            <TableCell className="sticky left-0 z-10 bg-background text-muted-foreground font-medium !border-r !border-r-border">
              Status
            </TableCell>
            {runs.map((run) => {
              const isBaseline = run.record.run_id === baselineRunId;
              return (
                <TableCell
                  key={run.record.run_id}
                  className={cn(isBaseline && 'bg-primary/5')}
                >
                  <StatusBadge status={run.record.status} />
                </TableCell>
              );
            })}
          </TableRow>

          {/* Parameters section */}
          {paramKeys.length > 0 && (
            <>
              <SectionRow label="Parameters" colSpan={totalCols} />
              {paramKeys.map((key) => (
                <TableRow key={`param-${key}`}>
                  <TableCell className="sticky left-0 z-10 bg-background text-muted-foreground !border-r !border-r-border">
                    {key}
                  </TableCell>
                  {runs.map((run) => {
                    const isBaseline = run.record.run_id === baselineRunId;
                    const showDelta = !isBaseline && baselineRun !== null;
                    return (
                      <TableCell
                        key={run.record.run_id}
                        className={cn(isBaseline && 'bg-primary/5')}
                      >
                        <ValueCell
                          value={run.params[key]}
                          baselineValue={baselineRun?.params[key]}
                          showDelta={showDelta}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </>
          )}

          {/* Metrics section */}
          {metricKeys.length > 0 && (
            <>
              <SectionRow label="Metrics" colSpan={totalCols} />
              {metricKeys.map((key) => (
                <TableRow key={`metric-${key}`}>
                  <TableCell className="sticky left-0 z-10 bg-background text-muted-foreground !border-r !border-r-border">
                    {key}
                  </TableCell>
                  {runs.map((run) => {
                    const isBaseline = run.record.run_id === baselineRunId;
                    const showDelta = !isBaseline && baselineRun !== null;
                    return (
                      <TableCell
                        key={run.record.run_id}
                        className={cn(isBaseline && 'bg-primary/5')}
                      >
                        <ValueCell
                          value={run.metrics[key]}
                          baselineValue={baselineRun?.metrics[key]}
                          showDelta={showDelta}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </>
          )}

          {/* Timing section */}
          <SectionRow label="Timing" colSpan={totalCols} />
          <TableRow>
            <TableCell className="sticky left-0 z-10 bg-background text-muted-foreground !border-r !border-r-border">
              Duration
            </TableCell>
            {runs.map((run) => {
              const isBaseline = run.record.run_id === baselineRunId;
              const showDelta = !isBaseline && baselineRun !== null;
              return (
                <TableCell
                  key={run.record.run_id}
                  className={cn(isBaseline && 'bg-primary/5')}
                >
                  <ValueCell
                    value={run.record.duration_ms}
                    baselineValue={baselineRun?.record.duration_ms}
                    showDelta={showDelta}
                    isDuration
                  />
                </TableCell>
              );
            })}
          </TableRow>

          {/* Artifacts section */}
          {allArtifactNames.length > 0 && (
            <>
              <SectionRow label="Artifacts" colSpan={totalCols} />
              {/* Individual artifact rows */}
              {allArtifactNames.map((artifactName) => (
                <TableRow key={`artifact-${artifactName}`}>
                  <TableCell className="sticky left-0 z-10 bg-background text-muted-foreground !border-r !border-r-border">
                    <span className="truncate max-w-[120px] block" title={artifactName}>
                      {artifactName}
                    </span>
                  </TableCell>
                  {runs.map((run) => {
                    const isBaseline = run.record.run_id === baselineRunId;
                    const artifact = run.artifacts?.find((a) => a.name === artifactName);
                    const Icon = artifact ? getArtifactIcon(artifact.kind) : null;
                    return (
                      <TableCell
                        key={run.record.run_id}
                        className={cn(isBaseline && 'bg-primary/5')}
                      >
                        {artifact ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1.5"
                            onClick={() => setPreviewArtifact({ runId: run.record.run_id, artifact })}
                          >
                            {Icon && <Icon className="h-3.5 w-3.5" />}
                            Preview
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </>
          )}
        </TableBody>
      </Table>

      {/* Artifact preview dialog */}
      {previewArtifact && (
        <ArtifactPreviewDialog
          runId={previewArtifact.runId}
          artifact={previewArtifact.artifact}
          open={!!previewArtifact}
          onClose={() => setPreviewArtifact(null)}
        />
      )}
    </div>
  );
}
