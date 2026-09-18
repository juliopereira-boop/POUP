import { Link, useLocalSearchParams } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';

/** Pública, inclusive sem aplicativo instalado e sem assinatura. URL do Play Console. */
export default function DeleteAccountPage() {
  const { user, initializing } = useAuth();
  const { apple } = useLocalSearchParams<{ apple?: string }>();
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={{ gap: 20, paddingVertical: 24 }}>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 26, fontWeight: '700', color: colors.ink }}
        >
          Excluir conta e dados — POUP
        </Text>
        <Text style={{ color: colors.ink }}>
          Você pode excluir sua conta pelo site, sem instalar o aplicativo. A exclusão remove seu
          perfil, leads, simulações, propostas, vendas, comissões e arquivos pessoais. Uma
          assinatura existente é cancelada durante o processo.
        </Text>
        <Text style={{ color: colors.ink }}>
          O catálogo compartilhado da plataforma não é apagado junto com uma conta. Dados que
          precisem ser retidos por obrigação legal e cópias de segurança seguem os prazos descritos
          na Política de Privacidade.
        </Text>
        {apple ? (
          <Text accessibilityRole="alert" style={{ color: colors.ink }}>
            {apple === 'confirmed'
              ? 'Você retornou da Apple. Confira a conta abaixo e confirme a exclusão novamente. O servidor verificará o vínculo antes de excluir.'
              : 'A confirmação Apple não foi concluída. Sua conta não foi excluída. Você pode tentar novamente.'}
          </Text>
        ) : null}
        {initializing ? (
          <Text style={{ color: colors.ink }}>Conferindo sessão…</Text>
        ) : user ? (
          <>
            <Text style={{ color: colors.ink }}>Conta conectada: {user.email ?? user.id}</Text>
            <DeleteAccountButton />
          </>
        ) : (
          <Link href="/(auth)/login" style={{ color: colors.primary }}>
            Entrar para excluir minha conta
          </Link>
        )}
        <Text style={{ color: colors.ink }}>
          Sem acesso à conta? Envie um pedido para gestao@poupgestao.com, informando o e-mail da
          conta e solicitando a exclusão. Não envie sua senha nem fotos de documentos. Confirmaremos
          sua identidade e informaremos o andamento antes de apagar os dados. Respondemos a
          solicitações sobre dados em até 15 dias.
        </Text>
        <Button
          label="Solicitar exclusão por e-mail"
          variant="secondary"
          onPress={() =>
            void Linking.openURL('mailto:gestao@poupgestao.com?subject=Excluir%20conta%20POUP')
          }
        />
        <Link href="/privacidade" style={{ color: colors.primary }}>
          Política de Privacidade e retenção
        </Link>
        <Link href="/suporte" style={{ color: colors.primary }}>
          Suporte
        </Link>
      </View>
    </Screen>
  );
}
