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
  chart_type: ChartType;
  bin_count: number;
  agg_fn: AggFn;
  error_bars: ErrorBarType;
  aggregate_replicates: boolean;
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

/**
 * Selection can be either:
 * - 'explicit': User manually selected specific runs (stores IDs)
 * - 'filter': User clicked "Select All" (stores the filter spec + count)
 * 
 * Filter-based selection is much more efficient for large result sets
 * (no need to fetch/store 300k+ IDs).
 */
export type RunSelection =
  | { type: 'explicit'; runIds: string[] }
  | { type: 'filter'; filter: FilterSpec; count: number };

interface AtlasUIState {
  // Selection state - now supports both explicit IDs and filter-based selection
  selectedRunIds: string[];  // Legacy: kept for explicit selection
  selectionFilter: { filter: FilterSpec; count: number } | null;  // For "Select All"
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
  setSelectionFilter: (filter: FilterSpec, count: number) => void;
  clearSelection: () => void;
  hasSelection: () => boolean;
  getSelectionSummary: () => { type: 'explicit' | 'filter' | 'none'; count: number };
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
      selectionFilter: null,
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
      // Setting explicit IDs clears any filter-based selection
      setSelectedRunIds: (ids) => set({ selectedRunIds: ids, selectionFilter: null }),

      // Toggling a run switches to explicit selection mode
      toggleRunSelection: (id) =>
        set((state) => {
          // If we had a filter-based selection, switching to explicit mode starts fresh
          if (state.selectionFilter) {
            return { selectedRunIds: [id], selectionFilter: null };
          }
          return {
            selectedRunIds: state.selectedRunIds.includes(id)
              ? state.selectedRunIds.filter((x) => x !== id)
              : [...state.selectedRunIds, id],
          };
        }),

      // Set filter-based selection (clears explicit IDs)
      setSelectionFilter: (filter, count) =>
        set({ selectionFilter: { filter, count }, selectedRunIds: [] }),

      clearSelection: () => set({ selectedRunIds: [], selectionFilter: null, baselineRunId: null }),

      hasSelection: () => {
        const state = get();
        return state.selectedRunIds.length > 0 || state.selectionFilter !== null;
      },

      getSelectionSummary: () => {
        const state = get();
        if (state.selectionFilter) {
          return { type: 'filter' as const, count: state.selectionFilter.count };
        }
        if (state.selectedRunIds.length > 0) {
          return { type: 'explicit' as const, count: state.selectedRunIds.length };
        }
        return { type: 'none' as const, count: 0 };
      },

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
