import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from './Button';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { GUIDE_STEPS } from '@/features/guideSteps';
import { guideSeenKey, registerGuideOpener } from '@/features/guide';
import { sessionStorage } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const TOTAL = GUIDE_STEPS.length;

export function WelcomeGuide() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { profile, needsOnboarding, loading } = useProfile();

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const checked = useRef<string | null>(null);

  const open = useCallback(() => {
    setStep(0);
    setVisible(true);
  }, []);

  useEffect(() => {
    registerGuideOpener(open);
    return () => registerGuideOpener(null);
  }, [open]);

  // Primeira vez: só depois de o cadastro estar completo, para não empilhar
  // duas telas em cima da outra.
  useEffect(() => {
    if (!user || loading || needsOnboarding) return;
    if (checked.current === user.id) return;
    checked.current = user.id;
    void sessionStorage.getItem(guideSeenKey(user.id)).then((seen) => {
      if (!seen) open();
    });
  }, [user, loading, needsOnboarding, open]);

  function animateTo(next: number) {
    Animated.timing(fade, {
      toValue: 0,
      duration: 110,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setStep(next);
      Animated.timing(fade, {
        toValue: 1,
        duration: 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }

  async function finish(goToCadastros: boolean) {
    if (user) await sessionStorage.setItem(guideSeenKey(user.id), '1');
    setVisible(false);
    if (goToCadastros) router.push('/(app)/cadastros');
  }

  const current = GUIDE_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOTAL - 1;
  const primeiroNome = profile?.fullName?.trim().split(' ')[0] ?? null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => void finish(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Logo size={30} />
            <View style={styles.headerSpacer} />
            <Pressable onPress={() => void finish(false)} hitSlop={10}>
              <Text style={styles.skip}>Pular</Text>
            </Pressable>
          </View>

          <View style={styles.progressRow}>
            {GUIDE_STEPS.map((s, i) => (
              <View
                key={s.title}
                style={[
                  styles.progressBar,
                  i === step && styles.progressBarActive,
                  i < step && styles.progressBarDone,
                ]}
              />
            ))}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}
          >
            <Animated.View style={{ opacity: fade }}>
              <View style={styles.iconBox}>
                <Icon name={current.icon} size={34} color={colors.primary} strokeWidth={1.7} />
              </View>

              <Text style={styles.stepCount}>
                Passo {step + 1} de {TOTAL}
              </Text>

              {current.where ? (
                <View style={styles.wherePill}>
                  <Text style={styles.whereText}>{current.where}</Text>
                </View>
              ) : null}

              <Text style={styles.title}>
                {isFirst && primeiroNome ? `${current.title}, ${primeiroNome}` : current.title}
              </Text>
              <Text style={styles.description}>{current.description}</Text>

              {current.bullets?.length ? (
                <View style={styles.bullets}>
                  {current.bullets.map((b) => (
                    <View key={b} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{b}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Animated.View>
          </ScrollView>

          <View style={styles.footer}>
            {isLast ? (
              <>
                <Button label="Começar pelos cadastros" onPress={() => void finish(true)} />
                <Pressable onPress={() => void finish(false)} hitSlop={8}>
                  <Text style={styles.laterLink}>Explorar por conta própria</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.navRow}>
                {isFirst ? null : (
                  <Button
                    label="Voltar"
                    variant="secondary"
                    onPress={() => animateTo(step - 1)}
                    style={styles.navBtn}
                  />
                )}
                <Button
                  label={isFirst ? 'Vamos começar' : 'Avançar'}
                  onPress={() => animateTo(step + 1)}
                  style={styles.navBtn}
                />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      height: '92%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    headerSpacer: { flex: 1 },
    progressRow: { flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: spacing.lg },
    progressBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    progressBarDone: { backgroundColor: colors.primarySoft },
    progressBarActive: { backgroundColor: colors.primary },
    skip: { ...typography.caption, color: colors.inkMuted, fontWeight: '600', flexShrink: 0 },

    scrollBody: { flexGrow: 1, justifyContent: 'center', paddingBottom: spacing.lg },
    iconBox: {
      width: 68,
      height: 68,
      borderRadius: radius.lg,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    stepCount: {
      ...typography.caption,
      color: colors.inkSubtle,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    wherePill: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    whereText: { ...typography.caption, color: colors.primaryDark, fontWeight: '700' },
    title: {
      ...typography.title,
      color: colors.ink,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    description: { ...typography.body, color: colors.inkMuted, lineHeight: 23 },
    bullets: { marginTop: spacing.lg, gap: spacing.md },
    bulletRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    bulletDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginTop: 7,
    },
    bulletText: { ...typography.body, color: colors.ink, flex: 1, lineHeight: 22 },

    footer: { gap: spacing.md, paddingTop: spacing.md },
    navRow: { flexDirection: 'row', gap: spacing.md },
    navBtn: { flex: 1 },
    laterLink: {
      ...typography.caption,
      color: colors.inkMuted,
      textAlign: 'center',
      fontWeight: '600',
    },
  });
