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
  const { isActive, initialLoad } = useSubscription();

  // IMPORTANTE: usar `initialLoad` (não `loading`) aqui. `loading` volta a
  // true toda vez que a assinatura é reconferida em segundo plano (ex.: após
  // o app voltar do segundo plano). Se usássemos `loading`, cada uma dessas
  // reconferências desmontaria o <Stack> inteiro — incluindo o estado do
  // Simulador — jogando o usuário de volta pro menu e apagando o progresso.
  if (initializing || initialLoad) return <LoadingScreen />;
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
        <Stack.Screen name="leads" options={{ title: 'Leads' }} />
        <Stack.Screen name="calendario" options={{ title: 'Calendário' }} />
        <Stack.Screen name="simulador" options={{ headerShown: false }} />
        <Stack.Screen name="relatorios/index" options={{ title: 'Relatórios' }} />
        <Stack.Screen name="relatorios/[id]" options={{ title: 'Simulação' }} />
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
