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
 *   **Poupança**      — como o saldo é pago à CONSTRUTORA: ato, mensais,
 *                       semestrais, anuais.
 *
 * ===========================================================================
 * SÓ OS DOIS NOMES
 * ===========================================================================
 * Os cartões já tiveram uma frase de resumo, um parágrafo de detalhe e um
 * rodapé explicando a ligação entre os dois. Era texto demais para uma tela
 * que o corretor abre com o cliente na frente e só precisa de um toque. Quem
 * usa o POUP sabe a diferença pelo nome; o que sobra é peso para o olho.
 *
 * `/(app)/simulador` continua sendo a poupança e `/(app)/financiamento` o
 * financiamento: esta tela é só a entrada.
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
  icone: IconName;
  rota: Href;
}

const PORTAS: Porta[] = [
  { chave: 'financiamento', titulo: 'Simulador de financiamento', icone: 'chart', rota: '/(app)/financiamento' },
  { chave: 'poupanca', titulo: 'Simulador de poupança', icone: 'house', rota: '/(app)/simulador' },
];

export default function SimuladoresScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  return (
    <Screen>
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
              <Icon name={p.icone} size={26} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={styles.cartaoTitulo}>{p.titulo}</Text>
            <Icon name="chevronRight" size={20} color={colors.inkSubtle} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    lista: { gap: spacing.lg, marginTop: spacing.sm },
    cartao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    cartaoPressionado: { opacity: 0.85, transform: [{ scale: 0.995 }] },
    icone: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    cartaoTitulo: { ...typography.heading, color: colors.ink, flex: 1 },
  });
