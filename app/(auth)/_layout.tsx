import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/Loading';
import { useAuth } from '@/providers/AuthProvider';

/** Grupo de telas públicas (login/cadastro). Se já logado, sai daqui. */
export default function AuthLayout() {
  const { user, initializing } = useAuth();

  if (initializing) return <LoadingScreen />;
  if (user) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
