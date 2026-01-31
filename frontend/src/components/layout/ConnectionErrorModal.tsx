import { useExperiments } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isConnectionError } from '@/components/ui/connection-error.utils';
import { RefreshCw, ServerOff } from 'lucide-react';
import { useState } from 'react';

/**
 * Global connection error modal that appears when the backend server is unreachable.
 * Uses the experiments endpoint as a health check since it's called on every page.
 */
export function ConnectionErrorModal() {
  const { isError, error, refetch, isFetching } = useExperiments();
  const [isRetrying, setIsRetrying] = useState(false);

  // Only show modal for connection errors (server down), not for other API errors
  const showModal = isError && isConnectionError(error);

  const handleRetry = async () => {
    setIsRetrying(true);
    await refetch();
    setIsRetrying(false);
  };

  const isLoading = isFetching || isRetrying;

  return (
    <Dialog open={showModal}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-2">
            <ServerOff className="h-10 w-10 text-destructive" />
          </div>
          <DialogTitle className="text-xl">Unable to connect to server</DialogTitle>
          <DialogDescription className="text-center">
            The Atlas backend server is not responding. Please make sure the server is running and try again.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">To start the server:</p>
          <code className="block bg-background rounded px-2 py-1 font-mono text-xs">
            metalab-atlas serve --store ./path/to/store
          </code>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button onClick={handleRetry} disabled={isLoading} className="min-w-32">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Connecting...' : 'Retry Connection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
