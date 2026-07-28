import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select, type SelectOption } from '@/components/Select';
import {
  db,
  isAppointmentLate,
  type Appointment,
  type AppointmentPriority,
  type AppointmentStatusInfo,
  type AppointmentType,
  type Company,
  type Development,
  type Lead,
} from '@/data';
import {
  formatDateBR,
  formatTimeISO,
  localISO,
  maskTime,
  ymdFromISO,
} from '@/features/agenda/dates';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const FALLBACK_COLOR = '#6B7280';

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

function confirmRemove(message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert('Excluir agendamento', message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: onConfirm },
  ]);
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDateBR(d)} às ${formatTimeISO(iso)}`;
}

export default function AgendamentoDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = user?.id ?? null;

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [statuses, setStatuses] = useState<AppointmentStatusInfo[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  // Campos editáveis
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<AppointmentPriority>('normal');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);

  // Reagendamento
  const [date, setDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Conclusão / cancelamento
  const [completedNote, setCompletedNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelPane, setCancelPane] = useState(false);

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((data: Appointment) => {
    setAppointment(data);
    setTitle(data.title);
    setTypeId(data.typeId);
    setPriority(data.priority);
    setLocation(data.location ?? '');
    setDescription(data.description ?? '');
    setLeadId(data.leadId);
    setCompanyId(data.companyId);
    setDevelopmentId(data.developmentId);
    setDate(ymdFromISO(data.startAt) || null);
    setStartTime(formatTimeISO(data.startAt));
    setEndTime(data.endAt ? formatTimeISO(data.endAt) : '');
    setCompletedNote(data.completedNote ?? '');
    setCancelReason(data.cancelReason ?? '');
    setCancelPane(false);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const data = await db.appointments.get(id);
    if (data) apply(data);
    else setAppointment(null);
    setLoading(false);

    const [tps, sts] = await Promise.all([
      db.appointments.listTypes(),
      db.appointments.listStatuses(),
    ]);
    setTypes(tps);
    setStatuses(sts);
    if (userId) {
      const [comps, devs, leadList] = await Promise.all([
        db.companies.list(userId),
        db.developments.list(userId),
        db.leads.list(userId),
      ]);
      setCompanies(comps);
      setDevelopments(devs);
      setLeads(leadList);
    }
  }, [id, userId, apply]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const type = useMemo(
    () => types.find((t) => t.id === appointment?.typeId) ?? null,
    [types, appointment],
  );
  const status = useMemo(
    () => statuses.find((s) => s.id === appointment?.statusId) ?? null,
    [statuses, appointment],
  );
  const companyDevs = useMemo(
    () => developments.filter((d) => d.companyId === companyId),
    [developments, companyId],
  );

  const late = appointment ? isAppointmentLate(appointment) : false;
  const done = appointment?.statusId === 'concluido';
  const cancelled = appointment?.statusId === 'cancelado';

  async function refresh() {
    if (!id) return;
    const data = await db.appointments.get(id);
    if (data) apply(data);
  }

  async function onChangeStatus(next: AppointmentStatusInfo) {
    if (!appointment || next.id === appointment.statusId) return;
    setError(null);
    setNotice(null);
    if (next.id === 'cancelado') {
      setCancelPane(true);
      return;
    }
    setBusy(true);
    const res = await db.appointments.setStatus(
      appointment.id,
      next.id,
      next.id === 'concluido' ? { note: completedNote.trim() || null } : undefined,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await refresh();
    setNotice(`Situação alterada para “${next.nome}”.`);
  }

  async function onConclude() {
    if (!appointment) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await db.appointments.setStatus(appointment.id, 'concluido', {
      note: completedNote.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await refresh();
    setNotice('Atendimento concluído.');
  }

  async function onCancelAppointment() {
    if (!appointment) return;
    setError(null);
    setNotice(null);
    if (!cancelReason.trim()) {
      setError('Informe o motivo do cancelamento.');
      return;
    }
    setBusy(true);
    const res = await db.appointments.setStatus(appointment.id, 'cancelado', {
      reason: cancelReason.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await refresh();
    setNotice('Agendamento cancelado.');
  }

  async function onReschedule() {
    if (!appointment) return;
    setError(null);
    setNotice(null);
    if (!date) {
      setError('Escolha a nova data.');
      return;
    }
    const startISO = localISO(date, startTime);
    if (!startISO) {
      setError('Informe a nova hora inicial no formato HH:MM.');
      return;
    }
    let endISO: string | null = null;
    if (endTime.trim()) {
      endISO = localISO(date, endTime);
      if (!endISO) {
        setError('Informe a hora final no formato HH:MM.');
        return;
      }
      if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
        setError('A hora final deve ser depois da hora inicial.');
        return;
      }
    }
    setBusy(true);
    const res = await db.appointments.reschedule(appointment.id, startISO, endISO);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await refresh();
    setNotice('Agendamento remarcado.');
  }

  async function onSaveDetails() {
    if (!appointment) return;
    setError(null);
    setNotice(null);
    if (!title.trim()) {
      setError('Informe o título do agendamento.');
      return;
    }
    setSaving(true);
    const res = await db.appointments.update(appointment.id, {
      title: title.trim(),
      typeId: typeId ?? appointment.typeId,
      priority,
      location: location.trim() || null,
      description: description.trim() || null,
      leadId,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    apply(res.data);
    setNotice('Agendamento atualizado.');
  }

  async function onSelectCompany(value: string) {
    setCompanyId(value);
    setDevelopmentId(null);
    if (!appointment) return;
    setError(null);
    setNotice(null);
    const res = await db.appointments.update(appointment.id, {
      companyId: value,
      developmentId: null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    apply(res.data);
    setNotice('Empresa associada ao agendamento.');
  }

  async function onSelectDevelopment(value: string) {
    setDevelopmentId(value);
    if (!appointment) return;
    setError(null);
    setNotice(null);
    const res = await db.appointments.update(appointment.id, { developmentId: value });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    apply(res.data);
    setNotice('Empreendimento associado ao agendamento.');
  }

  function onRemove() {
    if (!appointment) return;
    confirmRemove(`Excluir o agendamento “${appointment.title}”?`, () => {
      void (async () => {
        setBusy(true);
        const res = await db.appointments.remove(appointment.id);
        setBusy(false);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.back();
      })();
    });
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator style={styles.loader} />
      </Screen>
    );
  }

  if (!appointment) {
    return (
      <Screen>
        <Text style={styles.muted}>Agendamento não encontrado.</Text>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const statusColor = status?.cor ?? FALLBACK_COLOR;

  return (
    <Screen>
      <Stack.Screen options={{ title: appointment.title?.trim() || 'Agendamento' }} />

      <View style={styles.hero}>
        <Text style={styles.heroType}>
          {(type?.icone ? `${type.icone} ` : '') + (type?.nome ?? 'Compromisso').toUpperCase()}
        </Text>
        <Text style={styles.heroTitle} numberOfLines={3}>
          {appointment.title}
        </Text>
        <Text style={[styles.heroWhen, late && styles.lateText]}>
          {late ? '⚠️ ' : ''}
          {formatWhen(appointment.startAt)}
          {appointment.endAt ? ` – ${formatTimeISO(appointment.endAt)}` : ''}
        </Text>
        {appointment.leadName ? (
          <Text style={styles.heroMeta}>Lead: {appointment.leadName}</Text>
        ) : null}
        {appointment.companyName || appointment.developmentName ? (
          <Text style={styles.heroMeta}>
            {[appointment.companyName, appointment.developmentName].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
          <Text style={styles.statusPillText}>{status?.nome ?? appointment.statusId}</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.feedback}>{notice}</Text> : null}
      {late ? <Text style={styles.warn}>⚠️ Este atendimento está atrasado.</Text> : null}

      <Text style={styles.band}>Situação do atendimento</Text>
      {statuses.length === 0 ? (
        <Text style={styles.hint}>Nenhuma situação disponível.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {statuses.map((s) => {
            const active = s.id === appointment.statusId;
            return (
              <Pressable
                key={s.id}
                onPress={() => void onChangeStatus(s)}
                style={({ pressed }) => [
                  styles.chip,
                  active ? { backgroundColor: s.cor, borderColor: s.cor } : { borderColor: s.cor },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.chipText, active ? styles.chipTextActive : { color: s.cor }]}
                  numberOfLines={1}
                >
                  {s.nome}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {cancelPane && !cancelled ? (
        <View style={styles.card}>
          <Input
            label="Motivo do cancelamento"
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder="Ex.: cliente pediu para remarcar"
            multiline
            numberOfLines={3}
            style={styles.textArea}
          />
          <Button
            label="Confirmar cancelamento"
            variant="danger"
            onPress={() => void onCancelAppointment()}
            loading={busy}
          />
          <Button
            label="Voltar"
            variant="ghost"
            onPress={() => setCancelPane(false)}
            style={styles.cardAction}
          />
        </View>
      ) : null}

      {done ? (
        <View style={styles.card}>
          <Text style={styles.doneTitle}>✓ Concluído em {formatWhen(appointment.completedAt)}</Text>
          {appointment.completedNote ? (
            <Text style={styles.hint}>{appointment.completedNote}</Text>
          ) : null}
        </View>
      ) : cancelled ? (
        <View style={styles.card}>
          <Text style={styles.cancelTitle}>Cancelado em {formatWhen(appointment.cancelledAt)}</Text>
          {appointment.cancelReason ? (
            <Text style={styles.hint}>Motivo: {appointment.cancelReason}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.card}>
          <Input
            label="Como foi o atendimento? (opcional)"
            value={completedNote}
            onChangeText={setCompletedNote}
            placeholder="Ex.: cliente gostou do apartamento 302"
            multiline
            numberOfLines={3}
            style={styles.textArea}
          />
          <Button label="✓ Concluir atendimento" onPress={() => void onConclude()} loading={busy} />
        </View>
      )}

      <Text style={styles.band}>Reagendar</Text>
      <View style={styles.card}>
        <DateField label="Nova data" value={date} onChange={setDate} />
        <Input
          label="Hora inicial"
          value={startTime}
          onChangeText={(t) => setStartTime(maskTime(t))}
          placeholder="HH:MM"
          keyboardType="number-pad"
          maxLength={5}
        />
        <Input
          label="Hora final (opcional)"
          value={endTime}
          onChangeText={(t) => setEndTime(maskTime(t))}
          placeholder="HH:MM"
          keyboardType="number-pad"
          maxLength={5}
        />
        <Button label="Salvar novo horário" onPress={() => void onReschedule()} loading={busy} />
      </View>

      <Text style={styles.band}>Empresa e empreendimento</Text>
      <View style={styles.card}>
        <Select
          label="Empresa"
          placeholder="Selecione a empresa"
          value={companyId}
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => void onSelectCompany(v)}
          emptyHint="Nenhuma empresa cadastrada."
          searchable
        />
        <Select
          label="Empreendimento"
          placeholder={companyId ? 'Selecione o empreendimento' : 'Escolha a empresa primeiro'}
          value={developmentId}
          options={companyDevs.map((d) => ({ value: d.id, label: d.name }))}
          onChange={(v) => void onSelectDevelopment(v)}
          emptyHint={
            companyId ? 'Nenhum empreendimento para esta empresa.' : 'Escolha a empresa primeiro.'
          }
          searchable
        />
      </View>

      <Text style={styles.band}>Dados do agendamento</Text>
      <View style={styles.card}>
        <Input
          label="Título"
          value={title}
          onChangeText={setTitle}
          placeholder="Ex.: Visita ao apartamento 302"
        />
        <Select
          label="Tipo"
          placeholder="Escolha o tipo"
          value={typeId}
          options={types.map((t) => ({
            value: t.id,
            label: t.icone ? `${t.icone} ${t.nome}` : t.nome,
          }))}
          onChange={setTypeId}
          emptyHint="Nenhum tipo disponível."
        />
        <Select
          label="Prioridade"
          placeholder="Escolha a prioridade"
          value={priority}
          options={PRIORITY_OPTIONS}
          onChange={(v) => setPriority(v as AppointmentPriority)}
        />
        <Input
          label="Local"
          value={location}
          onChangeText={setLocation}
          placeholder="Ex.: Plantão do empreendimento"
        />
        <Select
          label="Lead vinculado"
          placeholder="Nenhum lead vinculado"
          value={leadId}
          options={leads.map((l) => ({ value: l.id, label: l.name }))}
          onChange={setLeadId}
          emptyHint="Nenhum lead cadastrado."
          searchable
        />
        {leadId ? (
          <Button
            label="Desvincular lead"
            variant="ghost"
            onPress={() => setLeadId(null)}
            style={styles.cardActionTight}
          />
        ) : null}
        <Input
          label="Observações"
          value={description}
          onChangeText={setDescription}
          placeholder="Anotações sobre o atendimento…"
          multiline
          numberOfLines={4}
          style={styles.textArea}
        />
        <Button label="Salvar alterações" onPress={() => void onSaveDetails()} loading={saving} />
      </View>

      {appointment.leadId ? (
        <Button
          label="👤 Abrir ficha do lead"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/(app)/leads/[id]',
              params: { id: appointment.leadId as string },
            })
          }
          style={styles.cardAction}
        />
      ) : null}

      <Button
        label="🗓️ Abrir calendário"
        variant="ghost"
        onPress={() => router.push('/(app)/calendario')}
        style={styles.cardAction}
      />

      <View style={styles.footer}>
        <Button label="Excluir agendamento" variant="danger" onPress={onRemove} loading={busy} />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    loader: { marginTop: spacing.xl },
    muted: { ...typography.body, color: colors.inkSubtle, marginBottom: spacing.lg },
    hero: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    heroType: {
      ...typography.caption,
      color: colors.inkSubtle,
      fontSize: 11,
      letterSpacing: 1.1,
      fontWeight: '700',
    },
    heroTitle: { ...typography.title, color: colors.primary, marginTop: spacing.xs },
    heroWhen: { ...typography.body, color: colors.inkMuted, marginTop: spacing.xs },
    heroMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
    lateText: { color: colors.danger, fontWeight: '700' },
    statusPill: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginTop: spacing.md,
    },
    statusPillText: { ...typography.caption, color: colors.white, fontWeight: '700' },
    band: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    chips: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
    chip: {
      borderWidth: 1.5,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: 'transparent',
    },
    chipText: { ...typography.label },
    chipTextActive: { color: colors.white },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
      marginTop: spacing.sm,
    },
    cardAction: { marginTop: spacing.md },
    cardActionTight: { marginTop: -spacing.sm, marginBottom: spacing.md },
    textArea: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
    hint: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
    doneTitle: { ...typography.label, color: colors.success },
    cancelTitle: { ...typography.label, color: colors.inkMuted },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    feedback: {
      ...typography.caption,
      color: colors.success,
      backgroundColor: colors.successSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    warn: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    footer: { marginTop: spacing.xl },
    pressed: { opacity: 0.6 },
  });
