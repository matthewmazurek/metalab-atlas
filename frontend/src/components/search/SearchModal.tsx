import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Beaker,
  Calculator,
  ChevronRight,
  FileBox,
  Fingerprint,
  Hash,
  LayoutList,
  Loader2,
  ScrollText,
  Search,
  SlidersHorizontal,
  Tag,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearch, useSearchLogs } from '@/api/hooks';
import type { SearchGroup, SearchHit } from '@/api/types';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 5;

/** Three discrete body-panel heights (px). */
const BODY_HEIGHTS = { input: 0, status: 56, results: 400 } as const;
type ModalSize = keyof typeof BODY_HEIGHTS;

const SKELETON_ROW_WIDTHS = ['w-48', 'w-36', 'w-56'];
const MAX_SUBLABEL_LEN = 48;

/** Shimmer placeholders that mirror the shape of real result sections. */
function SearchSkeleton() {
  return (
    <div className="space-y-1">
      {[0, 1].map((section) => (
        <div key={section}>
          {/* Category header */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="skeleton-shimmer h-3.5 w-3.5 rounded bg-muted-foreground/20" />
            <div className={cn('skeleton-shimmer h-3 rounded bg-muted-foreground/20', section === 0 ? 'w-24' : 'w-20')} />
          </div>
          {/* Result rows */}
          {SKELETON_ROW_WIDTHS.map((w, row) => (
            <div key={row} className="flex items-center gap-2 rounded-md px-2 py-2">
              <div className={cn('skeleton-shimmer h-4 rounded bg-muted-foreground/15', w)} />
              <div className="flex-1" />
              <div className="skeleton-shimmer h-3 w-20 rounded bg-muted-foreground/10" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  experiments: Beaker,
  runs: LayoutList,
  param_names: SlidersHorizontal,
  metric_names: BarChart3,
  derived_names: Calculator,
  param_values: Hash,
  metric_values: Hash,
  derived_values: Hash,
  fingerprints: Fingerprint,
  artifacts: FileBox,
  tags: Tag,
  run_tags: Tag,
  logs: ScrollText,
};

function getHitHref(hit: SearchHit): string {
  if (hit.entity_type === 'experiment') {
    return `/experiments/${encodeURIComponent(hit.entity_id)}`;
  }
  if (hit.entity_type === 'run') {
    return `/runs/${encodeURIComponent(hit.entity_id)}`;
  }
  return '/';
}

function getOverflowHref(group: SearchGroup, query: string): string {
  if (group.scope === 'run') {
    return '/runs';
  }
  // Experiment-scoped: only filter by experiment name when the category is "experiments"
  if (group.category === 'experiments') {
    return `/experiments?name=${encodeURIComponent(query)}`;
  }
  // param_names, metric_names, derived_names, artifacts: filter by "has field/artifact"
  if (group.category === 'param_names') {
    return `/experiments?has_param=${encodeURIComponent(query)}`;
  }
  if (group.category === 'metric_names') {
    return `/experiments?has_metric=${encodeURIComponent(query)}`;
  }
  if (group.category === 'derived_names') {
    return `/experiments?has_derived=${encodeURIComponent(query)}`;
  }
  if (group.category === 'artifacts') {
    return `/experiments?has_artifact=${encodeURIComponent(query)}`;
  }
  if (group.category === 'tags') {
    return `/experiments?has_tag=${encodeURIComponent(query)}`;
  }
  return '/experiments';
}

type SelectableItem =
  | { type: 'hit'; group: SearchGroup; hit: SearchHit; href: string }
  | { type: 'overflow'; group: SearchGroup; href: string };

export interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedIndex(0);
    setTimeout(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(inputValue), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [inputValue]);

  const {
    data: searchData,
    isFetching: searchFetching,
    isPlaceholderData: searchIsPlaceholder,
  } = useSearch(debouncedQuery, SEARCH_LIMIT);
  const {
    data: logsData,
    isFetching: logsFetching,
    isPlaceholderData: logsIsPlaceholder,
  } = useSearchLogs(debouncedQuery, SEARCH_LIMIT);

  const mergedGroups = useMemo(() => {
    const groups = searchData?.groups ?? [];
    if (logsData?.groups?.length) {
      return [...groups, ...logsData.groups];
    }
    if (logsFetching && debouncedQuery.trim().length >= 2) {
      return [
        ...groups,
        {
          category: 'logs',
          label: 'Log contents',
          scope: 'run' as const,
          hits: [] as SearchHit[],
          total: 0,
        } as SearchGroup,
      ];
    }
    return groups;
  }, [searchData?.groups, logsData?.groups, logsFetching, debouncedQuery]);

  const selectableItems = useMemo((): SelectableItem[] => {
    const items: SelectableItem[] = [];
    const query = debouncedQuery.trim();
    for (const group of mergedGroups) {
      for (const hit of group.hits) {
        items.push({
          type: 'hit',
          group,
          hit,
          href: getHitHref(hit),
        });
      }
      if (group.total > group.hits.length) {
        items.push({
          type: 'overflow',
          group,
          href: getOverflowHref(group, query),
        });
      }
    }
    return items;
  }, [mergedGroups, debouncedQuery]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    setSelectedIndex((i) =>
      selectableItems.length === 0 ? 0 : Math.min(i, selectableItems.length - 1)
    );
  }, [selectableItems.length]);

  // Indices where each new category section begins (for Cmd+Arrow jumping)
  const sectionStartIndices = useMemo(() => {
    const indices: number[] = [];
    let lastCategory = '';
    selectableItems.forEach((item, idx) => {
      if (item.group.category !== lastCategory) {
        indices.push(idx);
        lastCategory = item.group.category;
      }
    });
    return indices;
  }, [selectableItems]);

  // Scroll the selected item into view within the results list
  useEffect(() => {
    if (selectedIndex < 0) return;
    const el = document.querySelector(`[data-search-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' && e.metaKey) {
        // Cmd+Down: jump to next section
        e.preventDefault();
        const next = sectionStartIndices.find((i) => i > selectedIndex);
        if (next !== undefined) {
          setSelectedIndex(next);
        } else {
          setSelectedIndex(Math.max(0, selectableItems.length - 1));
        }
      } else if (e.key === 'ArrowUp' && e.metaKey) {
        // Cmd+Up: jump to start of current section, or previous section if already there
        e.preventDefault();
        let currentSectionStart = 0;
        for (const idx of sectionStartIndices) {
          if (idx <= selectedIndex) currentSectionStart = idx;
          else break;
        }
        if (currentSectionStart < selectedIndex) {
          setSelectedIndex(currentSectionStart);
        } else {
          const prevIdx = sectionStartIndices.indexOf(currentSectionStart);
          setSelectedIndex(prevIdx > 0 ? sectionStartIndices[prevIdx - 1] : 0);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) =>
          selectableItems.length === 0 ? 0 : Math.min(i + 1, selectableItems.length - 1)
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        const item = selectableItems[selectedIndex];
        if (item) {
          e.preventDefault();
          onOpenChange(false);
          navigate(item.href);
        }
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    },
    [selectableItems, selectedIndex, onOpenChange, navigate, sectionStartIndices]
  );

  const handleSelect = useCallback(
    (href: string) => {
      onOpenChange(false);
      navigate(href);
    },
    [onOpenChange, navigate]
  );

  const isLoading = searchFetching && debouncedQuery.trim().length >= 2;
  const isDebouncing = inputValue.trim().length >= 2 && inputValue !== debouncedQuery;
  const hasQuery = debouncedQuery.trim().length >= 2;
  // Data is stale when React Query is serving previous-query placeholders or debounce hasn't fired yet
  const isStale = isDebouncing || searchIsPlaceholder || logsIsPlaceholder;
  const hasResults =
    (searchData?.groups?.some((g) => g.hits.length > 0 || g.total > 0) ?? false) ||
    (logsData?.groups?.some((g) => g.hits.length > 0 || g.total > 0) ?? false);
  const emptyState = hasQuery && !isLoading && !isStale && !hasResults;
  // Show skeleton when user has typed a query but fresh results haven't arrived yet
  const showSkeleton = inputValue.trim().length >= 2 && (isStale || isLoading);
  // Only show real results when they're fresh and there are actual items to display
  const showResults = !isStale && !isLoading && searchData && selectableItems.length > 0;

  // Three discrete modal body sizes
  const modalSize: ModalSize =
    showSkeleton || showResults
      ? 'results'
      : emptyState
        ? 'status'
        : inputValue.trim().length === 0
          ? 'input'
          : 'status';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl p-0 gap-0 overflow-hidden"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2',
            modalSize !== 'input' && 'border-b border-border'
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-brand-tertiary" />
          <Input
            ref={inputRef}
            type="search"
            placeholder="Search experiments, runs, parameters, metrics..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 bg-transparent"
            aria-label="Search"
            autoComplete="off"
          />
          <kbd className="pointer-events-none hidden h-6 select-none items-center gap-1 rounded border border-border bg-muted px-2 font-mono text-[10px] font-medium text-brand-tertiary sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>

        {/* Animated body panel — three fixed heights */}
        <div
          className="overflow-hidden transition-[height] duration-200 ease-out"
          style={{ height: BODY_HEIGHTS[modalSize] }}
        >
          {modalSize === 'results' ? (
            <ScrollArea className="h-full">
              <div className="p-2">
                {showSkeleton && <SearchSkeleton />}

                {showResults && (
                  <>
                    {(() => {
                      let lastCategory = '';
                      return selectableItems.map((item, idx) => {
                        const showHeader = item.group.category !== lastCategory;
                        if (showHeader) lastCategory = item.group.category;
                        const Icon =
                          CATEGORY_ICONS[item.group.category] ?? SlidersHorizontal;
                        const isLogsLoading =
                          item.group.category === 'logs' &&
                          logsFetching &&
                          item.group.hits.length === 0;
                        const isSelected = idx === selectedIndex;

                        return (
                          <div key={`${item.group.category}-${idx}`} data-search-index={idx}>
                            {showHeader && (
                              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-brand-tertiary">
                                <Icon className="h-3.5 w-3.5" />
                                {item.group.label}
                                {/* Scope badge — skip for categories whose name already implies the scope */}
                                {item.group.category !== 'experiments' &&
                                  item.group.category !== 'runs' && (
                                    <span className={cn(
                                      'ml-auto rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium tracking-wide uppercase',
                                      'bg-muted text-muted-foreground'
                                    )}>
                                      {item.group.scope === 'experiment' ? 'exp' : 'run'}
                                    </span>
                                  )}
                                {isLogsLoading && (
                                  <Loader2 className="h-3 w-3 animate-spin ml-1" />
                                )}
                              </div>
                            )}
                            {item.type === 'hit' ? (
                              <button
                                type="button"
                                onClick={() => handleSelect(item.href)}
                                className={cn(
                                  'flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-2 text-left text-sm transition-colors',
                                  isSelected
                                    ? 'bg-brand/10 text-brand'
                                    : 'hover:bg-muted/80'
                                )}
                              >
                                {/* Entity-type icon */}
                                {item.hit.entity_type === 'experiment' ? (
                                  <Beaker className={cn(
                                    'h-3.5 w-3.5 shrink-0',
                                    isSelected ? 'text-brand' : 'text-muted-foreground'
                                  )} />
                                ) : (
                                  <LayoutList className={cn(
                                    'h-3.5 w-3.5 shrink-0',
                                    isSelected ? 'text-brand' : 'text-muted-foreground'
                                  )} />
                                )}
                                <span className="shrink-0 truncate max-w-[40%] font-medium">
                                  {item.hit.label}
                                </span>
                                {item.hit.sublabel && (
                                  <span className={cn(
                                    'truncate text-xs',
                                    isSelected ? 'text-brand/80' : 'text-muted-foreground'
                                  )}>
                                    {item.hit.sublabel.length > MAX_SUBLABEL_LEN
                                      ? item.hit.sublabel.slice(0, MAX_SUBLABEL_LEN) + '…'
                                      : item.hit.sublabel}
                                  </span>
                                )}
                                <ChevronRight className={cn(
                                  'h-4 w-4 shrink-0',
                                  isSelected ? 'text-brand' : 'text-brand-tertiary'
                                )} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSelect(item.href)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80',
                                  isSelected
                                    ? 'bg-brand/10 text-brand'
                                    : 'text-muted-foreground'
                                )}
                              >
                                <span className="flex-1 text-xs">
                                  {item.group.total} matching{' '}
                                  {item.group.scope === 'experiment'
                                    ? 'experiments'
                                    : 'runs'}{' '}
                                  →
                                </span>
                              </button>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </>
                )}
              </div>
            </ScrollArea>
          ) : modalSize === 'status' ? (
            <div className="flex h-full items-center justify-center text-sm">
              {emptyState ? (
                <span className="text-muted-foreground">No results found</span>
              ) : (
                <span className="text-brand-tertiary">
                  Type at least 2 characters to search
                </span>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
