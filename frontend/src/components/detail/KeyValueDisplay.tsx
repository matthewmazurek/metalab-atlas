import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Copy, CheckCircle2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Normalized entry for display
 */
interface DisplayEntry {
  key: string;
  preview: string;
  shape: string;
  raw: unknown;
  isExpandable: boolean;
}

interface KeyValueDisplayProps {
  /** The data to display (key-value pairs) */
  data: Record<string, unknown>;
  /** Maximum number of visible rows when collapsed (default: 8) */
  maxVisible?: number;
  /** Maximum height of scrollable area when expanded (default: 288px / 18rem) */
  maxHeight?: string;
  /** Whether to show the filter input (default: true when > maxVisible entries) */
  showFilter?: boolean;
  /** Footer content to display below the entries */
  footer?: React.ReactNode;
  /** Custom formatter for specific keys */
  formatValue?: (key: string, value: unknown) => string | null;
}

/**
 * Get the shape/type descriptor for a value
 */
function getShape(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (Array.isArray(value)) {
    // Check if it's a homogeneous array and describe element type
    if (value.length === 0) return 'Array(0)';
    const firstType = typeof value[0];
    const isHomogeneous = value.every((v) => typeof v === firstType);
    if (isHomogeneous && firstType !== 'object') {
      return `${firstType}[${value.length}]`;
    }
    return `Array(${value.length})`;
  }

  if (typeof value === 'object') {
    // Check if it's a distribution spec
    if ('type' in value && typeof (value as Record<string, unknown>).type === 'string') {
      return (value as Record<string, unknown>).type as string;
    }
    const keys = Object.keys(value);
    return `Object(${keys.length})`;
  }

  return typeof value;
}

/**
 * Format a value for preview display with type-aware truncation
 */
