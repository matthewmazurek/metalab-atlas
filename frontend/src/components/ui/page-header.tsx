import * as React from 'react';
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

/**
 * PageHeader provides a consistent layout for page headers across all routes.
 *
 * Layout pattern (top to bottom):
 * 1. Breadcrumb row (reserved height for visual consistency, content optional)
 * 2. Identity layer: Title + subtitle + actions (always present)
 * 3. Context layer: Scope/selection summary + quick controls (optional)
 * 4. Filters layer: Filter chips + clear (optional)
 *
 * This ensures every page answers in order:
 * - "How did I get here?" (breadcrumb - for detail pages)
 * - "What is this page?" (title)
 * - "What am I looking at?" (context)
 * - "How is it filtered?" (filters)
 *
 * Usage:
 * <PageHeader
 *   title="Run abc123"
 *   subtitle="Experiment: my-experiment"
 *   breadcrumb={[
 *     { label: 'Experiments', href: '/experiments' },
 *     { label: 'my-experiment', href: '/experiments/my-experiment' },
 *     { label: 'abc123' },
 *   ]}
 *   actions={<StatusBadge />}
 * />
 */

interface PageHeaderProps {
  /** Page title - required */
  title: React.ReactNode;
  /** Optional subtitle displayed below title */
  subtitle?: React.ReactNode;
  /** Optional breadcrumb items (for detail pages) */
  breadcrumb?: BreadcrumbItem[];
  /** Optional actions (buttons, etc.) to display on the right of title */
  actions?: React.ReactNode;
  /** Optional context row: scope/selection summary + quick controls */
  context?: React.ReactNode;
  /** Optional filters row: filter chips + clear */
  filters?: React.ReactNode;
  /** Additional className for the container */
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
    <div className={cn('space-y-4', className)}>
      {/* Header content section */}
      <div className="pt-4 pb-6">
        {/* Breadcrumb row */}
        <div className="h-5 mb-4">
          {breadcrumb && breadcrumb.length > 0 && (
            <Breadcrumb items={breadcrumb} />
          )}
        </div>

        {/* Identity layer: Title + subtitle + actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-2">
                {subtitle}
              </p>
            )}
          </div>

          {/* Actions on the right */}
          {actions && (
            <div className="flex items-center gap-2 shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Context layer: scope/selection summary */}
      {context}

      {/* Filters layer: filter chips */}
      {filters}
    </div>
  );
}
