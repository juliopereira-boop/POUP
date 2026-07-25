import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { LoadingScreen } from '@/components/Loading';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';

const CONFIRM_MAX_ATTEMPTS = 6;
const CONFIRM_INTERVAL_MS = 1500;

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
    if (isConfirmingCheckout) {
      return <Redirect href="/paywall?pending=1" />;
    }
    return <Redirect href="/paywall" />;
  }

  return <Redirect href="/(app)" />;
}
