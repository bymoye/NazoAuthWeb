import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { buildAuthRedirectWithNext, buildCurrentPath } from '../auth/next';
import { useAuth } from '../auth/useAuth';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, sessionChecked } = useAuth();
  const location = useLocation();

  if (loading || (!user && !sessionChecked)) {
    return (
      <div className="container" style={{ padding: '64px 16px', textAlign: 'center' }}>
        正在验证登录状态...
      </div>
    );
  }

  if (!user) {
    return <Navigate to={buildAuthRedirectWithNext(buildCurrentPath(location))} replace />;
  }

  return <>{children}</>;
}
