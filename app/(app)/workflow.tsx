import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { ToggleField } from '@/components/ToggleField';
import { db, type LeadStage } from '@/data';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const PALETTE = [
  '#FF751F',
  '#D97706',
  '#DC2626',
  '#DB2777',
  '#7C3AED',
  '#2563EB',
  '#0891B2',
  '#16A34A',
  '#6B7280',
  '#111827',
];

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export default function WorkflowScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();

  const [stages, setStages] = useState<LeadStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LeadStage | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(PALETTE[0]);
  const [isAgendamento, setIsAgendamento] = useState(false);
  const [isSimulacao, setIsSimulacao] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortByOrdem = (list: LeadStage[]) => [...list].sort((a, b) => a.ordem - b.ordem);

  const refresh = useCallback(async () => {
    if (!user) return;
    const list = await db.leads.listStages(user.id);
    setStages(sortByOrdem(list));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoading(true);
    void (async () => {
      await db.leads.seedDefaultStages(user.id);
      const list = await db.leads.listStages(user.id);
      if (!mounted) return;
      setStages(sortByOrdem(list));
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  function openCreate() {
    setEditing(null);
    setNome('');
    setCor(PALETTE[0]);
    setIsAgendamento(false);
    setIsSimulacao(false);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(stage: LeadStage) {
    setEditing(stage);
    setNome(stage.nome);
    setCor(stage.cor);
    setIsAgendamento(stage.isAgendamento);
    setIsSimulacao(stage.isSimulacao);
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setError(null);
  }

  async function save() {
    if (!user) return;
    const nomeTrimmed = nome.trim();
    const corTrimmed = cor.trim();
    if (!nomeTrimmed) return setError('Informe o nome da etapa.');
    if (!HEX_PATTERN.test(corTrimmed)) {
      return setError('Cor inválida. Use o formato #RRGGBB, por exemplo #FF751F.');
    }

    const nextOrdem = stages.length ? Math.max(...stages.map((s) => s.ordem)) + 1 : 1;
    setSaving(true);
    const result = editing
      ? await db.leads.updateStage(editing.id, {
          nome: nomeTrimmed,
          cor: corTrimmed,
          isAgendamento,
          isSimulacao,
        })
      : await db.leads.createStage(user.id, {
          nome: nomeTrimmed,
          cor: corTrimmed,
          ordem: nextOrdem,
          isAgendamento,
          isSimulacao,
        });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    closeModal();
    await refresh();
  }

  async function move(index: number, direction: -1 | 1) {
    const current = stages[index];
    const neighbour = stages[index + direction];
    if (!current || !neighbour) return;
    setBusy(true);
    await db.leads.updateStage(current.id, { ordem: neighbour.ordem });
    await db.leads.updateStage(neighbour.id, { ordem: current.ordem });
    await refresh();
    setBusy(false);
  }

  function confirmDelete(stage: LeadStage) {
    const doDelete = async () => {
      setBusy(true);
      const result = await db.leads.removeStage(stage.id);
      if (result.ok) await refresh();
      setBusy(false);
    };
    const message = `Excluir a etapa "${stage.nome}"? Os leads que estão nela ficarão sem etapa.`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) void doDelete();
    } else {
      Alert.alert('Excluir etapa', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  }

  return (
    <Screen>
      <Text style={styles.intro}>
        Defina as etapas do seu funil de leads. A ordem aqui é a ordem que aparece no quadro de
        leads.
      </Text>

      <Text style={styles.sectionLabel}>Etapas do funil</Text>

      {loading ? (
        <Text style={styles.muted}>Carregando etapas...</Text>
      ) : stages.length === 0 ? (
        <Text style={styles.muted}>Nenhuma etapa cadastrada ainda.</Text>
      ) : (
        stages.map((stage, index) => (
          <View key={stage.id} style={styles.item}>
            <View style={[styles.swatch, { backgroundColor: stage.cor }]} />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{stage.nome}</Text>
              <Text style={styles.itemMeta}>{stage.cor.toUpperCase()}</Text>
              {stage.isAgendamento || stage.isSimulacao ? (
                <View style={styles.tagRow}>
                  {stage.isAgendamento ? (
                    <Text style={styles.tag}>Automática: agendamento</Text>
                  ) : null}
                  {stage.isSimulacao ? <Text style={styles.tag}>Automática: simulação</Text> : null}
                </View>
              ) : null}
            </View>
            <View style={styles.itemActions}>
              <Pressable
                onPress={() => void move(index, -1)}
                disabled={index === 0 || busy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Mover para cima"
              >
                <Text style={[styles.arrow, (index === 0 || busy) && styles.arrowDisabled]}>▲</Text>
              </Pressable>
              <Pressable
                onPress={() => void move(index, 1)}
                disabled={index === stages.length - 1 || busy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Mover para baixo"
              >
                <Text
                  style={[
                    styles.arrow,
                    (index === stages.length - 1 || busy) && styles.arrowDisabled,
                  ]}
                >
                  ▼
                </Text>
              </Pressable>
              <Pressable onPress={() => openEdit(stage)} hitSlop={8}>
                <Text style={styles.editLink}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(stage)} hitSlop={8}>
                <Text style={styles.deleteLink}>Excluir</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <View style={styles.addAction}>
        <Button label="+ Nova etapa" variant="secondary" onPress={openCreate} />
      </View>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editing ? 'Editar etapa' : 'Nova etapa'}</Text>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Input
                label="Nome"
                value={nome}
                onChangeText={setNome}
                placeholder="Ex.: Visita agendada"
              />

              <Text style={styles.fieldLabel}>Cor</Text>
              <View style={styles.paletteRow}>
                {PALETTE.map((hex) => {
                  const selected = hex.toLowerCase() === cor.trim().toLowerCase();
                  return (
                    <Pressable
                      key={hex}
                      onPress={() => {
                        setCor(hex);
                        setError(null);
                      }}
                      style={[styles.paletteItem, selected && styles.paletteItemSelected]}
                      accessibilityRole="button"
                      accessibilityLabel={`Cor ${hex}`}
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.paletteColor, { backgroundColor: hex }]} />
                    </Pressable>
                  );
                })}
              </View>

              <Input
                label="Cor personalizada (hex)"
                value={cor}
                onChangeText={(text) => {
                  setCor(text);
                  setError(null);
                }}
                placeholder="#FF751F"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={7}
              />

              <View style={styles.previewRow}>
                <View
                  style={[
                    styles.swatch,
                    HEX_PATTERN.test(cor.trim())
                      ? { backgroundColor: cor.trim() }
                      : styles.swatchEmpty,
                  ]}
                />
                <Text style={styles.previewText}>{nome.trim() || 'Prévia da etapa'}</Text>
              </View>

              <Text style={styles.automationLabel}>Automações</Text>
              <View style={styles.automationBlock}>
                <ToggleField
                  label="Etapa de agendamento"
                  value={isAgendamento}
                  onChange={(value) => {
                    setIsAgendamento(value);
                    setError(null);
                  }}
                />
                <Text style={styles.automationHint}>
                  O lead entra aqui automaticamente quando um agendamento é criado para ele. Apenas
                  uma etapa pode ter esta marcação — ao marcar aqui, ela sai da etapa anterior.
                </Text>
              </View>
              <View style={styles.automationBlock}>
                <ToggleField
                  label="Etapa de simulação"
                  value={isSimulacao}
                  onChange={(value) => {
                    setIsSimulacao(value);
                    setError(null);
                  }}
                />
                <Text style={styles.automationHint}>
                  O lead entra aqui automaticamente quando uma simulação é feita para ele. Apenas
                  uma etapa pode ter esta marcação — ao marcar aqui, ela sai da etapa anterior.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.sheetActions}>
              <Button label="Cancelar" variant="ghost" onPress={closeModal} style={styles.flex1} />
              <Button
                label="Salvar"
                onPress={() => void save()}
                loading={saving}
                style={styles.flex1}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    intro: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
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
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    swatch: {
      width: 20,
      height: 20,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    swatchEmpty: { backgroundColor: colors.surfaceAlt },
    itemInfo: { flex: 1 },
    itemName: { ...typography.body, color: colors.ink, fontWeight: '600' },
    itemMeta: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    itemActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    arrow: { ...typography.label, color: colors.ink },
    arrowDisabled: { color: colors.inkSubtle, opacity: 0.4 },
    editLink: { ...typography.label, color: colors.primary },
    deleteLink: { ...typography.label, color: colors.danger },
    addAction: { marginTop: spacing.lg },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '90%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
    },
    sheetTitle: { ...typography.title, color: colors.primary, marginBottom: spacing.lg },
    sheetScroll: { maxHeight: 420 },
    sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    flex1: { flex: 1 },
    fieldLabel: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.sm },
    paletteRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    paletteItem: {
      padding: 3,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    paletteItemSelected: { borderColor: colors.ink },
    paletteColor: {
      width: 30,
      height: 30,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    previewText: { ...typography.body, color: colors.ink },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    tag: {
      ...typography.caption,
      color: colors.primary,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    automationLabel: {
      ...typography.label,
      color: colors.inkMuted,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    automationBlock: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      marginBottom: spacing.md,
    },
    automationHint: { ...typography.caption, color: colors.inkMuted },
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
