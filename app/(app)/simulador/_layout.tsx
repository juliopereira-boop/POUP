import { Stack } from 'expo-router';

import { SimuladorProvider } from '@/features/simulador/SimuladorProvider';
import { useTheme } from '@/providers/ThemeProvider';

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
        {/* Dois blocos: primeiro os valores (a conta), depois a unidade e o cliente
            (a proposta). Ver o cabeçalho de `index.tsx`. */}
        <Stack.Screen name="index" options={{ title: 'Simulador de vendas' }} />
        <Stack.Screen name="dados" options={{ title: 'Unidade e cliente' }} />
      </Stack>
    </SimuladorProvider>
  );
}
