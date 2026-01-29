import { cn } from '@/lib/utils';
import { AlertCircle, RefreshCw, ServerOff, WifiOff } from 'lucide-react';
import { Button } from './button';

interface ConnectionErrorProps {
  /** The type of error to display */
  variant?: 'connection' | 'not-found' | 'generic';
  /** Custom title (overrides default based on variant) */
  title?: string;
  /** Custom description (overrides default based on variant) */
  description?: string;
  /** Additional context to display (e.g., "runId: abc123") */
  context?: string;
  /** Callback for retry button. If not provided, retry button is hidden */
  onRetry?: () => void;
  /** Whether the retry is currently in progress */
  retrying?: boolean;
  /** Size variant - 'full' fills container, 'compact' is smaller inline version */
  size?: 'full' | 'compact';
  /** Additional CSS classes */
  className?: string;
}

const variantDefaults = {
  connection: {
    icon: ServerOff,
    title: 'Unable to connect to server',
    description: 'Make sure the Atlas backend server is running.',
  },
  'not-found': {
    icon: AlertCircle,
    title: 'Not found',
    description: 'The requested resource could not be found.',
  },
  generic: {
    icon: WifiOff,
    title: 'Failed to load data',
    description: 'Something went wrong. Please try again.',
  },
};

/**
 * Consistent error display component for connection/loading failures.
 *
 * Use this when:
 * - Backend server is not running
 * - API request fails
 * - Resource is not found
 *
 * @example
 * // Connection error with retry
 * <ConnectionError variant="connection" onRetry={() => refetch()} />
 *
 * @example
 * // Not found error with context
 * <ConnectionError variant="not-found" context={`Run ID: ${runId}`} />
 *
 * @example
 * // Compact inline version
 * <ConnectionError variant="generic" size="compact" />
 */
export function ConnectionError({
  variant = 'connection',
  title,
  description,
  context,
  onRetry,
  retrying = false,
  size = 'full',
  className,
}: ConnectionErrorProps) {
  const defaults = variantDefaults[variant];
  const Icon = defaults.icon;
  const displayTitle = title ?? defaults.title;
  const displayDescription = description ?? defaults.description;

  if (size === 'compact') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20',
          className
        )}
      >
        <Icon className="h-5 w-5 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">{displayTitle}</p>
          <p className="text-xs text-muted-foreground">{displayDescription}</p>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            className="shrink-0"
          >
            <RefreshCw className={cn('h-4 w-4', retrying && 'animate-spin')} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        className
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3 mb-4">
        <Icon className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{displayTitle}</h3>
      <p className="text-sm text-muted-foreground mb-2 max-w-md">
        {displayDescription}
      </p>
      {context && (
        <p className="text-xs font-mono text-muted-foreground mb-4">{context}</p>
      )}
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
          className="mt-2"
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', retrying && 'animate-spin')} />
          {retrying ? 'Retrying...' : 'Retry'}
        </Button>
      )}
    </div>
  );
}

/**
 * Helper to detect if an error is likely a connection/network error.
 * Use this to decide whether to show ConnectionError vs a more specific error.
 */
export function isConnectionError(error: unknown): boolean {
  if (!error) return false;

  // Axios network errors
  if (typeof error === 'object' && error !== null) {
    const axiosError = error as { code?: string; message?: string; response?: unknown };

    // No response means network/connection failure
    if (axiosError.code === 'ERR_NETWORK' || axiosError.code === 'ECONNREFUSED') {
      return true;
    }

    // Check for common network error messages
    if (axiosError.message) {
      const msg = axiosError.message.toLowerCase();
      if (
        msg.includes('network error') ||
        msg.includes('failed to fetch') ||
        msg.includes('econnrefused') ||
        msg.includes('connection refused')
      ) {
        return true;
      }
    }

    // If there's a response, it's not a connection error (might be 404, 500, etc.)
    if (axiosError.response) {
      return false;
    }
  }

  return false;
}
