import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/**
 * TruncatedId — displays a truncated value with an ellipsis
 * and a tooltip showing the full text on hover.
 *
 * Use for run IDs, seed fingerprints, parameter values, etc.
 */
interface TruncatedIdProps {
  /** The full string to display */
  value: string;
  /** Number of leading characters to show (default: 8) */
  chars?: number;
  /** Use monospace font (default: true — set false for regular text values) */
  mono?: boolean;
  /** Additional class names applied to the visible text span */
  className?: string;
}

export function TruncatedId({
  value,
  chars = 8,
  mono = true,
  className,
}: TruncatedIdProps) {
  const truncated = value.length > chars;
  const display = truncated ? value.slice(0, chars) : value;

  if (!truncated) {
    return <span className={cn(mono && 'font-mono', className)}>{display}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(mono && 'font-mono', 'cursor-default', className)}>
          {display}
          <span className="text-muted-foreground/50">…</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{value}</TooltipContent>
    </Tooltip>
  );
}
