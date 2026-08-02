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

import { Button } from '@/components/Button';
import { CommissionFields, formatPercent, percentToNumber } from '@/components/CommissionFields';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { InstallmentStatusPill, InvoiceStatusChip } from '@/components/InstallmentStatusPill';
import { ProFeatureLock } from '@/components/ProFeatureLock';
import { Screen } from '@/components/Screen';
import {
  db,
  isInstallmentLate,
  type Commission,
  type CommissionInstallment,
  type CommissionWithInstallments,
} from '@/data';
import { dateKey } from '@/features/agenda/dates';
import { computeCommissionKpis } from '@/features/comissao/kpis';
import { isNfseConfigured, issueNfse } from '@/features/comissao/nfse';
import { FEATURES } from '@/features/registry';
import { useFeatureAccess } from '@/features/useFeatureAccess';
import { currencyToNumber, formatCurrencyBRL } from '@/lib/masks';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const feature = FEATURES.find((f) => f.key === 'comissao')!;

type Styles = ReturnType<typeof makeStyles>;

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** YYYY-MM-DD lido por partes locais — `new Date(ymd)` cairia no dia anterior. */
function dateBR(ymd: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function toMasked(value: number | null): string {
  if (value == null || value <= 0) return '';
  return formatCurrencyBRL(String(Math.round(value * 100)));
}

/** De onde saiu o percentual aplicado, em texto para o corretor. */
function sourceLabel(c: Commission): string {
  if (c.source === 'campanha') {
    return `Campanha ${c.campaignName?.trim() || 'promocional'}`;
  }
  if (c.source === 'manual') return 'Definido manualmente';
  return 'Percentual padrão da construtora';
}

function confirmAction(title: string, message: string, onConfirm: () => void, danger = false) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', style: danger ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export default function ComissaoDetailScreen() {
  const { canUse } = useFeatureAccess();

  if (!canUse('comissao')) {
    return (
      <ProFeatureLock
        emoji={feature.emoji}
        title={feature.title}
        description={feature.description}
      />
    );
  }

  return <ComissaoContent />;
}

