import { useExperiments } from '@/api/hooks';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Beaker } from 'lucide-react';

/**
 * Format a date string as relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${Math.round(diffHours)}h ago`;
  if (diffHours < 168) return `${Math.round(diffHours / 24)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface ExperimentListProps {
  selectedId: string | null;
  onSelect: (experimentId: string) => void;
  className?: string;
}

export function ExperimentList({
  selectedId,
  onSelect,
  className,
}: ExperimentListProps) {
  const { data: experimentsData, isLoading } = useExperiments();

  if (isLoading) {
    return (
      <div className={cn('p-4 text-sm text-muted-foreground', className)}>
        Loading experiments...
      </div>
    );
  }

  if (!experimentsData?.experiments.length) {
    return (
      <div className={cn('p-4 text-sm text-muted-foreground', className)}>
        No experiments found
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="space-y-1 p-2">
        {experimentsData.experiments.map((exp) => (
          <button
            key={exp.experiment_id}
            onClick={() => onSelect(exp.experiment_id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              selectedId === exp.experiment_id &&
              'bg-accent text-accent-foreground'
            )}
          >
            <Beaker className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{exp.experiment_id}</div>
              <div className="text-xs text-muted-foreground">
                {exp.run_count} runs • {formatRelativeTime(exp.latest_run)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
