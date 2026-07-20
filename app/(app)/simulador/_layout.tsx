import { Stack } from 'expo-router';

import { SimuladorProvider } from '@/features/simulador/SimuladorProvider';
import { useTheme } from '@/providers/ThemeProvider';

/** Wizard do Simulador de poupança — mantém o estado entre as páginas. */
export default function SimuladorLayout() {
  const { colors } = useTheme();
  return (
    <SimuladorProvider>
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
        <Stack.Screen name="index" options={{ title: 'Simulador · Empreendimento' }} />
        <Stack.Screen name="corretor" options={{ title: 'Simulador · Corretor' }} />
        <Stack.Screen name="cliente" options={{ title: 'Simulador · Cliente' }} />
        <Stack.Screen name="financiamento" options={{ title: 'Simulador · Financiamento' }} />
        <Stack.Screen name="fluxo" options={{ title: 'Simulador · Fluxo de pagamento' }} />
      </Stack>
    </SimuladorProvider>
  );
}
