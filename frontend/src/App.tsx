import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { ExperimentsListPage } from '@/pages/ExperimentsListPage';
import { ExperimentDetailPage } from '@/pages/ExperimentDetailPage';
import { RunsPage } from '@/pages/RunsPage';
import { RunDetailPage } from '@/pages/RunDetailPage';
import { PlotsPage } from '@/pages/PlotsPage';
import { ComparePage } from '@/pages/ComparePage';
import { refreshStores } from '@/api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      retry: 1,
    },
  },
});

function App() {
  // Refresh store discovery on page load to pick up new experiments
  useEffect(() => {
    refreshStores().catch(() => {
      // Silently ignore errors - stores will use cached data
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/experiments" replace />} />
            <Route path="/experiments" element={<ExperimentsListPage />} />
            <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/runs/:runId" element={<RunDetailPage />} />
            <Route path="/plots" element={<PlotsPage />} />
            <Route path="/compare" element={<ComparePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
