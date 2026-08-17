import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { db } from '@/data';
import type { AuthUser, Result } from '@/data';
import { clearThumbCache } from '@/features/material/thumbCache';
import { clearScanConsent } from '@/features/scan/consent';
import { SIMULADOR_LOCAL_KEYS } from '@/features/simulador/SimuladorProvider';
import { sessionStorage } from '@/lib/storage';

interface AuthContextValue {
  user: AuthUser | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<Result<AuthUser>>;
  signUp: (email: string, password: string, fullName?: string) => Promise<Result<AuthUser | null>>;
  signInWithGoogle: () => Promise<Result<void>>;
  signInWithApple: () => Promise<Result<void>>;
  sendPasswordReset: (email: string) => Promise<Result<void>>;
  signOut: () => Promise<void>;
  /** Exclusão definitiva. `confirm` é a palavra digitada pelo corretor. */
  deleteAccount: (confirm: string) => Promise<Result<void>>;
}

/**
 * Apaga do aparelho tudo que pertence a quem está saindo.
 *
 * Não é higiene: é vazamento entre contas. As miniaturas são URLs assinadas do
 * material de venda, e os rascunhos do simulador guardam nome, CPF e renda dos
 * CLIENTES do corretor — com chave global, não por usuário. Sem esta limpeza,
 * o próximo login no mesmo aparelho abriria o simulador preenchido com o
 * cliente do corretor anterior.
 */
async function clearLocalUserData(): Promise<void> {
  await clearThumbCache();
  // O consentimento da leitura por IA é de quem o deu, não do aparelho.
  await clearScanConsent();
  await Promise.all(
    SIMULADOR_LOCAL_KEYS.map((key) => sessionStorage.removeItem(key).catch(() => undefined)),
  );
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
      signInWithApple: () => db.auth.signInWithApple(),
      sendPasswordReset: (email) => db.auth.sendPasswordReset(email),
      // As miniaturas guardadas são URLs assinadas do corretor que está
      // saindo. Deixá-las no aparelho vazaria material de venda para a próxima
      // conta que entrar nele.
      signOut: async () => {
        await clearLocalUserData();
        await db.auth.signOut();
      },
      deleteAccount: async (confirm: string) => {
        const result = await db.auth.deleteAccount(confirm);
        if (result.ok) await clearLocalUserData();
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
