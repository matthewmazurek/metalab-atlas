/**
 * Zustand store for UI state only.
 * All server state is managed by React Query.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AggFn, ChartType, ErrorBarType, FilterSpec, FieldFilter } from '@/api/types';

export interface PlotConfig {
  x_field: string;
  y_field: string;
  group_by: string[];
  agg_fn: AggFn;
  error_bars: ErrorBarType;
  reduce_replicates: boolean;
  chart_type: ChartType;
  bin_count: number;
}

export interface TableSort {
  field: string;
  order: 'asc' | 'desc';
}

export interface ColumnFilter {
  columnId: string;
  field: string;
  value: string;           // For contains filter (text search)
  values?: string[];       // For multi-select filter (discrete values)
}

interface AtlasUIState {
  // Selection state
  selectedRunIds: string[];
  baselineRunId: string | null;

  // UI preferences
  pinnedColumns: string[];
  darkMode: boolean;
  sidebarCollapsed: boolean;
  visibleColumns: Record<string, string[]>; // experiment_id -> visible column IDs

  // Filter state (synced with URL)
  filter: FilterSpec;

  // Table state
  tableSort: TableSort | null;
  columnFilters: ColumnFilter[];

  // Plot builder state
  plotConfig: PlotConfig | null;

  // Actions
  setSelectedRunIds: (ids: string[]) => void;
  toggleRunSelection: (id: string) => void;
  clearSelection: () => void;
  setBaselineRunId: (id: string | null) => void;
  setPinnedColumns: (columns: string[]) => void;
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
  setVisibleColumns: (experimentId: string, columns: string[]) => void;
  getVisibleColumns: (experimentId: string) => string[] | undefined;
  setFilter: (filter: FilterSpec) => void;
  updateFilter: (partial: Partial<FilterSpec>) => void;
  setPlotConfig: (config: PlotConfig | null) => void;
  updatePlotConfig: (partial: Partial<PlotConfig>) => void;
  setTableSort: (sort: TableSort | null) => void;
  setColumnFilter: (columnId: string, field: string, value: string) => void;
  setColumnFilterValues: (columnId: string, field: string, values: string[]) => void;
  clearColumnFilter: (columnId: string) => void;
  clearAllColumnFilters: () => void;
  getFieldFilters: () => FieldFilter[];
  getColumnFilterValues: (columnId: string) => string[];
}

export const useAtlasStore = create<AtlasUIState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedRunIds: [],
      baselineRunId: null,
      pinnedColumns: ['record.status', 'record.duration_ms'],
      darkMode: false,
      sidebarCollapsed: false,
      visibleColumns: {},
      filter: {},
      tableSort: { field: 'record.started_at', order: 'desc' },
      columnFilters: [],
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

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setVisibleColumns: (experimentId, columns) =>
        set((state) => ({
          visibleColumns: { ...state.visibleColumns, [experimentId]: columns },
        })),

      getVisibleColumns: (experimentId) => {
        return get().visibleColumns[experimentId];
      },

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

      setTableSort: (sort) => set({ tableSort: sort }),

      setColumnFilter: (columnId, field, value) =>
        set((state) => {
          const existing = state.columnFilters.filter((f) => f.columnId !== columnId);
          if (value) {
            return { columnFilters: [...existing, { columnId, field, value }] };
          }
          return { columnFilters: existing };
        }),

      setColumnFilterValues: (columnId, field, values) =>
        set((state) => {
          const existing = state.columnFilters.filter((f) => f.columnId !== columnId);
          if (values.length > 0) {
            return { columnFilters: [...existing, { columnId, field, value: '', values }] };
          }
          return { columnFilters: existing };
        }),

      clearColumnFilter: (columnId) =>
        set((state) => ({
          columnFilters: state.columnFilters.filter((f) => f.columnId !== columnId),
        })),

      clearAllColumnFilters: () => set({ columnFilters: [] }),

      getFieldFilters: () => {
        const { columnFilters } = get();
        return columnFilters
          .filter((cf) => cf.value || (cf.values && cf.values.length > 0))
          .map((cf) => {
            // Use 'in' operator for multi-select values, 'contains' for text search
            if (cf.values && cf.values.length > 0) {
              return {
                field: cf.field,
                op: 'in' as const,
                value: cf.values,
              };
            }
            return {
              field: cf.field,
              op: 'contains' as const,
              value: cf.value,
            };
          });
      },

      getColumnFilterValues: (columnId) => {
        const { columnFilters } = get();
        const filter = columnFilters.find((f) => f.columnId === columnId);
        return filter?.values || [];
      },
    }),
    {
      name: 'atlas-ui-storage',
      partialize: (state) => ({
        selectedRunIds: state.selectedRunIds,
        pinnedColumns: state.pinnedColumns,
        darkMode: state.darkMode,
        sidebarCollapsed: state.sidebarCollapsed,
        visibleColumns: state.visibleColumns,
      }),
    }
  )
);
