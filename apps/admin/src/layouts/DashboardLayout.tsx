import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Puzzle,
  Shield,
  Settings,
  LogOut,
  Plug,
  Activity,
  Receipt,
  ShieldAlert,
  Brain,
  Store,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/lib/realtime-context';
import { useTheme } from '@/lib/theme-context';
import { NotificationListener } from '@/components/notification-listener';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  minRole?: 'viewer' | 'admin' | 'super_admin';
}

const ROLE_LEVELS: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  viewer: 1,
};

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/chats', label: 'Chats', icon: MessageSquare },
  { to: '/dashboard/usage', label: 'Usage', icon: BarChart3 },
  { to: '/dashboard/skills', label: 'Skills', icon: Puzzle, minRole: 'admin' },
  { to: '/dashboard/jobs', label: 'Jobs', icon: Activity, minRole: 'admin' },
  { to: '/dashboard/bookkeeping', label: 'Bookkeeping', icon: Receipt, minRole: 'admin' },
  { to: '/dashboard/memory', label: 'Memory', icon: Brain, minRole: 'admin' },
  { to: '/dashboard/audit', label: 'Audit Log', icon: Shield, minRole: 'admin' },
  { to: '/dashboard/security', label: 'Security', icon: ShieldAlert, minRole: 'admin' },
  { to: '/dashboard/integrations', label: 'Integrations', icon: Plug, minRole: 'admin' },
  { to: '/dashboard/marketplace', label: 'Marketplace', icon: Store, minRole: 'admin' },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings },
];

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPageTitle(pathname: string): string {
  const segment = pathname.split('/').pop() ?? '';
  const titles: Record<string, string> = {
    dashboard: 'Dashboard',
    chats: 'Chat History',
    usage: 'API Usage',
    skills: 'Skills',
    audit: 'Audit Log',
    integrations: 'Integrations',
    settings: 'Settings',
    jobs: 'Jobs & Tasks',
    bookkeeping: 'Bookkeeping',
    memory: 'Memory',
    security: 'Security',
    marketplace: 'Marketplace',
  };
  // Handle conversation detail pages
  if (pathname.includes('/chats/') && segment !== 'chats') {
    return 'Conversation Detail';
  }
  return titles[segment] ?? 'Dashboard';
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(next)}
      title={`Theme: ${label}. Click to switch.`}
      className="gap-1.5"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline text-xs">{label}</span>
    </Button>
  );
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { connected } = useRealtime();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const userLevel = ROLE_LEVELS[user?.role ?? ''] ?? 0;

  const visibleNavItems = navItems.filter((item) => {
    const requiredLevel = ROLE_LEVELS[item.minRole ?? 'viewer'] ?? 0;
    return userLevel >= requiredLevel;
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen">
      <NotificationListener />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-6">
          <h1 className="text-lg font-bold">OpenClaw Admin</h1>
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {visibleNavItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="mb-1 truncate text-sm font-medium">{user?.displayName ?? user?.email}</div>
          <div className="mb-2 text-xs text-muted-foreground">{formatRole(user?.role ?? '')}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => void handleLogout()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b bg-background px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold">{getPageTitle(location.pathname)}</h2>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn('inline-block h-2 w-2 rounded-full', connected ? 'bg-green-500' : 'bg-muted-foreground/40')} />
              <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 sm:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
