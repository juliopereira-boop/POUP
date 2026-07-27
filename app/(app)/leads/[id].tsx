import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import {
  db,
  type Appointment,
  type AppointmentStatusInfo,
  type AppointmentType,
  type Company,
  type Development,
  type Lead,
  type LeadStage,
  type StorageEntry,
} from '@/data';
import { localISO, maskTime } from '@/features/agenda/dates';
import { currencyToNumber, formatCPF, formatCurrencyBRL, formatPhone } from '@/lib/masks';
import { sessionStorage } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const MAX_FILE_MB = 20;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const PREFILL_KEY = 'simulador:prefill';

const SOURCE_LABEL: Record<Lead['source'], string> = {
  landing: 'Página de captação',
  whatsapp: 'WhatsApp',
  prospeccao: 'Prospecção',
  meta: 'Facebook/Instagram',
  manual: 'Manual',
};

interface PickedFile {
  name: string;
  blob: Blob;
  contentType: string;
  size: number;
}

interface WebFile {
  name: string;
  type: string;
  size: number;
}
interface WebInput {
  type: string;
  multiple: boolean;
  onchange: (() => void) | null;
  click: () => void;
  files: ArrayLike<WebFile> | null;
}

function pickFilesWeb(): Promise<PickedFile[]> {
  const doc = (globalThis as unknown as { document?: { createElement: (t: string) => WebInput } })
    .document;
  if (!doc) return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      const list = input.files ? Array.from(input.files as ArrayLike<WebFile>) : [];
      resolve(
        list.map((f) => ({
          name: f.name,
          blob: f as unknown as Blob,
          contentType: f.type || 'application/octet-stream',
          size: f.size,
        })),
      );
    };
    input.click();
  });
}

async function pickFilesNative(): Promise<PickedFile[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (res.canceled) return [];
  const out: PickedFile[] = [];
  for (const a of res.assets) {
    const r = await fetch(a.uri);
    const blob = await r.blob();
    out.push({
      name: a.fileName ?? `arquivo-${Date.now()}.jpg`,
      blob,
      contentType: blob.type || 'image/jpeg',
      size: blob.size,
    });
  }
  return out;
}

function pickFiles(): Promise<PickedFile[]> {
  return Platform.OS === 'web' ? pickFilesWeb() : pickFilesNative();
}

