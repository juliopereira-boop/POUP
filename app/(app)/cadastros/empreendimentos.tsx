import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { db, type Company, type Development } from '@/data';
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

  function resetForm() {
    setEditingId(null);
    setCompanyId(null);
    setName('');
    setError(null);
  }

  function startEdit(dev: Development) {
    setEditingId(dev.id);
    setCompanyId(dev.companyId);
    setName(dev.name);
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
    const payload = { companyId, name: name.trim() };
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

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));

  return (
    <Screen>
      {!loading && companies.length === 0 ? (
        <View style={styles.warnCard}>
          <Text style={styles.warnText}>
            Você precisa cadastrar uma empresa antes de criar um empreendimento.
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
          emptyHint="Cadastre uma empresa primeiro."
        />
        <Input
          label="Nome do empreendimento"
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Residencial..."
        />
        <View style={styles.formActions}>
          {editingId ? (
            <Button label="Cancelar" variant="ghost" onPress={resetForm} style={styles.flex1} />
          ) : null}
          <Button
            label={editingId ? 'Salvar' : 'Adicionar'}
            onPress={save}
            loading={saving}
            disabled={companies.length === 0}
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
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{d.name}</Text>
              <Text style={styles.itemMeta}>{d.companyName ?? '—'}</Text>
            </View>
            <View style={styles.itemActions}>
              <Pressable onPress={() => startEdit(d)} hitSlop={8}>
                <Text style={styles.editLink}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(d)} hitSlop={8}>
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
