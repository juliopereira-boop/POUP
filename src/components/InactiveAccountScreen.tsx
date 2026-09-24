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
 * Conferir de novo, sair da conta, acessar suporte/privacidade e excluir a
 * conta. A gestão essencial nunca depende de uma assinatura ativa.
 */
import { useState } from 'react';
import { Modal, Text, View, StyleSheet } from 'react-native';

import { Button } from './Button';
import { AccountActions } from './AccountActions';
import { Logo } from './Logo';
import { Screen } from './Screen';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

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
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

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
          Se você acabou de resolver isso, toque em conferir de novo, pode levar alguns instantes
          para aparecer.
        </Text>

        <View style={styles.actions}>
          <Button label="Conferir de novo" onPress={onCheckAgain} loading={checking} />
          <Button
            label="Sair da conta"
            variant="secondary"
            onPress={() => setConfirmingSignOut(true)}
          />
          <AccountActions />
        </View>
      </View>
      <Modal
        visible={confirmingSignOut}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingSignOut(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog} accessibilityRole="alert">
            <Text style={styles.dialogTitle}>Sair da conta?</Text>
            <Text style={styles.dialogText}>
              Você precisará entrar novamente para acessar o POUP neste dispositivo.
            </Text>
            <Button label="Sim, sair" variant="danger" onPress={onSignOut} />
            <Button
              label="Continuar conectado"
              variant="secondary"
              onPress={() => setConfirmingSignOut(false)}
            />
          </View>
        </View>
      </Modal>
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
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    dialog: {
      width: '100%',
      maxWidth: 440,
      gap: spacing.md,
      padding: spacing.xl,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
    },
    dialogTitle: { ...typography.heading, color: colors.ink },
    dialogText: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.sm },
  });
