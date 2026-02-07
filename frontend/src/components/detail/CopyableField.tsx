import { useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Copyable field component with click-to-copy functionality.
 * Shared between ExperimentDetailPage and RunDetailPage.
 */
export function CopyableField({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group min-w-0">
      <div className="text-muted-foreground text-xs mb-0.5">{label}</div>
      <div className="flex items-start gap-1">
        <div className="overflow-x-auto min-w-0 flex-1">
          <button
            onClick={handleCopy}
            className={cn(
              'text-sm text-left hover:bg-muted/50 px-1 -mx-1 rounded transition-colors whitespace-nowrap',
              mono && 'font-mono'
            )}
            title="Click to copy"
          >
            {value}
          </button>
        </div>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded shrink-0"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckCircle2 className="h-3 w-3 text-status-success" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}
