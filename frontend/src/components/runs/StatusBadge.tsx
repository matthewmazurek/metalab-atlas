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
        status === 'success' && 'border-green-500 text-green-700 bg-green-50',
        status === 'failed' && 'border-red-500 text-red-700 bg-red-50',
        status === 'cancelled' && 'border-yellow-500 text-yellow-700 bg-yellow-50',
        status === 'running' && 'border-blue-500 text-blue-700 bg-blue-50'
      )}
    >
      {status}
    </Badge>
  );
}
