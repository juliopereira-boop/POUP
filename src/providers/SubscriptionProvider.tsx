import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { db } from '@/data';
import {
  type PlanTier,
  type Subscription,
  isSubscriptionActive,
  isTrialExpired,
  trialDaysRemaining,
} from '@/data';
import { getPlan, type PlanConfig } from '@/features/plans';
import { useAuth } from './AuthProvider';

interface SubscriptionContextValue {
  subscription: Subscription | null;
  isActive: boolean;
  tier: PlanTier | null;
  plan: PlanConfig | null;
  /** Dias que ainda faltam do período de teste. `null` quando não está em teste válido. */
  trialDaysLeft: number | null;
  /** Estava em período de teste e o prazo venceu. */
  trialExpired: boolean;
  loading: boolean;
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
        trialDaysLeft: trialDaysRemaining(subscription),
        trialExpired: isTrialExpired(subscription),
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
