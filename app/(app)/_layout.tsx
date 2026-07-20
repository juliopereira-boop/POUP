import { Redirect, Stack } from 'expo-router';
import { Fragment } from 'react';

import { LoadingScreen } from '@/components/Loading';
import { OnboardingModal } from '@/components/OnboardingModal';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useTheme } from '@/providers/ThemeProvider';

/**
 * Guarda do app: exige login + assinatura ativa.
 * Toda a área "logada" fica sob este grupo.
 */
export default function AppLayout() {
  const { colors } = useTheme();
  const { user, initializing } = useAuth();
  const { isActive, loading } = useSubscription();

  if (initializing || loading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!isActive) return <Redirect href="/paywall" />;

  return (
    <Fragment>
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
        <Stack.Screen name="simulador" options={{ headerShown: false }} />
        <Stack.Screen name="relatorios" options={{ title: 'Relatórios' }} />
        <Stack.Screen name="configuracoes" options={{ title: 'Configurações' }} />
        <Stack.Screen name="perfil" options={{ title: 'Meu Perfil' }} />
        <Stack.Screen name="cadastros/index" options={{ title: 'Cadastros' }} />
        <Stack.Screen name="cadastros/empresas" options={{ title: 'Cadastro de Empresas' }} />
        <Stack.Screen
          name="cadastros/empreendimentos"
          options={{ title: 'Cadastro de Empreendimentos' }}
        />
        <Stack.Screen name="material-venda" options={{ title: 'Material de Venda' }} />
        <Stack.Screen name="comissao" options={{ title: 'Controle de Comissão' }} />
        <Stack.Screen name="vendas" options={{ title: 'Vendas Realizadas' }} />
      </Stack>
      <OnboardingModal />
    </Fragment>
  );
}
