/**
 * SLURM status badge component.
 *
 * Displays scheduler status for SLURM array experiments with explicit state buckets.
 */

import { useSlurmStatus } from '@/api/hooks';
import type { SlurmArrayStatusResponse } from '@/api/types';
import {
  Server,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface SlurmStatusBadgeProps {
  experimentId: string;
  /** Show compact version (just counts) or full version (with labels) */
  compact?: boolean;
}

/**
 * Format a count for display (e.g., 1000 -> "1k")
 */
function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

/**
 * Small count badge with title tooltip
 */
function CountBadge({
  count,
  label,
  icon: Icon,
  colorClass,
}: {
  count: number;
  label: string;
  icon: React.ElementType;
  colorClass: string;
}) {
  if (count === 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${colorClass}`}
      title={`${count.toLocaleString()} ${label}`}
    >
      <Icon className="h-3 w-3" />
      {formatCount(count)}
    </span>
  );
}

/**
 * Build tooltip text for full status
 */
function buildTooltipText(status: SlurmArrayStatusResponse): string {
  const lines = [
    `SLURM Array Status`,
    `Total: ${status.total.toLocaleString()}`,
    `Running: ${status.running.toLocaleString()}`,
    `Pending: ${status.pending.toLocaleString()}`,
    `Completed: ${status.completed.toLocaleString()}`,
  ];

  if (status.failed > 0) lines.push(`Failed: ${status.failed.toLocaleString()}`);
  if (status.cancelled > 0) lines.push(`Cancelled: ${status.cancelled.toLocaleString()}`);
  if (status.timeout > 0) lines.push(`Timeout: ${status.timeout.toLocaleString()}`);
  if (status.oom > 0) lines.push(`OOM: ${status.oom.toLocaleString()}`);
  if (status.other > 0) lines.push(`Other: ${status.other.toLocaleString()}`);

  if (status.sacct_stale) {
    lines.push('⚠ Terminal counts may be stale');
  }

  return lines.join('\n');
}

export function SlurmStatusBadge({ experimentId, compact = false }: SlurmStatusBadgeProps) {
  const { data: status, isLoading, isError } = useSlurmStatus(experimentId);

  // Don't show anything if loading or error (experiment might not be SLURM-based)
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }

  if (isError || !status) {
    return null;
  }

  // Progress percentage
  const done = status.completed + status.failed + status.cancelled + status.timeout + status.oom;
  const progressPct = status.total > 0 ? Math.round((done / status.total) * 100) : 0;
  const tooltipText = buildTooltipText(status);

  if (compact) {
    // Compact version: just show progress with icon
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        title={tooltipText}
      >
        <Server className="h-3.5 w-3.5" />
        {progressPct}%
      </span>
    );
  }

  // Full version: show all non-zero counts
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-1"
        title={tooltipText}
      >
        <Server className="h-3.5 w-3.5" />
        SLURM
      </span>

      <CountBadge
        count={status.running}
        label="running"
        icon={Play}
        colorClass="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      />
      <CountBadge
        count={status.pending}
        label="pending"
        icon={Clock}
        colorClass="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
      />
      <CountBadge
        count={status.completed}
        label="completed"
        icon={CheckCircle}
        colorClass="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      />
      <CountBadge
        count={status.failed + status.cancelled + status.timeout + status.oom}
        label="failed/cancelled"
        icon={XCircle}
        colorClass="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      />
      {status.other > 0 && (
        <CountBadge
          count={status.other}
          label="other"
          icon={AlertTriangle}
          colorClass="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
        />
      )}
    </div>
  );
}
