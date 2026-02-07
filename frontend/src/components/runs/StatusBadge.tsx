import { Badge } from '@/components/ui/badge';
import type { RunStatus } from '@/api/types';

interface StatusBadgeProps {
  status: RunStatus;
}

const variantByStatus: Record<RunStatus, 'success' | 'destructive' | 'info' | 'secondary'> = {
  success: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
  running: 'info',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={variantByStatus[status]} className="capitalize">
      {status}
    </Badge>
  );
}
