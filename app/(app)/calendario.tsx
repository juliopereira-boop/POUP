import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

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
  type Lead,
} from '@/data';
import {
  WEEKDAYS,
  addDays,
  addMonths,
  dateKey,
  endOfDay,
  endOfWeek,
  formatDateBR,
  formatDayLabel,
  formatMonthLabel,
  formatShortDate,
  formatTimeISO,
  formatWeekLabel,
  isSameDay,
  localISO,
  maskTime,
  monthGrid,
  monthGridStart,
  normalize,
  overlaps,
  startOfDay,
  startOfWeek,
  weekDays,
  ymdFromISO,
} from '@/features/agenda/dates';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

type ViewMode = 'mes' | 'semana' | 'dia';

const SEGMENTS: { value: ViewMode; label: string }[] = [
  { value: 'mes', label: 'Mês' },
  { value: 'semana', label: 'Semana' },
  { value: 'dia', label: 'Dia' },
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const FALLBACK_COLOR = '#6B7280';

function confirmDelete(message: string, onConfirm: () => void) {
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

export default function CalendarioScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [mode, setMode] = useState<ViewMode>('mes');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [statuses, setStatuses] = useState<AppointmentStatusInfo[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Appointment | null>(null);

  const range = useMemo(() => {
    if (mode === 'mes') {
      const start = monthGridStart(anchor);
      return { startISO: start.toISOString(), endISO: endOfDay(addDays(start, 41)).toISOString() };
    }
    if (mode === 'semana') {
      return {
        startISO: startOfWeek(anchor).toISOString(),
        endISO: endOfWeek(anchor).toISOString(),
      };
    }
    return {
      startISO: startOfDay(selected).toISOString(),
      endISO: endOfDay(selected).toISOString(),
    };
  }, [mode, anchor, selected]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setItems(await db.appointments.listRange(userId, range.startISO, range.endISO));
    setLoading(false);
  }, [userId, range.startISO, range.endISO]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!userId) return;
    void db.appointments.listTypes().then(setTypes);
    void db.appointments.listStatuses().then(setStatuses);
    void db.leads.list(userId).then(setLeads);
  }, [userId]);

  const typeMap = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const statusMap = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const item of items) {
      const key = dateKey(new Date(item.startAt));
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    map.forEach((list) => list.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return map;
  }, [items]);

  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const today = useMemo(() => startOfDay(new Date()), []);

  function goPrev() {
    if (mode === 'mes') {
      setAnchor((a) => addMonths(a, -1));
      return;
    }
    if (mode === 'semana') {
      setAnchor((a) => addDays(a, -7));
      return;
    }
    const next = addDays(selected, -1);
    setSelected(next);
    setAnchor(next);
  }

  function goNext() {
    if (mode === 'mes') {
      setAnchor((a) => addMonths(a, 1));
      return;
    }
    if (mode === 'semana') {
      setAnchor((a) => addDays(a, 7));
      return;
    }
    const next = addDays(selected, 1);
    setSelected(next);
    setAnchor(next);
  }

  function goToday() {
    const now = startOfDay(new Date());
    setAnchor(now);
    setSelected(now);
  }

  function onPickDay(day: Date) {
    setSelected(day);
    setAnchor(day);
  }

  const periodLabel =
    mode === 'mes'
      ? formatMonthLabel(anchor)
      : mode === 'semana'
        ? formatWeekLabel(anchor)
        : formatDayLabel(selected);

  const selectedItems = byDay.get(dateKey(selected)) ?? [];

  return (
    <Screen>
      <Text style={styles.title}>Calendário</Text>

      <View style={styles.segment}>
        {SEGMENTS.map((seg) => (
          <Pressable
            key={seg.value}
            style={[styles.segmentItem, mode === seg.value && styles.segmentItemActive]}
            onPress={() => setMode(seg.value)}
          >
            <Text style={[styles.segmentText, mode === seg.value && styles.segmentTextActive]}>
              {seg.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.header}>
        <Pressable onPress={goPrev} style={styles.navBtn} accessibilityLabel="Período anterior">
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.periodLabel} numberOfLines={1}>
          {periodLabel}
        </Text>
        <Pressable onPress={goNext} style={styles.navBtn} accessibilityLabel="Próximo período">
          <Text style={styles.navText}>›</Text>
        </Pressable>
        <Pressable onPress={goToday} style={styles.todayBtn}>
          <Text style={styles.todayText}>Hoje</Text>
        </Pressable>
      </View>

      <Button
        label="+ Novo agendamento"
        onPress={() => setCreating(true)}
        style={styles.newButton}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : mode === 'mes' ? (
        <View>
          <View style={styles.weekHeader}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekHeaderText}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((cell) => {
              const key = dateKey(cell.date);
              const dayItems = byDay.get(key) ?? [];
              const isSelected = isSameDay(cell.date, selected);
              return (
                <Pressable
                  key={key}
                  style={[styles.cell, isSelected && styles.cellSelected]}
                  onPress={() => onPickDay(cell.date)}
                >
                  <Text
                    style={[
                      styles.cellDay,
                      !cell.inMonth && styles.cellDayMuted,
                      isSameDay(cell.date, today) && styles.cellDayToday,
                    ]}
                  >
                    {cell.date.getDate()}
                  </Text>
                  <View style={styles.dots}>
                    {dayItems.slice(0, 4).map((item) => (
                      <View
                        key={item.id}
                        style={[
                          styles.dot,
                          { backgroundColor: typeMap.get(item.typeId)?.cor ?? FALLBACK_COLOR },
                        ]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Compromissos de {formatDateBR(selected)}</Text>
          {selectedItems.length === 0 ? (
            <Text style={styles.emptyLine}>Nenhum compromisso neste dia.</Text>
          ) : (
            selectedItems.map((item) => (
              <AppointmentCard
                key={item.id}
                item={item}
                type={typeMap.get(item.typeId)}
                onPress={() => setDetail(item)}
              />
            ))
          )}
        </View>
      ) : mode === 'semana' ? (
        <View>
          {weekDays(anchor).map((day) => {
            const key = dateKey(day);
            const dayItems = byDay.get(key) ?? [];
            return (
              <View key={key} style={styles.weekBlock}>
                <Pressable
                  onPress={() => {
                    onPickDay(day);
                    setMode('dia');
                  }}
                >
                  <Text
                    style={[
                      styles.weekBlockTitle,
                      isSameDay(day, today) && styles.weekBlockTitleToday,
                    ]}
                  >
                    {WEEKDAYS[day.getDay()]}, {formatShortDate(day)}
                  </Text>
                </Pressable>
                {dayItems.length === 0 ? (
                  <Text style={styles.emptyLine}>Sem compromissos</Text>
                ) : (
                  dayItems.map((item) => (
                    <AppointmentCard
                      key={item.id}
                      item={item}
                      type={typeMap.get(item.typeId)}
                      onPress={() => setDetail(item)}
                    />
                  ))
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <View>
          {selectedItems.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyText}>
                Nenhum compromisso para este dia. Toque em “+ Novo agendamento” para criar.
              </Text>
            </View>
          ) : (
            selectedItems.map((item) => (
              <AppointmentCard
                key={item.id}
                item={item}
                type={typeMap.get(item.typeId)}
                onPress={() => setDetail(item)}
              />
            ))
          )}
        </View>
      )}

      {creating ? (
        <CreateModal
          userId={userId}
          types={types}
          leads={leads}
          initialDate={dateKey(selected)}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}

      {detail ? (
        <DetailModal
          key={detail.id}
          appointment={detail}
          type={typeMap.get(detail.typeId)}
          statusName={statusMap.get(detail.statusId)?.nome ?? detail.statusId}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function AppointmentCard({
  item,
  type,
  onPress,
}: {
  item: Appointment;
  type: AppointmentType | undefined;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const late = isAppointmentLate(item);
  const meta = [type?.nome, item.leadName, item.location].filter(Boolean).join(' · ');

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={[styles.cardBar, { backgroundColor: type?.cor ?? FALLBACK_COLOR }]} />
      <View style={styles.cardMain}>
        <Text style={[styles.cardTime, late && styles.lateText]}>
          {formatTimeISO(item.startAt)}
          {item.endAt ? ` – ${formatTimeISO(item.endAt)}` : ''}
          {late ? ' ⚠️ Atrasado' : ''}
        </Text>
        <Text style={[styles.cardTitle, late && styles.lateText]} numberOfLines={1}>
          {type?.icone ? `${type.icone} ` : ''}
          {item.title}
        </Text>
        {meta ? (
          <Text style={styles.cardMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function CreateModal({
  userId,
  types,
  leads,
  initialDate,
  onClose,
  onSaved,
}: {
  userId: string | null;
  types: AppointmentType[];
  leads: Lead[];
  initialDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(initialDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<string | null>('normal');
  const [leadQuery, setLeadQuery] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const leadMatches = useMemo(() => {
    const q = normalize(leadQuery.trim());
    if (leadId || q.length < 2) return [];
    return leads.filter((l) => normalize(l.name).includes(q)).slice(0, 6);
  }, [leads, leadQuery, leadId]);

  useEffect(() => {
    if (!userId || !date) {
      setConflict(null);
      return;
    }
    const startISO = localISO(date, startTime);
    if (!startISO) {
      setConflict(null);
      return;
    }
    const endISO = endTime.trim() ? localISO(date, endTime) : null;
    let active = true;
    const day = new Date(startISO);
    void db.appointments
      .listRange(userId, startOfDay(day).toISOString(), endOfDay(day).toISOString())
      .then((list) => {
        if (!active) return;
        const clash = list.find(
          (a) => a.statusId !== 'cancelado' && overlaps(startISO, endISO, a.startAt, a.endAt),
        );
        setConflict(clash ? `Já existe “${clash.title}” às ${formatTimeISO(clash.startAt)}.` : null);
      });
    return () => {
      active = false;
    };
  }, [userId, date, startTime, endTime]);

  async function onSave() {
    if (!userId) return;
    setError(null);
    if (!title.trim()) return setError('Informe o título do agendamento.');
    if (!date) return setError('Escolha a data do agendamento.');
    const startISO = localISO(date, startTime);
    if (!startISO) return setError('Informe a hora inicial no formato HH:MM.');
    let endISO: string | null = null;
    if (endTime.trim()) {
      endISO = localISO(date, endTime);
      if (!endISO) return setError('Informe a hora final no formato HH:MM.');
      if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
        return setError('A hora final deve ser depois da hora inicial.');
      }
    }

    setSaving(true);
    const res = await db.appointments.create(userId, {
      title: title.trim(),
      description: notes.trim() || null,
      typeId: typeId ?? types[0]?.id ?? 'outro',
      leadId,
      startAt: startISO,
      endAt: endISO,
      location: location.trim() || null,
      priority: (priority as AppointmentPriority | null) ?? 'normal',
    });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Novo agendamento</Text>
            <Pressable onPress={onClose} accessibilityLabel="Fechar">
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {conflict ? <Text style={styles.warn}>⚠️ {conflict}</Text> : null}

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
            />
            <DateField label="Data" value={date} onChange={setDate} />
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
            <Input
              label="Local (opcional)"
              value={location}
              onChangeText={setLocation}
              placeholder="Endereço ou ponto de referência"
            />

            <Input
              label="Lead vinculado (opcional)"
              value={leadQuery}
              onChangeText={(t) => {
                setLeadQuery(t);
                setLeadId(null);
              }}
              placeholder="Digite o nome do lead"
            />
            {leadId ? (
              <Pressable
                onPress={() => {
                  setLeadId(null);
                  setLeadQuery('');
                }}
              >
                <Text style={styles.leadClear}>✕ Remover vínculo</Text>
              </Pressable>
            ) : leadMatches.length > 0 ? (
              <View style={styles.leadList}>
                {leadMatches.map((l) => (
                  <Pressable
                    key={l.id}
                    style={styles.leadOption}
                    onPress={() => {
                      setLeadId(l.id);
                      setLeadQuery(l.name);
                    }}
                  >
                    <Text style={styles.leadOptionText} numberOfLines={1}>
                      {l.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : leadQuery.trim().length >= 2 ? (
              <Text style={styles.leadEmpty}>Nenhum lead encontrado com esse nome.</Text>
            ) : null}

            <Select
              label="Prioridade (opcional)"
              placeholder="Normal"
              value={priority}
              options={PRIORITY_OPTIONS}
              onChange={setPriority}
            />
            <Input
              label="Observações (opcional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Detalhes do compromisso"
              multiline
              numberOfLines={3}
              style={styles.textArea}
            />

            <Button label="Salvar agendamento" onPress={() => void onSave()} loading={saving} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailModal({
  appointment,
  type,
  statusName,
  onClose,
  onChanged,
}: {
  appointment: Appointment;
  type: AppointmentType | undefined;
  statusName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [pane, setPane] = useState<'none' | 'reagendar' | 'cancelar'>('none');
  const [date, setDate] = useState<string | null>(ymdFromISO(appointment.startAt) || null);
  const [startTime, setStartTime] = useState(formatTimeISO(appointment.startAt));
  const [endTime, setEndTime] = useState(appointment.endAt ? formatTimeISO(appointment.endAt) : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const late = isAppointmentLate(appointment);
  const done = appointment.statusId === 'concluido';
  const cancelled = appointment.statusId === 'cancelado';
  const start = new Date(appointment.startAt);

  async function onConclude() {
    setError(null);
    setBusy(true);
    const res = await db.appointments.setStatus(appointment.id, 'concluido');
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onChanged();
  }

  async function onReschedule() {
    setError(null);
    if (!date) return setError('Escolha a nova data.');
    const startISO = localISO(date, startTime);
    if (!startISO) return setError('Informe a nova hora inicial no formato HH:MM.');
    let endISO: string | null = null;
    if (endTime.trim()) {
      endISO = localISO(date, endTime);
      if (!endISO) return setError('Informe a hora final no formato HH:MM.');
      if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
        return setError('A hora final deve ser depois da hora inicial.');
      }
    }
    setBusy(true);
    const res = await db.appointments.reschedule(appointment.id, startISO, endISO);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onChanged();
  }

  async function onCancelAppointment() {
    setError(null);
    if (!reason.trim()) return setError('Informe o motivo do cancelamento.');
    setBusy(true);
    const res = await db.appointments.setStatus(appointment.id, 'cancelado', {
      reason: reason.trim(),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onChanged();
  }

  function onDelete() {
    confirmDelete(`Excluir o agendamento “${appointment.title}”?`, () => {
      void (async () => {
        setBusy(true);
        const res = await db.appointments.remove(appointment.id);
        setBusy(false);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onChanged();
      })();
    });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={2}>
              {type?.icone ? `${type.icone} ` : ''}
              {appointment.title}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Fechar">
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {late ? <Text style={styles.warn}>⚠️ Este compromisso está atrasado.</Text> : null}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Quando</Text>
              <Text style={[styles.detailValue, late && styles.lateText]}>
                {formatDateBR(start)} às {formatTimeISO(appointment.startAt)}
                {appointment.endAt ? ` – ${formatTimeISO(appointment.endAt)}` : ''}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Tipo</Text>
              <Text style={styles.detailValue}>{type?.nome ?? appointment.typeId}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Situação</Text>
              <Text style={styles.detailValue}>{statusName}</Text>
            </View>
            {appointment.leadName ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Lead</Text>
                <Text style={styles.detailValue}>{appointment.leadName}</Text>
              </View>
            ) : null}
            {appointment.location ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Local</Text>
                <Text style={styles.detailValue}>{appointment.location}</Text>
              </View>
            ) : null}
            {appointment.description ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Observações</Text>
                <Text style={styles.detailValue}>{appointment.description}</Text>
              </View>
            ) : null}
            {appointment.cancelReason ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Motivo do cancelamento</Text>
                <Text style={styles.detailValue}>{appointment.cancelReason}</Text>
              </View>
            ) : null}

            {pane === 'reagendar' ? (
              <View style={styles.pane}>
                <DateField label="Nova data" value={date} onChange={setDate} />
                <Input
                  label="Nova hora inicial"
                  value={startTime}
                  onChangeText={(t) => setStartTime(maskTime(t))}
                  placeholder="HH:MM"
                  keyboardType="number-pad"
                  maxLength={5}
                />
                <Input
                  label="Nova hora final (opcional)"
                  value={endTime}
                  onChangeText={(t) => setEndTime(maskTime(t))}
                  placeholder="HH:MM"
                  keyboardType="number-pad"
                  maxLength={5}
                />
                <Button
                  label="Salvar novo horário"
                  onPress={() => void onReschedule()}
                  loading={busy}
                />
              </View>
            ) : null}

            {pane === 'cancelar' ? (
              <View style={styles.pane}>
                <Input
                  label="Motivo do cancelamento"
                  value={reason}
                  onChangeText={setReason}
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
              </View>
            ) : null}

            <View style={styles.actions}>
              {!done && !cancelled ? (
                <Button
                  label="✓ Concluir"
                  onPress={() => void onConclude()}
                  loading={busy}
                  style={styles.actionBtn}
                />
              ) : null}
              <Button
                label="Reagendar"
                variant="secondary"
                onPress={() => setPane(pane === 'reagendar' ? 'none' : 'reagendar')}
                style={styles.actionBtn}
              />
              {!cancelled ? (
                <Button
                  label="Cancelar"
                  variant="secondary"
                  onPress={() => setPane(pane === 'cancelar' ? 'none' : 'cancelar')}
                  style={styles.actionBtn}
                />
              ) : null}
              <Button
                label="Excluir"
                variant="danger"
                onPress={onDelete}
                style={styles.actionBtn}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.lg },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: 3,
      marginBottom: spacing.lg,
    },
    segmentItem: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      alignItems: 'center',
    },
    segmentItemActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentText: { ...typography.label, color: colors.inkMuted },
    segmentTextActive: { color: colors.primary },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    navBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navText: { ...typography.heading, color: colors.ink, lineHeight: 22 },
    periodLabel: { ...typography.heading, color: colors.ink, flex: 1, textAlign: 'center' },
    todayBtn: {
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    todayText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    newButton: { marginBottom: spacing.lg },
    loader: { marginTop: spacing.xl },

    weekHeader: { flexDirection: 'row', marginBottom: spacing.xs },
    weekHeaderText: {
      width: '14.2857%',
      textAlign: 'center',
      ...typography.caption,
      color: colors.inkSubtle,
      fontWeight: '700',
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
      width: '14.2857%',
      height: 54,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: spacing.xs,
      borderRadius: radius.sm,
    },
    cellSelected: { backgroundColor: colors.primarySoft },
    cellDay: { ...typography.caption, color: colors.ink, fontWeight: '600' },
    cellDayMuted: { color: colors.inkSubtle, fontWeight: '400' },
    cellDayToday: { color: colors.primary, fontWeight: '700' },
    dots: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 2,
      marginTop: 4,
      maxWidth: 34,
    },
    dot: { width: 6, height: 6, borderRadius: 3 },

    sectionTitle: {
      ...typography.label,
      color: colors.inkMuted,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    emptyLine: { ...typography.caption, color: colors.inkSubtle, marginBottom: spacing.sm },
    empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
    emptyEmoji: { fontSize: 40 },
    emptyText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },

    weekBlock: { marginBottom: spacing.lg },
    weekBlockTitle: { ...typography.label, color: colors.ink, marginBottom: spacing.sm },
    weekBlockTitleToday: { color: colors.primary },

    card: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
      overflow: 'hidden',
    },
    cardBar: { width: 4 },
    cardMain: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
    cardTime: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
    cardTitle: { ...typography.body, color: colors.ink, fontWeight: '600', marginTop: 1 },
    cardMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
    lateText: { color: colors.danger },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.55)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: 640,
      maxHeight: '92%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    sheetTitle: { ...typography.heading, color: colors.ink, flex: 1 },
    sheetClose: { ...typography.heading, color: colors.inkMuted },

    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
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
    textArea: { minHeight: 80, paddingTop: spacing.md, textAlignVertical: 'top' },

    leadClear: {
      ...typography.caption,
      color: colors.danger,
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
    },
    leadList: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    leadOption: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    leadOptionText: { ...typography.body, color: colors.ink },
    leadEmpty: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
    },

    detailRow: { marginBottom: spacing.md },
    detailLabel: { ...typography.caption, color: colors.inkSubtle },
    detailValue: { ...typography.body, color: colors.ink, marginTop: 1 },
    pane: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.lg,
      marginTop: spacing.sm,
    },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
    actionBtn: { flexGrow: 1, flexBasis: '45%' },
  });
