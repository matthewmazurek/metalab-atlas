import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTableNavigation } from '@/hooks/useTableNavigation';
import { useRuns, useFields } from '@/api/hooks';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from './StatusBadge';
import { ColumnHeader, type SortDirection } from './ColumnHeader';
import { TruncatedId } from '@/components/ui/truncated-id';
import { useAtlasStore } from '@/store/useAtlasStore';
import type { RunResponse, FieldInfo } from '@/api/types';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime, formatDuration } from '@/lib/datetime';

const PAGE_SIZE = 25;

// Column definitions
interface ColumnDef {
  id: string;
  title: string;
  field: string; // API field path for sorting/filtering
  sortable: boolean;
  filterable: boolean;
  sticky?: boolean; // Whether this column should be sticky
  stickyOffset?: number; // Left offset for sticky positioning
  render: (run: RunResponse) => React.ReactNode;
  getValue?: (run: RunResponse) => string;
}

/**
 * Format a value for display in the table
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    if (Math.abs(value) < 0.0001 || Math.abs(value) >= 10000) return value.toExponential(3);
    return value.toFixed(4);
  }
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

interface RunTableProps {
  onVisibleRunIdsChange?: (runIds: string[]) => void;
  onTotalChange?: (total: number) => void;
}

export function RunTable({ onVisibleRunIdsChange, onTotalChange }: RunTableProps) {
  return (
    <RunTableImpl
      onVisibleRunIdsChange={onVisibleRunIdsChange}
      onTotalChange={onTotalChange}
    />
  );
}

function RunTableImpl({
  onVisibleRunIdsChange,
  onTotalChange,
}: {
  onVisibleRunIdsChange?: (runIds: string[]) => void;
  onTotalChange?: (total: number) => void;
}) {
  const [page, setPage] = useState(0);
  const {
    filter,
    tableSort,
    selectedRunIds,
    selectionFilter,
    toggleRunSelection,
    setTableSort,
    addFieldFilter,
    setFieldFilterValues,
    getFieldFilterValues,
    visibleColumns: visibleColumnsMap,
    setVisibleColumns,
  } = useAtlasStore();

  // Helper to check if a run is selected (handles both explicit and filter-based selection)
  const isRunSelected = (runId: string) => {
    // If we have filter-based selection, all visible runs are selected
    if (selectionFilter !== null) return true;
    // Otherwise check explicit selection
    return selectedRunIds.includes(runId);
  };

  const experimentId = filter.experiment_id ?? '_all';

  // Fetch field index for discrete value filtering and dynamic columns
  const { data: fieldsData } = useFields(filter.experiment_id ?? undefined);

  // Get visible columns from store, or use defaults
  // Note: We subscribe to visibleColumnsMap directly (not via getVisibleColumns)
  // because Zustand's get() doesn't trigger re-renders
  const storedVisibleColumns = visibleColumnsMap[experimentId];
  const visibleColumns = useMemo(() => {
    if (storedVisibleColumns) return storedVisibleColumns;
    // Default: first 2 params + first 2 metrics
    if (!fieldsData) return [];
    const defaultCols = [
      ...Object.keys(fieldsData.params_fields || {}).slice(0, 2),
      ...Object.keys(fieldsData.metrics_fields || {}).slice(0, 2),
    ];
    return defaultCols;
  }, [storedVisibleColumns, fieldsData]);

  // Initialize visible columns in store if not set
  useEffect(() => {
    if (!storedVisibleColumns && fieldsData && filter.experiment_id) {
      const defaultCols = [
        ...Object.keys(fieldsData.params_fields || {}).slice(0, 2),
        ...Object.keys(fieldsData.metrics_fields || {}).slice(0, 2),
      ];
      if (defaultCols.length > 0) {
        setVisibleColumns(experimentId, defaultCols);
      }
    }
  }, [storedVisibleColumns, fieldsData, experimentId, filter.experiment_id, setVisibleColumns]);

  const { data, isLoading } = useRuns({
    filter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort_by: tableSort?.field || 'record.started_at',
    sort_order: tableSort?.order || 'desc',
  });

  const navigate = useNavigate();
  const runs = useMemo(() => data?.runs ?? [], [data?.runs]);
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Notify parent of visible run IDs for "Select All" functionality
  useEffect(() => {
    if (onVisibleRunIdsChange) {
      const visibleIds = runs.map((run) => run.record.run_id);
      onVisibleRunIdsChange(visibleIds);
    }
  }, [runs, onVisibleRunIdsChange]);

  // Notify parent of total count
  useEffect(() => {
    if (onTotalChange) {
      onTotalChange(total);
    }
  }, [total, onTotalChange]);

  // Keyboard table navigation
  const handleOpenRow = useCallback(
    (index: number) => {
      const run = runs[index];
      if (run) {
        navigate(`/runs/${run.record.run_id}`);
      }
    },
    [runs, navigate]
  );

  const handleSelectRow = useCallback(
    (index: number) => {
      const run = runs[index];
      if (run) {
        toggleRunSelection(run.record.run_id);
      }
    },
    [runs, toggleRunSelection]
  );

  const { focusedIndex, tableBodyRef } = useTableNavigation({
    rowCount: runs.length,
    onOpen: handleOpenRow,
    onSelect: handleSelectRow,
    page,
    totalPages,
    onPageChange: setPage,
  });

  // Build column definitions dynamically
  const columns: ColumnDef[] = useMemo(() => {
    // Fixed columns (always shown)
    const fixedColumns: ColumnDef[] = [
      {
        id: 'run_id',
        title: 'Run ID',
        field: 'record.run_id',
        sortable: true,
        filterable: true,
        sticky: true,
        stickyOffset: 40, // After checkbox (w-10 = 40px)
        render: (run) => (
          <Link
            to={`/runs/${run.record.run_id}`}
            className="text-sm text-brand-secondary hover:underline"
          >
            <TruncatedId value={run.record.run_id} />
          </Link>
        ),
        getValue: (run) => run.record.run_id,
      },
      {
        id: 'status',
        title: 'Status',
        field: 'record.status',
        sortable: true,
        filterable: true,
        render: (run) => <StatusBadge status={run.record.status} />,
        getValue: (run) => run.record.status,
      },
      {
        id: 'started_at',
        title: 'Started',
        field: 'record.started_at',
        sortable: true,
        filterable: false,
        render: (run) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(run.record.started_at)}
          </span>
        ),
      },
      {
        id: 'duration_ms',
        title: 'Duration',
        field: 'record.duration_ms',
        sortable: true,
        filterable: false,
        render: (run) => (
          <span className="text-sm whitespace-nowrap">
            {run.record.duration_ms != null ? formatDuration(run.record.duration_ms) : '—'}
          </span>
        ),
      },
    ];

    // If "All experiments" is selected, also show experiment column but no dynamic columns
    if (!filter.experiment_id) {
      fixedColumns.splice(1, 0, {
        id: 'experiment_id',
        title: 'Experiment',
        field: 'record.experiment_id',
        sortable: true,
        filterable: true,
        render: (run) => (
          <span className="text-sm truncate max-w-32" title={run.record.experiment_id}>
            {run.record.experiment_id}
          </span>
        ),
        getValue: (run) => run.record.experiment_id,
      });
      return fixedColumns;
    }

    // Dynamic columns (params and metrics) based on visibleColumns
    const dynamicColumns: ColumnDef[] = [];

    // Add params columns
    if (fieldsData?.params_fields) {
      for (const fieldName of visibleColumns) {
        if (fieldsData.params_fields[fieldName]) {
          dynamicColumns.push({
            id: `params.${fieldName}`,
            title: fieldName,
            field: `params.${fieldName}`,
            sortable: true,
            filterable: true,
            render: (run) => (
              <span className="text-sm font-mono">
                {formatValue(run.params[fieldName])}
              </span>
            ),
            getValue: (run) => String(run.params[fieldName] ?? ''),
          });
        }
      }
    }

    // Add metrics columns
    if (fieldsData?.metrics_fields) {
      for (const fieldName of visibleColumns) {
        if (fieldsData.metrics_fields[fieldName]) {
          dynamicColumns.push({
            id: `metrics.${fieldName}`,
            title: fieldName,
            field: `metrics.${fieldName}`,
            sortable: true,
            filterable: true,
            render: (run) => (
              <span className="text-sm font-mono">
                {formatValue(run.metrics[fieldName])}
              </span>
            ),
            getValue: (run) => String(run.metrics[fieldName] ?? ''),
          });
        }
      }
    }

    // Add derived metrics columns
    if (fieldsData?.derived_fields) {
      for (const fieldName of visibleColumns) {
        if (fieldsData.derived_fields[fieldName]) {
          dynamicColumns.push({
            id: `derived.${fieldName}`,
            title: fieldName,
            field: `derived_metrics.${fieldName}`,
            sortable: true,
            filterable: true,
            render: (run) => (
              <span className="text-sm font-mono">
                {formatValue(run.derived_metrics[fieldName])}
              </span>
            ),
            getValue: (run) => String(run.derived_metrics[fieldName] ?? ''),
          });
        }
      }
    }

    // Add metadata columns (from record fields)
    for (const fieldPath of visibleColumns) {
      if (fieldPath === 'record.seed_fingerprint') {
        dynamicColumns.push({
          id: 'record.seed_fingerprint',
          title: 'Seed',
          field: 'record.seed_fingerprint',
          sortable: true,
          filterable: true,
          render: (run) => (
            <TruncatedId value={run.record.seed_fingerprint} className="text-sm text-muted-foreground" />
          ),
          getValue: (run) => run.record.seed_fingerprint,
        });
      }
    }

    return [...fixedColumns, ...dynamicColumns];
  }, [filter.experiment_id, fieldsData, visibleColumns]);

  // Get sort direction for a column
  const getSortDirection = (field: string): SortDirection => {
    if (!tableSort || tableSort.field !== field) return null;
    return tableSort.order;
  };

  // Get filter value for a column (text contains filter)
  // Now reads from filter.field_filters
  const getFilterValue = useCallback((field: string): string => {
    const fieldFilter = filter.field_filters?.find(
      (f) => f.field === field && f.op === 'contains'
    );
    return fieldFilter ? String(fieldFilter.value) : '';
  }, [filter.field_filters]);

  // Get selected values for a column (discrete filter)
  // Now uses getFieldFilterValues from store
  const getSelectedValues = useCallback((field: string): string[] => {
    return getFieldFilterValues(field);
  }, [getFieldFilterValues]);

  // Get field info for a column to determine if it has discrete values
  const getFieldInfo = (field: string): FieldInfo | undefined => {
    if (!fieldsData) return undefined;

    // Parse field path (e.g., "record.status" -> look in record_fields for "status")
    const parts = field.split('.');
    if (parts.length === 2) {
      const [category, fieldName] = parts;
      if (category === 'record' && fieldsData.record_fields) {
        return fieldsData.record_fields[fieldName];
      }
      if (category === 'params' && fieldsData.params_fields) {
        return fieldsData.params_fields[fieldName];
      }
      if (category === 'metrics' && fieldsData.metrics_fields) {
        return fieldsData.metrics_fields[fieldName];
      }
    }
    // For simple field names, check all categories
    return (
      fieldsData.params_fields?.[field] ||
      fieldsData.metrics_fields?.[field] ||
      fieldsData.record_fields?.[field]
    );
  };

  // Handle sort change
  const handleSort = (field: string, direction: SortDirection) => {
    if (direction === null) {
      setTableSort(null);
    } else {
      setTableSort({ field, order: direction });
    }
    setPage(0);
  };

  // Handle filter change (text contains)
  const handleFilter = useCallback((field: string, value: string) => {
    if (value) {
      addFieldFilter({ field, op: 'contains', value });
    } else {
      // Remove the filter by setting empty values triggers removal
      const { removeFieldFilter } = useAtlasStore.getState();
      removeFieldFilter(field);
    }
    setPage(0);
  }, [addFieldFilter]);

  // Handle filter values change (discrete multi-select)
  const handleFilterValues = useCallback((field: string, values: string[]) => {
    setFieldFilterValues(field, values);
    setPage(0);
  }, [setFieldFilterValues]);

  const hasActiveFilters = (filter.field_filters && filter.field_filters.length > 0) ?? false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }


  return (
    <div className="space-y-2">
      {/* Table with horizontal scroll */}
      <div className="border border-border/60 rounded-xl overflow-x-auto bg-card shadow-sm">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              {/* Checkbox column - sticky */}
              <TableHead
                className={cn(
                  'w-10 align-middle bg-card',
                  'sticky left-0 z-20'
                )}
              />
              {columns.map((col) => {
                const fieldInfo = getFieldInfo(col.field);
                return (
                  <TableHead
                    key={col.id}
                    className={cn(
                      'align-middle whitespace-nowrap bg-muted/10',
                      col.sticky && 'sticky z-20',
                    )}
                    style={col.sticky ? { left: col.stickyOffset } : undefined}
                  >
                    <ColumnHeader
                      title={col.title}
                      sortable={col.sortable}
                      filterable={col.filterable}
                      sortDirection={getSortDirection(col.field)}
                      filterValue={getFilterValue(col.field)}
                      onSort={(dir) => handleSort(col.field, dir)}
                      onFilter={(value) => handleFilter(col.field, value)}
                      discreteValues={fieldInfo?.values}
                      selectedValues={getSelectedValues(col.field)}
                      onFilterValues={(values) => handleFilterValues(col.field, values)}
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody ref={tableBodyRef}>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-center py-8 text-muted-foreground"
                >
                  No runs found
                  {hasActiveFilters && (
                    <span className="block mt-1 text-xs">
                      Try adjusting your filters
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run, rowIdx) => {
                const isFocused = rowIdx === focusedIndex;
                const isSelected = isRunSelected(run.record.run_id);
                const rowState = isFocused ? 'focused' : isSelected ? 'selected' : undefined;
                // Sticky cells need an explicit background so content doesn't
                // show through when scrolling horizontally.  Mirror the row
                // state so focus/selection colours are visible.
                const stickyBg = isFocused
                  ? 'bg-brand/5'
                  : isSelected
                    ? 'bg-muted/70'
                    : 'bg-card';
                return (
                  <TableRow
                    key={run.record.run_id}
                    data-state={rowState}
                  >
                    {/* Checkbox - sticky */}
                    <TableCell
                      className={cn(
                        'align-middle',
                        'sticky left-0 z-10',
                        stickyBg,
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRunSelection(run.record.run_id)}
                      />
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell
                        key={col.id}
                        className={cn(
                          'align-middle',
                          col.sticky ? `sticky z-10 ${stickyBg}` : '',
                        )}
                        style={col.sticky ? { left: col.stickyOffset } : undefined}
                      >
                        {col.render(run)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        entityName="runs"
      />
    </div>
  );
}
