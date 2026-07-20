import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { db } from '@/data';
import { type PlanTier, type Subscription, isSubscriptionActive } from '@/data';
import { getPlan, type PlanConfig } from '@/features/plans';
import { useAuth } from './AuthProvider';

interface SubscriptionContextValue {
  subscription: Subscription | null;
  /** Assinatura ativa/trial → libera o app. */
  isActive: boolean;
  /** Nível do plano atual (start/pro), ou null. */
  tier: PlanTier | null;
  /** Config do plano atual (nome, limite, benefícios). */
  plan: PlanConfig | null;
  loading: boolean;
  /**
   * true SOMENTE até a 1ª busca terminar (nunca mais volta a true depois).
   * Use isto (não `loading`) para decidir se mostra um loading de tela cheia
   * — assim, atualizações em segundo plano não desmontam a árvore de telas.
   */
  initialLoad: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      setInitialLoad(false);
      return;
    }
    setLoading(true);
    try {
      const sub = await db.billing.getSubscription(user.id);
      setSubscription(sub);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tier = subscription?.tier ?? null;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        isActive: isSubscriptionActive(subscription),
        tier,
        plan: getPlan(tier),
        loading,
        initialLoad,
        refresh,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription deve ser usado dentro de <SubscriptionProvider>.');
  return ctx;
}
