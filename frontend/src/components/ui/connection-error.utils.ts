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

