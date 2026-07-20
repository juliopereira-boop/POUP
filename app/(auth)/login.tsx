import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { GoogleButton } from '@/components/GoogleButton';
import { useAuth } from '@/providers/AuthProvider';
import { spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export default function LoginScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { signIn, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function notify(message: string) {
    if (Platform.OS === 'web') setError(message);
    else Alert.alert('POUP', message);
  }

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      notify('Preencha email e senha.');
      return;
    }
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      notify(result.error);
      return;
    }
    router.replace('/');
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    setGoogleLoading(false);
    if (!result.ok) notify(result.error);
    // No web, o fluxo redireciona a página; no nativo, o AuthProvider assume.
  }

  return (
    <Screen center>
      <View style={styles.header}>
        <Logo size={44} />
        <Text style={styles.subtitle}>A ferramenta do corretor de sucesso</Text>
      </View>

      <Text style={styles.title}>Entrar</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Input
        label="Senha"
        value={password}
        onChangeText={setPassword}
        placeholder="Sua senha"
        secureTextEntry
        autoComplete="password"
        textContentType="password"
      />

      <Link href="/(auth)/forgot-password" style={styles.forgot}>
        <Text style={styles.link}>Esqueci minha senha</Text>
      </Link>

      <Button label="Entrar" onPress={handleLogin} loading={loading} style={styles.cta} />

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>ou</Text>
        <View style={styles.line} />
      </View>

      <GoogleButton onPress={handleGoogle} loading={googleLoading} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Ainda não tem conta? </Text>
        <Link href="/(auth)/signup">
          <Text style={styles.link}>Criar conta</Text>
        </Link>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  subtitle: {
    ...typography.body,
    color: colors.inkMuted,
    marginTop: spacing.md,
  },
  title: { ...typography.title, color: colors.ink, marginBottom: spacing.lg },
  cta: { marginTop: spacing.sm },
  forgot: { alignSelf: 'flex-end', marginBottom: spacing.lg },
  link: { ...typography.label, color: colors.primary },
  error: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
    gap: spacing.md,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.caption, color: colors.inkSubtle },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: { ...typography.body, color: colors.inkMuted },
});
