import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { Icon, type IconName } from '@/components/Icon';
import { InstallAppCard } from '@/components/InstallAppCard';
import { Screen } from '@/components/Screen';
import { WordMark } from '@/components/WordMark';
import { db, isAppointmentLate, type Appointment, type AppointmentType } from '@/data';
import type { PlanFeatureKey } from '@/features/plans';
import { useFeatureAccess } from '@/features/useFeatureAccess';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, shadow, spacing, typography, type AppColors } from '@/theme';

interface ServiceItem {
  key: string;
  label: string;
  icon: IconName;
  route: Href;
  /** Quando definido, o atalho ganha o selo "PRO" se o plano atual não liberar. */
  feature?: PlanFeatureKey;
}

const SERVICES: ServiceItem[] = [
  { key: 'leads', label: 'Leads', icon: 'contacts', route: '/(app)/leads' },
  { key: 'simulador', label: 'Simulador', icon: 'house', route: '/(app)/simulador' },
  { key: 'relatorios', label: 'Relatórios', icon: 'chart', route: '/(app)/relatorios' },
  {
    key: 'material',
    label: 'Material de Venda',
    icon: 'briefcase',
    route: '/(app)/material-venda',
  },
  { key: 'calendario', label: 'Calendário', icon: 'calendar', route: '/(app)/calendario' },
  { key: 'cadastros', label: 'Cadastros', icon: 'building', route: '/(app)/cadastros' },
  {
    key: 'comissao',
    label: 'Comissão',
    icon: 'coins',
    route: '/(app)/comissao',
    feature: 'comissao',
  },
  { key: 'vendas', label: 'Vendas', icon: 'handshake', route: '/(app)/vendas', feature: 'vendas' },
  { key: 'configuracoes', label: 'Ajustes', icon: 'gear', route: '/(app)/configuracoes' },
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(iso: string): string {
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - startOfToday().getTime()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { trialDaysLeft } = useSubscription();
  const { canUse } = useFeatureAccess();
  const { width } = useWindowDimensions();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);

  const columns = width >= 720 ? 4 : 3;
  const firstName = (profile?.fullName ?? user?.displayName ?? user?.email ?? 'corretor')
    .split(' ')[0]
    .split('@')[0];

  const load = useCallback(async () => {
    if (!user?.id) return;
    const from = startOfToday();
    const to = new Date(from.getTime() + 14 * 86400000);
    const [list, tps] = await Promise.all([
      db.appointments.listRange(user.id, from.toISOString(), to.toISOString()),
      db.appointments.listTypes(),
    ]);
    setAppointments(list);
    setTypes(tps);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const typeById = useMemo(() => {
    const map: Record<string, AppointmentType> = {};
    types.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [types]);

  const pending = useMemo(
    () => appointments.filter((a) => a.statusId !== 'concluido' && a.statusId !== 'cancelado'),
    [appointments],
  );

  const todayList = useMemo(() => {
    const limit = startOfToday().getTime() + 86400000;
    return pending.filter((a) => new Date(a.startAt).getTime() < limit);
  }, [pending]);

  const reminders = pending.slice(0, 6);

  return (
    <>
      <View style={styles.header}>
        <WordMark size={26} />
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push('/(app)/calendario')}
            accessibilityLabel="Agenda"
            style={styles.headerBtn}
          >
            <Icon name="bell" size={22} color={colors.ink} />
            {todayList.length > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{todayList.length}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/perfil')}
            accessibilityLabel="Meu perfil"
            style={styles.headerBtn}
          >
            <Icon name="user" size={22} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <Screen>
        <Text style={styles.greeting}>Olá, {firstName}</Text>

        {trialDaysLeft != null ? (
          <Pressable style={styles.trialBanner} onPress={() => router.push('/paywall')}>
            <Text style={styles.trialTitle}>
              {trialDaysLeft === 1
                ? 'Último dia do seu teste gratuito'
                : `Faltam ${trialDaysLeft} dias do seu teste gratuito`}
            </Text>
            <Text style={styles.trialText}>Toque para assinar e não perder o acesso.</Text>
          </Pressable>
        ) : null}

        <InstallAppCard />

        {reminders.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
            style={styles.carouselWrap}
          >
            {reminders.map((a) => {
              const t = typeById[a.typeId];
              const late = isAppointmentLate(a);
              return (
                <Pressable
                  key={a.id}
                  onPress={() =>
                    router.push({ pathname: '/(app)/agendamentos/[id]', params: { id: a.id } })
                  }
                  style={styles.reminder}
                >
                  <View
                    style={[styles.reminderBar, { backgroundColor: t?.cor ?? colors.primary }]}
                  />
                  <View style={styles.reminderBody}>
                    <Text style={styles.reminderType}>
                      {(t?.nome ?? 'Compromisso').toUpperCase()}
                    </Text>
                    <Text style={styles.reminderTitle} numberOfLines={1}>
                      {a.leadName ?? a.title}
                    </Text>
                    <Text style={[styles.reminderWhen, late && styles.reminderLate]}>
                      {late ? '⚠️ ' : ''}
                      {dayLabel(a.startAt)} · {hhmm(a.startAt)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Pressable style={styles.emptyReminder} onPress={() => router.push('/(app)/calendario')}>
            <Icon name="calendar" size={20} color={colors.inkMuted} />
            <Text style={styles.emptyReminderText}>
              Nenhum compromisso por aqui. Toque para abrir sua agenda.
            </Text>
          </Pressable>
        )}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>O que você quer fazer?</Text>
          <View style={styles.grid}>
            {SERVICES.map((s, i) => {
              const featured = i === 0;
              const locked = s.feature ? !canUse(s.feature) : false;
              return (
                <View key={s.key} style={[styles.cell, { width: `${100 / columns}%` }]}>
                  <Pressable
                    onPress={() => router.push(s.route)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.tile,
                      featured && styles.tileFeatured,
                      pressed && styles.tilePressed,
                    ]}
                  >
                    <Icon name={s.icon} size={24} color={featured ? colors.white : colors.navy} />
                    <Text style={[styles.tileLabel, featured && styles.tileLabelFeatured]}>
                      {s.label}
                    </Text>
                    {locked ? (
                      <View style={styles.proTag}>
                        <Text style={styles.proTagText}>PRO</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        {todayList.length > 0 ? (
          <View style={styles.todayBlock}>
            <Text style={styles.sectionTitle}>Hoje</Text>
            {todayList.map((a) => {
              const t = typeById[a.typeId];
              return (
                <Pressable
                  key={a.id}
                  onPress={() =>
                    router.push({ pathname: '/(app)/agendamentos/[id]', params: { id: a.id } })
                  }
                  style={styles.todayRow}
                >
                  <Text style={styles.todayTime}>{hhmm(a.startAt)}</Text>
                  <View style={[styles.todayDot, { backgroundColor: t?.cor ?? colors.primary }]} />
                  <View style={styles.todayMain}>
                    <Text style={styles.todayTitle} numberOfLines={1}>
                      {a.leadName ?? a.title}
                    </Text>
                    <Text style={styles.todayType}>{t?.nome ?? 'Compromisso'}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Screen>
    </>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xxl,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    headerBtn: { padding: spacing.sm },
    badge: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { color: colors.white, fontSize: 10.5, fontWeight: '700' },

    greeting: { ...typography.heading, color: colors.primary, marginBottom: spacing.lg },

    trialBanner: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginBottom: spacing.lg,
      gap: 2,
    },
    trialTitle: { ...typography.label, color: colors.primaryDark },
    trialText: { ...typography.caption, color: colors.inkMuted },

    carouselWrap: { marginHorizontal: -spacing.lg, marginBottom: spacing.xl },
    carousel: { paddingHorizontal: spacing.lg, gap: spacing.md },
    reminder: {
      width: 250,
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadow.card,
    },
    reminderBar: { width: 5 },
    reminderBody: { flex: 1, padding: spacing.lg, gap: 3 },
    reminderType: {
      ...typography.caption,
      color: colors.inkSubtle,
      fontSize: 10.5,
      letterSpacing: 1.1,
      fontWeight: '700',
    },
    reminderTitle: { ...typography.body, color: colors.ink, fontWeight: '600' },
    reminderWhen: { ...typography.caption, color: colors.inkMuted },
    reminderLate: { color: colors.danger, fontWeight: '700' },

    emptyReminder: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    emptyReminderText: { ...typography.caption, color: colors.inkMuted, flex: 1 },

    panel: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    panelTitle: {
      ...typography.heading,
      color: colors.ink,
      fontSize: 17,
      marginBottom: spacing.lg,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
    cell: { padding: spacing.xs },
    tile: {
      aspectRatio: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      justifyContent: 'space-between',
    },
    tileFeatured: { backgroundColor: colors.navy, borderColor: colors.navy },
    tilePressed: { opacity: 0.75 },
    tileLabel: { ...typography.caption, color: colors.ink, fontWeight: '700', fontSize: 12.5 },
    tileLabelFeatured: { color: colors.white },
    proTag: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    proTagText: {
      ...typography.caption,
      fontSize: 9,
      lineHeight: 13,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: colors.primary,
    },

    todayBlock: { marginBottom: spacing.lg },
    sectionTitle: {
      ...typography.heading,
      color: colors.ink,
      fontSize: 17,
      marginBottom: spacing.md,
    },
    todayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
    },
    todayTime: { ...typography.label, color: colors.ink, width: 46 },
    todayDot: { width: 8, height: 8, borderRadius: 4 },
    todayMain: { flex: 1 },
    todayTitle: { ...typography.body, color: colors.ink, fontWeight: '600' },
    todayType: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
  });
