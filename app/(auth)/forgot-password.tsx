import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing, typography } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReset() {
    if (!email.trim()) {
      setMessage('Informe seu email.');
      return;
    }
    setLoading(true);
    const result = await sendPasswordReset(email.trim());
    setLoading(false);
    const text = result.ok
      ? 'Se este email tiver conta, enviamos um link para redefinir a senha.'
      : result.error;
    if (Platform.OS === 'web') setMessage(text);
    else {
      Alert.alert('POUP', text);
      if (result.ok) router.replace('/(auth)/login');
    }
  }

  return (
    <Screen center>
      <View style={styles.header}>
        <Logo size={40} />
      </View>
      <Text style={styles.title}>Redefinir senha</Text>
      <Text style={styles.subtitle}>
        Digite seu email e enviaremos um link para criar uma nova senha.
      </Text>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      <Button label="Enviar link" onPress={handleReset} loading={loading} style={styles.cta} />

      <View style={styles.footer}>
        <Link href="/(auth)/login">
          <Text style={styles.link}>Voltar para o login</Text>
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
  message: {
    ...typography.caption,
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
});
