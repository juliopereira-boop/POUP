import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { db } from '@/data';
import type { AuthUser, Result } from '@/data';

interface AuthContextValue {
  user: AuthUser | null;
  /** true enquanto restauramos a sessão inicial. */
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<Result<AuthUser>>;
  signUp: (email: string, password: string, fullName?: string) => Promise<Result<AuthUser | null>>;
  signInWithGoogle: () => Promise<Result<void>>;
  sendPasswordReset: (email: string) => Promise<Result<void>>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Compara os dados relevantes de dois usuários, ignorando identidade de
 * objeto. O Supabase dispara onAuthStateChange (com um NOVO objeto de user)
 * em eventos como refresh automático de token — algo que acontece sozinho
 * quando a aba volta a ficar visível (ex.: usuário troca de app e volta).
 * Sem essa comparação, cada refresh de token trocaria a referência de `user`,
 * derrubando em cascata qualquer provider/efeito que dependa de [user]
 * (ex.: SubscriptionProvider), causando remounts indevidos da árvore.
 */
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

    // Restaura a sessão persistida ao abrir o app.
    db.auth
      .getCurrentUser()
      .then((u) => {
        if (mounted) setUser(u);
      })
      .finally(() => {
        if (mounted) setInitializing(false);
      });

    // Mantém o estado sincronizado com login/logout/refresh de token.
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
      signOut: () => db.auth.signOut(),
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
