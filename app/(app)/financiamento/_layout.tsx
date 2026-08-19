import { Stack } from 'expo-router';

import { FinanciamentoProvider } from '@/features/financiamento/FinanciamentoProvider';
import { useTheme } from '@/providers/ThemeProvider';

/**
 * O provider envolve o módulo inteiro, e não cada tela.
 *
 * A simulação atravessa telas — o corretor preenche em "Simulação", olha o
 * resultado, volta para mexer no prazo, vai ao comparador e volta de novo. Com
 * o estado por tela, cada volta apagaria o que ele acabou de digitar.
 */
export default function FinanciamentoLayout() {
  const { colors } = useTheme();
  return (
    <FinanciamentoProvider>
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
        <Stack.Screen name="index" options={{ title: 'Financiamento' }} />
        <Stack.Screen name="simular" options={{ title: 'Simulação' }} />
        <Stack.Screen name="resultado" options={{ title: 'Resultado' }} />
        <Stack.Screen name="poder-de-compra" options={{ title: 'Poder de compra' }} />
        <Stack.Screen name="historico" options={{ title: 'Minhas simulações' }} />
      </Stack>
    </FinanciamentoProvider>
  );
}
