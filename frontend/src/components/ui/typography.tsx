import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Atlas typography: Plus Jakarta Sans for all UI and body; IBM Plex Mono for IDs/code only.
 *
 * Scale:
 * - Page title: 4xl bold (main page heading)
 * - Section: 2xl semibold (major sections)
 * - Card/panel title: lg semibold
 * - Subsection: base semibold
 * - Body: base normal (default)
 * - Body secondary: sm, muted
 * - Caption/label: sm medium
 * - Overline: xs semibold uppercase tracking-wide muted
 */

interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

/** Page-level title (H1). Use for main page headings. */
export function PageTitle({ className, children, ...props }: TypographyProps) {
  return (
    <h1
      className={cn('font-sans text-4xl font-bold tracking-tight text-foreground', className)}
      {...props}
    >
      {children}
    </h1>
  );
}

/** Section title (H2). Card headers, major content sections. */
export function SectionTitle({ className, children, ...props }: TypographyProps) {
  return (
    <h2
      className={cn('font-sans text-2xl font-semibold tracking-tight text-foreground', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

/** Panel title (H3). Sidebar panels, collapsible sections. */
export function PanelTitle({ className, children, ...props }: TypographyProps) {
  return (
    <h3
      className={cn('font-sans text-base font-semibold text-foreground', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

/** Small subsection label. Uppercase, muted, tracking. */
export function SectionLabel({ className, children, ...props }: TypographyProps) {
  return (
    <div
      className={cn(
        'font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Body text, secondary (muted). */
export function BodySecondary({ className, children, ...props }: TypographyProps) {
  return (
    <p className={cn('font-sans text-sm font-normal text-muted-foreground', className)} {...props}>
      {children}
    </p>
  );
}

/** Technical content: IDs, hashes, code. Use sparingly. */
export function Mono({ className, children, ...props }: TypographyProps) {
  return (
    <span className={cn('font-mono text-sm font-normal', className)} {...props}>
      {children}
    </span>
  );
}
