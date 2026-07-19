import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/Loading';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';

/**
 * Ponto de entrada. Decide para onde mandar o usuário:
 * - carregando sessão/assinatura → splash
 * - sem login → /login
 * - logado sem assinatura ativa → /paywall
 * - logado e assinante → app
 */
export default function Index() {
  const { user, initializing } = useAuth();
  const { isActive, loading } = useSubscription();

  if (initializing || (user && loading)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!isActive) {
    return <Redirect href="/paywall" />;
  }

  return <Redirect href="/(app)" />;
}
