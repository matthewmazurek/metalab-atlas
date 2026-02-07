import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-expect-error - tinykeys types not resolved via package.json exports
import { tinykeys } from 'tinykeys';

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

interface UseGlobalShortcutsOptions {
  onToggleSearch: () => void;
  onShowHelp: () => void;
}

export function useGlobalShortcuts({
  onToggleSearch,
  onShowHelp,
}: UseGlobalShortcutsOptions) {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = tinykeys(window, {
      // Search (Cmd+K / Ctrl+K)
      '$mod+KeyK': (e: KeyboardEvent) => {
        e.preventDefault();
        onToggleSearch();
      },

      // Page navigation: g then letter
      'g e': (e: KeyboardEvent) => {
        if (isInputFocused()) return;
        e.preventDefault();
        navigate('/experiments');
      },
      'g r': (e: KeyboardEvent) => {
        if (isInputFocused()) return;
        e.preventDefault();
        navigate('/runs');
      },
      'g p': (e: KeyboardEvent) => {
        if (isInputFocused()) return;
        e.preventDefault();
        navigate('/plots');
      },
      'g c': (e: KeyboardEvent) => {
        if (isInputFocused()) return;
        e.preventDefault();
        navigate('/compare');
      },

      // Show shortcut help
      'Shift+?': (e: KeyboardEvent) => {
        if (isInputFocused()) return;
        e.preventDefault();
        onShowHelp();
      },
    });

    return unsubscribe;
  }, [navigate, onToggleSearch, onShowHelp]);
}
