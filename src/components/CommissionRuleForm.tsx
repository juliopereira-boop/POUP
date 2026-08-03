import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { ToggleField } from '@/components/ToggleField';
import {
  DEFAULT_COMMISSION_RULE,
  db,
  type CommissionCampaign,
  type CommissionCampaignInput,
  type CommissionRule,
  type CommissionRuleInput,
} from '@/data';
import { resolveRate } from '@/features/comissao/engine';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/* ------------------------------------------------------------------------- *
 * Números e datas em PT-BR
 * ------------------------------------------------------------------------- */

/** Lê número digitado em PT-BR (aceita vírgula e ponto). Vazio/invalido = null. */
export function parseDecimalBR(input: string): number | null {
  const raw = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Mostra número com vírgula decimal e sem zeros à direita. Ex.: 2.5 -> "2,5". */
export function formatDecimalBR(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

function formatPct(value: number | null | undefined): string {
  return value == null ? '—' : `${formatDecimalBR(value)}%`;
}

/** Data de hoje em YYYY-MM-DD pelas partes LOCAIS (nunca via toISOString). */
function todayYmd(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** YYYY-MM-DD -> DD/MM/AAAA, sem passar por Date (fuso não atrapalha). */
function formatYmdBR(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

const ORDINALS = [
  '1ª',
  '2ª',
  '3ª',
  '4ª',
  '5ª',
  '6ª',
  '7ª',
  '8ª',
  '9ª',
  '10ª',
  '11ª',
  '12ª',
  '13ª',
  '14ª',
  '15ª',
  '16ª',
  '17ª',
  '18ª',
  '19ª',
  '20ª',
  '21ª',
  '22ª',
  '23ª',
  '24ª',
];

function ordinal(index: number): string {
  return ORDINALS[index] ?? `${index + 1}ª`;
}

/** Resumo curto para a listagem de empresas. Ex.: "2% · 2x". */
export function describeCommissionRule(rule: CommissionRule | null): string {
  if (!rule) return '—';
  const parcelas = rule.installmentsCount <= 1 ? 'pagamento único' : `${rule.installmentsCount}x`;
  return `${formatPct(rule.defaultPct)} · ${parcelas}`;
}

/* ------------------------------------------------------------------------- *
 * Controller: o estado do formulário mora aqui para a tela poder salvar
 * ------------------------------------------------------------------------- */

export interface CommissionRuleController {
  defaultPct: string;
  setDefaultPct: (v: string) => void;
  installmentsCount: string;
  setInstallmentsCount: (v: string) => void;
  firstPaymentDays: string;
  setFirstPaymentDays: (v: string) => void;
  intervalDays: string;
  setIntervalDays: (v: string) => void;
  useSplit: boolean;
  setUseSplit: (v: boolean) => void;
  split: string[];
  setSplitAt: (index: number, value: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  /** Quantidade de parcelas já validada, ou null enquanto o campo não fecha conta. */
  parsedCount: number | null;
  /** Soma dos percentuais por parcela digitados (para mostrar em tempo real). */
  splitSum: number;
  /** Primeira mensagem de erro em PT-BR, ou null quando está tudo certo. */
  validate: () => string | null;
  /** Monta o payload da regra. Devolve null quando há erro de validação. */
  build: () => CommissionRuleInput | null;
  /** Carrega a regra salva da empresa (ou os padrões, se não houver). */
  loadFor: (companyId: string) => Promise<void>;
  /** Volta tudo para os valores padrão. */
  reset: () => void;
  /** Salva a regra. Devolve mensagem de erro em PT-BR ou null em caso de sucesso. */
  persist: (userId: string, companyId: string) => Promise<string | null>;
}

const MAX_INSTALLMENTS = 24;
const MAX_DAYS = 365;

function fill(count: number, values: number[] | null): string[] {
  return Array.from({ length: count }, (_, i) => formatDecimalBR(values?.[i] ?? null));
}

export function useCommissionRuleForm(): CommissionRuleController {
  const [defaultPct, setDefaultPct] = useState(formatDecimalBR(DEFAULT_COMMISSION_RULE.defaultPct));
  const [installmentsCount, setInstallmentsCount] = useState(
    String(DEFAULT_COMMISSION_RULE.installmentsCount),
  );
  const [firstPaymentDays, setFirstPaymentDays] = useState(
    String(DEFAULT_COMMISSION_RULE.firstPaymentDays),
  );
  const [intervalDays, setIntervalDays] = useState(String(DEFAULT_COMMISSION_RULE.intervalDays));
  const [useSplit, setUseSplit] = useState(false);
  const [split, setSplit] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const parsedCountRaw = parseDecimalBR(installmentsCount);
  const parsedCount =
    parsedCountRaw != null &&
    Number.isInteger(parsedCountRaw) &&
    parsedCountRaw >= 1 &&
    parsedCountRaw <= MAX_INSTALLMENTS
      ? parsedCountRaw
      : null;

  const setSplitAt = useCallback((index: number, value: string) => {
    setSplit((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push('');
      next[index] = value;
      return next;
    });
  }, []);

  const splitSum = useMemo(() => {
    const count = parsedCount ?? 0;
    let total = 0;
    for (let i = 0; i < count; i += 1) total += parseDecimalBR(split[i] ?? '') ?? 0;
    return Math.round(total * 100) / 100;
  }, [parsedCount, split]);

  const validate = useCallback((): string | null => {
    const pct = parseDecimalBR(defaultPct);
    if (pct == null) return 'Informe o percentual padrão de comissão.';
    if (pct < 0 || pct > 100) return 'O percentual de comissão deve estar entre 0 e 100.';

    if (parsedCount == null) {
      return `Em quantas parcelas a comissão é paga? Use um número inteiro de 1 a ${MAX_INSTALLMENTS}.`;
    }

    const first = parseDecimalBR(firstPaymentDays);
    if (first == null || !Number.isInteger(first) || first < 0 || first > MAX_DAYS) {
      return `Os dias até a 1ª parcela devem ser um número inteiro entre 0 e ${MAX_DAYS}.`;
    }

    if (parsedCount > 1) {
      const interval = parseDecimalBR(intervalDays);
      if (interval == null || !Number.isInteger(interval) || interval < 0 || interval > MAX_DAYS) {
        return `O intervalo entre as parcelas deve ser um número inteiro entre 0 e ${MAX_DAYS} dias.`;
      }
    }

    if (useSplit && parsedCount > 1) {
      for (let i = 0; i < parsedCount; i += 1) {
        const value = parseDecimalBR(split[i] ?? '');
        if (value == null) {
          return `Informe o percentual da ${ordinal(i)} parcela da comissão.`;
        }
        if (value < 0 || value > 100) {
          return `O percentual da ${ordinal(i)} parcela deve estar entre 0 e 100.`;
        }
      }
      if (Math.abs(splitSum - 100) > 0.01) {
        return `Os percentuais das parcelas somam ${formatDecimalBR(splitSum)}%. Ajuste para somar exatamente 100%.`;
      }
    }

    return null;
  }, [defaultPct, firstPaymentDays, intervalDays, parsedCount, split, splitSum, useSplit]);

  const build = useCallback((): CommissionRuleInput | null => {
    if (validate() != null) return null;
    const count = parsedCount ?? 1;
    const usarSplit = useSplit && count > 1;
    return {
      defaultPct: parseDecimalBR(defaultPct) ?? 0,
      installmentsCount: count,
      installmentsSplit: usarSplit
        ? Array.from({ length: count }, (_, i) => parseDecimalBR(split[i] ?? '') ?? 0)
        : null,
      firstPaymentDays: parseDecimalBR(firstPaymentDays) ?? 0,
      intervalDays: count > 1 ? (parseDecimalBR(intervalDays) ?? 0) : 0,
      notes: notes.trim() ? notes.trim() : null,
    };
  }, [defaultPct, firstPaymentDays, intervalDays, notes, parsedCount, split, useSplit, validate]);

  const apply = useCallback((input: CommissionRuleInput) => {
    setDefaultPct(formatDecimalBR(input.defaultPct));
    setInstallmentsCount(String(input.installmentsCount));
    setFirstPaymentDays(String(input.firstPaymentDays));
    setIntervalDays(String(input.intervalDays));
    const hasSplit = !!input.installmentsSplit && input.installmentsSplit.length > 0;
    setUseSplit(hasSplit);
    setSplit(hasSplit ? fill(input.installmentsCount, input.installmentsSplit) : []);
    setNotes(input.notes ?? '');
  }, []);

  const reset = useCallback(() => {
    apply(DEFAULT_COMMISSION_RULE);
  }, [apply]);

  const loadFor = useCallback(
    async (companyId: string) => {
      const rule = await db.commissions.getRule(companyId);
      apply(rule ?? DEFAULT_COMMISSION_RULE);
    },
    [apply],
  );

  const persist = useCallback(
    async (userId: string, companyId: string): Promise<string | null> => {
      const invalid = validate();
      if (invalid) return invalid;
      const input = build();
      if (!input) return 'Revise a regra de comissão.';
      const result = await db.commissions.saveRule(userId, companyId, input);
      return result.ok ? null : result.error;
    },
    [build, validate],
  );

  return {
    defaultPct,
    setDefaultPct,
    installmentsCount,
    setInstallmentsCount,
    firstPaymentDays,
    setFirstPaymentDays,
    intervalDays,
    setIntervalDays,
    useSplit,
    setUseSplit,
    split,
    setSplitAt,
    notes,
    setNotes,
    parsedCount,
    splitSum,
    validate,
    build,
    loadFor,
    reset,
    persist,
  };
}

/* ------------------------------------------------------------------------- *
 * Campanhas
 * ------------------------------------------------------------------------- */

type CampaignStatus = 'agora' | 'agendada' | 'encerrada';

function campaignStatus(campaign: CommissionCampaign, today: string): CampaignStatus {
  if (campaign.startsOn > today) return 'agendada';
  if (campaign.endsOn < today) return 'encerrada';
  return 'agora';
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  agora: 'Valendo agora',
  agendada: 'Agendada',
  encerrada: 'Encerrada',
};

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/* ------------------------------------------------------------------------- *
 * Formulário
 * ------------------------------------------------------------------------- */

interface CommissionRuleFormProps {
  controller: CommissionRuleController;
  /** null enquanto a empresa não existir: campanhas só depois de salvar. */
  companyId: string | null;
  /** null enquanto a sessão não carregou. */
  userId: string | null;
}

export function CommissionRuleForm({ controller, companyId, userId }: CommissionRuleFormProps) {
  const styles = useThemedStyles(makeStyles);
  const today = todayYmd();

  const [campaigns, setCampaigns] = useState<CommissionCampaign[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [campaignPct, setCampaignPct] = useState('');
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [campaignSaving, setCampaignSaving] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setCampaigns([]);
      return undefined;
    }
    let alive = true;
    void db.commissions.listCampaigns(companyId).then((list) => {
      if (alive) setCampaigns(list);
    });
    return () => {
      alive = false;
    };
  }, [companyId]);

  const ordered = useMemo(
    () => [...campaigns].sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    [campaigns],
  );

  const ruleInput = controller.build();

  /** O percentual que está valendo hoje, pelo motor de cálculo oficial. */
  const vigente = useMemo(() => {
    if (!ruleInput) return null;
    const rule: CommissionRule = {
      ...ruleInput,
      companyId: companyId ?? '',
      updatedAt: new Date().toISOString(),
    };
    return resolveRate(rule, campaigns, today);
  }, [campaigns, companyId, ruleInput, today]);

  const overlapWarning = useMemo(() => {
    if (!startsOn || !endsOn || endsOn < startsOn) return null;
    const clash = campaigns.find(
      (c) => c.id !== campaignId && rangesOverlap(startsOn, endsOn, c.startsOn, c.endsOn),
    );
    return clash
      ? `Atenção: este período se sobrepõe à campanha "${clash.name}" (${formatYmdBR(clash.startsOn)} a ${formatYmdBR(clash.endsOn)}).`
      : null;
  }, [campaignId, campaigns, endsOn, startsOn]);

  function closeCampaignForm() {
    setFormOpen(false);
    setCampaignId(null);
    setCampaignName('');
    setCampaignPct('');
    setStartsOn(null);
    setEndsOn(null);
    setCampaignError(null);
  }

  function openNewCampaign() {
    closeCampaignForm();
    setFormOpen(true);
  }

  function openEditCampaign(campaign: CommissionCampaign) {
    setFormOpen(true);
    setCampaignId(campaign.id);
    setCampaignName(campaign.name);
    setCampaignPct(formatDecimalBR(campaign.pct));
    setStartsOn(campaign.startsOn);
    setEndsOn(campaign.endsOn);
    setCampaignError(null);
  }

  function validateCampaign(): string | null {
    if (!campaignName.trim()) return 'Informe o nome da campanha.';
    const pct = parseDecimalBR(campaignPct);
    if (pct == null) return 'Informe o percentual da campanha.';
    if (pct < 0 || pct > 100) return 'O percentual da campanha deve estar entre 0 e 100.';
    if (!startsOn || !endsOn) return 'Informe as datas de início e de fim da campanha.';
    if (endsOn < startsOn) return 'A data de fim não pode ser anterior à data de início.';
    return null;
  }

  async function saveCampaign() {
    if (!companyId || !userId) return;
    const invalid = validateCampaign();
    if (invalid) return setCampaignError(invalid);
    if (!startsOn || !endsOn) return;

    const input: CommissionCampaignInput = {
      name: campaignName.trim(),
      pct: parseDecimalBR(campaignPct) ?? 0,
      startsOn,
      endsOn,
    };
    setCampaignSaving(true);
    const result = campaignId
      ? await db.commissions.updateCampaign(campaignId, input)
      : await db.commissions.addCampaign(userId, companyId, input);
    setCampaignSaving(false);
    if (!result.ok) return setCampaignError(result.error);

    const saved = result.data;
    setCampaigns((prev) =>
      campaignId ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved],
    );
    closeCampaignForm();
  }

  function confirmRemoveCampaign(campaign: CommissionCampaign) {
    const doRemove = async () => {
      const result = await db.commissions.removeCampaign(campaign.id);
      if (result.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
        if (campaignId === campaign.id) closeCampaignForm();
      } else {
        setCampaignError(result.error);
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Excluir a campanha "${campaign.name}"?`)) void doRemove();
    } else {
      Alert.alert('Excluir campanha', `Excluir "${campaign.name}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doRemove() },
      ]);
    }
  }

  const count = controller.parsedCount;
  const sumOk = Math.abs(controller.splitSum - 100) <= 0.01;
  // Campanhas são CRUD de lista: só depois de a empresa existir (e com sessão).
  const canManageCampaigns = !!companyId && !!userId;

  return (
    <View>
      <Text style={styles.sectionTitle}>Regra de comissão</Text>

      <Input
        label="Comissão padrão (%)"
        value={controller.defaultPct}
        onChangeText={controller.setDefaultPct}
        placeholder="Ex.: 2"
        keyboardType="decimal-pad"
      />
      <Text style={styles.hint}>
        Percentual sobre o valor da unidade. Vale sempre que nenhuma campanha estiver no prazo.
      </Text>

      {vigente ? (
        <View style={styles.vigenteBox}>
          <Text style={styles.vigenteLabel}>Valendo hoje ({formatYmdBR(today)})</Text>
          <Text style={styles.vigenteValue}>{formatPct(vigente.pct)}</Text>
          <Text style={styles.vigenteSource}>
            {vigente.source === 'campanha' && vigente.campaignName
              ? `Campanha "${vigente.campaignName}"`
              : 'Percentual padrão'}
          </Text>
        </View>
      ) : null}

      <Text style={styles.subTitle}>Campanhas</Text>
      <Text style={styles.hint}>
        Percentual promocional com prazo. Enquanto a campanha estiver valendo, ela substitui o
        percentual padrão.
      </Text>

      {!canManageCampaigns ? (
        <Text style={styles.hint}>
          Salve a empresa primeiro para cadastrar campanhas de comissão. O percentual padrão e a
          forma de pagamento já são salvos junto com a empresa.
        </Text>
      ) : (
        <>
          {ordered.length === 0 ? (
            <Text style={styles.hint}>Nenhuma campanha cadastrada.</Text>
          ) : (
            ordered.map((c) => {
              const status = campaignStatus(c, today);
              return (
                <View key={c.id} style={styles.campaignItem}>
                  <View style={styles.campaignHeader}>
                    <Text style={styles.campaignName}>{c.name}</Text>
                    <View
                      style={[
                        styles.pill,
                        status === 'agora'
                          ? styles.pillNow
                          : status === 'agendada'
                            ? styles.pillNext
                            : styles.pillPast,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          status === 'agora'
                            ? styles.pillTextNow
                            : status === 'agendada'
                              ? styles.pillTextNext
                              : styles.pillTextPast,
                        ]}
                      >
                        {STATUS_LABEL[status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.campaignMeta}>
                    {formatPct(c.pct)} · {formatYmdBR(c.startsOn)} a {formatYmdBR(c.endsOn)}
                  </Text>
                  <View style={styles.campaignActions}>
                    <Pressable onPress={() => openEditCampaign(c)} hitSlop={8}>
                      <Text style={styles.editLink}>Editar</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmRemoveCampaign(c)} hitSlop={8}>
                      <Text style={styles.deleteLink}>Excluir</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}

          {formOpen ? (
            <View style={styles.campaignForm}>
              <Text style={styles.campaignFormTitle}>
                {campaignId ? 'Editar campanha' : 'Nova campanha'}
              </Text>
              {campaignError ? <Text style={styles.error}>{campaignError}</Text> : null}
              {overlapWarning ? <Text style={styles.warning}>{overlapWarning}</Text> : null}
              <Input
                label="Nome da campanha"
                value={campaignName}
                onChangeText={setCampaignName}
                placeholder="Ex.: Campanha de julho"
              />
              <Input
                label="Comissão da campanha (%)"
                value={campaignPct}
                onChangeText={setCampaignPct}
                placeholder="Ex.: 2,5"
                keyboardType="decimal-pad"
              />
              <DateField label="Início" value={startsOn} onChange={setStartsOn} />
              <DateField label="Fim" value={endsOn} onChange={setEndsOn} />
              <View style={styles.rowActions}>
                <Button
                  label="Cancelar"
                  variant="ghost"
                  onPress={closeCampaignForm}
                  style={styles.flex1}
                />
                <Button
                  label={campaignId ? 'Salvar' : 'Adicionar'}
                  variant="secondary"
                  onPress={saveCampaign}
                  loading={campaignSaving}
                  style={styles.flex1}
                />
              </View>
            </View>
          ) : (
            <Button label="Adicionar campanha" variant="secondary" onPress={openNewCampaign} />
          )}
        </>
      )}

      <Text style={styles.subTitle}>Forma de pagamento da comissão</Text>
      <Input
        label="Parcelas da comissão"
        value={controller.installmentsCount}
        onChangeText={controller.setInstallmentsCount}
        placeholder="Ex.: 2"
        keyboardType="number-pad"
      />
      <Text style={styles.hint}>1 = pagamento único. Máximo de {MAX_INSTALLMENTS} parcelas.</Text>
      <Input
        label="Dias até a 1ª parcela"
        value={controller.firstPaymentDays}
        onChangeText={controller.setFirstPaymentDays}
        placeholder="Ex.: 30"
        keyboardType="number-pad"
      />
      {count != null && count > 1 ? (
        <Input
          label="Intervalo entre parcelas (dias)"
          value={controller.intervalDays}
          onChangeText={controller.setIntervalDays}
          placeholder="Ex.: 30"
          keyboardType="number-pad"
        />
      ) : null}

      {count != null && count > 1 ? (
        <>
          <ToggleField
            label="Definir o % de cada parcela"
            value={controller.useSplit}
            onChange={controller.setUseSplit}
          />
          {controller.useSplit ? (
            <>
              <Text style={styles.hint}>
                Cada caso é um caso: informe quanto da comissão cai em cada parcela (ex.: 60 e 40).
                Sem isso, a comissão é dividida igualmente.
              </Text>
              {Array.from({ length: count }, (_, i) => (
                <Input
                  key={i}
                  label={`${ordinal(i)} parcela (%)`}
                  value={controller.split[i] ?? ''}
                  onChangeText={(v) => controller.setSplitAt(i, v)}
                  placeholder="Ex.: 50"
                  keyboardType="decimal-pad"
                />
              ))}
              <Text style={[styles.sum, sumOk ? styles.sumOk : styles.sumBad]}>
                Soma: {formatDecimalBR(controller.splitSum)}%
                {sumOk ? ' — certo' : ' — precisa somar 100%'}
              </Text>
            </>
          ) : (
            <Text style={styles.hint}>
              A comissão é dividida igualmente entre as {count} parcelas.
            </Text>
          )}
        </>
      ) : null}

      <Input
        label="Observações da regra (opcional)"
        value={controller.notes}
        onChangeText={controller.setNotes}
        placeholder="Ex.: 2ª parcela após o repasse do banco"
        multiline
        style={styles.notes}
      />
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    sectionTitle: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    subTitle: {
      ...typography.label,
      color: colors.ink,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    hint: { ...typography.caption, color: colors.inkSubtle, marginBottom: spacing.md },
    vigenteBox: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primary,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    vigenteLabel: { ...typography.caption, color: colors.inkMuted },
    vigenteValue: { ...typography.title, color: colors.primary, marginTop: 2 },
    vigenteSource: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    campaignItem: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    campaignHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    campaignName: { ...typography.body, color: colors.ink, fontWeight: '600', flexShrink: 1 },
    campaignMeta: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
    campaignActions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
    editLink: { ...typography.label, color: colors.primary },
    deleteLink: { ...typography.label, color: colors.danger },
    pill: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    pillNow: { backgroundColor: colors.successSoft },
    pillNext: { backgroundColor: colors.warningSoft },
    pillPast: { backgroundColor: colors.borderStrong },
    pillText: { ...typography.caption, fontWeight: '700' },
    pillTextNow: { color: colors.success },
    pillTextNext: { color: colors.warning },
    pillTextPast: { color: colors.inkMuted },
    campaignForm: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    campaignFormTitle: { ...typography.label, color: colors.ink, marginBottom: spacing.md },
    rowActions: { flexDirection: 'row', gap: spacing.md },
    flex1: { flex: 1 },
    sum: { ...typography.label, marginBottom: spacing.md },
    sumOk: { color: colors.success },
    sumBad: { color: colors.danger },
    notes: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    warning: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
  });