function formatPreview(value: unknown, maxLength = 60): { preview: string; shape: string; isExpandable: boolean } {
  const shape = getShape(value);

  if (value === null || value === undefined) {
    return { preview: '—', shape, isExpandable: false };
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, 5).map((v) => formatPrimitive(v)).join(', ');
    const suffix = value.length > 5 ? ', …' : '';
    const preview = `[${items}${suffix}]`;
    return {
      preview: preview.length > maxLength ? preview.slice(0, maxLength - 1) + '…' : preview,
      shape,
      isExpandable: value.length > 5 || preview.length > maxLength,
    };
  }

  if (typeof value === 'object') {
    // Check if it's a distribution spec (has 'type' field)
    if ('type' in value && typeof (value as Record<string, unknown>).type === 'string') {
      const preview = formatDistribution(value as Record<string, unknown>);
      return { preview, shape, isExpandable: false };
    }

    const keys = Object.keys(value);
    const preview = `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
    return {
      preview: preview.length > maxLength ? preview.slice(0, maxLength - 1) + '…' : preview,
      shape,
      isExpandable: keys.length > 3 || preview.length > maxLength,
    };
  }

  const str = String(value);
  if (str.length > maxLength) {
    return { preview: str.slice(0, maxLength - 1) + '…', shape, isExpandable: true };
  }
  return { preview: str, shape, isExpandable: false };
}

/**
 * Format a primitive value for display
 */
function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toPrecision(4);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value.length > 20 ? value.slice(0, 17) + '…' : value;
  return String(value);
}

/**
 * Format a distribution specification (for RandomSource params)
 */
function formatDistribution(dist: Record<string, unknown>): string {
  const type = dist.type as string;

  switch (type) {
    case 'Uniform':
      return `Uniform(${dist.low}, ${dist.high})`;
    case 'LogUniform':
      return `LogUniform(${dist.low}, ${dist.high})`;
    case 'IntUniform':
      return `IntUniform(${dist.low}, ${dist.high})`;
    case 'Choice': {
      const choices = dist.choices as unknown[];
      const items = choices.slice(0, 3).map((v) => formatPrimitive(v)).join(', ');
      return `Choice([${items}${choices.length > 3 ? ', …' : ''}])`;
    }
    default:
      return JSON.stringify(dist);
  }
}

/**
 * Normalize data into display entries
 */
function normalizeEntries(
  data: Record<string, unknown>,
  customFormat?: (key: string, value: unknown) => string | null
): DisplayEntry[] {
  return Object.entries(data).map(([key, value]) => {
    // Try custom formatter first
    const custom = customFormat?.(key, value);
    if (custom !== null && custom !== undefined) {
      return { key, preview: custom, shape: getShape(value), raw: value, isExpandable: false };
    }

    const { preview, shape, isExpandable } = formatPreview(value);
    return { key, preview, shape, raw: value, isExpandable };
  });
}

/**
 * Max items to show in expanded view for arrays/objects
 */
const MAX_EXPANDED_ITEMS = 50;

/**
 * Copyable row component
 */
function CopyableRow({ entry }: { entry: DisplayEntry }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCopy = async () => {
    const text = typeof entry.raw === 'object'
      ? JSON.stringify(entry.raw, null, 2)
      : String(entry.raw);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // For expanded view, truncate large arrays/objects to avoid rendering thousands of items
  const { displayValue, isTruncated, totalCount } = useMemo(() => {
    if (Array.isArray(entry.raw)) {
      const total = entry.raw.length;
      if (total > MAX_EXPANDED_ITEMS) {
        const truncated = entry.raw.slice(0, MAX_EXPANDED_ITEMS);
        return {
          displayValue: JSON.stringify(truncated, null, 2).slice(0, -1) + ',\n  ...\n]',
          isTruncated: true,
          totalCount: total,
        };
      }
      return { displayValue: JSON.stringify(entry.raw, null, 2), isTruncated: false, totalCount: total };
    }

    if (typeof entry.raw === 'object' && entry.raw !== null) {
      const keys = Object.keys(entry.raw);
      const total = keys.length;
      if (total > MAX_EXPANDED_ITEMS) {
        const truncatedObj: Record<string, unknown> = {};
        keys.slice(0, MAX_EXPANDED_ITEMS).forEach((k) => {
          truncatedObj[k] = (entry.raw as Record<string, unknown>)[k];
        });
        return {
          displayValue: JSON.stringify(truncatedObj, null, 2).slice(0, -1) + ',\n  ...\n}',
          isTruncated: true,
          totalCount: total,
        };
      }
      return { displayValue: JSON.stringify(entry.raw, null, 2), isTruncated: false, totalCount: total };
    }

    return { displayValue: String(entry.raw), isTruncated: false, totalCount: 0 };
  }, [entry.raw]);

  return (
    <div className="group border-b border-border/50 last:border-0 py-2 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">{entry.key}</span>
            <span className="font-mono text-xs text-muted-foreground/70 px-1 py-0.5 bg-muted/50 rounded">
              {entry.shape}
            </span>
          </div>
          {entry.isExpandable ? (
            <>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                  "w-full text-left font-mono text-sm truncate rounded px-1 -mx-1 transition-colors",
                  "hover:bg-muted/40 cursor-pointer"
                )}
                title="Click to expand"
              >
                {entry.preview}
              </button>

              <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 min-w-0 pr-10">
                      <span className="truncate">{entry.key}</span>
                      <span className="text-xs font-mono text-muted-foreground/80 rounded-md border border-border/50 bg-card/70 px-2 py-0.5">
                        {entry.shape}
                      </span>
                    </DialogTitle>
                  </DialogHeader>

                  <div className="rounded-lg border border-border/50 bg-card/70">
                    <pre className="max-h-[60vh] overflow-auto p-3 text-xs font-mono whitespace-pre-wrap break-words text-foreground/90">
                      {displayValue}
                    </pre>
                  </div>

                  {isTruncated && (
                    <div className="text-xs text-muted-foreground">
                      Showing {MAX_EXPANDED_ITEMS} of {totalCount} items. Copy for full data.
                    </div>
                  )}

                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <div className="font-mono text-sm truncate">
              {entry.preview}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="p-0.5 hover:bg-muted rounded"
            title="Copy to clipboard (full data)"
          >
            {copied ? (
              <CheckCircle2 className="h-3 w-3 text-status-success" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * KeyValueDisplay - A reusable component for displaying key-value data
 * with expand/collapse, filtering, and scrolling capabilities.
 */
export function KeyValueDisplay({
  data,
  maxVisible = 8,
  maxHeight = 'max-h-72',
  showFilter,
  footer,
  formatValue,
}: KeyValueDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');

  const entries = useMemo(() => normalizeEntries(data, formatValue), [data, formatValue]);

  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return entries;
    const lowerFilter = filter.toLowerCase();
    return entries.filter(
      (entry) =>
        entry.key.toLowerCase().includes(lowerFilter) ||
        entry.preview.toLowerCase().includes(lowerFilter) ||
        entry.shape.toLowerCase().includes(lowerFilter)
    );
  }, [entries, filter]);

  const totalCount = entries.length;
  const shouldShowToggle = totalCount > maxVisible;
  const shouldShowFilter = showFilter ?? shouldShowToggle;
  const visibleEntries = expanded ? filteredEntries : filteredEntries.slice(0, maxVisible);
  const hiddenCount = filteredEntries.length - visibleEntries.length;

  if (totalCount === 0) {
    return (
      <div className="text-sm text-muted-foreground">No data available</div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Filter input */}
      {shouldShowFilter && expanded && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Entries list */}
      <div className={cn(expanded && maxHeight, expanded && 'overflow-y-auto')}>
        {visibleEntries.map((entry) => (
          <CopyableRow key={entry.key} entry={entry} />
        ))}
      </div>

      {/* Footer / Toggle */}
      <div className="flex items-center justify-between pt-1">
        <div className="text-xs text-muted-foreground">
          {filter && filteredEntries.length !== totalCount ? (
            <span>{filteredEntries.length} of {totalCount} shown</span>
          ) : footer ? (
            footer
          ) : null}
        </div>
        {shouldShowToggle && (
          <button
            onClick={() => {
              setExpanded(!expanded);
              if (expanded) setFilter('');
            }}
            className="text-xs text-brand-secondary hover:underline flex items-center gap-1"
          >
            {expanded ? (
              <>
                Show less
                <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Show all ({hiddenCount} more)
                <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Specialized display for GridSource parameters
 */
export function GridSourceDisplay({ spec, totalCases }: { spec: Record<string, unknown[]>; totalCases?: number }) {
  return (
    <KeyValueDisplay
      data={spec}
      footer={totalCases != null ? `${totalCases} total combinations` : undefined}
    />
  );
}

/**
 * Specialized display for RandomSource parameters
 */
export function RandomSourceDisplay({
  space,
  nTrials,
  seed
}: {
  space: Record<string, Record<string, unknown>>;
  nTrials?: number;
  seed?: number;
}) {
  return (
    <KeyValueDisplay
      data={space}
      footer={
        <span>
          {nTrials != null && <>{nTrials} trials</>}
          {nTrials != null && seed != null && ', '}
          {seed != null && <>seed: {seed}</>}
        </span>
      }
    />
  );
}

/**
 * Display for ManualSource parameters
 */
export function ManualSourceDisplay({ totalCases }: { totalCases?: number }) {
  return (
    <div className="text-sm text-muted-foreground">
      {totalCases} manually specified cases
    </div>
  );
}

/**
 * Smart params display that routes to the appropriate component
 */
export function ParamsDisplay({ params }: { params: Record<string, unknown> }) {
  const type = params.type as string | undefined;

  if (type === 'GridSource' && params.spec) {
    return (
      <GridSourceDisplay
        spec={params.spec as Record<string, unknown[]>}
        totalCases={params.total_cases as number | undefined}
      />
    );
  }

  if (type === 'RandomSource' && params.space) {
    return (
      <RandomSourceDisplay
        space={params.space as Record<string, Record<string, unknown>>}
        nTrials={params.n_trials as number | undefined}
        seed={params.seed as number | undefined}
      />
    );
  }

  if (type === 'ManualSource') {
    return <ManualSourceDisplay totalCases={params.total_cases as number | undefined} />;
  }

  // Fallback: generic key-value display
  return <KeyValueDisplay data={params} />;
}

/**
 * Generic metadata display
 */
export function MetadataDisplay({ metadata }: { metadata: Record<string, unknown> }) {
  return <KeyValueDisplay data={metadata} />;
}
