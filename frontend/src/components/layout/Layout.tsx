import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Beaker, GitCompare, Keyboard, LayoutList, Search, Settings, Moon, Sun } from 'lucide-react';
import { useAtlasStore } from '@/store/useAtlasStore';
import { applyAccentTheme } from '@/lib/accent-themes';
import { ACCENT_THEMES } from '@/lib/accent-themes';
import { ConnectionErrorModal } from './ConnectionErrorModal';
import { SearchModal } from '@/components/search/SearchModal';
import { ShortcutHelpModal } from './ShortcutHelpModal';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/experiments', label: 'Experiments', icon: Beaker },
  { path: '/runs', label: 'Runs', icon: LayoutList },
  { path: '/plots', label: 'Plots', icon: BarChart3 },
  { path: '/compare', label: 'Compare', icon: GitCompare },
];

export function Layout() {
  const location = useLocation();
  const { darkMode, accentTheme, setAccentTheme, toggleDarkMode } = useAtlasStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const handleToggleSearch = useCallback(() => setSearchOpen((o) => !o), []);
  const handleShowHelp = useCallback(() => setShortcutHelpOpen(true), []);

  useGlobalShortcuts({
    onToggleSearch: handleToggleSearch,
    onShowHelp: handleShowHelp,
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    applyAccentTheme(accentTheme, darkMode);
  }, [accentTheme, darkMode]);

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      {/* Top bar only - no sidebar */}
      <header className="relative z-10 flex h-14 shrink-0 items-center border-b border-border bg-card/95 backdrop-blur-sm px-6 transition-colors duration-200">
        <Link
          to="/"
          className="flex items-center gap-2 font-sans text-base font-bold tracking-tight text-foreground transition-opacity duration-200 hover:opacity-80"
        >
          <BarChart3 className="h-5 w-5" />
          <span>metalab ATLAS</span>
        </Link>
        <nav className="ml-10 flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 font-sans text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-brand text-brand-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 rounded-md p-2 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
            <kbd className="pointer-events-none hidden h-5 select-none items-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
              ⌘K
            </kbd>
          </button>
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Accent theme
              </p>
              <div className="flex flex-col gap-0.5">
                {ACCENT_THEMES.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setAccentTheme(preset.id);
                      setSettingsOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      accentTheme === preset.id
                        ? 'bg-brand/10 text-brand'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <span className="flex shrink-0 gap-0.5" aria-hidden>
                      <span
                        className="h-4 w-3 rounded-sm border border-border"
                        style={{ backgroundColor: preset.brand }}
                      />
                      <span
                        className="h-4 w-3 rounded-sm border border-border"
                        style={{ backgroundColor: preset.brandSecondary }}
                      />
                      <span
                        className="h-4 w-3 rounded-sm border border-border"
                        style={{ backgroundColor: preset.brandTertiary }}
                      />
                    </span>
                    {preset.label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            onClick={() => setShortcutHelpOpen(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div
          key={location.pathname}
          className="container mx-auto animate-page-in px-6 py-8"
        >
          <Outlet />
        </div>
      </main>

      <footer className="relative z-10 shrink-0">
        <div className="container mx-auto px-6">
          <div className="border-t border-border pt-4 pb-3">
            <p className="font-sans text-center text-[11px] text-muted-foreground">
              metalab ATLAS · The experiment runner for reproducible science
            </p>
          </div>
        </div>
      </footer>

      <ConnectionErrorModal />
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutHelpModal open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
    </div>
  );
}