function ComissaoContent() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<CommissionWithInstallments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [receberTarget, setReceberTarget] = useState<CommissionInstallment | null>(null);
  const [editarTarget, setEditarTarget] = useState<CommissionInstallment | null>(null);
  const [notaTarget, setNotaTarget] = useState<{
    inst: CommissionInstallment;
    /** Motivo de o registro manual ter aberto (provedor ausente ou erro). */
    hint: string | null;
  } | null>(null);
  const [editComissao, setEditComissao] = useState(false);

  const today = dateKey(new Date());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setData(await db.commissions.get(id));
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Os mesmos números do painel, restritos a esta comissão.
  const kpis = useMemo(() => computeCommissionKpis(data ? [data] : [], today), [data, today]);

  function feedback(message: string) {
    setError(null);
    setNotice(message);
  }

  async function reload() {
    setData(id ? await db.commissions.get(id) : null);
  }

  async function onDesfazer(inst: CommissionInstallment) {
    setError(null);
    setNotice(null);
    setBusyId(inst.id);
    const res = await db.commissions.setInstallmentStatus(inst.id, 'pendente', {
      paidDate: null,
      paidValue: null,
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reload();
    feedback(`Recebimento da parcela ${inst.number} desfeito: ela volta para pendente.`);
  }

  async function onSetStatus(
    inst: CommissionInstallment,
    status: 'pendente' | 'cancelada',
    message: string,
  ) {
    setError(null);
    setNotice(null);
    setBusyId(inst.id);
    const res = await db.commissions.setInstallmentStatus(inst.id, status, {
      paidDate: null,
      paidValue: null,
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reload();
    feedback(message);
  }

  /**
   * "Gerar Nota Fiscal": tenta o provedor de NFS-e e, enquanto ele não estiver
   * conectado (ou se a emissão falhar), abre o registro manual da nota — que
   * grava de verdade em `setInvoice` e já serve para o controle do corretor.
   */
  async function onGerarNota(inst: CommissionInstallment) {
    if (!data) return;
    setError(null);
    setNotice(null);
    setBusyId(inst.id);
    const res = await issueNfse({
      installmentId: inst.id,
      amount: inst.paidValue ?? inst.value,
      clientName: data.commission.clientName,
      description: `Comissão de intermediação imobiliária — parcela ${inst.number}/${data.installments.length} — ${data.commission.developmentName?.trim() || data.commission.clientName}`,
      dueDate: inst.dueDate,
    });

    if (res.ok) {
      const saved = await db.commissions.setInvoice(inst.id, {
        invoiceStatus: 'emitida',
        invoiceNumber: res.invoiceNumber,
        invoiceUrl: res.invoiceUrl,
        invoiceIssuedAt: res.issuedAt,
      });
      setBusyId(null);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      await reload();
      feedback(`Nota fiscal nº ${res.invoiceNumber} emitida para a parcela ${inst.number}.`);
      return;
    }

    setBusyId(null);
    setNotaTarget({
      inst,
      hint: res.notConfigured
        ? 'A emissão automática ainda não está conectada. Registre abaixo os dados da nota que você emitiu no portal — fica gravado na parcela.'
        : `Não foi possível emitir automaticamente: ${res.error} Você pode registrar a nota manualmente abaixo.`,
    });
  }

  async function onCancelarNota(inst: CommissionInstallment) {
    setError(null);
    setNotice(null);
    setBusyId(inst.id);
    const res = await db.commissions.setInvoice(inst.id, { invoiceStatus: 'cancelada' });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await reload();
    feedback(`Nota fiscal da parcela ${inst.number} marcada como cancelada.`);
  }

  function onExcluir() {
    if (!data) return;
    const doDelete = async () => {
      setBusyId('comissao');
      const res = await db.commissions.removeCommission(data.commission.id);
      setBusyId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.back();
    };
    confirmAction(
      'Excluir comissão',
      `Excluir a comissão de "${data.commission.clientName}"? As parcelas e as notas registradas saem do controle e dos indicadores. A venda continua.`,
      () => void doDelete(),
      true,
    );
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator style={styles.loader} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <Text style={styles.muted}>Comissão não encontrada.</Text>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const { commission, installments } = data;
  const previsto = kpis.totalPrevisto > 0 ? kpis.totalPrevisto : commission.totalValue;
  const progresso =
    previsto > 0 ? Math.max(0, Math.min(100, (kpis.totalRecebido / previsto) * 100)) : 0;
  const somaParcelas = installments
    .filter((i) => i.status !== 'cancelada')
    .reduce((acc, i) => acc + i.value, 0);
  const diferenca = commission.totalValue - somaParcelas;
  const nfsePronta = isNfseConfigured();

  return (
    <Screen>
      <Stack.Screen options={{ title: commission.clientName.trim() || 'Comissão' }} />

      <View style={styles.hero}>
        <Text style={styles.heroClient} numberOfLines={2}>
          {commission.clientName}
        </Text>
        <Text style={styles.heroDev} numberOfLines={2}>
          {commission.developmentName?.trim() || 'Empreendimento não informado'}
          {commission.companyName ? `  ·  ${commission.companyName}` : ''}
        </Text>

        <View style={styles.heroRow}>
          <View style={styles.heroCol}>
            <Text style={styles.heroColLabel}>Valor da venda</Text>
            <Text style={styles.heroColValue} numberOfLines={1} adjustsFontSizeToFit>
              {brl(commission.saleValue)}
            </Text>
            <Text style={styles.heroColCaption}>venda em {dateBR(commission.saleDate)}</Text>
          </View>
          <View style={styles.heroCol}>
            <Text style={styles.heroColLabel}>Percentual aplicado</Text>
            <Text style={styles.heroColValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatPercent(commission.pct) || '0'}%
            </Text>
            <Text style={styles.heroColCaption} numberOfLines={2}>
              {sourceLabel(commission)}
            </Text>
          </View>
        </View>

        <View style={styles.totalWrap}>
          <Text style={styles.totalLabel}>TOTAL DA COMISSÃO</Text>
          <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
            {brl(commission.totalValue)}
          </Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progresso}%` }]} />
        </View>
        <View style={styles.progressLegend}>
          <Text style={styles.progressText}>
            {brl(kpis.totalRecebido)} recebido de {brl(previsto)}
          </Text>
          <Text style={styles.progressPct}>
            {progresso.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
          </Text>
        </View>
        <Text style={styles.progressCaption}>
          Falta receber {brl(kpis.totalAReceber)}
          {kpis.totalAtrasado > 0 ? ` · ${brl(kpis.totalAtrasado)} em atraso` : ''}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.feedback}>{notice}</Text> : null}

      <View style={styles.actions}>
        <Button
          label="Editar comissão"
          variant="secondary"
          onPress={() => {
            setError(null);
            setNotice(null);
            setEditComissao(true);
          }}
          style={styles.actionBtn}
        />
        <Button
          label="Abrir a venda"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/(app)/vendas/[id]', params: { id: commission.saleId } })
          }
          style={styles.actionBtn}
        />
      </View>

      <Text style={styles.band}>Parcelas ({installments.length})</Text>

      {!nfsePronta ? (
        <View style={styles.nfBanner}>
          <Text style={styles.nfBannerTitle}>Nota fiscal</Text>
          <Text style={styles.nfBannerText}>
            A emissão automática de NFS-e/NF-e entra quando a plataforma de notas for conectada ao
            POUP. Até lá, “Gerar Nota Fiscal” abre o registro manual: você informa número, data e
            link da nota emitida no portal e ela fica gravada na parcela.
          </Text>
        </View>
      ) : null}

      {installments.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyInst}>
            Esta comissão está sem parcelas. Edite o valor total e cadastre o parcelamento na regra
            da construtora para as próximas vendas.
          </Text>
        </View>
      ) : null}

      {installments.map((inst) => {
        const late = isInstallmentLate(inst, today);
        const busy = busyId === inst.id;
        const divergiu =
          inst.status === 'recebida' &&
          inst.paidValue != null &&
          Math.abs(inst.paidValue - inst.value) >= 0.01;

        return (
          <View
            key={inst.id}
            style={[
              styles.instCard,
              late && styles.instCardLate,
              inst.status === 'cancelada' && styles.instCardOff,
            ]}
          >
            <View style={styles.instTop}>
              <Text style={styles.instTitle}>
                Parcela {inst.number} de {installments.length}
              </Text>
              <InstallmentStatusPill status={inst.status} late={late} />
            </View>

            <View style={styles.instRow}>
              <Text style={styles.instLabel}>Vencimento</Text>
              <Text style={styles.instValue}>{dateBR(inst.dueDate)}</Text>
            </View>
            <View style={styles.instRow}>
              <Text style={styles.instLabel}>Valor previsto</Text>
              <Text style={styles.instValue}>{brl(inst.value)}</Text>
            </View>
            {inst.status === 'recebida' ? (
              <View style={styles.instRow}>
                <Text style={styles.instLabel}>Recebido</Text>
                <Text style={[styles.instValue, styles.instValueOk]}>
                  {brl(inst.paidValue ?? inst.value)} em {dateBR(inst.paidDate)}
                </Text>
              </View>
            ) : null}
            {divergiu ? (
              <Text style={styles.instHint}>
                O valor recebido difere do previsto em{' '}
                {brl(Math.abs((inst.paidValue ?? 0) - inst.value))}.
              </Text>
            ) : null}

            <View style={styles.instNf}>
              <InvoiceStatusChip status={inst.invoiceStatus} invoiceNumber={inst.invoiceNumber} />
              {inst.invoiceStatus !== 'nao_emitida' && inst.invoiceIssuedAt ? (
                <Text style={styles.instNfDate}>Emitida em {dateBR(inst.invoiceIssuedAt)}</Text>
              ) : null}
            </View>

            <View style={styles.chips}>
              {inst.status === 'pendente' ? (
                <ActionChip
                  styles={styles}
                  label="✓ Dar baixa"
                  tone="ok"
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    setNotice(null);
                    setReceberTarget(inst);
                  }}
                />
              ) : null}

              {inst.status === 'recebida' ? (
                <ActionChip
                  styles={styles}
                  label="Desfazer recebimento"
                  disabled={busy}
                  onPress={() =>
                    confirmAction(
                      'Desfazer recebimento',
                      `Desfazer o recebimento da parcela ${inst.number}? Ela volta para pendente.`,
                      () => void onDesfazer(inst),
                    )
                  }
                />
              ) : null}

              {inst.status !== 'cancelada' ? (
                <ActionChip
                  styles={styles}
                  label="Editar"
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    setNotice(null);
                    setEditarTarget(inst);
                  }}
                />
              ) : null}

              {inst.status !== 'cancelada' && inst.invoiceStatus !== 'emitida' ? (
                <ActionChip
                  styles={styles}
                  label={busy ? 'Gerando…' : '🧾 Gerar Nota Fiscal'}
                  disabled={busy}
                  onPress={() => void onGerarNota(inst)}
                />
              ) : null}

              {inst.invoiceStatus === 'emitida' && inst.invoiceUrl ? (
                <ActionChip
                  styles={styles}
                  label="📄 Abrir nota"
                  disabled={busy}
                  onPress={() => void Linking.openURL(inst.invoiceUrl as string)}
                />
              ) : null}

              {inst.invoiceStatus === 'emitida' ? (
                <ActionChip
                  styles={styles}
                  label="Editar nota"
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    setNotice(null);
                    setNotaTarget({ inst, hint: null });
                  }}
                />
              ) : null}

              {inst.invoiceStatus === 'emitida' ? (
                <ActionChip
                  styles={styles}
                  label="Cancelar nota"
                  tone="danger"
                  disabled={busy}
                  onPress={() =>
                    confirmAction(
                      'Cancelar nota fiscal',
                      `Marcar a nota fiscal da parcela ${inst.number} como cancelada?`,
                      () => void onCancelarNota(inst),
                      true,
                    )
                  }
                />
              ) : null}

              {inst.status === 'pendente' ? (
                <ActionChip
                  styles={styles}
                  label="Cancelar parcela"
                  tone="danger"
                  disabled={busy}
                  onPress={() =>
                    confirmAction(
                      'Cancelar parcela',
                      `Cancelar a parcela ${inst.number}? Ela sai do total a receber e dos indicadores.`,
                      () =>
                        void onSetStatus(
                          inst,
                          'cancelada',
                          `Parcela ${inst.number} cancelada: saiu do total a receber.`,
                        ),
                      true,
                    )
                  }
                />
              ) : null}

              {inst.status === 'cancelada' ? (
                <ActionChip
                  styles={styles}
                  label="Reativar parcela"
                  disabled={busy}
                  onPress={() =>
                    void onSetStatus(
                      inst,
                      'pendente',
                      `Parcela ${inst.number} reativada: voltou para pendente.`,
                    )
                  }
                />
              ) : null}
            </View>

            {inst.notes?.trim() ? <Text style={styles.instNotes}>{inst.notes.trim()}</Text> : null}
          </View>
        );
      })}

      {installments.length > 0 && Math.abs(diferenca) >= 1 ? (
        <Text style={styles.hint}>
          {diferenca > 0
            ? `As parcelas somam ${brl(somaParcelas)} — ${brl(diferenca)} a menos que o total da comissão.`
            : `As parcelas somam ${brl(somaParcelas)} — ${brl(Math.abs(diferenca))} a mais que o total da comissão.`}{' '}
          Ajuste o total ou os valores das parcelas.
        </Text>
      ) : null}

      <Text style={styles.band}>Observações</Text>
      <View style={styles.card}>
        <Text style={styles.notes}>
          {commission.notes?.trim() || 'Nenhuma observação registrada.'}
        </Text>
      </View>

      <View style={styles.deleteWrap}>
        <Button
          label="Excluir comissão"
          variant="danger"
          onPress={onExcluir}
          loading={busyId === 'comissao'}
        />
      </View>

      {receberTarget ? (
        <ReceberModal
          inst={receberTarget}
          onClose={() => setReceberTarget(null)}
          onSaved={async (message) => {
            setReceberTarget(null);
            await reload();
            feedback(message);
          }}
        />
      ) : null}

      {editarTarget ? (
        <EditarParcelaModal
          inst={editarTarget}
          onClose={() => setEditarTarget(null)}
          onSaved={async (message) => {
            setEditarTarget(null);
            await reload();
            feedback(message);
          }}
        />
      ) : null}

      {notaTarget ? (
        <NotaFiscalModal
          inst={notaTarget.inst}
          hint={notaTarget.hint}
          onClose={() => setNotaTarget(null)}
          onSaved={async (message) => {
            setNotaTarget(null);
            await reload();
            feedback(message);
          }}
        />
      ) : null}

      {editComissao ? (
        <EditarComissaoModal
          commission={commission}
          onClose={() => setEditComissao(false)}
          onSaved={async (message) => {
            setEditComissao(false);
            await reload();
            feedback(message);
          }}
        />
      ) : null}
    </Screen>
  );
}

function ActionChip({
  styles,
  label,
  onPress,
  tone = 'default',
  disabled = false,
}: {
  styles: Styles;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'ok' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.chip,
        tone === 'ok' && styles.chipOk,
        tone === 'danger' && styles.chipDanger,
        pressed && styles.pressed,
        disabled && styles.chipDisabled,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          tone === 'ok' && styles.chipTextOk,
          tone === 'danger' && styles.chipTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Fechar">
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------------- *
 * Baixa da parcela: data (hoje por padrão) e valor recebido
 * ------------------------------------------------------------------------- */

function ReceberModal({
  inst,
  onClose,
  onSaved,
}: {
  inst: CommissionInstallment;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const [date, setDate] = useState<string>(inst.paidDate ?? dateKey(new Date()));
  const [value, setValue] = useState<string>(toMasked(inst.paidValue ?? inst.value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recebido = currencyToNumber(value);
  const diferenca = recebido - inst.value;

  async function onSave() {
    setError(null);
    if (!date) {
      setError('Informe a data do recebimento.');
      return;
    }
    if (recebido <= 0) {
      setError('Informe o valor recebido.');
      return;
    }
    setSaving(true);
    const res = await db.commissions.setInstallmentStatus(inst.id, 'recebida', {
      paidDate: date,
      paidValue: recebido,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    void onSaved(
      `Parcela ${inst.number} recebida em ${dateBR(date)} — ${brl(recebido)} no seu caixa.`,
    );
  }

  return (
    <SheetShell title={`Receber parcela ${inst.number}`} onClose={onClose}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.sheetHint}>
        Previsto: {brl(inst.value)} com vencimento em {dateBR(inst.dueDate)}. O valor recebido pode
        divergir do previsto.
      </Text>

      <DateField label="Data do recebimento" value={date} onChange={setDate} />
      <Input
        label="Valor recebido"
        value={value}
        onChangeText={(t) => setValue(formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="number-pad"
      />
      {recebido > 0 && Math.abs(diferenca) >= 0.01 ? (
        <Text style={styles.sheetHint}>
          {diferenca > 0
            ? `${brl(diferenca)} acima do previsto.`
            : `${brl(Math.abs(diferenca))} abaixo do previsto.`}
        </Text>
      ) : null}

      <Button label="Confirmar recebimento" onPress={() => void onSave()} loading={saving} />
      <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.sheetCancel} />
    </SheetShell>
  );
}

/* ------------------------------------------------------------------------- *
 * Edição de vencimento e valor da parcela
 * ------------------------------------------------------------------------- */

function EditarParcelaModal({
  inst,
  onClose,
  onSaved,
}: {
  inst: CommissionInstallment;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const [dueDate, setDueDate] = useState<string>(inst.dueDate);
  const [value, setValue] = useState<string>(toMasked(inst.value));
  const [notes, setNotes] = useState<string>(inst.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    if (!dueDate) {
      setError('Informe o vencimento da parcela.');
      return;
    }
    const numero = currencyToNumber(value);
    if (numero <= 0) {
      setError('Informe o valor da parcela.');
      return;
    }
    setSaving(true);
    const res = await db.commissions.updateInstallment(inst.id, {
      dueDate,
      value: numero,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    void onSaved(`Parcela ${inst.number} atualizada.`);
  }

  return (
    <SheetShell title={`Editar parcela ${inst.number}`} onClose={onClose}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.sheetHint}>
        Use quando a construtora renegociar o prazo ou o valor desta parcela.
      </Text>

      <DateField label="Vencimento" value={dueDate} onChange={setDueDate} />
      <Input
        label="Valor da parcela"
        value={value}
        onChangeText={(t) => setValue(formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="number-pad"
      />
      <Input
        label="Observações da parcela"
        value={notes}
        onChangeText={setNotes}
        placeholder="Ex.: pagamento previsto após registro do contrato"
        multiline
        numberOfLines={3}
        style={styles.textArea}
      />

      <Button label="Salvar parcela" onPress={() => void onSave()} loading={saving} />
      <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.sheetCancel} />
    </SheetShell>
  );
}

/* ------------------------------------------------------------------------- *
 * Nota fiscal — registro manual (o que funciona hoje)
 * ------------------------------------------------------------------------- */

function NotaFiscalModal({
  inst,
  hint,
  onClose,
  onSaved,
}: {
  inst: CommissionInstallment;
  hint: string | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const [numero, setNumero] = useState<string>(inst.invoiceNumber ?? '');
  const [emitidaEm, setEmitidaEm] = useState<string>(
    inst.invoiceIssuedAt ?? inst.paidDate ?? dateKey(new Date()),
  );
  const [link, setLink] = useState<string>(inst.invoiceUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    if (!numero.trim()) {
      setError('Informe o número da nota fiscal.');
      return;
    }
    if (!emitidaEm) {
      setError('Informe a data de emissão.');
      return;
    }
    const url = link.trim();
    setSaving(true);
    const res = await db.commissions.setInvoice(inst.id, {
      invoiceStatus: 'emitida',
      invoiceNumber: numero.trim(),
      invoiceUrl: url ? (url.startsWith('http') ? url : `https://${url}`) : null,
      invoiceIssuedAt: emitidaEm,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    void onSaved(`Nota fiscal nº ${numero.trim()} registrada na parcela ${inst.number}.`);
  }

  return (
    <SheetShell title={`Nota fiscal da parcela ${inst.number}`} onClose={onClose}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {hint ? <Text style={styles.sheetWarn}>{hint}</Text> : null}
      <Text style={styles.sheetHint}>
        Valor da nota: {brl(inst.paidValue ?? inst.value)} · serviço de intermediação imobiliária.
      </Text>

      <Input
        label="Número da nota"
        value={numero}
        onChangeText={setNumero}
        placeholder="Ex.: 2026/000123"
        autoCapitalize="characters"
      />
      <DateField label="Data de emissão" value={emitidaEm} onChange={setEmitidaEm} />
      <Input
        label="Link da nota (opcional)"
        value={link}
        onChangeText={setLink}
        placeholder="https://nfse.prefeitura.gov.br/..."
        autoCapitalize="none"
        keyboardType="url"
      />

      <Button label="Salvar nota fiscal" onPress={() => void onSave()} loading={saving} />
      <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.sheetCancel} />
    </SheetShell>
  );
}

/* ------------------------------------------------------------------------- *
 * Edição do total / percentual / observações da comissão
 * ------------------------------------------------------------------------- */

function EditarComissaoModal({
  commission,
  onClose,
  onSaved,
}: {
  commission: Commission;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const [percent, setPercent] = useState<string>(formatPercent(commission.pct));
  const [total, setTotal] = useState<string>(toMasked(commission.totalValue));
  const [notes, setNotes] = useState<string>(commission.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    const pctNumero = percentToNumber(percent);
    const totalNumero = currencyToNumber(total);
    if (totalNumero <= 0) {
      setError('Informe o valor total da comissão.');
      return;
    }

    const mudouValor =
      Math.abs(pctNumero - commission.pct) > 0.001 ||
      Math.abs(totalNumero - commission.totalValue) >= 0.01;

    setSaving(true);
    const res = await db.commissions.updateCommission(commission.id, {
      pct: pctNumero,
      totalValue: totalNumero,
      notes: notes.trim() || null,
      // Mexer na mão no percentual/total tira a comissão da regra e da campanha:
      // o histórico precisa dizer que o número foi definido manualmente.
      ...(mudouValor && commission.source !== 'manual'
        ? { source: 'manual' as const, campaignName: null }
        : {}),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    void onSaved('Comissão atualizada.');
  }

  return (
    <SheetShell title="Editar comissão" onClose={onClose}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.sheetHint}>
        Base do cálculo: {brl(commission.saleValue)} (valor da venda). Origem atual:{' '}
        {sourceLabel(commission)}.
      </Text>

      <CommissionFields
        saleValue={commission.saleValue}
        percent={percent}
        commission={total}
        onChange={(next) => {
          setPercent(next.percent);
          setTotal(next.commission);
        }}
      />
      <Input
        label="Observações"
        value={notes}
        onChangeText={setNotes}
        placeholder="Acordo com a construtora, retenções, prazos…"
        multiline
        numberOfLines={3}
        style={styles.textArea}
      />
      <Text style={styles.sheetWarn}>
        As parcelas não são recalculadas automaticamente: se o total mudar, ajuste o valor de cada
        parcela em “Editar”.
      </Text>

      <Button label="Salvar comissão" onPress={() => void onSave()} loading={saving} />
      <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.sheetCancel} />
    </SheetShell>
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
    heroClient: { ...typography.title, color: colors.primary },
    heroDev: { ...typography.body, color: colors.inkMuted, marginTop: 2 },
    heroRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
    heroCol: { flex: 1, gap: 2 },
    heroColLabel: { ...typography.caption, color: colors.inkMuted },
    heroColValue: { ...typography.heading, color: colors.ink },
    heroColCaption: { ...typography.caption, color: colors.inkSubtle, fontSize: 12 },

    totalWrap: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    totalLabel: {
      ...typography.caption,
      color: colors.inkMuted,
      fontWeight: '700',
      letterSpacing: 1,
      fontSize: 11,
    },
    totalValue: { ...typography.display, color: colors.primary },

    progressTrack: {
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginTop: spacing.md,
    },
    progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.success },
    progressLegend: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    progressText: { ...typography.caption, color: colors.ink, flex: 1 },
    progressPct: { ...typography.caption, color: colors.success, fontWeight: '700' },
    progressCaption: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },

    actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
    actionBtn: { flex: 1 },

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
    notes: { ...typography.body, color: colors.ink, paddingVertical: spacing.lg },
    emptyInst: { ...typography.body, color: colors.inkMuted, paddingVertical: spacing.lg },
    hint: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.sm },

    nfBanner: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    nfBannerTitle: { ...typography.label, color: colors.primary },
    nfBannerText: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },

    instCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    instCardLate: { borderColor: colors.danger },
    instCardOff: { opacity: 0.62 },
    instTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    instTitle: { ...typography.label, color: colors.ink, flex: 1 },
    instRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    instLabel: { ...typography.caption, color: colors.inkMuted },
    instValue: {
      ...typography.body,
      color: colors.ink,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'right',
    },
    instValueOk: { color: colors.success },
    instHint: { ...typography.caption, color: colors.warning, marginTop: spacing.xs },
    instNf: { marginTop: spacing.sm, gap: 2 },
    instNfDate: { ...typography.caption, color: colors.inkSubtle, fontSize: 12 },
    instNotes: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.md },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    chip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      minHeight: 38,
      justifyContent: 'center',
    },
    chipOk: { borderColor: colors.success, backgroundColor: colors.successSoft },
    chipDanger: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    chipDisabled: { opacity: 0.5 },
    chipText: { ...typography.label, color: colors.ink, fontSize: 13 },
    chipTextOk: { color: colors.success },
    chipTextDanger: { color: colors.danger },

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
    sheetWarn: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    sheetCancel: { marginTop: spacing.sm },

    pressed: { opacity: 0.6 },
  });
