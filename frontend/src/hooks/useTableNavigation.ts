import { useState, useCallback, useEffect, useRef } from 'react';

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable
  );
}

/** Returns true if any Radix dialog/popover overlay is open */
function isOverlayOpen(): boolean {
  return document.querySelector('[data-state="open"][role="dialog"]') !== null;
}

interface UseTableNavigationOptions {
  /** Total number of rows on the current page */
  rowCount: number;
  /** Called when Enter is pressed on the focused row */
  onOpen: (index: number) => void;
  /** Called when x/Space is pressed (e.g. toggle checkbox). Optional. */
  onSelect?: (index: number) => void;
  /** Current page index */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
}

export function useTableNavigation({
  rowCount,
  onOpen,
  onSelect,
  page,
  totalPages,
  onPageChange,
}: UseTableNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  // Reset focus when page changes or row count changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [page, rowCount]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInputFocused() || isOverlayOpen()) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = Math.min(prev + 1, rowCount - 1);
            return next;
          });
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            return next;
          });
          break;
        }
        case 'Enter': {
          if (focusedIndex >= 0 && focusedIndex < rowCount) {
            e.preventDefault();
            onOpen(focusedIndex);
          }
          break;
        }
        case 'x': {
          if (focusedIndex >= 0 && focusedIndex < rowCount && onSelect) {
            e.preventDefault();
            onSelect(focusedIndex);
          }
          break;
        }
        case '[': {
          if (page > 0) {
            e.preventDefault();
            onPageChange(page - 1);
          }
          break;
        }
        case ']': {
          if (page < totalPages - 1) {
            e.preventDefault();
            onPageChange(page + 1);
          }
          break;
        }
      }
    },
    [focusedIndex, rowCount, onOpen, onSelect, page, totalPages, onPageChange]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex >= 0 && tableBodyRef.current) {
      const rows = tableBodyRef.current.querySelectorAll('tr');
      rows[focusedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex]);

  return { focusedIndex, setFocusedIndex, tableBodyRef };
}
