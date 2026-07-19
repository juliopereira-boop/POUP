import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { LoadingScreen } from '@/components/Loading';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';

/** Quantas vezes reconferir a assinatura após voltar do Checkout, e o intervalo. */
const CONFIRM_MAX_ATTEMPTS = 6;
const CONFIRM_INTERVAL_MS = 1500;

/**
 * Ponto de entrada. Decide para onde mandar o usuário:
 * - carregando sessão/assinatura → splash
 * - sem login → /login
 * - voltando do Checkout do Stripe (?checkout=success) → aguarda o webhook
 *   confirmar o pagamento antes de decidir (evita bater de volta no paywall
 *   por causa do pequeno atraso entre o pagamento e o webhook atualizar o banco)
 * - logado sem assinatura ativa → /paywall
 * - logado e assinante → app
 */
export default function Index() {
  const { user, initializing } = useAuth();
  const { isActive, loading, refresh } = useSubscription();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const isConfirmingCheckout = checkout === 'success';

  const [attempt, setAttempt] = useState(0);
  const stillConfirming = isConfirmingCheckout && !isActive && attempt < CONFIRM_MAX_ATTEMPTS;

  useEffect(() => {
    if (!stillConfirming || loading) return;
    const timer = setTimeout(() => {
      refresh().then(() => setAttempt((a) => a + 1));
    }, CONFIRM_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [stillConfirming, loading, refresh]);

  if (initializing || (user && loading && !isConfirmingCheckout)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (stillConfirming) {
    return <LoadingScreen message="Confirmando seu pagamento..." />;
  }

  if (!isActive) {
    // Esgotamos as tentativas de confirmação sem sucesso: manda pro paywall
    // com um aviso, em vez de voltar em silêncio como se nada tivesse acontecido.
    if (isConfirmingCheckout) {
      return <Redirect href="/paywall?pending=1" />;
    }
    return <Redirect href="/paywall" />;
  }

  return <Redirect href="/(app)" />;
}
