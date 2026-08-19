import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BackendMissingScreen } from '@/components/BackendMissingScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SplashGate } from '@/components/SplashGate';
import { AuthProvider } from '@/providers/AuthProvider';
import { SubscriptionProvider } from '@/providers/SubscriptionProvider';
import { ProfileProvider } from '@/providers/ProfileProvider';
import { ThemeProvider, useTheme } from '@/providers/ThemeProvider';
import { isBackendConfigured } from '@/lib/env';

export default function RootLayout() {
  /*
   * Build sem as chaves do Supabase: avisa em vez de abrir um app onde nada
   * funciona e ninguém entende por quê. Fica ANTES dos providers de propósito
   * — o `AuthProvider` tentaria conversar com um servidor que não existe.
   */
  if (!isBackendConfigured) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <BackendMissingScreen />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    /*
     * A fronteira de erro fica POR FORA de todos os providers.
     *
     * Se ela ficasse por dentro, um erro no `AuthProvider` ou no
     * `ThemeProvider` passaria por cima dela e a tela voltaria a ficar branca —
     * que é exatamente o problema que ela existe para eliminar.
     */
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <ProfileProvider>
                <SubscriptionProvider>
                  <SplashGate>
                    <ThemedNavigator />
                  </SplashGate>
                </SubscriptionProvider>
              </ProfileProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

function ThemedNavigator() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="captar" />
        {/*
          A simulação compartilhada com o CLIENTE. Fora de `(app)` porque ele
          não tem conta nem assinatura — lá dentro o link viraria uma tela de
          login na cara dele.
        */}
        <Stack.Screen name="simulacao/[token]" />
        {/*
          Fora de `(auth)` de propósito: o link do e-mail já autentica o
          visitante, e o `(auth)/_layout` expulsa todo mundo autenticado para
          `/`. Dentro daquele grupo, a tela de trocar a senha nunca apareceria.
        */}
        <Stack.Screen name="redefinir-senha" />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
