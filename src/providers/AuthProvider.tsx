import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { db } from '@/data';
import type { AuthUser, Result } from '@/data';
import { clearThumbCache } from '@/features/material/thumbCache';
import { revogarConsentimentoScan } from '@/features/scan/consent';
import { limparConsentimentoLia } from '@/features/lia/consentimento';
import { FINANCIAMENTO_LOCAL_KEYS } from '@/features/financiamento/FinanciamentoProvider';
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
  /** Instala a sessão que vem no link do e-mail de redefinição (celular). */
  applyRecoveryLink: (url: string) => Promise<Result<void>>;
  /** Grava a senha nova de quem está autenticado agora. */
  updatePassword: (password: string) => Promise<Result<void>>;
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
  // Os consentimentos de IA são de quem os deu, não do aparelho. Vale para a
  // leitura de documento e, com peso maior, para a LIA: quem autorizou abrir o
  // microfone numa negociação foi uma pessoa, não este celular.
  await revogarConsentimentoScan();
  await limparConsentimentoLia();
  /*
   * Os rascunhos dos DOIS simuladores guardam nome, CPF, telefone e renda de
   * um cliente — e as chaves não são separadas por usuário. Sem apagar na
   * saída, o próximo corretor a entrar no mesmo aparelho abriria o simulador
   * preenchido com o cliente do anterior. Vazamento de dado pessoal entre
   * contas, e no Brasil problema de LGPD.
   */
  await Promise.all(
    [...SIMULADOR_LOCAL_KEYS, ...FINANCIAMENTO_LOCAL_KEYS].map((key) =>
      sessionStorage.removeItem(key).catch(() => undefined),
    ),
  );

  /*
   * A SOBRA DA PROSPECÇÃO, QUE NÃO TINHA DONO PARA APAGÁ-LA.
   *
   * A busca por dados públicos saiu do produto (regra 5.1.1(viii)), mas ela
   * guardava os resultados em `prospect:<userId>` — nome e telefone de pessoas
   * que nunca pediram contato — e esse cache sobrevivia ao logout e à exclusão
   * da conta. Uma auditoria externa apontou isso.
   *
   * Não dá para apagar pelo nome: a chave termina com o id de quem estava
   * logado, e aqui a sessão já acabou. Daí a varredura por prefixo.
   *
   * Isto some do código no dia em que ninguém mais abrir uma versão antiga do
   * app — até lá, é a única coisa que limpa esses aparelhos.
   */
  try {
    const todas = await AsyncStorage.getAllKeys();
    const orfas = todas.filter((k) => k.startsWith('prospect:'));
    if (orfas.length > 0) await AsyncStorage.multiRemove(orfas);
  } catch {
    /* Sem armazenamento não há o que apagar. */
  }
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
      applyRecoveryLink: (url) => db.auth.applyRecoveryLink(url),
      updatePassword: (password) => db.auth.updatePassword(password),
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
