/**
 * Zustand store for UI state only.
 * All server state is managed by React Query.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AggFn, ErrorBarType, FilterSpec } from '@/api/types';

export interface PlotConfig {
  x_field: string;
  y_field: string;
  group_by: string[];
  agg_fn: AggFn;
  error_bars: ErrorBarType;
  reduce_replicates: boolean;
}

interface AtlasUIState {
  // Selection state
  selectedRunIds: string[];
  baselineRunId: string | null;

  // UI preferences
  pinnedColumns: string[];
  darkMode: boolean;

  // Filter state (synced with URL)
  filter: FilterSpec;

  // Plot builder state
  plotConfig: PlotConfig | null;

  // Actions
  setSelectedRunIds: (ids: string[]) => void;
  toggleRunSelection: (id: string) => void;
  clearSelection: () => void;
  setBaselineRunId: (id: string | null) => void;
  setPinnedColumns: (columns: string[]) => void;
  toggleDarkMode: () => void;
  setFilter: (filter: FilterSpec) => void;
  updateFilter: (partial: Partial<FilterSpec>) => void;
  setPlotConfig: (config: PlotConfig | null) => void;
  updatePlotConfig: (partial: Partial<PlotConfig>) => void;
}

export const useAtlasStore = create<AtlasUIState>()(
  persist(
    (set) => ({
      // Initial state
      selectedRunIds: [],
      baselineRunId: null,
      pinnedColumns: ['record.status', 'record.duration_ms'],
      darkMode: false,
      filter: {},
      plotConfig: null,

      // Actions
      setSelectedRunIds: (ids) => set({ selectedRunIds: ids }),

      toggleRunSelection: (id) =>
        set((state) => ({
          selectedRunIds: state.selectedRunIds.includes(id)
            ? state.selectedRunIds.filter((x) => x !== id)
            : [...state.selectedRunIds, id],
        })),

      clearSelection: () => set({ selectedRunIds: [], baselineRunId: null }),

      setBaselineRunId: (id) => set({ baselineRunId: id }),

      setPinnedColumns: (columns) => set({ pinnedColumns: columns }),

      toggleDarkMode: () =>
        set((state) => ({ darkMode: !state.darkMode })),

      setFilter: (filter) => set({ filter }),

      updateFilter: (partial) =>
        set((state) => ({ filter: { ...state.filter, ...partial } })),

      setPlotConfig: (config) => set({ plotConfig: config }),

      updatePlotConfig: (partial) =>
        set((state) => ({
          plotConfig: state.plotConfig
            ? { ...state.plotConfig, ...partial }
            : null,
        })),
    }),
    {
      name: 'atlas-ui-storage',
      partialize: (state) => ({
        pinnedColumns: state.pinnedColumns,
        darkMode: state.darkMode,
      }),
    }
  )
);
