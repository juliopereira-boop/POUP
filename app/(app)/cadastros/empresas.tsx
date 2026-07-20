import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { db, type Company } from '@/data';
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
    setError(null);
  }

  function startEdit(company: Company) {
    setEditingId(company.id);
    setName(company.name);
    setRisk(company.risk != null ? String(company.risk) : '');
    setError(null);
  }

  function parseRisk(input: string): number | null {
    const normalized = input.trim().replace(',', '.');
    if (!normalized) return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  async function save() {
    if (!user) return;
    setError(null);
    if (!name.trim()) {
      setError('Informe o nome da empresa.');
      return;
    }
    if (risk.trim() && parseRisk(risk) === null) {
      setError('Risco inválido. Use apenas números (ex.: 0.5).');
      return;
    }
    setSaving(true);
    const payload = { name: name.trim(), risk: parseRisk(risk) };
    const result = editingId
      ? await db.companies.update(editingId, payload)
      : await db.companies.create(user.id, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    resetForm();
    void load();
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
        <Input
          label="Risco (parâmetro do Simulador)"
          value={risk}
          onChangeText={setRisk}
          placeholder="Ex.: 0.5"
          keyboardType="numeric"
        />
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
              <Text style={styles.itemMeta}>Risco: {c.risk != null ? c.risk : '—'}</Text>
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
