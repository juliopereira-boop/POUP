import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';

import { BottomTabBar } from '@/components/BottomTabBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Lia } from '@/components/lia/Lia';
import { LoadingScreen } from '@/components/Loading';
import { OnboardingModal } from '@/components/OnboardingModal';
import { WelcomeGuide } from '@/components/WelcomeGuide';
import { useRastrearTela, useRegistrarRetorno } from '@/features/analytics/useRastreio';
import { LiaProvider } from '@/features/lia/LiaProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useTheme } from '@/providers/ThemeProvider';

export default function AppLayout() {
  const { colors } = useTheme();
  const { user, initializing } = useAuth();
  const { isActive, initialLoad } = useSubscription();

  /*
   * Os dois rastreios que precisam de um lugar na árvore, montados ANTES dos
   * `return` de carregamento e redirecionamento — hooks não podem ficar atrás de
   * um `if`. Nenhum dos dois depende de haver usuário: `useRegistrarRetorno` só
   * grava evento quando há sessão (o RLS exigiria de qualquer forma), e
   * `useRastrearTela` nem toca no banco.
   */
  useRastrearTela();
  useRegistrarRetorno();

  if (initializing || initialLoad) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!isActive) return <Redirect href="/paywall" />;

  return (
    /*
     * A LIA envolve o app inteiro de propósito: a sessão de escuta precisa
     * sobreviver à navegação. O corretor abre a LIA, começa a ouvir e vai
     * consultar o cadastro de uma empresa no meio da conversa — se o estado
     * morresse na troca de tela, a negociação inteira se perderia junto.
     */
    <LiaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/*
         * Uma segunda fronteira, só em volta das telas.
         *
         * A do `app/_layout.tsx` protege o aplicativo inteiro; esta é mais
         * fina de propósito: uma tela que quebra mostra o erro sem levar junto
         * a barra de navegação, e o corretor sai dali com um toque em vez de
         * ficar preso.
         */}
        <ErrorBoundary onde="uma tela do aplicativo">
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
            <Stack.Screen name="admin/catalogo" options={{ title: 'Catálogo do sistema' }} />
            <Stack.Screen name="admin/rastreabilidade" options={{ title: 'Rastreabilidade' }} />
            <Stack.Screen name="simuladores" options={{ title: 'Simulador' }} />
            <Stack.Screen name="simulador" options={{ headerShown: false }} />
            <Stack.Screen name="financiamento" options={{ headerShown: false }} />
            <Stack.Screen name="admin/financiamento" options={{ title: 'Regras de financiamento' }} />
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
            <Stack.Screen name="comissao/index" options={{ title: 'Controle de Comissão' }} />
            <Stack.Screen name="comissao/[id]" options={{ title: 'Comissão' }} />
            <Stack.Screen name="vendas/index" options={{ title: 'Vendas Realizadas' }} />
            <Stack.Screen name="vendas/[id]" options={{ title: 'Venda' }} />
          </Stack>
        </ErrorBoundary>
        <BottomTabBar />
        <OnboardingModal />
        <WelcomeGuide />
        <Lia />
      </View>
    </LiaProvider>
  );
}
