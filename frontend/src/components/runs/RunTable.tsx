import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRuns } from '@/api/hooks';
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
import { useAtlasStore } from '@/store/useAtlasStore';
import type { RunResponse } from '@/api/types';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const PAGE_SIZE = 25;

export function RunTable() {
  const [page, setPage] = useState(0);
  const { filter, selectedRunIds, toggleRunSelection } = useAtlasStore();

  const { data, isLoading, isError } = useRuns({
    filter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort_by: 'record.started_at',
    sort_order: 'desc',
  });

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

  const runs = data?.runs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-32">Run ID</TableHead>
              <TableHead>Experiment</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="w-24">Duration</TableHead>
              <TableHead>Key Metrics</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No runs found
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run: RunResponse) => (
                <TableRow key={run.record.run_id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedRunIds.includes(run.record.run_id)}
                      onCheckedChange={() => toggleRunSelection(run.record.run_id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <Link
                      to={`/runs/${run.record.run_id}`}
                      className="text-primary hover:underline"
                    >
                      {run.record.run_id.slice(0, 8)}...
                    </Link>
                  </TableCell>
                  <TableCell>{run.record.experiment_id}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.record.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(run.record.started_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDuration(run.record.duration_ms)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(run.metrics).slice(0, 3).map(([key, value]) => (
                        <span
                          key={key}
                          className="px-2 py-0.5 bg-muted rounded text-xs"
                        >
                          {key}: {typeof value === 'number' ? value.toFixed(4) : String(value)}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total} runs
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
