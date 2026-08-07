/**
 * O que o corretor vê, no app das lojas, quando a assinatura não está ativa.
 *
 * ------------------------------------------------------------------
 * POR QUE ESTA TELA É TÃO SECA
 * ------------------------------------------------------------------
 * Tudo que falta aqui está faltando de propósito. Não tem preço, não tem botão
 * "Assinar", não tem link para o site, e não diz onde assinar. A Apple não
 * proíbe só cobrar por fora: proíbe **apontar o caminho** para a cobrança de
 * fora. Um "acesse nosso site para assinar" é exatamente o que derruba a
 * revisão — e derrubaria o app inteiro por causa de uma frase.
 *
 * Quem usa pelo navegador continua vendo o paywall normal, com os planos e o
 * Stripe. Esta tela existe só para o aplicativo das lojas.
 *
 * ------------------------------------------------------------------
 * O QUE SOBRA PARA O CORRETOR FAZER
 * ------------------------------------------------------------------
 * Conferir de novo (a assinatura pode ter sido ativada agora, em outro
 * aparelho) e sair da conta. É pouco, e é o preço de não vender pela loja.
 */
import { Text, View, StyleSheet } from 'react-native';

import { Button } from './Button';
import { Logo } from './Logo';
import { Screen } from './Screen';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { spacing, typography, type AppColors } from '@/theme';

interface InactiveAccountScreenProps {
  /** Recarrega a assinatura do servidor. */
  onCheckAgain: () => void;
  checking: boolean;
  onSignOut: () => void;
  /** O teste gratuito acabou (muda só o texto, não o que dá para fazer). */
  trialExpired: boolean;
}

export function InactiveAccountScreen({
  onCheckAgain,
  checking,
  onSignOut,
  trialExpired,
}: InactiveAccountScreenProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen center>
      <View style={styles.wrap}>
        <Logo size={44} />
        <Text style={styles.title}>
          {trialExpired ? 'Seu período de teste terminou' : 'Assinatura não está ativa'}
        </Text>
        <Text style={styles.text}>
          Esta conta não tem uma assinatura ativa no momento, então o POUP fica indisponível por
          aqui.
        </Text>
        <Text style={styles.hint}>
          Se você acabou de resolver isso, toque em conferir de novo — pode levar alguns instantes
          para aparecer.
        </Text>

        <View style={styles.actions}>
          <Button label="Conferir de novo" onPress={onCheckAgain} loading={checking} />
          <Button label="Sair da conta" variant="secondary" onPress={onSignOut} />
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
    title: {
      ...typography.heading,
      color: colors.ink,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    text: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
    hint: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center' },
    actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
  });
