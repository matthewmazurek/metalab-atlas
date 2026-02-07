import * as React from 'react';
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

/**
 * PageHeader: consistent header strip on every page.
 * No background—shows through to page. Breadcrumb, title, actions, optional context/filters.
 * Horizontal rule is container width (same as main content/tables).
 */
interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
  actions?: React.ReactNode;
  context?: React.ReactNode;
  filters?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  context,
  filters,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn('flex w-full flex-col border-b border-border', className)}
      style={{ minHeight: 'var(--page-header-height)' }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 pt-3 pb-6">
        {/* Breadcrumb row - fixed space */}
        <div className="h-5 shrink-0">
          {breadcrumb && breadcrumb.length > 0 ? (
            <Breadcrumb items={breadcrumb} />
          ) : (
            <span aria-hidden className="block h-5" />
          )}
        </div>

        {/* Title + subtitle + actions */}
        <div className="flex shrink-0 items-center justify-between gap-6">
          <div className="min-w-0">
            <h1 className="font-sans text-4xl font-bold tracking-tight text-foreground overflow-x-clip text-ellipsis whitespace-nowrap">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 font-sans text-base font-normal text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">
              {actions}
            </div>
          )}
        </div>

        {/* Context and filters */}
        {(context || filters) && (
          <div className="flex flex-col gap-4">
            {context}
            {filters}
          </div>
        )}
      </div>
    </header>
  );
}
