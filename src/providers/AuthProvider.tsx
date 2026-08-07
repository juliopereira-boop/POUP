import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { db } from '@/data';
import type { AuthUser, Result } from '@/data';
import { clearThumbCache } from '@/features/material/thumbCache';

interface AuthContextValue {
  user: AuthUser | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<Result<AuthUser>>;
  signUp: (email: string, password: string, fullName?: string) => Promise<Result<AuthUser | null>>;
  signInWithGoogle: () => Promise<Result<void>>;
  sendPasswordReset: (email: string) => Promise<Result<void>>;
  signOut: () => Promise<void>;
  /** Exclusão definitiva. `confirm` é a palavra digitada pelo corretor. */
  deleteAccount: (confirm: string) => Promise<Result<void>>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function sameUser(a: AuthUser | null, b: AuthUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.displayName === b.displayName &&
    a.avatarUrl === b.avatarUrl
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;

    db.auth
      .getCurrentUser()
      .then((u) => {
        if (mounted) setUser(u);
      })
      .finally(() => {
        if (mounted) setInitializing(false);
      });

    const unsubscribe = db.auth.onAuthStateChange(({ user: u }) => {
      if (!mounted) return;
      setUser((prev) => (sameUser(prev, u) ? prev : u));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      signIn: (email, password) => db.auth.signInWithPassword(email, password),
      signUp: (email, password, fullName) =>
        db.auth.signUpWithPassword(email, password, fullName),
      signInWithGoogle: () => db.auth.signInWithGoogle(),
      sendPasswordReset: (email) => db.auth.sendPasswordReset(email),
      // As miniaturas guardadas são URLs assinadas do corretor que está
      // saindo. Deixá-las no aparelho vazaria material de venda para a próxima
      // conta que entrar nele.
      signOut: async () => {
        await clearThumbCache();
        await db.auth.signOut();
      },
      deleteAccount: async (confirm: string) => {
        const result = await db.auth.deleteAccount(confirm);
        if (result.ok) await clearThumbCache();
        return result;
      },
    }),
    [user, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return ctx;
}
