import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';

import { BottomTabBar } from '@/components/BottomTabBar';
import { LoadingScreen } from '@/components/Loading';
import { OnboardingModal } from '@/components/OnboardingModal';
import { WelcomeGuide } from '@/components/WelcomeGuide';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useTheme } from '@/providers/ThemeProvider';

export default function AppLayout() {
  const { colors } = useTheme();
  const { user, initializing } = useAuth();
  const { isActive, initialLoad } = useSubscription();

  if (initializing || initialLoad) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!isActive) return <Redirect href="/paywall" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerShown: true,
          headerBackTitle: 'Voltar',
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="leads/index" options={{ title: 'Leads' }} />
        <Stack.Screen name="leads/[id]" options={{ title: 'Lead' }} />
        <Stack.Screen name="calendario" options={{ title: 'Calendário' }} />
        <Stack.Screen name="agendamentos/[id]" options={{ title: 'Agendamento' }} />
        <Stack.Screen name="campanhas" options={{ title: 'Período de teste' }} />
        <Stack.Screen name="simulador" options={{ headerShown: false }} />
        <Stack.Screen name="relatorios/index" options={{ title: 'Relatórios' }} />
        <Stack.Screen name="relatorios/[id]" options={{ title: 'Simulação' }} />
        <Stack.Screen name="configuracoes" options={{ title: 'Configurações' }} />
        <Stack.Screen name="workflow" options={{ title: 'Workflow de Leads' }} />
        <Stack.Screen name="perfil" options={{ title: 'Meu Perfil' }} />
        <Stack.Screen name="cadastros/index" options={{ title: 'Cadastros' }} />
        <Stack.Screen name="cadastros/empresas" options={{ title: 'Cadastro de Empresas' }} />
        <Stack.Screen
          name="cadastros/empreendimentos"
          options={{ title: 'Cadastro de Empreendimentos' }}
        />
        <Stack.Screen name="material-venda" options={{ title: 'Material de Venda' }} />
        <Stack.Screen name="comissao" options={{ title: 'Controle de Comissão' }} />
        <Stack.Screen name="vendas/index" options={{ title: 'Vendas Realizadas' }} />
        <Stack.Screen name="vendas/[id]" options={{ title: 'Venda' }} />
      </Stack>
      <BottomTabBar />
      <OnboardingModal />
      <WelcomeGuide />
    </View>
  );
}
