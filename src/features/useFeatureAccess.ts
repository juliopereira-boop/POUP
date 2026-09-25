import { useCallback, useMemo } from 'react';

import { canUse, SO_ASSINATURA_PAGA, type PlanFeatureKey } from '@/features/plans';
import { useSubscription } from '@/providers/SubscriptionProvider';

export interface FeatureAccess {
  /** Assinatura em período de teste gratuito ainda válido. */
  isTrial: boolean;
  /** `true` quando a funcionalidade está liberada para a assinatura atual. */
  canUse: (feature: PlanFeatureKey) => boolean;
}

/**
 * Ponte entre a assinatura do usuário e a regra `canUse` de `@/features/plans`.
 * Toda tela que precisa bloquear algo usa este hook — a regra em si mora em um
 * lugar só.
 */
export function useFeatureAccess(): FeatureAccess {
  const { tier, trialDaysLeft, subscription } = useSubscription();
  const isTrial = subscription?.status === 'trialing' && trialDaysLeft !== null;

  const check = useCallback(
    (feature: PlanFeatureKey) =>
      (!SO_ASSINATURA_PAGA.includes(feature) || subscription?.status === 'active') && canUse(feature, tier, isTrial),
    [tier, isTrial, subscription?.status],
  );

  return useMemo(() => ({ isTrial, canUse: check }), [isTrial, check]);
}
