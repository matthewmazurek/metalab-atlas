import { useSearchParams, Link } from 'react-router-dom';
import { CompareTable } from '@/components/runs/CompareTable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/ui/typography';
import { useAtlasStore } from '@/store/useAtlasStore';
import { ArrowLeft, X } from 'lucide-react';

export function ComparePage() {
  const [searchParams] = useSearchParams();
  const runIdsParam = searchParams.get('runs') || '';
  const runIds = runIdsParam ? runIdsParam.split(',').filter(Boolean) : [];
  const { selectedRunIds, baselineRunId, setBaselineRunId } = useAtlasStore();

  // Use URL params if provided, otherwise use selected runs from store
  const compareIds = runIds.length > 0 ? runIds : selectedRunIds;

  if (compareIds.length === 0) {
    return (
      <div className="space-y-4">
        {/* Header - fixed height for consistency */}
        <div className="flex items-center gap-4 h-10">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <PageTitle>Compare Runs</PageTitle>
        </div>

        <Card>
          <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
            No runs selected for comparison. Go to the{' '}
            <Link to="/" className="text-primary hover:underline mx-1">
              Runs page
            </Link>{' '}
            and select runs to compare.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header - fixed height for consistency */}
      <div className="flex items-center justify-between h-10">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <PageTitle>Compare Runs ({compareIds.length})</PageTitle>
        </div>
        {baselineRunId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBaselineRunId(null)}
          >
            <X className="h-4 w-4 mr-2" />
            Clear baseline
          </Button>
        )}
      </div>

      {/* Comparison table */}
      <CompareTable runIds={compareIds} />
    </div>
  );
}
