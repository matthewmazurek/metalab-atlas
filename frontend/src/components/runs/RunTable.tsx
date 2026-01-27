import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useRuns, useFields } from '@/api/hooks';
import { Button } from '@/components/ui/button';
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
import { useAtlasStore } from '@/store/useAtlasStore';
import type { RunResponse, FieldInfo } from '@/api/types';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';

const PAGE_SIZE = 25;

// Column definitions
interface ColumnDef {
  id: string;
  title: string;
  field: string; // API field path for sorting/filtering
  sortable: boolean;
  filterable: boolean;
  width?: string;
  render: (run: RunResponse) => React.ReactNode;
  getValue?: (run: RunResponse) => string; // For client-side filtering fallback
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString();
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

export function RunTable() {
  const [page, setPage] = useState(0);
  const {
    filter,
    tableSort,
    columnFilters,
    selectedRunIds,
    toggleRunSelection,
    setTableSort,
    setColumnFilter,
    setColumnFilterValues,
    clearAllColumnFilters,
    getFieldFilters,
  } = useAtlasStore();

  // Fetch field index for discrete value filtering
  const { data: fieldsData } = useFields(filter.experiment_id ?? undefined);

  // Build field_filters from column filters for server-side filtering
  const fieldFilters = useMemo(() => {
    return getFieldFilters();
  }, [columnFilters, getFieldFilters]);

  // Merge field_filters into the filter
  const mergedFilter = useMemo(() => {
    if (fieldFilters.length === 0) return filter;
    return {
      ...filter,
      field_filters: [...(filter.field_filters || []), ...fieldFilters],
    };
  }, [filter, fieldFilters]);

  const { data, isLoading, isError } = useRuns({
    filter: mergedFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort_by: tableSort?.field || 'record.started_at',
    sort_order: tableSort?.order || 'desc',
  });

  // Reset to page 0 when filters change
  const filterKey = JSON.stringify(mergedFilter);
  useEffect(() => {
    setPage(0);
  }, [filterKey]);

  const runs = data?.runs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Column definitions
  const columns: ColumnDef[] = useMemo(
    () => [
      {
        id: 'run_id',
        title: 'Run ID',
        field: 'record.run_id',
        sortable: true,
        filterable: true,
        width: 'w-32',
        render: (run) => (
          <Link
            to={`/runs/${run.record.run_id}`}
            className="font-mono text-sm text-primary hover:underline"
          >
            {run.record.run_id.slice(0, 8)}...
          </Link>
        ),
        getValue: (run) => run.record.run_id,
      },
      {
        id: 'experiment_id',
        title: 'Experiment',
        field: 'record.experiment_id',
        sortable: true,
        filterable: true,
        render: (run) => run.record.experiment_id,
        getValue: (run) => run.record.experiment_id,
      },
      {
        id: 'status',
        title: 'Status',
        field: 'record.status',
        sortable: true,
        filterable: true,
        width: 'w-24',
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
          <span className="text-sm text-muted-foreground">
            {formatDate(run.record.started_at)}
          </span>
        ),
      },
      {
        id: 'duration_ms',
        title: 'Duration',
        field: 'record.duration_ms',
        sortable: true,
        filterable: false,
        width: 'w-24',
        render: (run) => (
          <span className="text-sm">{formatDuration(run.record.duration_ms)}</span>
        ),
      },
      {
        id: 'metrics',
        title: 'Key Metrics',
        field: 'metrics',
        sortable: false,
        filterable: true,
        render: (run) => (
          <div className="flex gap-2 flex-wrap">
            {Object.entries(run.metrics)
              .slice(0, 3)
              .map(([key, value]) => (
                <span key={key} className="px-2 py-0.5 bg-muted rounded text-xs">
                  {key}: {typeof value === 'number' ? value.toFixed(4) : String(value)}
                </span>
              ))}
          </div>
        ),
        getValue: (run) =>
          Object.entries(run.metrics)
            .map(([k, v]) => `${k}:${v}`)
            .join(' '),
      },
    ],
    []
  );

  // Get sort direction for a column
  const getSortDirection = (field: string): SortDirection => {
    if (!tableSort || tableSort.field !== field) return null;
    return tableSort.order;
  };

  // Get filter value for a column (text contains filter)
  const getFilterValue = (columnId: string): string => {
    return columnFilters.find((cf) => cf.columnId === columnId)?.value || '';
  };

  // Get selected values for a column (discrete filter)
  const getSelectedValues = (columnId: string): string[] => {
    return columnFilters.find((cf) => cf.columnId === columnId)?.values || [];
  };

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
    return fieldsData.params_fields?.[field] || 
           fieldsData.metrics_fields?.[field] ||
           fieldsData.record_fields?.[field];
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
  const handleFilter = (columnId: string, field: string, value: string) => {
    setColumnFilter(columnId, field, value);
    setPage(0);
  };

  // Handle filter values change (discrete multi-select)
  const handleFilterValues = (columnId: string, field: string, values: string[]) => {
    setColumnFilterValues(columnId, field, values);
    setPage(0);
  };

  const hasActiveFilters = columnFilters.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center p-8 text-destructive">
        Failed to load runs. Make sure the Atlas server is running.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active filters indicator */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-muted-foreground">Column filters:</span>
          {columnFilters.map((cf) => (
            <span
              key={cf.columnId}
              className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs"
            >
              {cf.columnId}:{' '}
              {cf.values && cf.values.length > 0
                ? `[${cf.values.length} selected]`
                : `"${cf.value}"`}
            </span>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={clearAllColumnFilters}
          >
            <X className="h-3 w-3 mr-1" />
            Clear all
          </Button>
        </div>
      )}

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 align-middle"></TableHead>
              {columns.map((col) => {
                const fieldInfo = getFieldInfo(col.field);
                return (
                  <TableHead
                    key={col.id}
                    className={`align-middle ${col.width || ''}`}
                  >
                    <ColumnHeader
                      title={col.title}
                      sortable={col.sortable}
                      filterable={col.filterable}
                      sortDirection={getSortDirection(col.field)}
                      filterValue={getFilterValue(col.id)}
                      onSort={(dir) => handleSort(col.field, dir)}
                      onFilter={(value) => handleFilter(col.id, col.field, value)}
                      discreteValues={fieldInfo?.values}
                      selectedValues={getSelectedValues(col.id)}
                      onFilterValues={(values) => handleFilterValues(col.id, col.field, values)}
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
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
              runs.map((run) => (
                <TableRow
                  key={run.record.run_id}
                  data-state={
                    selectedRunIds.includes(run.record.run_id)
                      ? 'selected'
                      : undefined
                  }
                >
                  <TableCell className="align-middle">
                    <Checkbox
                      checked={selectedRunIds.includes(run.record.run_id)}
                      onCheckedChange={() => toggleRunSelection(run.record.run_id)}
                    />
                  </TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.id} className="align-middle">
                      {col.render(run)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {total > 0 ? (
            <>
              Showing {page * PAGE_SIZE + 1}-
              {Math.min((page + 1) * PAGE_SIZE, total)} of {total} runs
            </>
          ) : (
            'No runs'
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
