import { Link } from 'expo-router';
import { Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/providers/ThemeProvider';

/** Retorno seguro caso o SO reabra o app fora da sessão do navegador. */
export default function AppleReauthReturn() {
  const { colors } = useTheme();
  return (
    <Screen center>
      <Text style={{ color: colors.ink }}>
        Retorne à exclusão para conferir o vínculo Apple e confirmar seu pedido. Nenhuma conta é
        excluída apenas por abrir este link.
      </Text>
      <Link href="/excluir-conta" style={{ color: colors.primary, marginTop: 20 }}>
        Voltar à exclusão de conta
      </Link>
    </Screen>
  );
}
