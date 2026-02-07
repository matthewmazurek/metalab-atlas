import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
const modKey = isMac ? '⌘' : 'Ctrl';

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['g', 'e'], description: 'Go to Experiments' },
      { keys: ['g', 'r'], description: 'Go to Runs' },
      { keys: ['g', 'p'], description: 'Go to Plots' },
      { keys: ['g', 'c'], description: 'Go to Compare' },
      { keys: [`${modKey}`, 'K'], description: 'Search' },
    ],
  },
  {
    title: 'Tables',
    shortcuts: [
      { keys: ['j', '↓'], description: 'Next row' },
      { keys: ['k', '↑'], description: 'Previous row' },
      { keys: ['Enter'], description: 'Open row' },
      { keys: ['x'], description: 'Toggle selection' },
      { keys: ['['], description: 'Previous page' },
      { keys: [']'], description: 'Next page' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show this help' },
    ],
  },
];

interface ShortcutHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutHelpModal({ open, onOpenChange }: ShortcutHelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate Atlas quickly with keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-xs text-muted-foreground">/</span>
                          )}
                          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[11px] font-medium text-muted-foreground">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
