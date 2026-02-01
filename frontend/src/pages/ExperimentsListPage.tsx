import { ExperimentTable } from '@/components/experiments/ExperimentTable';
import { PageHeader } from '@/components/ui/page-header';

export function ExperimentsListPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Experiments" />
      <ExperimentTable />
    </div>
  );
}
