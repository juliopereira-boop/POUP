import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { db } from '@/data';
import { type Subscription, isSubscriptionActive } from '@/data';
import { useAuth } from './AuthProvider';

interface SubscriptionContextValue {
  subscription: Subscription | null;
  /** Assinatura ativa/trial → libera o app. */
  isActive: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sub = await db.billing.getSubscription(user.id);
      setSubscription(sub);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        isActive: isSubscriptionActive(subscription),
        loading,
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
