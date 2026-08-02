import { useCallback, useState } from 'react';
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

import { Button } from '@/components/Button';
import {
  CommissionFields,
  commissionFromPercent,
  formatPercent,
  percentToNumber,
} from '@/components/CommissionFields';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { ProFeatureLock } from '@/components/ProFeatureLock';
import { SaleStatusPill } from '@/components/SaleStatusPill';
import { Screen } from '@/components/Screen';
import { db, type Sale, type SaleInput } from '@/data';
import { dateKey } from '@/features/agenda/dates';
import {
  cancelCommissionForDistrato,
  ensureCommissionForSale,
  revertCommissionCancellation,
} from '@/features/comissao/link';
import { FEATURES } from '@/features/registry';
import { useFeatureAccess } from '@/features/useFeatureAccess';
import { currencyToNumber, formatCPF, formatCurrencyBRL, formatPhone } from '@/lib/masks';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const feature = FEATURES.find((f) => f.key === 'vendas')!;

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Data em YYYY-MM-DD lida pelas partes locais — nunca por `new Date(iso)`. */
function dateBR(ymd: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

/** Timestamp completo (createdAt, originStartedAt): aí o horário existe. */
function timestampBR(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function moneyOrDash(value: number | null): string {
  return value == null ? 'Não informado' : brl(value);
}

function toMasked(value: number | null): string {
  if (value == null || value <= 0) return '';
  return formatCurrencyBRL(String(Math.round(value * 100)));
}

function digitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

export default function VendaDetailScreen() {
  const { canUse } = useFeatureAccess();

  if (!canUse('vendas')) {
    return (
      <ProFeatureLock
        emoji={feature.emoji}
        title={feature.title}
        description={feature.description}
      />
    );
  }

  return <VendaContent />;
}

function VendaContent() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [distratoOpen, setDistratoOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const found = await db.sales.get(id);
    setSale(found);
    setLoading(false);
    // Rede de segurança: se o lançamento da comissão falhou no momento do
    // registro da venda, é aqui que ele acontece. `ensureCommissionForSale` é
    // idempotente, então abrir a tela várias vezes não duplica nada.
    if (found && userId && found.status === 'ativa') {
      void ensureCommissionForSale(userId, found);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function onWhatsApp() {
    const digits = digitsOnly(sale?.clientPhone ?? '');
    if (!digits) return;
    void Linking.openURL(`https://wa.me/55${digits}`);
  }

  async function onRevertDistrato() {
    if (!sale) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await db.sales.setStatus(sale.id, 'ativa', {
      distratoDate: null,
      distratoReason: null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSale(res.data);
    void revertCommissionCancellation(sale.id);
    setNotice('Distrato revertido: a venda voltou a contar como ativa.');
  }

  function confirmRevertDistrato() {
    const msg = 'Reverter o distrato e voltar a venda para ativa?';
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(msg)) void onRevertDistrato();
    } else {
      Alert.alert('Reverter distrato', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reverter', onPress: () => void onRevertDistrato() },
      ]);
    }
  }

  function onDelete() {
    if (!sale) return;
    const doDelete = async () => {
      setBusy(true);
      const res = await db.sales.remove(sale.id);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.back();
    };
    const msg = `Excluir a venda de "${sale.clientName}"? Ela sai dos indicadores e do histórico.`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(msg)) void doDelete();
    } else {
      Alert.alert('Excluir venda', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doDelete() },
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

  if (!sale) {
    return (
      <Screen>
        <Text style={styles.muted}>Venda não encontrada.</Text>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const distratada = sale.status === 'distratada';
  const phoneDigits = digitsOnly(sale.clientPhone ?? '');
  const composicao = [
    sale.financedValue,
    sale.subsidyValue,
    sale.fgtsValue,
    sale.ownResourcesValue,
  ].filter((v): v is number => v != null);
  const somaComposicao = composicao.reduce((acc, v) => acc + v, 0);
  const diferenca = composicao.length > 0 ? sale.saleValue - somaComposicao : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: sale.clientName.trim() || 'Venda' }} />

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroClient} numberOfLines={2}>
            {sale.clientName}
          </Text>
          <SaleStatusPill status={sale.status} />
        </View>
        <Text style={styles.heroDev} numberOfLines={2}>
          {sale.developmentName?.trim() || 'Empreendimento não informado'}
          {sale.companyName ? `  ·  ${sale.companyName}` : ''}
        </Text>
        <Text style={styles.heroUnit}>
          {sale.block != null ? `Bloco/Quadra ${sale.block}` : 'Bloco não informado'}
          {'  ·  '}
          {sale.unit ? `Unidade ${sale.unit}` : 'Unidade não informada'}
        </Text>
        <View style={styles.heroValueWrap}>
          <Text style={styles.heroValueLabel}>Valor da venda</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            {brl(sale.saleValue)}
          </Text>
          <Text style={styles.heroDate}>Fechada em {dateBR(sale.saleDate)}</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.feedback}>{notice}</Text> : null}

      {distratada ? (
        <View style={styles.distratoBanner}>
          <Text style={styles.distratoTitle}>Venda distratada</Text>
          <Text style={styles.distratoMeta}>Data do distrato: {dateBR(sale.distratoDate)}</Text>
          <Text style={styles.distratoMeta}>Motivo: {sale.distratoReason?.trim() || '—'}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Editar venda"
          variant="secondary"
          onPress={() => {
            setError(null);
            setNotice(null);
            setEditOpen(true);
          }}
          style={styles.actionBtn}
        />
        {distratada ? (
          <Button
            label="Reverter distrato"
            onPress={confirmRevertDistrato}
            loading={busy}
            style={styles.actionBtn}
          />
        ) : (
          <Button
            label="Marcar distrato"
            variant="danger"
            onPress={() => {
              setError(null);
              setNotice(null);
              setDistratoOpen(true);
            }}
            style={styles.actionBtn}
          />
        )}
      </View>

      <Text style={styles.band}>Cliente</Text>
      <View style={styles.card}>
        <Row label="Nome" value={sale.clientName} />
        <Row label="CPF" value={sale.clientCpf ? formatCPF(sale.clientCpf) : '—'} />
        <Row label="Telefone" value={phoneDigits ? formatPhone(phoneDigits) : '—'} />
        <Row label="E-mail" value={sale.clientEmail ?? '—'} last />
      </View>
      {phoneDigits ? (
        <Button label="💬 Abrir no WhatsApp" onPress={onWhatsApp} style={styles.blockBtn} />
      ) : null}

      <Text style={styles.band}>Composição do pagamento</Text>
      <View style={styles.card}>
        <Row label="Financiamento" value={moneyOrDash(sale.financedValue)} />
        <Row label="Subsídio" value={moneyOrDash(sale.subsidyValue)} />
        <Row label="FGTS" value={moneyOrDash(sale.fgtsValue)} />
        <Row label="Recursos próprios" value={moneyOrDash(sale.ownResourcesValue)} />
        <Row label="Soma informada" value={composicao.length > 0 ? brl(somaComposicao) : '—'} last />
      </View>
      {composicao.length > 0 && Math.abs(diferenca) >= 1 ? (
        <Text style={styles.hint}>
          {diferenca > 0
            ? `Faltam ${brl(diferenca)} para fechar o valor da venda (cupom, desconto ou valor não informado).`
            : `A soma passa o valor da venda em ${brl(Math.abs(diferenca))}.`}
        </Text>
      ) : null}

      <Text style={styles.band}>Comissão</Text>
      <View style={styles.card}>
        <Row
          label="Percentual"
          value={sale.commissionPct != null ? `${formatPercent(sale.commissionPct)}%` : '—'}
        />
        <Row label="Valor" value={moneyOrDash(sale.commissionValue)} last />
      </View>

      <Text style={styles.band}>Origem e histórico</Text>
      <View style={styles.card}>
        <Row label="Início do atendimento" value={timestampBR(sale.originStartedAt)} />
        <Row label="Venda registrada em" value={timestampBR(sale.createdAt)} />
        <Row label="Última alteração" value={timestampBR(sale.updatedAt)} last />
      </View>
      {sale.simulationId ? (
        <Button
          label="📄 Abrir simulação de origem"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/(app)/relatorios/[id]',
              params: { id: sale.simulationId },
            })
          }
          style={styles.blockBtn}
        />
      ) : null}
      {sale.leadId ? (
        <Button
          label="👤 Abrir lead do cliente"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/(app)/leads/[id]',
              params: { id: sale.leadId },
            })
          }
          style={styles.blockBtn}
        />
      ) : null}

      <Text style={styles.band}>Observações</Text>
      <View style={styles.card}>
        <Text style={styles.notes}>{sale.notes?.trim() || 'Nenhuma observação registrada.'}</Text>
      </View>

      <View style={styles.deleteWrap}>
        <Button label="Excluir venda" variant="danger" onPress={onDelete} />
      </View>

      {editOpen ? (
        <EditarVendaModal
          sale={sale}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setEditOpen(false);
            setSale(updated);
            setNotice('Venda atualizada.');
          }}
        />
      ) : null}

      {distratoOpen ? (
        <DistratoModal
          sale={sale}
          onClose={() => setDistratoOpen(false)}
          onSaved={(updated) => {
            setDistratoOpen(false);
            setSale(updated);
            setNotice('Distrato registrado: a venda saiu do VGV ativo.');
          }}
        />
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------------- *
 * Edição dos campos editáveis
 * ------------------------------------------------------------------------- */

function EditarVendaModal({
  sale,
  onClose,
  onSaved,
}: {
  sale: Sale;
  onClose: () => void;
  onSaved: (sale: Sale) => void;
}) {
  const styles = useThemedStyles(makeStyles);

  const [saleDate, setSaleDate] = useState<string>(sale.saleDate);
  const [saleValue, setSaleValue] = useState<string>(toMasked(sale.saleValue));
  const [block, setBlock] = useState<string>(sale.block != null ? String(sale.block) : '');
  const [unit, setUnit] = useState<string>(sale.unit ?? '');
  const [percent, setPercent] = useState<string>(formatPercent(sale.commissionPct));
  const [commission, setCommission] = useState<string>(toMasked(sale.commissionValue));
  const [notes, setNotes] = useState<string>(sale.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saleValueNumber = currencyToNumber(saleValue);

  /** Mesma regra do registro: a % manda, a comissão em R$ acompanha. */
  function onChangeSaleValue(text: string) {
    const masked = formatCurrencyBRL(text);
    setSaleValue(masked);
    if (percent.trim()) setCommission(commissionFromPercent(currencyToNumber(masked), percent));
  }

  async function onSave() {
    setError(null);
    if (!saleDate) {
      setError('Informe a data da venda.');
      return;
    }
    if (saleValueNumber <= 0) {
      setError('Informe o valor da venda.');
      return;
    }

    const patch: Partial<SaleInput> = {
      saleDate,
      saleValue: saleValueNumber,
      block: block.trim() ? Number(digitsOnly(block)) : null,
      unit: unit.trim() || null,
      commissionPct: percent.trim() ? percentToNumber(percent) : null,
      commissionValue: commission.trim() ? currencyToNumber(commission) : null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    const res = await db.sales.update(sale.id, patch);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved(res.data);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Editar venda</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Fechar">
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <DateField label="Data da venda" value={saleDate} onChange={setSaleDate} />
            <Input
              label="Valor da venda"
              value={saleValue}
              onChangeText={onChangeSaleValue}
              placeholder="R$ 0,00"
              keyboardType="number-pad"
            />
            <View style={styles.row}>
              <View style={styles.col}>
                <Input
                  label="Bloco / Quadra"
                  value={block}
                  onChangeText={(t) => setBlock(digitsOnly(t).slice(0, 4))}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Unidade"
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="Ex.: 302"
                  autoCapitalize="characters"
                />
              </View>
            </View>
            <CommissionFields
              saleValue={saleValueNumber}
              percent={percent}
              commission={commission}
              onChange={(next) => {
                setPercent(next.percent);
                setCommission(next.commission);
              }}
            />
            <Input
              label="Observações"
              value={notes}
              onChangeText={setNotes}
              placeholder="Contrato, correspondente, prazos…"
              multiline
              numberOfLines={3}
              style={styles.textArea}
            />

            <Button label="Salvar alterações" onPress={() => void onSave()} loading={saving} />
            <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.sheetCancel} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------------- *
 * Distrato
 * ------------------------------------------------------------------------- */

function DistratoModal({
  sale,
  onClose,
  onSaved,
}: {
  sale: Sale;
  onClose: () => void;
  onSaved: (sale: Sale) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [date, setDate] = useState<string>(sale.distratoDate ?? dateKey(new Date()));
  const [reason, setReason] = useState<string>(sale.distratoReason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    if (!date) {
      setError('Informe a data do distrato.');
      return;
    }
    if (!reason.trim()) {
      setError('Descreva o motivo do distrato.');
      return;
    }
    setSaving(true);
    const res = await db.sales.setStatus(sale.id, 'distratada', {
      distratoDate: date,
      distratoReason: reason.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // A comissão acompanha: parcelas pendentes viram canceladas. O que já foi
    // recebido não é mexido — quem decide sobre devolução é o corretor.
    void cancelCommissionForDistrato(sale.id);
    onSaved(res.data);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Marcar distrato</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Fechar">
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.sheetHint}>
              A venda continua no histórico, mas sai do VGV e da comissão do período.
            </Text>

            <DateField label="Data do distrato" value={date} onChange={setDate} />
            <Input
              label="Motivo"
              value={reason}
              onChangeText={setReason}
              placeholder="Ex.: crédito reprovado na assinatura do contrato"
              multiline
              numberOfLines={3}
              style={styles.textArea}
            />

            <Button label="Confirmar distrato" onPress={() => void onSave()} loading={saving} />
            <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.sheetCancel} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.rowItem, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value?.trim() ? value : '—'}
      </Text>
    </View>
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
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    heroClient: { ...typography.title, color: colors.primary, flexShrink: 1 },
    heroDev: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
    heroUnit: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
    heroValueWrap: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    heroValueLabel: { ...typography.caption, color: colors.inkMuted },
    heroValue: { ...typography.display, color: colors.primary },
    heroDate: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },

    distratoBanner: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.danger,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    distratoTitle: { ...typography.label, color: colors.danger },
    distratoMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },

    actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
    actionBtn: { flex: 1 },
    blockBtn: { marginTop: spacing.md },

    band: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
    },
    rowItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.lg,
      paddingVertical: spacing.lg,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLabel: { ...typography.body, color: colors.inkMuted, flexShrink: 0 },
    rowValue: {
      ...typography.body,
      color: colors.ink,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'right',
    },
    notes: { ...typography.body, color: colors.ink, paddingVertical: spacing.lg },
    hint: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.sm },

    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    feedback: {
      ...typography.caption,
      color: colors.success,
      backgroundColor: colors.successSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },

    deleteWrap: { marginTop: spacing.xl, alignItems: 'center' },

    row: { flexDirection: 'row', gap: spacing.md },
    col: { flex: 1 },
    textArea: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },

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
    sheetHint: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    sheetCancel: { marginTop: spacing.sm },
  });
