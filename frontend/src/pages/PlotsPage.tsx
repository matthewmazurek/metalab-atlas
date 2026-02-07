/**
 * PlotsPage - Main page for creating plots from selected runs.
 */

import { useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Pencil, BarChart3 } from 'lucide-react';
import { useAtlasStore } from '@/store/useAtlasStore';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { PlotBuilder } from '@/components/plots/PlotBuilder';

export function PlotsPage() {
  const [searchParams] = useSearchParams();

  // Store state
  const filter = useAtlasStore((s) => s.filter);
  const updateFilter = useAtlasStore((s) => s.updateFilter);
  const selectedRunIds = useAtlasStore((s) => s.selectedRunIds);
  const selectionFilter = useAtlasStore((s) => s.selectionFilter);
  const selectionExperimentId = useAtlasStore((s) => s.selectionExperimentId);
  const hasSelection = useAtlasStore((s) => s.hasSelection);
  const getSelectionSummary = useAtlasStore((s) => s.getSelectionSummary);

  const hasActiveSelection = hasSelection();
  const selectionSummary = getSelectionSummary();

  // Initialize filter from URL params on mount
  useEffect(() => {
    const experimentId = searchParams.get('experiment_id');
    if (experimentId && experimentId !== filter.experiment_id) {
      updateFilter({ experiment_id: experimentId });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the "Edit selection" link URL
  const editSelectionUrl = useMemo(() => {
    const experimentId =
      selectionFilter?.filter.experiment_id ??
      selectionExperimentId ??
      filter.experiment_id;

    if (experimentId) {
      return `/runs?experiment_id=${encodeURIComponent(experimentId)}`;
    }
    return '/runs';
  }, [selectionFilter, selectionExperimentId, filter.experiment_id]);

  // Context row: selection summary
  const contextRow = hasActiveSelection ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        Plotting{' '}
        <span className="font-medium text-foreground">
          {selectionSummary.count.toLocaleString()}
        </span>{' '}
        run{selectionSummary.count !== 1 ? 's' : ''}
        {selectionSummary.type === 'filter' && ' (all matching filter)'}
      </span>
    </div>
  ) : null;

  // Actions row: Edit selection button
  const actionsRow = hasActiveSelection ? (
    <Link to={editSelectionUrl}>
      <Button variant="outline" size="sm">
        <Pencil className="h-3 w-3 mr-2" />
        Edit selection
      </Button>
    </Link>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Plots" context={contextRow} actions={actionsRow} />

      {/* Selection required message */}
      {!hasActiveSelection ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No runs selected</h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            Select runs from the Runs page to create plots. You can filter by any
            field and use "Select All" to include all matching runs.
          </p>
          <Link
            to={
              filter.experiment_id
                ? `/runs?experiment_id=${encodeURIComponent(filter.experiment_id)}`
                : '/runs'
            }
          >
            <Button>Go to Runs</Button>
          </Link>
        </div>
      ) : (
        <PlotBuilder
          runIds={selectionSummary.type === 'explicit' ? selectedRunIds : undefined}
          selectionFilter={
            selectionSummary.type === 'filter' ? selectionFilter?.filter : undefined
          }
        />
      )}
    </div>
  );
}
