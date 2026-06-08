import { createContext } from 'react';
import type { AuthUser } from '../types/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  sessionChecked: boolean;
  refreshSession: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
