import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  /** If provided, renders a dropdown instead of a simple link */
  dropdown?: {
    items: Array<{
      label: string;
      value: string;
      href?: string;
    }>;
    selectedValue?: string;
    onSelect?: (value: string) => void;
  };
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      className={cn('flex items-center gap-1 text-sm', className)}
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
  // Dropdown segment
  if (item.dropdown) {
    const selectedItem = item.dropdown.items.find(
      (i) => i.value === item.dropdown?.selectedValue
    );

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-1 hover:text-foreground transition-colors',
              isLast ? 'text-foreground font-medium' : 'text-muted-foreground'
            )}
          >
            <span className="truncate max-w-[200px]">
              {selectedItem?.label || item.label}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
          {item.dropdown.items.map((dropdownItem) => (
            <DropdownMenuItem
              key={dropdownItem.value}
              onClick={() => item.dropdown?.onSelect?.(dropdownItem.value)}
              className={cn(
                dropdownItem.value === item.dropdown?.selectedValue &&
                'bg-accent'
              )}
            >
              {dropdownItem.href ? (
                <Link to={dropdownItem.href} className="w-full">
                  {dropdownItem.label}
                </Link>
              ) : (
                dropdownItem.label
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Regular link or text segment
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
        isLast ? 'text-foreground font-medium' : 'text-muted-foreground'
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
