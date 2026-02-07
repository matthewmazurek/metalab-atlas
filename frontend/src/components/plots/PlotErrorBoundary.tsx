/**
 * PlotErrorBoundary - Catches rendering errors in chart components.
 * Displays a friendly error message instead of crashing the page.
 */

import { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlotErrorBoundaryProps {
  children: ReactNode;
  /** Optional callback when user clicks retry */
  onRetry?: () => void;
}

interface PlotErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PlotErrorBoundary extends Component<PlotErrorBoundaryProps, PlotErrorBoundaryState> {
  constructor(props: PlotErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): PlotErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging
    console.error('PlotErrorBoundary caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-96 text-center p-6">
          <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Failed to render chart</h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            An error occurred while rendering the chart. This might be due to invalid data or configuration.
          </p>
          {this.state.error && (
            <pre className="text-xs text-muted-foreground bg-muted p-2 rounded mb-4 max-w-md overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <Button variant="outline" onClick={this.handleRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
