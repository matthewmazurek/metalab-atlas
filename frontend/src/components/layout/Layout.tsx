import { Link, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, GitCompare, LayoutList, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAtlasStore } from '@/store/useAtlasStore';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Runs', icon: LayoutList },
  { path: '/plots', label: 'Plots', icon: BarChart3 },
  { path: '/compare', label: 'Compare', icon: GitCompare },
];

export function Layout() {
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useAtlasStore();

  return (
    <div className={cn('min-h-screen bg-background', darkMode && 'dark')}>
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex h-14 items-center px-4 gap-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-5 w-5" />
            <span>Metalab Atlas</span>
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

      {/* Main content */}
      <main className="container mx-auto py-6 px-4">
        <Outlet />
      </main>
    </div>
  );
}
