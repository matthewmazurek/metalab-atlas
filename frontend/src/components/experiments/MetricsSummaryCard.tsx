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
  if (ratio >= 0.95) return 'text-green-600 dark:text-green-400';
  if (ratio >= 0.7) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
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
}: {
  fields: Record<string, FieldInfo>;
  runCount: number;
  prefix: 'metrics' | 'derived';
  selectedField?: string;
  onFieldSelect?: (field: string) => void;
}) {
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No fields found
      </div>
    );
  }

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[44%]">Name</TableHead>
          <TableHead className="w-[18%] text-right">Coverage</TableHead>
          <TableHead className="w-[26%] text-right">Range</TableHead>
          <TableHead className="w-[12%] text-right">Type</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([name, info]) => {
          const fullFieldName = `${prefix}.${name}`;
          const isSelected = selectedField === fullFieldName;
          const isClickable = info.type === 'numeric' && onFieldSelect;

          return (
            <TableRow
              key={name}
              className={cn(
                isClickable && 'cursor-pointer',
                isSelected && 'bg-primary/10'
              )}
              onClick={isClickable ? () => onFieldSelect(fullFieldName) : undefined}
            >
              <TableCell className="font-mono text-sm truncate">
                <span className={cn(isSelected && 'font-semibold text-primary')}>
                  {name}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className={getCoverageColor(info.count, runCount)}>
                  {info.count}
                </span>
                <span className="text-muted-foreground">/{runCount}</span>
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {info.type === 'numeric' &&
                  info.min_value !== null &&
                  info.max_value !== null ? (
                  <>
                    {formatNumber(info.min_value)}
                    <span className="text-muted-foreground mx-1">→</span>
                    {formatNumber(info.max_value)}
                  </>
                ) : info.type === 'string' && info.values ? (
                  <span className="text-muted-foreground">
                    {info.values.length} values
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary" className="text-xs">
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
            {runCount} runs
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics (Outputs) Section */}
        {hasMetrics && (
          <div>
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" />
              Metrics (Outputs)
            </div>
            <div className="max-h-64 overflow-y-auto">
              <FieldTable
                fields={metricsFields}
                runCount={runCount}
                prefix="metrics"
                selectedField={selectedField}
                onFieldSelect={onFieldSelect}
              />
            </div>
          </div>
        )}

        {/* Derived Metrics Section */}
        {hasDerived && (
          <div className={hasMetrics ? 'border-t pt-4' : ''}>
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
              <Calculator className="h-3 w-3" />
              Derived Metrics
            </div>
            <div className="max-h-48 overflow-y-auto">
              <FieldTable
                fields={derivedFields}
                runCount={runCount}
                prefix="derived"
                selectedField={selectedField}
                onFieldSelect={onFieldSelect}
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
