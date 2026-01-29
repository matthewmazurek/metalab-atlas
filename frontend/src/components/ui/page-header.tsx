import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

/**
 * PageHeader provides a consistent layout for page headers across all routes.
 *
 * Layout pattern (top to bottom):
 * 1. Breadcrumb row (optional) - navigation context
 * 2. Title row - back button (optional), title, subtitle (optional), actions (optional)
 *
 * Usage:
 * <PageHeader
 *   title="Runs"
 *   backTo="/experiments"   // optional
 *   breadcrumb={[...]}      // optional
 *   actions={<Button>...</Button>}  // optional
 * />
 */

interface PageHeaderProps {
  /** Page title - required */
  title: React.ReactNode;
  /** Optional subtitle displayed below title */
  subtitle?: React.ReactNode;
  /** Optional back navigation URL - shows back button when provided */
  backTo?: string;
  /** Optional back button label (defaults to "Back") */
  backLabel?: string;
  /** Optional breadcrumb items for navigation context */
  breadcrumb?: BreadcrumbItem[];
  /** Optional actions (buttons, etc.) to display on the right */
  actions?: React.ReactNode;
  /** Optional content to display between title and main content (e.g., stats) */
  titleExtra?: React.ReactNode;
  /** Additional className for the container */
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  backTo,
  backLabel = 'Back',
  breadcrumb,
  actions,
  titleExtra,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Breadcrumb row - shows navigation context */}
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb items={breadcrumb} />
      )}

      {/* Title row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Back button */}
          {backTo && (
            <Link to={backTo}>
              <Button variant="ghost" size="sm" className="shrink-0">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {backLabel}
              </Button>
            </Link>
          )}

          {/* Title and subtitle */}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">
                {subtitle}
              </p>
            )}
          </div>

          {/* Extra content next to title (e.g., stats) */}
          {titleExtra}
        </div>

        {/* Actions on the right */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
