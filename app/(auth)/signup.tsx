import { useState } from 'react';
import { Link, Redirect, useRouter } from 'expo-router';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { AppleButton } from '@/components/AppleButton';
import { GoogleButton } from '@/components/GoogleButton';
import { registrar } from '@/features/analytics/eventos';
import { podeCriarConta } from '@/features/store';
import { useAuth } from '@/providers/AuthProvider';
import { spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export default function SignUpScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { signUp, signInWithGoogle, signInWithApple } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * ESCONDER O LINK NÃO BASTA — mas o corte precisa vir DEPOIS dos hooks.
   *
   * No app das lojas o POUP é companion de uma assinatura vendida no site, e
   * cadastro (ou teste grátis) aqui dentro é oferta comercial fora do In-App
   * Purchase (regra 3.1.1). O link para cá já sumiu da tela de login, mas a
   * rota continuaria respondendo a um deep link ou a um `router.push`.
   *
   * O `Redirect` fecha a porta de verdade — é o mesmo raciocínio que a
   * auditoria aplicou ao checkout: tirar da interface e deixar o caminho vivo
   * atrás dela é esconder, não remover.
   *
   * Fica abaixo das chamadas de `useState` porque `return` antes de um hook
   * muda a ordem dos hooks entre renders, e o React quebra por isso. O custo é
   * declarar estado que não vai ser usado nesse caminho — irrelevante perto de
   * um app que trava.
   */
  if (!podeCriarConta) return <Redirect href="/(auth)/login" />;

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
    if (!result.data) {
      /*
       * Conta criada, mas ainda sem sessão: falta confirmar o email. Não é um
       * `signup_completed` — o evento exige `auth.uid()` para gravar, e
       * comercialmente "criou a conta" é quem consegue entrar. `etapa` registra
       * que ficou pendente, que é justamente o buraco a medir.
       */
      registrar('signup_completed', { etapa: 'aguardando_email', resultado: 'cancelado' });
      Alert.alert('Quase lá!', 'Enviamos um email de confirmação. Confirme para continuar.');
      router.replace('/(auth)/login');
      return;
    }
    registrar('signup_completed', { etapa: 'email_senha', resultado: 'ok' });
    router.replace('/');
  }

  async function handleApple() {
    setError(null);
    setAppleLoading(true);
    const result = await signInWithApple();
    setAppleLoading(false);
    if (!result.ok) notify(result.error);
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

      <View style={styles.socialGap}>
        <AppleButton onPress={handleApple} loading={appleLoading} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Já tem conta? </Text>
        <Link href="/(auth)/login">
          <Text style={styles.link}>Entrar</Text>
        </Link>
      </View>

      <View style={styles.legalFooter}>
        <Text style={styles.legalText}>
          Ao criar sua conta, você concorda com nossa{' '}
          <Link href="/privacidade">
            <Text style={styles.legalLink}>Política de Privacidade</Text>
          </Link>
          .
        </Text>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.primary, marginBottom: spacing.xs },
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
  socialGap: { marginTop: spacing.md },
  dividerText: { ...typography.caption, color: colors.inkSubtle },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { ...typography.body, color: colors.inkMuted },
  legalFooter: { marginTop: spacing.md, paddingHorizontal: spacing.md },
  legalText: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  legalLink: { ...typography.caption, color: colors.primary, textDecorationLine: 'underline' },
});
