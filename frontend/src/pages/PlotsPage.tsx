import { useEffect, useMemo } from 'react';
import { PlotBuilder } from '@/components/plots/PlotBuilder';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { useAtlasStore } from '@/store/useAtlasStore';
import { useExperiments, useLatestManifest } from '@/api/hooks';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

export function PlotsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { filter, updateFilter } = useAtlasStore();

  // Get selected run IDs from URL params
  const selectedRunIds = useMemo(() => {
    const runsParam = searchParams.get('runs');
    if (!runsParam) return [];
    return runsParam.split(',').filter(Boolean);
  }, [searchParams]);

  const hasRunFilter = selectedRunIds.length > 0;

  // Clear run filter and show all runs
  const handleClearRunFilter = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('runs');
    setSearchParams(newParams);
  };

  // Fetch experiments for the dropdown
  const { data: experimentsData } = useExperiments();
  const { data: manifest } = useLatestManifest(filter.experiment_id ?? '');

  // Initialize filter from URL params on mount
  useEffect(() => {
    const experimentId = searchParams.get('experiment_id');
    if (experimentId && experimentId !== filter.experiment_id) {
      updateFilter({ experiment_id: experimentId });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get display name for current experiment
  const currentExperimentName = manifest?.name || filter.experiment_id || 'All experiments';

  // Build experiment dropdown items
  const experimentDropdownItems = [
    { label: 'All experiments', value: '_all', href: '/plots' },
    ...(experimentsData?.experiments || []).map((exp) => ({
      label: exp.experiment_id,
      value: exp.experiment_id,
      href: `/plots?experiment_id=${encodeURIComponent(exp.experiment_id)}`,
    })),
  ];

  // Handle experiment selection from dropdown
  const handleExperimentSelect = (value: string) => {
    if (value === '_all') {
      updateFilter({ experiment_id: null });
      navigate('/plots');
    } else {
      updateFilter({ experiment_id: value });
      navigate(`/plots?experiment_id=${encodeURIComponent(value)}`);
    }
  };

  // Build breadcrumb items
  const breadcrumbItems = filter.experiment_id
    ? [
      { label: 'Experiments', href: '/experiments' },
      {
        label: currentExperimentName,
        href: `/experiments/${encodeURIComponent(filter.experiment_id)}`,
        dropdown: {
          items: experimentDropdownItems,
          selectedValue: filter.experiment_id,
          onSelect: handleExperimentSelect,
        },
      },
      { label: 'Plots' },
    ]
    : [
      { label: 'Experiments', href: '/experiments' },
      {
        label: 'All experiments',
        dropdown: {
          items: experimentDropdownItems,
          selectedValue: '_all',
          onSelect: handleExperimentSelect,
        },
      },
      { label: 'Plots' },
    ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plots"
        breadcrumb={breadcrumbItems}
        backTo={filter.experiment_id ? `/experiments/${encodeURIComponent(filter.experiment_id)}` : undefined}
      />

      {/* Run filter indicator */}
      {hasRunFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Filtered to <span className="font-medium text-foreground">{selectedRunIds.length}</span> selected run{selectedRunIds.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={handleClearRunFilter}
          >
            <X className="h-3 w-3 mr-1" />
            Show all
          </Button>
        </div>
      )}

      <PlotBuilder runIds={hasRunFilter ? selectedRunIds : undefined} />
    </div>
  );
}
