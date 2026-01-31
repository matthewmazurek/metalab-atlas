import { Link } from 'react-router-dom';
import { CompareTable } from '@/components/runs/CompareTable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useAtlasStore } from '@/store/useAtlasStore';
import { X } from 'lucide-react';

export function ComparePage() {
  const { selectedRunIds, baselineRunId, setBaselineRunId } = useAtlasStore();

  if (selectedRunIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Compare Runs"
          backTo="/runs"
        />

        <Card>
          <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
            No runs selected for comparison. Go to the{' '}
            <Link to="/runs" className="text-primary hover:underline mx-1">
              Runs page
            </Link>{' '}
            and select runs to compare.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Compare Runs (${selectedRunIds.length})`}
        backTo="/runs"
        actions={
          baselineRunId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBaselineRunId(null)}
            >
              <X className="h-4 w-4 mr-2" />
              Clear baseline
            </Button>
          ) : undefined
        }
      />

      <CompareTable runIds={selectedRunIds} />
    </div>
  );
}
