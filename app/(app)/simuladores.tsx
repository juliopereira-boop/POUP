/**
 * O GARFO: dois simuladores, duas perguntas diferentes.
 *
 * ===========================================================================
 * POR QUE UMA TELA SÓ PARA ESCOLHER
 * ===========================================================================
 * "Simulador" virou ambíguo no POUP, e a ambiguidade custa caro no meio de um
 * atendimento. São duas coisas que o corretor faz em momentos diferentes da
 * venda:
 *
 *   **Financiamento** — quanto o BANCO empresta, qual a parcela, se enquadra.
 *                       Vem primeiro, quando o cliente ainda está decidindo se
 *                       consegue comprar.
 *   **Poupança**      — como o saldo é pago à CONSTRUTORA: ato, mensais,
 *                       semestrais, anuais. Vem depois, quando ele já decidiu.
 *
 * Empilhar as duas atrás do mesmo botão fazia o corretor entrar na errada e
 * voltar. Duas portas, com uma frase cada, resolvem — e o custo é um toque a
 * mais só para quem já sabia o que queria.
 *
 * As rotas antigas continuam existindo: `/(app)/simulador` é o fluxo da
 * poupança, intocado. Este arquivo não move nada de lugar, só passa a ser a
 * entrada.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, shadow, spacing, typography, type AppColors } from '@/theme';

interface Porta {
  chave: string;
  titulo: string;
  linha: string;
  detalhe: string;
  icone: IconName;
  rota: Href;
}

const PORTAS: Porta[] = [
  {
    chave: 'financiamento',
    titulo: 'Simulador de financiamento',
    linha: 'Quanto o banco empresta e qual a parcela',
    detalhe:
      'SAC ou PRICE, poder de compra, comparação de cenários e enquadramento estimado. Fica salvo no cliente.',
    icone: 'chart',
    rota: '/(app)/financiamento',
  },
  {
    chave: 'poupanca',
    titulo: 'Simulador de poupança',
    linha: 'Como o saldo é pago à construtora',
    detalhe:
      'Ato, mensais, semestrais e anuais, com a regra de risco da empresa — e a proposta de compra e venda em PDF no fim.',
    icone: 'house',
    rota: '/(app)/simulador',
  },
];

export default function SimuladoresScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.titulo}>Simulador</Text>
      <Text style={styles.sub}>O que você quer simular agora?</Text>

      <View style={styles.lista}>
        {PORTAS.map((p) => (
          <Pressable
            key={p.chave}
            onPress={() => router.push(p.rota)}
            accessibilityRole="button"
            accessibilityLabel={p.titulo}
            style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
          >
            <View style={styles.icone}>
              <Icon name={p.icone} size={24} color={colors.primary} strokeWidth={1.8} />
            </View>
            <View style={styles.texto}>
              <Text style={styles.cartaoTitulo}>{p.titulo}</Text>
              <Text style={styles.cartaoLinha}>{p.linha}</Text>
              <Text style={styles.cartaoDetalhe}>{p.detalhe}</Text>
            </View>
            <Icon name="chevronRight" size={20} color={colors.inkSubtle} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.rodape}>
        Os dois ficam ligados ao mesmo cliente: feito o financiamento, o simulador de poupança já
        abre com o valor informado pelo banco, o subsídio e o FGTS preenchidos.
      </Text>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    titulo: { ...typography.title, color: colors.primary },
    sub: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
    lista: { gap: spacing.lg },
    cartao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    cartaoPressionado: { opacity: 0.85, transform: [{ scale: 0.995 }] },
    icone: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    texto: { flex: 1, gap: 3 },
    cartaoTitulo: { ...typography.heading, color: colors.ink },
    cartaoLinha: { ...typography.body, color: colors.primary, fontWeight: '600' },
    cartaoDetalhe: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },
    rodape: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: spacing.xl,
      lineHeight: 19,
    },
  });