function formatSize(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function incomeToMasked(value: number | null): string {
  if (value == null) return '';
  return formatCurrencyBRL(String(Math.round(value * 100)));
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LeadDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = user?.id ?? null;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [statuses, setStatuses] = useState<AppointmentStatusInfo[]>([]);
  const [files, setFiles] = useState<StorageEntry[]>([]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [income, setIncome] = useState('');
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [busyFiles, setBusyFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apptOpen, setApptOpen] = useState(false);

  const filesPath = id ? `leads/${id}` : null;

  const applyLead = useCallback((data: Lead) => {
    setLead(data);
    setName(data.name);
    setPhone(formatPhone(data.phone));
    setEmail(data.email ?? '');
    setCpf(data.cpf ? formatCPF(data.cpf) : '');
    setIncome(incomeToMasked(data.income));
    setBirthDate(data.birthDate);
    setNotes(data.notes ?? '');
    setCompanyId(data.companyId);
    setDevelopmentId(data.developmentId);
  }, []);

  const loadFiles = useCallback(async () => {
    if (!userId || !filesPath) return;
    setFiles(await db.material.list(userId, filesPath));
  }, [userId, filesPath]);

  const loadAppointments = useCallback(async () => {
    if (!userId || !id) return;
    setAppointments(await db.appointments.listByLead(userId, id));
  }, [userId, id]);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    setLoading(true);
    const [data, stageList, comps, devs] = await Promise.all([
      db.leads.get(id),
      db.leads.listStages(userId),
      db.companies.list(userId),
      db.developments.list(userId),
    ]);
    if (data) applyLead(data);
    setStages(stageList.length > 0 ? stageList : await db.leads.seedDefaultStages(userId));
    setCompanies(comps);
    setDevelopments(devs);
    setLoading(false);
    const [apptTypes, apptStatuses] = await Promise.all([
      db.appointments.listTypes(),
      db.appointments.listStatuses(),
    ]);
    setTypes(apptTypes);
    setStatuses(apptStatuses);
    await Promise.all([loadAppointments(), loadFiles()]);
  }, [userId, id, applyLead, loadAppointments, loadFiles]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const companyDevs = useMemo(
    () => developments.filter((d) => d.companyId === companyId),
    [developments, companyId],
  );

  const currentStage = useMemo(
    () => stages.find((s) => s.id === lead?.stageId) ?? null,
    [stages, lead],
  );

  async function onSelectStage(stage: LeadStage) {
    if (!lead || stage.id === lead.stageId) return;
    const previous = lead.stageId;
    setLead({ ...lead, stageId: stage.id });
    const res = await db.leads.update(lead.id, { stageId: stage.id });
    if (!res.ok) {
      setLead((prev) => (prev ? { ...prev, stageId: previous } : prev));
      setError(res.error);
      return;
    }
    setError(null);
    applyLead(res.data);
  }

  async function onSaveData() {
    if (!lead) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    const res = await db.leads.update(lead.id, {
      name: name.trim() || lead.name,
      phone: phone.replace(/\D/g, ''),
      email: email.trim() || null,
      cpf: cpf.replace(/\D/g, '') || null,
      income: income.trim() ? currencyToNumber(income) : null,
      birthDate: birthDate || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyLead(res.data);
    setNotice('Dados do cliente salvos.');
  }

  async function onSelectCompany(value: string) {
    setCompanyId(value);
    setDevelopmentId(null);
    if (!lead) return;
    const res = await db.leads.update(lead.id, { companyId: value, developmentId: null });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyLead(res.data);
  }

  async function onSelectDevelopment(value: string) {
    setDevelopmentId(value);
    if (!lead) return;
    const res = await db.leads.update(lead.id, { developmentId: value });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    applyLead(res.data);
  }

  async function onSimular() {
    if (!lead) return;
    // Automação: simular move o lead para a etapa marcada como "de simulação".
    // Disparado sem bloquear para não atrasar a navegação para o simulador.
    if (userId) {
      const simStage = stages.find((s) => s.isSimulacao) ?? null;
      if (simStage && simStage.id !== lead.stageId) {
        setLead({ ...lead, stageId: simStage.id });
      }
      void db.leads.moveToFlaggedStage(userId, lead.id, 'simulacao');
    }
    await sessionStorage.setItem(
      PREFILL_KEY,
      JSON.stringify({
        leadId: lead.id,
        companyId,
        developmentId,
        proponent1: {
          name: name.trim(),
          cpf: cpf.trim(),
          email: email.trim(),
          contact: phone.trim(),
          rendaBruta: income.trim(),
        },
      }),
    );
    router.push({ pathname: '/(app)/simulador', params: { leadId: lead.id } });
  }

  function onWhatsApp() {
    if (!lead) return;
    const digits = lead.phone.replace(/\D/g, '');
    if (!digits) {
      setError('Este lead não tem telefone cadastrado.');
      return;
    }
    void Linking.openURL(`https://wa.me/55${digits}`);
  }

  async function onUpload() {
    if (!userId || !filesPath) return;
    setError(null);
    let picked: PickedFile[] = [];
    try {
      picked = await pickFiles();
    } catch {
      setError('Não foi possível abrir o seletor de arquivos.');
      return;
    }
    if (picked.length === 0) return;
    const okFiles = picked.filter((f) => f.size <= MAX_FILE_BYTES);
    const tooBig = picked.length - okFiles.length;
    if (tooBig > 0) {
      setError(`${tooBig} arquivo(s) acima do limite de ${MAX_FILE_MB} MB foram ignorados.`);
    }
    if (okFiles.length === 0) return;
    setBusyFiles(true);
    let firstErr: string | null = null;
    for (const f of okFiles) {
      const res = await db.material.upload(userId, filesPath, f.name, f.blob, f.contentType);
      if (!res.ok && !firstErr) firstErr = res.error;
    }
    setBusyFiles(false);
    if (firstErr) setError(firstErr);
    await loadFiles();
  }

  async function onOpenFile(entry: StorageEntry) {
    const url = await db.material.signedUrl(entry.path);
    if (url) void Linking.openURL(url);
    else setError('Não foi possível abrir o arquivo.');
  }

  function onRemoveFile(entry: StorageEntry) {
    const doRemove = async () => {
      setBusyFiles(true);
      const res = await db.material.remove(entry.path, false);
      setBusyFiles(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await loadFiles();
    };
    const msg = `Excluir "${entry.name}"?`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(msg)) void doRemove();
    } else {
      Alert.alert('Excluir arquivo', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doRemove() },
      ]);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator style={styles.loader} />
      </Screen>
    );
  }

  if (!lead) {
    return (
      <Screen>
        <Text style={styles.muted}>Lead não encontrado.</Text>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: lead.name?.trim() || 'Lead' }} />

      <View style={styles.hero}>
        <Text style={styles.heroName} numberOfLines={2}>
          {lead.name}
        </Text>
        <Text style={styles.heroPhone}>{formatPhone(lead.phone)}</Text>
        <Text style={styles.heroMeta}>
          {SOURCE_LABEL[lead.source]} · cadastrado em {formatCreatedAt(lead.createdAt)}
        </Text>
        {currentStage ? (
          <View style={[styles.heroStage, { backgroundColor: currentStage.cor }]}>
            <Text style={styles.heroStageText}>{currentStage.nome}</Text>
          </View>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.feedback}>{notice}</Text> : null}

      <Text style={styles.band}>Situação</Text>
      {stages.length === 0 ? (
        <Text style={styles.hint}>Nenhuma etapa disponível.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pipeline}
        >
          {stages.map((s) => {
            const active = s.id === lead.stageId;
            return (
              <Pressable
                key={s.id}
                onPress={() => void onSelectStage(s)}
                style={({ pressed }) => [
                  styles.stageChip,
                  active
                    ? { backgroundColor: s.cor, borderColor: s.cor }
                    : { borderColor: s.cor },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.stageChipText, active ? styles.stageChipTextActive : { color: s.cor }]}
                  numberOfLines={1}
                >
                  {s.nome}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Text style={styles.band}>Dados do cliente</Text>
      <View style={styles.card}>
        <Input label="Nome" value={name} onChangeText={setName} autoCapitalize="words" />
        <Input
          label="Telefone"
          value={phone}
          onChangeText={(t) => setPhone(formatPhone(t))}
          placeholder="(00) 00000-0000"
          keyboardType="phone-pad"
        />
        <Input
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="cliente@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="CPF"
          value={cpf}
          onChangeText={(t) => setCpf(formatCPF(t))}
          placeholder="000.000.000-00"
          keyboardType="number-pad"
        />
        <Input
          label="Renda mensal"
          value={income}
          onChangeText={(t) => setIncome(formatCurrencyBRL(t))}
          placeholder="R$ 0,00"
          keyboardType="number-pad"
        />
        <DateField label="Data de nascimento" value={birthDate} onChange={setBirthDate} />
        <Input
          label="Observações"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anotações sobre o atendimento…"
          multiline
          numberOfLines={4}
          style={styles.textArea}
        />
        <Button label="Salvar dados" onPress={() => void onSaveData()} loading={saving} />
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
        />
      </View>

      <Button label="🧮 Simular para este lead" onPress={() => void onSimular()} />

      <Text style={styles.band}>Agendamentos do lead</Text>
      <View style={styles.card}>
        {appointments.length === 0 ? (
          <Text style={styles.hint}>Nenhum agendamento para este lead.</Text>
        ) : (
          appointments.map((a) => {
            const type = types.find((t) => t.id === a.typeId) ?? null;
            const status = statuses.find((s) => s.id === a.statusId) ?? null;
            return (
              <View key={a.id} style={styles.apptRow}>
                <View style={styles.apptMain}>
                  <Text style={styles.apptTitle} numberOfLines={1}>
                    {type?.icone ? `${type.icone} ` : ''}
                    {a.title}
                  </Text>
                  <Text style={styles.apptMeta}>
                    {type?.nome ?? 'Agendamento'} · {formatWhen(a.startAt)}
                  </Text>
                </View>
                <Text style={[styles.apptStatus, status ? { color: status.cor } : null]}>
                  {status?.nome ?? a.statusId}
                </Text>
              </View>
            );
          })
        )}
        <Button
          label="+ Novo agendamento"
          variant="secondary"
          onPress={() => setApptOpen(true)}
          style={styles.cardAction}
        />
      </View>

      <Text style={styles.band}>Arquivos do cliente</Text>
      <View style={styles.card}>
        {files.length === 0 ? (
          <Text style={styles.hint}>Nenhum arquivo enviado ainda.</Text>
        ) : (
          files
            .filter((f) => !f.isFolder)
            .map((f) => (
              <View key={f.path} style={styles.fileRow}>
                <Pressable
                  style={({ pressed }) => [styles.fileMain, pressed && styles.pressed]}
                  onPress={() => void onOpenFile(f)}
                  accessibilityRole="button"
                >
                  <Text style={styles.fileIcon}>📄</Text>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {f.name}
                    </Text>
                    <Text style={styles.fileMeta}>{formatSize(f.size)}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => onRemoveFile(f)} hitSlop={8} accessibilityLabel="Excluir">
                  <Text style={styles.fileIcon}>🗑️</Text>
                </Pressable>
              </View>
            ))
        )}
        <Text style={styles.hint}>Máx. {MAX_FILE_MB} MB por arquivo.</Text>
        <Button
          label="⬆️ Enviar arquivo"
          variant="secondary"
          onPress={() => void onUpload()}
          loading={busyFiles}
          style={styles.cardAction}
        />
      </View>

      <View style={styles.footer}>
        <Button label="💬 Abrir no WhatsApp" onPress={onWhatsApp} />
      </View>

      {apptOpen ? (
        <NovoAgendamentoModal
          userId={userId}
          leadId={lead.id}
          leadName={lead.name}
          types={types}
          onClose={() => setApptOpen(false)}
          onSaved={() => {
            setApptOpen(false);
            // Recarrega o lead também: criar agendamento move a etapa automaticamente.
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function NovoAgendamentoModal({
  userId,
  leadId,
  leadName,
  types,
  onClose,
  onSaved,
}: {
  userId: string | null;
  leadId: string;
  leadName: string;
  types: AppointmentType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [title, setTitle] = useState(`Contato com ${leadName}`);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!userId) return;
    setError(null);
    if (!title.trim()) return setError('Informe o título do agendamento.');
    if (!date) return setError('Escolha a data do agendamento.');
    const startAt = localISO(date, time);
    if (!startAt) return setError('Informe a hora no formato HH:MM.');

    setSaving(true);
    const res = await db.appointments.create(userId, {
      title: title.trim(),
      typeId: typeId ?? types[0]?.id ?? 'outro',
      startAt,
      leadId,
      source: 'lead',
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
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Fechar">
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

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
            <DateField label="Data" value={date} onChange={setDate} />
            <Input
              label="Hora"
              value={time}
              onChangeText={(t) => setTime(maskTime(t))}
              placeholder="00:00"
              keyboardType="number-pad"
            />

            <Button label="Salvar agendamento" onPress={() => void onSave()} loading={saving} />
            <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.cardAction} />
          </ScrollView>
        </View>
      </View>
    </Modal>
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
    heroName: { ...typography.title, color: colors.primary },
    heroPhone: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
    heroMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
    heroStage: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginTop: spacing.md,
    },
    heroStageText: { ...typography.caption, color: colors.white, fontWeight: '700' },
    band: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    pipeline: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
    stageChip: {
      borderWidth: 1.5,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: 'transparent',
    },
    stageChipText: { ...typography.label },
    stageChipTextActive: { color: colors.white },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    cardAction: { marginTop: spacing.md },
    textArea: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
    hint: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.sm },
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
    apptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    apptMain: { flex: 1 },
    apptTitle: { ...typography.body, color: colors.ink, fontWeight: '600' },
    apptMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
    apptStatus: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    fileMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
    fileIcon: { fontSize: 18 },
    fileInfo: { flex: 1 },
    fileName: { ...typography.body, color: colors.ink, fontWeight: '600' },
    fileMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
    footer: { marginTop: spacing.xl },
    pressed: { opacity: 0.6 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '92%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    sheetTitle: { ...typography.heading, color: colors.ink, flex: 1 },
    sheetClose: { ...typography.heading, color: colors.inkMuted },
  });
