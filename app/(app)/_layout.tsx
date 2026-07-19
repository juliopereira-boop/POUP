import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/Loading';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { colors } from '@/theme';

/**
 * Guarda do app: exige login + assinatura ativa.
 * Toda a área "logada" fica sob este grupo.
 */
export default function AppLayout() {
  const { user, initializing } = useAuth();
  const { isActive, loading } = useSubscription();

  if (initializing || loading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!isActive) return <Redirect href="/paywall" />;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Voltar',
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="simulador" options={{ title: 'Simulador de poupança' }} />
      <Stack.Screen name="relatorios" options={{ title: 'Relatórios' }} />
      <Stack.Screen name="configuracoes" options={{ title: 'Configurações' }} />
      <Stack.Screen name="material-venda" options={{ title: 'Material de Venda' }} />
      <Stack.Screen name="comissao" options={{ title: 'Controle de Comissão' }} />
      <Stack.Screen name="vendas" options={{ title: 'Vendas Realizadas' }} />
    </Stack>
  );
}
