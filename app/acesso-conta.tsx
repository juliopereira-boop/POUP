import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase } from '@/lib/supabase';
import { linkAccountProvider } from '@/lib/accountAccess';

export default function AccountAccessPage() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [providers, setProviders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setProviders([]);
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active && data.user?.id === user?.id)
          setProviders(data.user?.identities?.map((i) => i.provider) ?? []);
      })
      .catch(() => {
        if (active) setMessage('Não foi possível consultar os métodos de acesso.');
      });
    return () => {
      active = false;
    };
  }, [user?.id]);
  async function link(provider: 'google' | 'apple') {
    setBusy(true);
    setMessage('');
    try {
      setMessage(await linkAccountProvider(provider));
      const { data } = await supabase.auth.getUser();
      if (data.user?.id === user?.id)
        setProviders(data.user?.identities?.map((i) => i.provider) ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Vinculação não concluída.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={{ gap: 20, paddingVertical: 24 }}>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 26, fontWeight: '700', color: colors.ink }}
        >
          Métodos de acesso
        </Text>
        <Text style={{ color: colors.ink }}>
          Use o mesmo método de entrada no iPhone, Android e computador. Se usou Apple com e-mail
          oculto, continue com Apple — digitar outro e-mail pode abrir outra conta.
        </Text>
        {user ? (
          <>
            <Text style={{ color: colors.ink }}>Conta: {user.email ?? user.id}</Text>
            <Text style={{ color: colors.ink }}>
              Vincule outro método enquanto está conectado à conta que deseja manter. Não mesclamos
              contas existentes nem transferimos assinaturas automaticamente.
            </Text>
            {(['google', 'apple'] as const).map((provider) => (
              <Button
                key={provider}
                label={`${providers.includes(provider) ? 'Vinculado' : 'Vincular'}: ${provider === 'google' ? 'Google' : 'Apple'}`}
                disabled={busy || providers.includes(provider)}
                onPress={() => void link(provider)}
                variant="secondary"
              />
            ))}
            <Text style={{ color: colors.ink }}>
              A confirmação acontece no Google ou na Apple. Nunca informe a senha desses serviços em
              uma tela do POUP.
            </Text>
          </>
        ) : (
          <Link href="/(auth)/login" style={{ color: colors.primary }}>
            Entrar na conta que desejo manter
          </Link>
        )}
        {message ? (
          <Text accessibilityRole="alert" style={{ color: colors.ink }}>
            {message}
          </Text>
        ) : null}
        <Link href="/suporte" style={{ color: colors.primary }}>
          Preciso de ajuda com meu acesso
        </Link>
        <Link href="/" style={{ color: colors.primary }}>
          Voltar
        </Link>
      </View>
    </Screen>
  );
}
