import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Screen } from './Screen';
import { PLANS, PLAN_FEATURES, planoMinimoPara, type PlanFeatureKey } from '@/features/plans';
import { canShowBilling } from '@/features/store';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface ProFeatureLockProps {
  emoji: string;
  title: string;
  description: string;
  /**
   * A funcionalidade que o corretor tentou usar.
   *
   * É o que permite apontar o plano CERTO. Sem ela a tela só sabia dizer "Pro",
   * o que com três degraus passou a estar errado na maioria das vezes.
   */
  feature: PlanFeatureKey;
}

/**
 * Estado exibido quando a assinatura atual não dá acesso ao módulo.
 *
 * ===========================================================================
 * ELA APONTA O PLANO MAIS BARATO QUE RESOLVE, NÃO O MAIS CARO
 * ===========================================================================
 * Com dois planos, "assine o Pro" era sempre a resposta. Com três, virou a
 * resposta errada na maioria das vezes: quem está no Start e esbarrou em
 * Vendas precisa do **Intermed** — mandá-lo para o Pro é pedir R$ 30 a mais do
 * que o problema dele custa, e é o jeito mais rápido de perder o upgrade.
 *
 * O plano é derivado da funcionalidade (`planoMinimoPara`), e a lista mostrada
 * é a do que aquele plano acrescenta ao que ele já tem. Nada aqui é escrito à
 * mão, então acrescentar um plano no meio não deixa esta tela mentindo.
 */
export function ProFeatureLock({ emoji, title, description, feature }: ProFeatureLockProps) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { tier, plan } = useSubscription();

  const alvo = planoMinimoPara(feature) ?? PLANS.pro;
  // O que o plano-alvo acrescenta em relação ao plano atual — e não a lista
  // inteira dele, que repetiria coisas que o corretor já usa hoje.
  const ganhos = PLAN_FEATURES.filter(
    (f) => f.includedIn.includes(alvo.tier) && !(tier && f.includedIn.includes(tier)),
  ).map((f) => f.label);
  const atual = plan?.name ?? null;

  return (
    <Screen center>
      <View style={styles.card}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PLANO {alvo.name.toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {/* O preço só aparece fora das lojas: dentro do app publicado, valor e
            botão de assinar são justamente o que a Apple não permite. */}
        {/* O preço só aparece fora das lojas: dentro do app publicado, valor e
            botão de assinar são justamente o que a Apple não permite. */}
        <Text style={styles.notice}>
          {`Este módulo está disponível no plano ${alvo.name}`}
          {canShowBilling ? ` (${alvo.priceLabel})` : ''}
          {atual ? `. Seu plano atual é o ${atual}.` : '.'}
        </Text>

        <View style={styles.list}>
          {ganhos.map((label) => (
            <View key={label} style={styles.row}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.rowText}>{label}</Text>
            </View>
          ))}
        </View>

        {canShowBilling ? (
          <Button
            label={`Assinar o plano ${alvo.name}`}
            onPress={() => router.push({ pathname: '/paywall', params: { upgrade: '1' } })}
            style={styles.cta}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
    },
    emoji: { fontSize: 48, marginBottom: spacing.md },
    badge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      marginBottom: spacing.md,
    },
    badgeText: {
      ...typography.caption,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.primary,
    },
    title: { ...typography.title, color: colors.ink, textAlign: 'center' },
    description: {
      ...typography.body,
      color: colors.inkMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    notice: {
      ...typography.caption,
      color: colors.inkMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    list: {
      alignSelf: 'stretch',
      gap: spacing.sm,
      marginTop: spacing.lg,
      marginBottom: spacing.xl,
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    check: { color: colors.success, fontWeight: '700', fontSize: 14, lineHeight: 18 },
    rowText: { ...typography.label, fontWeight: '400', color: colors.ink, flex: 1 },
    cta: { alignSelf: 'stretch' },
  });
