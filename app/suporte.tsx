/**
 * Página de suporte — rota pública (fora dos grupos `(auth)`/`(app)`).
 *
 * A App Store Connect exige uma **URL de suporte** que funcione, e a regra 2.1
 * manda que toda URL enviada esteja no ar e completa ("fully functional URLs").
 * Um `mailto:` não serve nesse campo: tem que ser uma página.
 *
 * Precisa ser pública porque o revisor (e qualquer pessoa) abre esse endereço
 * sem estar logado.
 */
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { Screen } from '@/components/Screen';
import { WordMark } from '@/components/WordMark';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const SUPORTE_EMAIL = 'gestao@poupgestao.com';

const PERGUNTAS = [
  {
    q: 'Esqueci minha senha. E agora?',
    a: 'Na tela de entrada, toque em "Esqueci minha senha". Você recebe um link por e-mail para criar uma nova.',
  },
  {
    q: 'Como excluo minha conta?',
    a: 'Dentro do app, em Ajustes → Excluir conta. A exclusão é definitiva e apaga leads, simulações, vendas, comissões e arquivos.',
  },
  {
    q: 'Meus dados aparecem em outro aparelho?',
    a: 'Sim. Tudo fica na sua conta, então basta entrar com o mesmo e-mail em qualquer aparelho.',
  },
  {
    q: 'O app não está abrindo ou está com erro',
    a: 'Confira sua conexão com a internet e feche e abra o app. Se continuar, escreva para a gente com o modelo do aparelho e o que aconteceu.',
  },
];

export default function SupportScreen() {
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen>
      <View style={styles.header}>
        <WordMark size={28} />
      </View>

      <Text style={styles.title}>Suporte</Text>
      <Text style={styles.lead}>
        O POUP é a ferramenta de trabalho do corretor de imóveis: simulação de financiamento, gestão
        de leads, propostas, comissões e material de venda.
      </Text>

      <View style={styles.contactCard}>
        <Text style={styles.contactLabel}>Fale com a gente</Text>
        <Pressable onPress={() => void Linking.openURL(`mailto:${SUPORTE_EMAIL}`)}>
          <Text style={styles.contactEmail}>{SUPORTE_EMAIL}</Text>
        </Pressable>
        <Text style={styles.contactHint}>Respondemos em até 2 dias úteis.</Text>
      </View>

      <Text style={styles.sectionTitle}>Dúvidas frequentes</Text>
      {PERGUNTAS.map((item) => (
        <View key={item.q} style={styles.qa}>
          <Text style={styles.question}>{item.q}</Text>
          <Text style={styles.answer}>{item.a}</Text>
        </View>
      ))}

      <View style={styles.footer}>
        <Link href="/privacidade">
          <Text style={styles.link}>Política de Privacidade</Text>
        </Link>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    header: { marginBottom: spacing.lg },
    title: { ...typography.heading, fontSize: 24, color: colors.ink, marginBottom: spacing.sm },
    lead: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl, lineHeight: 22 },

    contactCard: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.xl,
      gap: 4,
    },
    contactLabel: { ...typography.label, color: colors.ink },
    contactEmail: {
      ...typography.body,
      color: colors.primary,
      textDecorationLine: 'underline',
      fontWeight: '700',
    },
    contactHint: { ...typography.caption, color: colors.inkMuted },

    sectionTitle: {
      ...typography.label,
      fontSize: 16,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    qa: { marginBottom: spacing.lg, gap: 4 },
    question: { ...typography.label, color: colors.ink },
    answer: { ...typography.body, color: colors.inkMuted, lineHeight: 21 },

    footer: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    link: { ...typography.body, color: colors.primary, textDecorationLine: 'underline' },
  });
