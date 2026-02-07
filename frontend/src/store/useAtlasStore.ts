/**
 * Zustand store for UI state only.
 * All server state is managed by React Query.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FilterSpec, FieldFilter } from '@/api/types';
import type { AccentThemeId } from '@/lib/accent-themes';

export interface PlotConfig {
  chartType: 'scatter' | 'line' | 'bar' | 'histogram';
  xField: string;
  yField: string;
  groupBy: string | null;
  aggregation: 'none' | 'mean' | 'median' | 'min' | 'max' | 'count';
  errorBars: 'none' | 'std' | 'sem';
  binCount: number;
}

export interface TableSort {
  field: string;
  order: 'asc' | 'desc';
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
  selectionExperimentId: string | null;  // Preserved experiment context for explicit selection
  baselineRunId: string | null;

  // UI preferences
  pinnedColumns: string[];
  darkMode: boolean;
  accentTheme: AccentThemeId;
  sidebarCollapsed: boolean;
  visibleColumns: Record<string, string[]>; // experiment_id -> visible column IDs

  // Filter state - single source of truth for all filters
  filter: FilterSpec;

  // Table state
  tableSort: TableSort | null;

  // Plot builder state
  plotConfig: PlotConfig | null;

  // Run detail: remembered metric selection (persisted across runs)
  selectedMetricField: string;

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
  setAccentTheme: (themeId: AccentThemeId) => void;
  toggleSidebar: () => void;
  setVisibleColumns: (experimentId: string, columns: string[]) => void;
  getVisibleColumns: (experimentId: string) => string[] | undefined;
  setFilter: (filter: FilterSpec) => void;
  updateFilter: (partial: Partial<FilterSpec>) => void;
  setPlotConfig: (config: PlotConfig | null) => void;
  updatePlotConfig: (partial: Partial<PlotConfig>) => void;
  setTableSort: (sort: TableSort | null) => void;
  // Run detail: remembered metric selection
  setSelectedMetricField: (field: string) => void;
  // Field filter actions - work directly with filter.field_filters
  addFieldFilter: (fieldFilter: FieldFilter) => void;
  removeFieldFilter: (field: string) => void;
  clearFieldFilters: () => void;
  setFieldFilterValues: (field: string, values: string[]) => void;
  getFieldFilterValues: (field: string) => string[];
}

export const useAtlasStore = create<AtlasUIState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedRunIds: [],
      selectionFilter: null,
      selectionExperimentId: null,
      baselineRunId: null,
      pinnedColumns: ['record.status', 'record.duration_ms'],
      darkMode: false,
      accentTheme: 'bold-modern',
      sidebarCollapsed: false,
      visibleColumns: {},
      filter: {},
      tableSort: { field: 'record.started_at', order: 'desc' },
      plotConfig: null,
      selectedMetricField: '',

      // Actions
      // Setting explicit IDs clears any filter-based selection, preserves experiment context
      setSelectedRunIds: (ids) => set((state) => ({
        selectedRunIds: ids,
        selectionFilter: null,
        // Capture the current experiment context for later navigation
        selectionExperimentId: state.filter.experiment_id ?? state.selectionExperimentId ?? null,
      })),

      // Toggling a run switches to explicit selection mode
      toggleRunSelection: (id) =>
        set((state) => {
          // If we had a filter-based selection, switching to explicit mode starts fresh
          if (state.selectionFilter) {
            return {
              selectedRunIds: [id],
              selectionFilter: null,
              // Capture experiment context from filter-based selection
              selectionExperimentId: state.selectionFilter.filter.experiment_id ?? state.filter.experiment_id ?? null,
            };
          }
          return {
            selectedRunIds: state.selectedRunIds.includes(id)
              ? state.selectedRunIds.filter((x) => x !== id)
              : [...state.selectedRunIds, id],
            // Capture experiment context if not already set
            selectionExperimentId: state.selectionExperimentId ?? state.filter.experiment_id ?? null,
          };
        }),

      // Set filter-based selection (clears explicit IDs)
      setSelectionFilter: (filter, count) =>
        set({ selectionFilter: { filter, count }, selectedRunIds: [] }),

      clearSelection: () => set({ selectedRunIds: [], selectionFilter: null, selectionExperimentId: null, baselineRunId: null }),

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

      setAccentTheme: (themeId) => set({ accentTheme: themeId }),

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

      setSelectedMetricField: (field) => set({ selectedMetricField: field }),

      // Add a field filter (replaces any existing filter for the same field)
      addFieldFilter: (fieldFilter) =>
        set((state) => {
          const existing = state.filter.field_filters?.filter((f) => f.field !== fieldFilter.field) || [];
          return {
            filter: {
              ...state.filter,
              field_filters: [...existing, fieldFilter],
            },
          };
        }),

      // Remove a field filter by field name
      removeFieldFilter: (field) =>
        set((state) => {
          const existing = state.filter.field_filters?.filter((f) => f.field !== field) || [];
          return {
            filter: {
              ...state.filter,
              field_filters: existing.length > 0 ? existing : undefined,
            },
          };
        }),

      // Clear all field filters
      clearFieldFilters: () =>
        set((state) => ({
          filter: {
            ...state.filter,
            field_filters: undefined,
          },
        })),

      // Set multi-select values for a field (uses 'in' operator)
      setFieldFilterValues: (field, values) =>
        set((state) => {
          const existing = state.filter.field_filters?.filter((f) => f.field !== field) || [];
          if (values.length > 0) {
            return {
              filter: {
                ...state.filter,
                field_filters: [...existing, { field, op: 'in' as const, value: values }],
              },
            };
          }
          // If no values, remove the filter
          return {
            filter: {
              ...state.filter,
              field_filters: existing.length > 0 ? existing : undefined,
            },
          };
        }),

      // Get current filter values for a field (for multi-select UI)
      getFieldFilterValues: (field) => {
        const { filter } = get();
        const fieldFilter = filter.field_filters?.find((f) => f.field === field);
        if (fieldFilter && fieldFilter.op === 'in' && Array.isArray(fieldFilter.value)) {
          return fieldFilter.value as string[];
        }
        return [];
      },
    }),
    {
      name: 'atlas-ui-storage',
      partialize: (state) => ({
        // Selection state
        selectedRunIds: state.selectedRunIds,
        selectionExperimentId: state.selectionExperimentId,
        selectionFilter: state.selectionFilter,
        baselineRunId: state.baselineRunId,
        // UI preferences
        pinnedColumns: state.pinnedColumns,
        darkMode: state.darkMode,
        accentTheme: state.accentTheme,
        sidebarCollapsed: state.sidebarCollapsed,
        visibleColumns: state.visibleColumns,
        // Filter & table state
        filter: state.filter,
        tableSort: state.tableSort,
        // Plot configuration
        plotConfig: state.plotConfig,
        // Run detail metric selection
        selectedMetricField: state.selectedMetricField,
      }),
    }
  )
);
