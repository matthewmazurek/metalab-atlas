import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_PAGE_SIZE = 25;

interface PaginationBarProps {
  total: number;
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  entityName?: string;
}

export function PaginationBar({
  total,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  entityName = 'items',
}: PaginationBarProps) {
  const totalPages = Math.ceil(total / pageSize);
  const start = total > 0 ? page * pageSize + 1 : 0;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        {total > 0 ? (
          <>
            Showing {start}-{end} of {total} {entityName}
          </>
        ) : (
          `No ${entityName}`
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
