import { useExperiments, useFields, useLatestManifest, useRuns } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PanelTitle, SectionLabel } from '@/components/ui/typography';
import { useAtlasStore } from '@/store/useAtlasStore';
import type { FieldInfo } from '@/api/types';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock } from 'lucide-react';

/**
 * Format a date string as relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${Math.round(diffHours)}h ago`;
  if (diffHours < 168) return `${Math.round(diffHours / 24)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/**
 * Format duration in ms to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Component to display field type
 */
function FieldTypeDisplay({ info }: { info: FieldInfo }) {
  return (
    <span className="font-mono text-muted-foreground text-[10px] uppercase">
      {info.type}
    </span>
  );
}


/**
 * Hook to get status counts for an experiment.
 * Returns 0 counts when no experiment is selected.
 */
function useStatusCounts(experimentId: string | null) {
  // Query for success count
  const { data: successData } = useRuns({
    filter: {
      experiment_id: experimentId ?? undefined,
      status: ['success'],
    },
    limit: 1,
  });

  // Query for failed count
  const { data: failedData } = useRuns({
    filter: {
      experiment_id: experimentId ?? undefined,
      status: ['failed'],
    },
    limit: 1,
  });

  // Query for running count
  const { data: runningData } = useRuns({
    filter: {
      experiment_id: experimentId ?? undefined,
      status: ['running'],
    },
    limit: 1,
  });

  // Only return counts when an experiment is selected
  if (!experimentId) {
    return { successCount: 0, failedCount: 0, runningCount: 0 };
  }

  return {
    successCount: successData?.total ?? 0,
    failedCount: failedData?.total ?? 0,
    runningCount: runningData?.total ?? 0,
  };
}

export function FilterPanel() {
  const { filter, updateFilter, sidebarCollapsed, toggleSidebar } = useAtlasStore();
  const { data: experimentsData } = useExperiments();
  const { data: fieldsData } = useFields(filter.experiment_id ?? undefined);
  const { data: manifest } = useLatestManifest(filter.experiment_id ?? '');

  const selectedExperiment = experimentsData?.experiments.find(
    (e) => e.experiment_id === filter.experiment_id
  );

  const totalRuns = experimentsData?.experiments.reduce((sum, e) => sum + e.run_count, 0) ?? 0;

  // Get status counts for the selected experiment
  const { successCount, failedCount, runningCount } = useStatusCounts(filter.experiment_id ?? null);

  // Total expected from manifest
  const expectedTotal = manifest?.total_runs;

  // Extract duration info
  const durationField = fieldsData?.record_fields?.duration_ms;

  // If collapsed, show just the expand button
  if (sidebarCollapsed) {
    return (
      <div className="flex flex-col items-center py-4 border rounded-lg bg-card">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="h-8 w-8 p-0"
          title="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const paramsEntries = Object.entries(fieldsData?.params_fields || {});
  const metricsEntries = Object.entries(fieldsData?.metrics_fields || {});

  return (
    <div className="border rounded-lg bg-card flex flex-col max-h-[calc(100vh-10rem)]">
      {/* Header - h-10 matches table header height */}
      <div className="flex items-center justify-between h-10 px-3 border-b shrink-0">
        <PanelTitle>Experiment</PanelTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="h-6 w-6 p-0"
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Experiment dropdown selector */}
          <Select
            value={filter.experiment_id || 'all'}
            onValueChange={(value) =>
              updateFilter({ experiment_id: value === 'all' ? null : value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All experiments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All experiments ({totalRuns})</SelectItem>
              {experimentsData?.experiments.map((exp) => (
                <SelectItem key={exp.experiment_id} value={exp.experiment_id}>
                  {exp.experiment_id} ({exp.run_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Metadata section - only show when experiment is selected */}
          {selectedExperiment && fieldsData && (
            <>
              {/* Overview stats */}
              <div className="space-y-2">
                <SectionLabel>Overview</SectionLabel>

                {/* Run counts: "17 runs ✓ / 72 total" */}
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-medium">{successCount} runs</span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  {expectedTotal != null && (
                    <>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-muted-foreground">
                        {expectedTotal} total
                      </span>
                    </>
                  )}
                </div>

                {/* Active runs or Latest run */}
                <div className="flex justify-between text-xs text-muted-foreground">
                  {runningCount > 0 ? (
                    <>
                      <span>Active runs</span>
                      <span>{runningCount}</span>
                    </>
                  ) : (
                    <>
                      <span>Latest run</span>
                      <span>{formatRelativeTime(selectedExperiment.latest_run)}</span>
                    </>
                  )}
                </div>

                {/* Duration info */}
                {durationField && durationField.min_value != null && durationField.max_value != null && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Duration
                    </span>
                    <span className="font-mono">
                      {durationField.min_value === durationField.max_value
                        ? formatDuration(durationField.min_value)
                        : `${formatDuration(durationField.min_value)}–${formatDuration(durationField.max_value)}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Params section */}
              {paramsEntries.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <SectionLabel>Parameters ({paramsEntries.length})</SectionLabel>
                    <div className="space-y-1">
                      {paramsEntries.map(([name, info]) => (
                        <div key={name} className="flex justify-between items-center gap-2 text-xs min-w-0">
                          <span className="text-muted-foreground truncate" title={name}>
                            {name}
                          </span>
                          <FieldTypeDisplay info={info} />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Metrics section */}
              {metricsEntries.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <SectionLabel>Metrics ({metricsEntries.length})</SectionLabel>
                    <div className="space-y-1">
                      {metricsEntries.map(([name, info]) => (
                        <div key={name} className="flex justify-between items-center gap-2 text-xs min-w-0">
                          <span className="text-muted-foreground truncate" title={name}>
                            {name}
                          </span>
                          <FieldTypeDisplay info={info} />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
