import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { EntityAvatar } from '@/components/EntityAvatar';
import { Input } from '@/components/Input';
import { MonthYearField } from '@/components/MonthYearField';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { db, type Company, type Development } from '@/data';
import { UF_OPTIONS } from '@/features/uf';
import { currencyToNumber, formatCurrencyBRL } from '@/lib/masks';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function EmpreendimentosScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [managerName, setManagerName] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [valorUnidade, setValorUnidade] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [comps, devs] = await Promise.all([
      db.companies.list(user.id),
      db.developments.list(user.id),
    ]);
    setCompanies(comps);
    setDevelopments(devs);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Só nas empresas PRÓPRIAS o corretor pode criar empreendimento: as do
   * catálogo são mantidas pelo admin do POUP e o banco recusa a escrita. Oferecer
   * a opção no seletor só renderia um erro sem explicação depois de digitar tudo.
   */
  const ownCompanies = useMemo(() => companies.filter((c) => !c.isCatalog), [companies]);

  function resetForm() {
    setEditingId(null);
    setCompanyId(null);
    setName('');
    setDescription('');
    setDeliveryDate(null);
    setManagerName('');
    setUf(null);
    setValorUnidade('');
    setError(null);
  }

  function startEdit(dev: Development) {
    setEditingId(dev.id);
    setCompanyId(dev.companyId);
    setName(dev.name);
    setDescription(dev.description ?? '');
    setDeliveryDate(dev.deliveryDate);
    setManagerName(dev.managerName ?? '');
    setUf(dev.uf);
    setValorUnidade(
      dev.unitValueFrom ? formatCurrencyBRL(String(Math.round(dev.unitValueFrom * 100))) : '',
    );
    setError(null);
  }

  async function save() {
    if (!user) return;
    setError(null);
    if (!companyId) {
      setError('Selecione a empresa.');
      return;
    }
    if (!name.trim()) {
      setError('Informe o nome do empreendimento.');
      return;
    }
    setSaving(true);
    const payload = {
      companyId,
      name: name.trim(),
      description: description.trim() || null,
      deliveryDate,
      managerName: managerName.trim() || null,
      uf,
      unitValueFrom: valorUnidade.trim() ? currencyToNumber(valorUnidade) : null,
    };
    const result = editingId
      ? await db.developments.update(editingId, payload)
      : await db.developments.create(user.id, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    resetForm();
    void load();
  }

  function confirmDelete(dev: Development) {
    const doDelete = async () => {
      const result = await db.developments.remove(dev.id);
      if (result.ok) {
        if (editingId === dev.id) resetForm();
        void load();
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Excluir o empreendimento "${dev.name}"?`)) void doDelete();
    } else {
      Alert.alert('Excluir empreendimento', `Excluir "${dev.name}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  }

  const companyOptions = ownCompanies.map((c) => ({ value: c.id, label: c.name }));

  return (
    <Screen>
      {!loading && ownCompanies.length === 0 ? (
        <View style={styles.warnCard}>
          <Text style={styles.warnText}>
            Para criar um empreendimento seu, cadastre primeiro uma empresa sua. Os empreendimentos
            das construtoras do catálogo do sistema já vêm prontos quando você adota a construtora.
          </Text>
          <Button
            label="Cadastrar empresa"
            variant="secondary"
            onPress={() => router.push('/(app)/cadastros/empresas')}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.formTitle}>
          {editingId ? 'Editar empreendimento' : 'Novo empreendimento'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Select
          label="Empresa"
          placeholder="Selecione a empresa"
          value={companyId}
          options={companyOptions}
          onChange={setCompanyId}
          emptyHint="Cadastre uma empresa sua primeiro."
        />
        <Input
          label="Nome do empreendimento"
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Residencial..."
        />
        <Input
          label="Descrição do empreendimento (opcional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Ex.: 2 quartos sendo uma suíte, varanda gourmet, lazer completo…"
          multiline
          numberOfLines={4}
          style={styles.textArea}
        />

        <Text style={styles.sectionTitle}>Regras de negócio</Text>
        <MonthYearField
          label="Data de entrega (mês/ano)"
          value={deliveryDate}
          onChange={setDeliveryDate}
          placeholder="Selecione mês/ano"
        />
        <Input
          label="Gerente responsável (opcional)"
          value={managerName}
          onChangeText={setManagerName}
          placeholder="Nome do gerente"
          autoCapitalize="words"
        />
        <Select
          label="Estado (UF) — opcional"
          placeholder="Não informar"
          value={uf}
          options={UF_OPTIONS}
          onChange={setUf}
          searchable
        />
        <Input
          label="Valor a partir de (opcional)"
          value={valorUnidade}
          onChangeText={(t) => setValorUnidade(formatCurrencyBRL(t))}
          placeholder="R$ 0,00"
          keyboardType="numeric"
        />
        {/*
          Este valor é o que faz o "poder de compra" terminar mostrando QUAIS
          empreendimentos seus cabem no bolso do cliente. Sem ele, o
          empreendimento simplesmente não aparece naquela lista — nem como
          compatível nem como incompatível, porque sem preço não dá para
          afirmar nenhum dos dois.
        */}
        <Text style={styles.hint}>
          Usado no simulador de financiamento para mostrar quais empreendimentos cabem no poder de
          compra do cliente.
        </Text>

        <View style={styles.formActions}>
          {editingId ? (
            <Button label="Cancelar" variant="ghost" onPress={resetForm} style={styles.flex1} />
          ) : null}
          <Button
            label={editingId ? 'Salvar' : 'Adicionar'}
            onPress={save}
            loading={saving}
            disabled={ownCompanies.length === 0}
            style={styles.flex1}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Empreendimentos cadastrados</Text>
      {loading ? (
        <Text style={styles.muted}>Carregando...</Text>
      ) : developments.length === 0 ? (
        <Text style={styles.muted}>Nenhum empreendimento cadastrado ainda.</Text>
      ) : (
        developments.map((d) => (
          <View key={d.id} style={styles.item}>
            <EntityAvatar photoUrl={d.photoUrl} name={d.name} size={44} />
            <View style={styles.itemInfo}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemName}>{d.name}</Text>
                {/* Do catálogo: o corretor usa, o POUP mantém. */}
                {d.isCatalog ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Do sistema</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.itemMeta}>{d.companyName ?? '—'}</Text>
              {d.isCatalog ? (
                <Text style={styles.itemNote}>Mantido pelo POUP. As atualizações chegam sozinhas.</Text>
              ) : null}
            </View>
            {/* Empreendimento do catálogo é somente leitura: sem editar nem excluir.
                Para deixar de usar, o caminho é remover a construtora da lista, em
                "Cadastro de empresas". */}
            {d.isCatalog ? null : (
              <View style={styles.itemActions}>
                <Pressable onPress={() => startEdit(d)} hitSlop={8}>
                  <Text style={styles.editLink}>Editar</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(d)} hitSlop={8}>
                  <Text style={styles.deleteLink}>Excluir</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    warnCard: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.md,
    },
    warnText: { ...typography.body, color: colors.warning },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    formTitle: { ...typography.heading, color: colors.ink, marginBottom: spacing.lg },
    sectionTitle: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    hint: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
      lineHeight: 18,
    },
    textArea: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
    formActions: { flexDirection: 'row', gap: spacing.md },
    flex1: { flex: 1 },
    sectionLabel: {
      ...typography.label,
      color: colors.inkMuted,
      marginBottom: spacing.md,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    muted: { ...typography.body, color: colors.inkSubtle },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    itemInfo: { flex: 1 },
    itemTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    itemName: { ...typography.body, color: colors.ink, fontWeight: '600' },
    itemMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    itemNote: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
    itemActions: { flexDirection: 'row', gap: spacing.lg },
    editLink: { ...typography.label, color: colors.primary },
    deleteLink: { ...typography.label, color: colors.danger },
    badge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    badgeText: { ...typography.caption, fontSize: 11, fontWeight: '700', color: colors.primary },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
  });
