import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { WordMark } from '@/components/WordMark';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { spacing, typography, type AppColors } from '@/theme';

const APPLE_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const SUPPORT_EMAIL = 'gestao@poupgestao.com';

export default function TermsScreen() {
  const styles = useThemedStyles(makeStyles);
  return (
    <Screen>
      <View style={styles.header}>
        <WordMark size={28} />
      </View>
      <Text style={styles.title}>Termos de Uso</Text>
      <Text style={styles.muted}>Vigentes desde 20 de setembro de 2026</Text>

      <Section title="1. Serviço">
        O Poup Gestão é uma ferramenta de organização para corretores de imóveis. O usuário é
        responsável pela exatidão dos dados inseridos e por possuir base legal para tratar dados de
        seus clientes.
      </Section>
      <Section title="2. Conta">
        A conta é pessoal. Você deve proteger seus dados de acesso e comunicar qualquer uso não
        autorizado. É possível solicitar a exclusão definitiva pelo próprio aplicativo.
      </Section>
      <Section title="3. Assinaturas">
        Os planos Start e Pro são assinaturas mensais com renovação automática. No iOS, pagamento,
        renovação, cancelamento e reembolso são administrados pela Apple conforme as regras da App
        Store. A assinatura pode ser cancelada nos ajustes da Conta Apple; excluir a conta do POUP
        não cancela automaticamente uma assinatura administrada pela loja.
      </Section>
      <Section title="4. Renovação e cancelamento">
        A assinatura renova automaticamente, salvo cancelamento realizado pelo menos 24 horas antes
        do fim do período vigente. O acesso continua até a data de expiração informada pela loja.
      </Section>
      <Section title="5. Uso permitido">
        Não é permitido tentar contornar controles de acesso, explorar o serviço para fins ilegais,
        inserir conteúdo sem autorização ou prejudicar outros usuários e a infraestrutura do POUP.
      </Section>
      <Section title="6. Disponibilidade e suporte">
        Podemos realizar manutenções e corrigir falhas. Para suporte, escreva para {SUPPORT_EMAIL}.
      </Section>

      <Text style={styles.paragraph}>
        No iOS, estes termos complementam a Licença Padrão de Usuário Final da Apple. Em caso de
        conflito relacionado ao uso do aplicativo distribuído pela App Store, prevalece a licença
        aplicável da Apple.
      </Text>
      <Pressable onPress={() => void Linking.openURL(APPLE_EULA)} accessibilityRole="link">
        <Text style={styles.link}>Ler a Licença Padrão da Apple</Text>
      </Pressable>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.paragraph}>{children}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    header: { marginBottom: spacing.xl },
    title: { ...typography.title, color: colors.ink },
    muted: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
    section: { marginTop: spacing.xl },
    sectionTitle: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm },
    paragraph: { ...typography.body, color: colors.inkMuted, lineHeight: 24 },
    link: { ...typography.label, color: colors.primary, marginVertical: spacing.xl },
  });
