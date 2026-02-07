import { useCallback } from 'react';
import { useFields } from '@/api/hooks';
import type { FieldInfo } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart3, Calculator, List, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricsSummaryCardProps {
  experimentId: string;
  selectedField?: string;
  onFieldSelect?: (field: string) => void;
  /** When true, polls data more frequently (for in-progress experiments) */
  isInProgress?: boolean;
  /** When set, show this run's values in a "Value" column */
  runValues?: Record<string, unknown>;
}

/**
 * Format a numeric value for display
 */
function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (Number.isInteger(value)) return value.toLocaleString();
  // Use scientific notation for very small or very large numbers
  if (Math.abs(value) < 0.001 || Math.abs(value) > 1000000) {
    return value.toExponential(2);
  }
  return value.toFixed(3);
}

/**
 * Get a color class based on coverage percentage
 */
function getCoverageColor(count: number, total: number): string {
  if (total === 0) return 'text-muted-foreground';
  const ratio = count / total;
  if (ratio >= 0.95) return 'text-status-success';
  if (ratio >= 0.7) return 'text-status-warning';
  return 'text-status-failure';
}

/**
 * Format a run value for display in the Value column
 */
function formatRunValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

/**
 * Render a table of field statistics
 */
function FieldTable({
  fields,
  runCount,
  prefix,
  selectedField,
  onFieldSelect,
  runValues,
}: {
  fields: Record<string, FieldInfo>;
  runCount: number;
  prefix: 'metrics' | 'derived';
  selectedField?: string;
  onFieldSelect?: (field: string) => void;
  runValues?: Record<string, unknown>;
}) {
  const entries = Object.entries(fields);
  const showRunValue = runValues != null;

  // Scroll the selected row into view when the selection changes.
  // Including selectedField in deps ensures the ref callback identity changes
  // on selection change, re-triggering the scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedRef = useCallback((node: HTMLTableRowElement | null) => {
    if (node) {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedField]);

  if (entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No fields found
      </div>
    );
  }

  return (
    <Table className="table-fixed min-w-0 w-full">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40%] min-w-0">Name</TableHead>
          <TableHead className="w-[18%] min-w-0 text-right">
            {showRunValue ? 'Value' : 'Coverage'}
          </TableHead>
          <TableHead className="w-[26%] min-w-0 text-right">Range</TableHead>
          <TableHead className="w-[16%] min-w-0 text-right">Type</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([name, info]) => {
          const fullFieldName = `${prefix}.${name}`;
          const isSelected = selectedField === fullFieldName;
          const isClickable = info.type === 'numeric' && onFieldSelect;
          const runVal = showRunValue ? runValues[name] : undefined;

          return (
            <TableRow
              key={name}
              ref={isSelected ? selectedRef : undefined}
              className={cn(
                isClickable && 'cursor-pointer',
                isSelected && 'bg-brand-secondary/10'
              )}
              onClick={isClickable ? () => onFieldSelect(fullFieldName) : undefined}
            >
              <TableCell className="font-mono text-sm min-w-0 overflow-hidden">
                <span className={cn(isSelected && 'font-semibold text-brand-secondary', 'block truncate')}>
                  {name}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums min-w-0 overflow-hidden">
                {showRunValue ? (
                  <span className="font-mono text-sm block truncate" title={formatRunValue(runVal)}>
                    {formatRunValue(runVal)}
                  </span>
                ) : (
                  <>
                    <span className={getCoverageColor(info.count, runCount)}>
                      {info.count}
                    </span>
                    <span className="text-muted-foreground">/{runCount}</span>
                  </>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums min-w-0 overflow-hidden">
                {info.type === 'numeric' &&
                  info.min_value !== null &&
                  info.max_value !== null ? (
                  <span className="block truncate" title={`${formatNumber(info.min_value)} → ${formatNumber(info.max_value)}`}>
                    {formatNumber(info.min_value)}
                    <span className="text-muted-foreground mx-1">→</span>
                    {formatNumber(info.max_value)}
                  </span>
                ) : info.type === 'string' && info.values ? (
                  <span className="text-muted-foreground">
                    {info.values.length} values
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right min-w-0 whitespace-nowrap">
                <Badge variant="secondary" className="text-xs shrink-0">
                  {info.type}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function MetricsSummaryCard({
  experimentId,
  selectedField,
  onFieldSelect,
  isInProgress = false,
  runValues,
}: MetricsSummaryCardProps) {
  const { data: fieldsData, isLoading, error } = useFields(experimentId, isInProgress);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <List className="h-4 w-4" />
            Metrics Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !fieldsData) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <List className="h-4 w-4" />
            Metrics Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Failed to load metrics data
        </CardContent>
      </Card>
    );
  }

  const metricsFields = fieldsData.metrics_fields || {};
  const derivedFields = fieldsData.derived_fields || {};
  const runCount = fieldsData.run_count;

  const hasMetrics = Object.keys(metricsFields).length > 0;
  const hasDerived = Object.keys(derivedFields).length > 0;

  if (!hasMetrics && !hasDerived) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <List className="h-4 w-4" />
            Metrics Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No metrics captured yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <List className="h-4 w-4" />
          Metrics Summary
          <span className="text-xs text-muted-foreground font-normal ml-auto">
            {runValues != null ? `1 of ${runCount} runs` : `${runCount} runs`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics (Outputs) Section */}
        {hasMetrics && (
          <div>
            <div className="font-sans text-xs font-medium uppercase tracking-wide text-brand-tertiary mb-2 flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" />
              Metrics (Outputs)
            </div>
            <div className="min-w-0 max-h-64 overflow-y-auto">
              <FieldTable
                fields={metricsFields}
                runCount={runCount}
                prefix="metrics"
                selectedField={selectedField}
                onFieldSelect={onFieldSelect}
                runValues={runValues}
              />
            </div>
          </div>
        )}

        {/* Derived Metrics Section */}
        {hasDerived && (
          <div className={hasMetrics ? 'border-t pt-4' : ''}>
            <div className="font-sans text-xs font-medium uppercase tracking-wide text-brand-tertiary mb-2 flex items-center gap-1.5">
              <Calculator className="h-3 w-3" />
              Derived Metrics
            </div>
            <div className="min-w-0 max-h-48 overflow-y-auto">
              <FieldTable
                fields={derivedFields}
                runCount={runCount}
                prefix="derived"
                selectedField={selectedField}
                onFieldSelect={onFieldSelect}
                runValues={runValues}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Derived metrics are computed post-hoc and may be missing for some runs.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
