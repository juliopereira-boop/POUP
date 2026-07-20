import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { ToggleField } from '@/components/ToggleField';
import { db, type Company, type CompanyInput, type Correspondent } from '@/data';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function EmpresasScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [risk, setRisk] = useState('');
  const [maxInstallments, setMaxInstallments] = useState('');
  const [maxSemiannual, setMaxSemiannual] = useState('');
  const [maxAnnual, setMaxAnnual] = useState('');
  const [coincide, setCoincide] = useState(true);

  const [correspondents, setCorrespondents] = useState<Correspondent[]>([]);
  const [newCorrespondent, setNewCorrespondent] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const list = await db.companies.list(user.id);
    setCompanies(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setRisk('');
    setMaxInstallments('');
    setMaxSemiannual('');
    setMaxAnnual('');
    setCoincide(true);
    setCorrespondents([]);
    setNewCorrespondent('');
    setError(null);
  }

  async function startEdit(company: Company) {
    setEditingId(company.id);
    setName(company.name);
    setRisk(company.risk != null ? String(company.risk) : '');
    setMaxInstallments(company.maxInstallments != null ? String(company.maxInstallments) : '');
    setMaxSemiannual(company.maxSemiannual != null ? String(company.maxSemiannual) : '');
    setMaxAnnual(company.maxAnnual != null ? String(company.maxAnnual) : '');
    setCoincide(company.coincideInstallments);
    setError(null);
    setCorrespondents(await db.companies.listCorrespondents(company.id));
  }

  function num(input: string): number | null {
    const n = Number(input.trim().replace(',', '.'));
    return input.trim() && Number.isFinite(n) ? n : null;
  }

  async function save() {
    if (!user) return;
    setError(null);
    if (!name.trim()) return setError('Informe o nome da empresa.');

    const payload: CompanyInput = {
      name: name.trim(),
      risk: num(risk),
      maxInstallments: num(maxInstallments),
      maxSemiannual: num(maxSemiannual),
      maxAnnual: num(maxAnnual),
      coincideInstallments: coincide,
    };
    setSaving(true);
    const result = editingId
      ? await db.companies.update(editingId, payload)
      : await db.companies.create(user.id, payload);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    resetForm();
    void load();
  }

  async function addCorrespondent() {
    if (!user || !editingId || !newCorrespondent.trim()) return;
    const result = await db.companies.addCorrespondent(user.id, editingId, newCorrespondent.trim());
    if (result.ok) {
      setCorrespondents((prev) => [...prev, result.data]);
      setNewCorrespondent('');
    }
  }

  async function removeCorrespondent(id: string) {
    const result = await db.companies.removeCorrespondent(id);
    if (result.ok) setCorrespondents((prev) => prev.filter((c) => c.id !== id));
  }

  function confirmDelete(company: Company) {
    const doDelete = async () => {
      const result = await db.companies.remove(company.id);
      if (result.ok) {
        if (editingId === company.id) resetForm();
        void load();
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Excluir a empresa "${company.name}"?`)) void doDelete();
    } else {
      Alert.alert('Excluir empresa', `Excluir "${company.name}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  }

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.formTitle}>{editingId ? 'Editar empresa' : 'Nova empresa'}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Input label="Nome da empresa" value={name} onChangeText={setName} placeholder="Construtora..." />

        <Text style={styles.sectionTitle}>Regras de negócio</Text>
        <Input
          label="Risco (%)"
          value={risk}
          onChangeText={setRisk}
          placeholder="Ex.: 32"
          keyboardType="numeric"
        />
        <Input
          label="Qtd máx. de parcelas mensais"
          value={maxInstallments}
          onChangeText={setMaxInstallments}
          placeholder="Ex.: 72"
          keyboardType="numeric"
        />
        <Input
          label="Qtd máx. de semestrais"
          value={maxSemiannual}
          onChangeText={setMaxSemiannual}
          placeholder="Ex.: 6"
          keyboardType="numeric"
        />
        <Input
          label="Qtd máx. de anuais"
          value={maxAnnual}
          onChangeText={setMaxAnnual}
          placeholder="Ex.: 5"
          keyboardType="numeric"
        />
        <ToggleField label="Coincidir parcelas" value={coincide} onChange={setCoincide} />

        <Text style={styles.sectionTitle}>Correspondentes</Text>
        {editingId ? (
          <>
            {correspondents.map((c) => (
              <View key={c.id} style={styles.corrItem}>
                <Text style={styles.corrName}>{c.name}</Text>
                <Pressable onPress={() => removeCorrespondent(c.id)} hitSlop={8}>
                  <Text style={styles.deleteLink}>Excluir</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.corrAddRow}>
              <View style={styles.corrInput}>
                <Input
                  value={newCorrespondent}
                  onChangeText={setNewCorrespondent}
                  placeholder="Nome do correspondente"
                />
              </View>
              <Button label="Adicionar" variant="secondary" onPress={addCorrespondent} />
            </View>
          </>
        ) : (
          <Text style={styles.hint}>Salve a empresa para cadastrar correspondentes.</Text>
        )}

        <View style={styles.formActions}>
          {editingId ? (
            <Button label="Cancelar" variant="ghost" onPress={resetForm} style={styles.flex1} />
          ) : null}
          <Button
            label={editingId ? 'Salvar' : 'Adicionar'}
            onPress={save}
            loading={saving}
            style={styles.flex1}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Empresas cadastradas</Text>
      {loading ? (
        <Text style={styles.muted}>Carregando...</Text>
      ) : companies.length === 0 ? (
        <Text style={styles.muted}>Nenhuma empresa cadastrada ainda.</Text>
      ) : (
        companies.map((c) => (
          <View key={c.id} style={styles.item}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{c.name}</Text>
              <Text style={styles.itemMeta}>Risco: {c.risk != null ? `${c.risk}%` : '—'}</Text>
            </View>
            <View style={styles.itemActions}>
              <Pressable onPress={() => startEdit(c)} hitSlop={8}>
                <Text style={styles.editLink}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(c)} hitSlop={8}>
                <Text style={styles.deleteLink}>Excluir</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
    formActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    flex1: { flex: 1 },
    hint: { ...typography.caption, color: colors.inkSubtle, marginBottom: spacing.sm },
    corrItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
    },
    corrName: { ...typography.body, color: colors.ink },
    corrAddRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    corrInput: { flex: 1 },
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
    itemName: { ...typography.body, color: colors.ink, fontWeight: '600' },
    itemMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    itemActions: { flexDirection: 'row', gap: spacing.lg },
    editLink: { ...typography.label, color: colors.primary },
    deleteLink: { ...typography.label, color: colors.danger },
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
