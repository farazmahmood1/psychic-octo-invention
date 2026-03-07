import { Navigate } from 'react-router-dom';
import { useAuth } from './auth-context';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  minimumRole?: 'viewer' | 'admin' | 'super_admin';
}

const ROLE_LEVELS: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  viewer: 1,
};

export function ProtectedRoute({ children, minimumRole = 'viewer' }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const userLevel = ROLE_LEVELS[user?.role ?? ''] ?? 0;
  const requiredLevel = ROLE_LEVELS[minimumRole] ?? 0;
  if (userLevel < requiredLevel) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-destructive">Insufficient permissions</div>
      </div>
    );
  }

  return <>{children}</>;
}
