import { Badge } from '@/components/ui/badge';
import type { RunStatus } from '@/api/types';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: RunStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize',
        // Cool, cohesive palette (light + dark)
        status === 'success' &&
          'border-emerald-500/40 text-emerald-800 bg-emerald-50/70 dark:border-emerald-400/30 dark:text-emerald-200 dark:bg-emerald-950/30',
        status === 'failed' &&
          'border-rose-500/40 text-rose-800 bg-rose-50/70 dark:border-rose-400/30 dark:text-rose-200 dark:bg-rose-950/30',
        status === 'cancelled' &&
          'border-violet-500/40 text-violet-800 bg-violet-50/70 dark:border-violet-400/30 dark:text-violet-200 dark:bg-violet-950/30',
        status === 'running' &&
          'border-cyan-500/40 text-cyan-800 bg-cyan-50/70 dark:border-cyan-400/30 dark:text-cyan-200 dark:bg-cyan-950/30'
      )}
    >
      {status}
    </Badge>
  );
}
