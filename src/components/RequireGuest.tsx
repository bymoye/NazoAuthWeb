import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { resolveSafeNextFromSearch } from '../auth/next';
import { useAuth } from '../auth/useAuth';

export default function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading, sessionChecked } = useAuth();
  const location = useLocation();

  if (loading || (!user && !sessionChecked)) {
    return (
      <div className="container" style={{ padding: '64px 16px', textAlign: 'center' }}>
        正在检查登录状态...
      </div>
    );
  }

  if (user) {
    const next = resolveSafeNextFromSearch(location.search);
    return <Navigate to={next ?? '/profile'} replace />;
  }

  return <>{children}</>;
}
