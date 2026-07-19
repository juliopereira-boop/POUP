import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { GoogleButton } from '@/components/GoogleButton';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing, typography } from '@/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, signInWithGoogle } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function notify(message: string) {
    if (Platform.OS === 'web') setError(message);
    else Alert.alert('POUP', message);
  }

  async function handleSignUp() {
    setError(null);
    if (!fullName.trim() || !email.trim() || !password) {
      notify('Preencha todos os campos.');
      return;
    }
    if (password.length < 6) {
      notify('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const result = await signUp(email.trim(), password, fullName.trim());
    setLoading(false);
    if (!result.ok) {
      notify(result.error);
      return;
    }
    // Se o projeto exigir confirmação de email, não haverá sessão ainda.
    if (!result.data) {
      Alert.alert('Quase lá!', 'Enviamos um email de confirmação. Confirme para continuar.');
      router.replace('/(auth)/login');
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
  }

  return (
    <Screen center>
      <View style={styles.header}>
        <Logo size={44} />
      </View>

      <Text style={styles.title}>Criar conta</Text>
      <Text style={styles.subtitle}>Comece agora a organizar suas vendas.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Input
        label="Nome completo"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Seu nome"
        autoCapitalize="words"
        autoComplete="name"
      />
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Input
        label="Senha"
        value={password}
        onChangeText={setPassword}
        placeholder="Mínimo 6 caracteres"
        secureTextEntry
        autoComplete="password-new"
      />

      <Button label="Criar conta" onPress={handleSignUp} loading={loading} style={styles.cta} />

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>ou</Text>
        <View style={styles.line} />
      </View>

      <GoogleButton onPress={handleGoogle} loading={googleLoading} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Já tem conta? </Text>
        <Link href="/(auth)/login">
          <Text style={styles.link}>Entrar</Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.ink, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
  cta: { marginTop: spacing.sm },
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
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { ...typography.body, color: colors.inkMuted },
});
