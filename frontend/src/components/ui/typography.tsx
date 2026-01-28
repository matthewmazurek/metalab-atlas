import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Typography system for consistent heading styles across the Atlas UI.
 *
 * Hierarchy:
 * - PageTitle (H1): Main page titles - large, bold
 * - SectionTitle (H2): Card titles, major sections - semibold
 * - PanelTitle (H3): Sidebar/panel headers - medium weight, smaller
 * - SectionLabel: Small uppercase labels for subsections
 */

interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

/**
 * Page-level title (H1)
 * Use for main page headings like "Runs", "Compare Runs", etc.
 */
export function PageTitle({ className, children, ...props }: TypographyProps) {
  return (
    <h1
      className={cn('text-2xl font-bold tracking-tight', className)}
      {...props}
    >
      {children}
    </h1>
  );
}

/**
 * Section title (H2)
 * Use for card headers, major content sections.
 * Note: For cards, prefer using CardTitle which has this style built-in.
 */
export function SectionTitle({ className, children, ...props }: TypographyProps) {
  return (
    <h2
      className={cn('text-lg font-semibold', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

/**
 * Panel title (H3)
 * Use for sidebar panels, collapsible sections, secondary headers.
 */
export function PanelTitle({ className, children, ...props }: TypographyProps) {
  return (
    <h3
      className={cn('text-sm font-semibold', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

/**
 * Section label
 * Use for small subsection labels within panels/cards (e.g., "Overview", "Parameters").
 * Uppercase, muted, with tracking for readability.
 */
export function SectionLabel({ className, children, ...props }: TypographyProps) {
  return (
    <div
      className={cn(
        'text-xs font-medium text-muted-foreground uppercase tracking-wide',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
