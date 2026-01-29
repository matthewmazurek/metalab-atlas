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
      <header className="shrink-0 border-b bg-card">
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
                    className="gap-2"
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
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4">
          <Outlet />
        </div>
      </main>

      {/* Global connection error modal */}
      <ConnectionErrorModal />
    </div>
  );
}
