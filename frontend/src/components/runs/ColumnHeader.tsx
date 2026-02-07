import { useState, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  ChevronDown,
} from 'lucide-react';

export type SortDirection = 'asc' | 'desc' | null;

// Maximum number of unique values to show as a discrete list
const MAX_DISCRETE_VALUES = 100;

interface ColumnHeaderProps {
  title: string;
  sortable?: boolean;
  filterable?: boolean;
  sortDirection?: SortDirection;
  filterValue?: string;
  onSort?: (direction: SortDirection) => void;
  onFilter?: (value: string) => void;
  className?: string;
  // Discrete value filtering props
  discreteValues?: string[] | null;
  selectedValues?: string[];
  onFilterValues?: (values: string[]) => void;
}

export function ColumnHeader({
  title,
  sortable = false,
  filterable = false,
  sortDirection = null,
  filterValue = '',
  onSort,
  onFilter,
  className = '',
  discreteValues,
  selectedValues = [],
  onFilterValues,
}: ColumnHeaderProps) {
  const [localFilter, setLocalFilter] = useState(filterValue);
  const [localSelectedValues, setLocalSelectedValues] = useState<string[]>(selectedValues);
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);

  // Determine if we should show discrete filtering
  const hasDiscreteValues = discreteValues && discreteValues.length > 0 && discreteValues.length <= MAX_DISCRETE_VALUES;

  const hasInteraction = sortable || filterable;
  const hasActiveFilter = hasDiscreteValues
    ? selectedValues.length > 0
    : filterValue && filterValue.length > 0;
  const hasActiveSort = sortDirection !== null;

  // Filter discrete values based on search term
  const filteredValues = useMemo(() => {
    if (!discreteValues) return [];
    if (!searchTerm) return discreteValues;
    const lowerSearch = searchTerm.toLowerCase();
    return discreteValues.filter((v) => v.toLowerCase().includes(lowerSearch));
  }, [discreteValues, searchTerm]);

  const handleApplyFilter = () => {
    onFilter?.(localFilter);
    setOpen(false);
  };

  const handleClearFilter = () => {
    setLocalFilter('');
    onFilter?.('');
  };

  const handleApplyDiscreteFilter = () => {
    onFilterValues?.(localSelectedValues);
    setOpen(false);
  };

  const handleClearDiscreteFilter = () => {
    setLocalSelectedValues([]);
    onFilterValues?.([]);
  };

  const handleToggleValue = (value: string) => {
    setLocalSelectedValues((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    );
  };

  const handleSelectAll = () => {
    setLocalSelectedValues(filteredValues);
  };

  const handleClearAll = () => {
    setLocalSelectedValues([]);
  };

  const handleSort = (direction: SortDirection) => {
    onSort?.(direction);
    setOpen(false);
  };

  // Sync local state with props when dropdown opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setLocalFilter(filterValue);
      setLocalSelectedValues(selectedValues);
      setSearchTerm('');
    }
    setOpen(isOpen);
  };

  if (!hasInteraction) {
    return <span className={className}>{title}</span>;
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-1 hover:text-foreground transition-colors ${className}`}
        >
          <span>{title}</span>
          <span className="flex items-center gap-0.5">
            {hasActiveSort && (
              <span className="text-brand-tertiary">
                {sortDirection === 'asc' ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )}
              </span>
            )}
            {hasActiveFilter && (
              <Filter className="h-3.5 w-3.5 text-brand-tertiary" />
            )}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {sortable && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Sort
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handleSort('asc')}
              className={sortDirection === 'asc' ? 'bg-accent' : ''}
            >
              <ArrowUp className="h-4 w-4 mr-2" />
              Sort Ascending
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleSort('desc')}
              className={sortDirection === 'desc' ? 'bg-accent' : ''}
            >
              <ArrowDown className="h-4 w-4 mr-2" />
              Sort Descending
            </DropdownMenuItem>
            {hasActiveSort && (
              <DropdownMenuItem onClick={() => handleSort(null)}>
                <X className="h-4 w-4 mr-2" />
                Clear Sort
              </DropdownMenuItem>
            )}
          </>
        )}

        {sortable && filterable && <DropdownMenuSeparator />}

        {filterable && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Filter
            </DropdownMenuLabel>
            <div className="px-2 py-1.5 space-y-2">
              {hasDiscreteValues ? (
                // Discrete value filter with checkbox list
                <>
                  <Input
                    placeholder="Search values..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs flex-1"
                      onClick={handleSelectAll}
                    >
                      Select All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs flex-1"
                      onClick={handleClearAll}
                    >
                      Clear
                    </Button>
                  </div>
                  <ScrollArea className="h-40 border rounded-md">
                    <div className="p-2 space-y-1">
                      {filteredValues.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-2">
                          No matching values
                        </div>
                      ) : (
                        filteredValues.map((value) => (
                          <label
                            key={value}
                            className="flex items-center gap-2 px-1 py-1 hover:bg-accent rounded cursor-pointer text-sm"
                          >
                            <Checkbox
                              checked={localSelectedValues.includes(value)}
                              onCheckedChange={() => handleToggleValue(value)}
                            />
                            <span className="truncate flex-1" title={value}>
                              {value}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 flex-1"
                      onClick={handleApplyDiscreteFilter}
                    >
                      Apply
                      {localSelectedValues.length > 0 && (
                        <span className="ml-1 text-xs opacity-70">
                          ({localSelectedValues.length})
                        </span>
                      )}
                    </Button>
                    {hasActiveFilter && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={handleClearDiscreteFilter}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                // Text contains filter (fallback)
                <>
                  <Input
                    placeholder="Contains..."
                    value={localFilter}
                    onChange={(e) => setLocalFilter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleApplyFilter();
                      }
                      e.stopPropagation();
                    }}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 flex-1"
                      onClick={handleApplyFilter}
                    >
                      Apply
                    </Button>
                    {hasActiveFilter && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={handleClearFilter}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
