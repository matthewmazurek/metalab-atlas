/**
 * Hook to resolve the effective filter from selection state.
 * Consolidates filter resolution logic in one place.
 */

import { useMemo } from 'react';
import type { FilterSpec } from '@/api/types';

/**
 * Resolves the effective filter to use for API queries based on selection state.
 * 
 * Priority:
 * 1. If selectionFilter is provided (from "Select All"), use it directly
 * 2. If explicit runIds are provided, create a run_id IN filter
 * 3. Fall back to empty filter (should not happen in practice)
 * 
 * @param runIds - Optional array of explicitly selected run IDs
 * @param selectionFilter - Optional filter from "Select All" operation
 * @returns FilterSpec to use for API queries
 */
export function useEffectiveFilter(
  runIds?: string[],
  selectionFilter?: FilterSpec
): FilterSpec {
  return useMemo(() => {
    // Filter-based selection is most efficient (no ID list)
    if (selectionFilter) {
      return selectionFilter;
    }

    // Explicit run IDs - create an IN filter
    // Note: Don't include experiment_id here - run IDs are globally unique
    // and users may select runs from multiple experiments
    if (runIds && runIds.length > 0) {
      return {
        field_filters: [
          {
            field: 'record.run_id',
            op: 'in',
            value: runIds,
          },
        ],
      };
    }

    // No selection - return empty filter
    return {};
  }, [runIds, selectionFilter]);
}
