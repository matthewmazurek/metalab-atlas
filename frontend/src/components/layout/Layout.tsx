import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Beaker, GitCompare, LayoutList, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAtlasStore } from '@/store/useAtlasStore';
import { ConnectionErrorModal } from './ConnectionErrorModal';

const navItems = [
  { path: '/experiments', label: 'Experiments', icon: Beaker },
  { path: '/runs', label: 'Runs', icon: LayoutList },
  { path: '/plots', label: 'Plots', icon: BarChart3 },
  { path: '/compare', label: 'Compare', icon: GitCompare },
];

// Subtle, modern hero gradients (light + dark) inspired by the provided references.
const HERO_GRADIENT_LIGHT = [
  "radial-gradient(900px circle at 20% 15%, rgba(99, 102, 241, 0.14), transparent 60%)",
  "radial-gradient(800px circle at 80% 25%, rgba(236, 72, 153, 0.11), transparent 62%)",
  "radial-gradient(900px circle at 60% 95%, rgba(14, 165, 233, 0.09), transparent 60%)",
  "linear-gradient(180deg, rgba(252, 252, 255, 1) 0%, rgba(244, 246, 252, 1) 45%, rgba(238, 236, 248, 1) 100%)",
].join(', ');

const HERO_GRADIENT_DARK = [
  "radial-gradient(900px circle at 20% 18%, rgba(56, 189, 248, 0.16), transparent 60%)",
  "radial-gradient(850px circle at 78% 24%, rgba(168, 85, 247, 0.18), transparent 62%)",
  "radial-gradient(950px circle at 60% 95%, rgba(244, 63, 94, 0.12), transparent 60%)",
  "linear-gradient(180deg, rgba(10, 16, 31, 1) 0%, rgba(15, 23, 42, 1) 50%, rgba(28, 20, 48, 1) 100%)",
].join(', ');

export function Layout() {
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useAtlasStore();

  // Apply dark class to <html> element so CSS variables cascade properly
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header - fixed at top */}
      <header className="shrink-0 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60 relative z-20">
        <div className="flex h-14 items-center px-4 gap-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-5 w-5" />
            <span>MetaLab Atlas</span>
          </Link>

          <nav className="flex items-center gap-1 ml-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className={[
                      'gap-2 cursor-pointer transition-colors',
                      // Light mode: soft “white glass” hover/active instead of grey
                      isActive
                        ? 'bg-card/80 hover:bg-card/95 shadow-sm'
                        : 'hover:bg-card/70',
                      // Dark mode: keep subtle, slightly muted hover/active
                      isActive
                        ? 'dark:bg-accent/50 dark:hover:bg-accent/60'
                        : 'dark:hover:bg-accent/50',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
              {darkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content - scrollable */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Hero background - behind header while scrolling */}
        <div
          className="fixed top-0 left-0 right-0 h-[360px] pointer-events-none z-0"
          aria-hidden="true"
        >
          {/* Light / dark gradient hero background */}
          <div
            className="absolute inset-0 dark:hidden"
            style={{
              backgroundImage: HERO_GRADIENT_LIGHT,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />
          <div
            className="absolute inset-0 hidden dark:block"
            style={{
              backgroundImage: HERO_GRADIENT_DARK,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />

          {/* Fade out (prevents harsh cutoff into page background) */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        </div>

        {/* Page content */}
        <div className="container mx-auto py-6 px-4 relative z-10">
          <Outlet />
        </div>
      </main>

      {/* Global connection error modal */}
      <ConnectionErrorModal />
    </div>
  );
}
