import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      className={cn('flex items-center gap-1 font-sans text-sm', className)}
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <ChevronRight className="h-4 w-4 text-brand-tertiary shrink-0" />
          )}
          <BreadcrumbSegment item={item} isLast={index === items.length - 1} />
        </React.Fragment>
      ))}
    </nav>
  );
}

interface BreadcrumbSegmentProps {
  item: BreadcrumbItem;
  isLast: boolean;
}

function BreadcrumbSegment({ item, isLast }: BreadcrumbSegmentProps) {
  // Regular link segment (not last item)
  if (item.href && !isLast) {
    return (
      <Link
        to={item.href}
        className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[200px]"
      >
        {item.label}
      </Link>
    );
  }

  // Last item (current page) - no link
  return (
    <span
      className={cn(
        'truncate max-w-[200px]',
        isLast ? 'text-brand-tertiary font-medium' : 'text-muted-foreground'
      )}
    >
      {item.label}
    </span>
  );
}

/**
 * Breadcrumb with stats displayed alongside
 */
interface BreadcrumbWithStatsProps extends BreadcrumbProps {
  stats?: React.ReactNode;
}

export function BreadcrumbWithStats({
  items,
  stats,
  className,
}: BreadcrumbWithStatsProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <Breadcrumb items={items} />
      {stats && <div className="flex items-center gap-4">{stats}</div>}
    </div>
  );
}
