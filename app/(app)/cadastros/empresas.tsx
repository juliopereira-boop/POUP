import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import {
  CommissionRuleForm,
  describeCommissionRule,
  parseDecimalBR,
  useCommissionRuleForm,
} from '@/components/CommissionRuleForm';
import { EntityAvatar } from '@/components/EntityAvatar';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { ToggleField } from '@/components/ToggleField';
import {
  db,
  type CatalogCompany,
  type Company,
  type CommissionRule,
  type CompanyInput,
  type Correspondent,
} from '@/data';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

/**
 * Duas leituras da mesma coisa: o que o corretor JÁ usa e o que o POUP oferece
 * pronto. Ficam em abas porque são fluxos diferentes — uma é cadastro na mão, a
 * outra é adoção com um toque.
 */
type Tab = 'minhas' | 'catalogo';

/** "3 empreendimentos" sem cair no plural errado quando é um só. */
function developmentCountLabel(count: number): string {
  if (count === 0) return 'Nenhum empreendimento cadastrado';
  return count === 1 ? '1 empreendimento' : `${count} empreendimentos`;
}

export default function EmpresasScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('minhas');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [rules, setRules] = useState<Record<string, CommissionRule | null>>({});
  const [catalog, setCatalog] = useState<CatalogCompany[]>([]);
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

  const commission = useCommissionRuleForm();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Empresa do catálogo aberta no aviso de aceite (ou na ficha, se já adotada). */
  const [openCatalog, setOpenCatalog] = useState<CatalogCompany | null>(null);
  const [adopting, setAdopting] = useState(false);
  /** Retorno visível do que acabou de acontecer — adoção é uma ação silenciosa. */
  const [flash, setFlash] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // As duas abas são carregadas juntas de propósito: adotar/remover muda as
    // DUAS listas ao mesmo tempo, e recarregar só uma deixaria a outra mentindo.
    const [list, catalogList] = await Promise.all([
      db.companies.list(user.id),
      db.catalog.list(user.id),
    ]);
    setCompanies(list);
    setCatalog(catalogList);
    const loaded = await Promise.all(
      list.map(async (c) => [c.id, await db.commissions.getRule(c.id)] as const),
    );
    setRules(Object.fromEntries(loaded));
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
    commission.reset();
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
    await commission.loadFor(company.id);
  }

  async function save() {
    if (!user) return;
    setError(null);
    if (!name.trim()) return setError('Informe o nome da empresa.');

    // A regra de comissão é validada ANTES de tocar no banco: nada de criar a
    // empresa e depois descobrir que o percentual estava errado.
    const ruleError = commission.validate();
    if (ruleError) return setError(ruleError);

    const payload: CompanyInput = {
      name: name.trim(),
      risk: parseDecimalBR(risk),
      maxInstallments: parseDecimalBR(maxInstallments),
      maxSemiannual: parseDecimalBR(maxSemiannual),
      maxAnnual: parseDecimalBR(maxAnnual),
      coincideInstallments: coincide,
    };
    setSaving(true);
    const result = editingId
      ? await db.companies.update(editingId, payload)
      : await db.companies.create(user.id, payload);
    if (!result.ok) {
      setSaving(false);
      return setError(result.error);
    }

    // A regra depende do id da empresa: ao criar, salva logo depois que a
    // empresa nasce; ao editar, usa o id que já existe.
    const companyId = result.data.id;
    const ruleFailure = await commission.persist(user.id, companyId);
    setSaving(false);
    if (ruleFailure) {
      // A empresa está salva; só a regra falhou. Passa para o modo de edição
      // dela para o corretor tentar de novo sem perder o que digitou.
      setEditingId(companyId);
      setCorrespondents(await db.companies.listCorrespondents(companyId));
      void load();
      return setError(`Empresa salva, mas a regra de comissão não foi: ${ruleFailure}`);
    }

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

  async function adopt(entry: CatalogCompany) {
    if (!user) return;
    setCatalogError(null);
    setAdopting(true);
    const result = await db.catalog.adopt(user.id, entry.company.id);
    setAdopting(false);
    if (!result.ok) {
      setCatalogError(result.error);
      return;
    }
    setOpenCatalog(null);
    setFlash(
      `${entry.company.name} agora é sua: os empreendimentos dela já aparecem no simulador e nos cadastros.`,
    );
    void load();
  }

  /**
   * Remover é VÍNCULO desfeito, não exclusão: a confirmação precisa dizer isso,
   * senão o corretor acha que vai perder venda e comissão já lançadas.
   */
  function confirmUnadopt(company: Company) {
    if (!user) return;
    const message =
      `Remover "${company.name}" da sua lista?\n\n` +
      'A empresa e os empreendimentos dela saem do seu app. ' +
      'Suas simulações, vendas e comissões já lançadas continuam iguais — nada do seu histórico é apagado. ' +
      'Você pode adotar de novo quando quiser.';

    const doRemove = async () => {
      setCatalogError(null);
      const result = await db.catalog.unadopt(user.id, company.id);
      if (!result.ok) {
        setCatalogError(result.error);
        return;
      }
      setOpenCatalog(null);
      setFlash(`${company.name} saiu da sua lista. Seu histórico continua intacto.`);
      void load();
    };

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) void doRemove();
    } else {
      Alert.alert('Remover da minha lista', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => void doRemove() },
      ]);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    // O aviso de sucesso é sobre a aba onde a ação aconteceu: trocar de aba o
    // torna ruído.
    setFlash(null);
    setCatalogError(null);
  }

  return (
    <Screen>
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentItem, tab === 'minhas' && styles.segmentItemActive]}
          onPress={() => switchTab('minhas')}
        >
          <Text style={[styles.segmentText, tab === 'minhas' && styles.segmentTextActive]}>
            Minhas empresas
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentItem, tab === 'catalogo' && styles.segmentItemActive]}
          onPress={() => switchTab('catalogo')}
        >
          <Text style={[styles.segmentText, tab === 'catalogo' && styles.segmentTextActive]}>
            Catálogo do sistema
          </Text>
        </Pressable>
      </View>

      {flash ? (
        <Pressable style={styles.flash} onPress={() => setFlash(null)}>
          <Text style={styles.flashText}>{flash}</Text>
        </Pressable>
      ) : null}
      {catalogError ? <Text style={styles.error}>{catalogError}</Text> : null}

      {tab === 'minhas' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.formTitle}>{editingId ? 'Editar empresa' : 'Nova empresa'}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Input
              label="Nome da empresa"
              value={name}
              onChangeText={setName}
              placeholder="Construtora..."
            />

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

            <CommissionRuleForm
              controller={commission}
              companyId={editingId}
              userId={user?.id ?? null}
            />

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
            <Text style={styles.muted}>
              Nenhuma empresa ainda. Cadastre a sua acima ou adote uma pronta no catálogo do
              sistema.
            </Text>
          ) : (
            companies.map((c) => (
              <View key={c.id} style={styles.item}>
                <EntityAvatar photoUrl={c.photoUrl} name={c.name} size={44} />
                <View style={styles.itemInfo}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemName}>{c.name}</Text>
                    {c.isCatalog ? <SystemBadge /> : null}
                  </View>
                  <Text style={styles.itemMeta}>Risco: {c.risk != null ? `${c.risk}%` : '—'}</Text>
                  <Text style={styles.itemMeta}>
                    Comissão: {describeCommissionRule(rules[c.id] ?? null)}
                  </Text>
                  {/* Empresa do catálogo é somente leitura: em vez de esconder e
                      deixar o corretor procurando o botão, a linha explica. */}
                  {c.isCatalog ? (
                    <Text style={styles.itemNote}>
                      Mantida pelo POUP. As atualizações chegam sozinhas.
                    </Text>
                  ) : null}
                </View>
                <View style={styles.itemActions}>
                  {c.isCatalog ? (
                    <Pressable onPress={() => confirmUnadopt(c)} hitSlop={8}>
                      <Text style={styles.deleteLink}>Remover da{'\n'}minha lista</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable onPress={() => startEdit(c)} hitSlop={8}>
                        <Text style={styles.editLink}>Editar</Text>
                      </Pressable>
                      <Pressable onPress={() => confirmDelete(c)} hitSlop={8}>
                        <Text style={styles.deleteLink}>Excluir</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            ))
          )}
        </>
      ) : (
        <>
          <Text style={styles.intro}>
            Construtoras que o POUP já configurou: regra de comissão, empreendimentos e material
            prontos. Adotar não cria uma cópia — você passa a usar os dados do POUP e recebe as
            atualizações automaticamente.
          </Text>

          {loading ? (
            <Text style={styles.muted}>Carregando...</Text>
          ) : catalog.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nenhuma construtora publicada ainda</Text>
              <Text style={styles.emptyText}>
                O POUP ainda não publicou construtoras no catálogo. Quando publicar, elas aparecem
                aqui e você adota com um toque. Até lá, cadastre as suas em “Minhas empresas”.
              </Text>
            </View>
          ) : (
            catalog.map((entry) => (
              <Pressable
                key={entry.company.id}
                onPress={() => {
                  setCatalogError(null);
                  setOpenCatalog(entry);
                }}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                <EntityAvatar photoUrl={entry.company.photoUrl} name={entry.company.name} size={48} />
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{entry.company.name}</Text>
                  <Text style={styles.itemMeta}>
                    {developmentCountLabel(entry.developmentCount)}
                    {entry.ufs.length > 0 ? ` · ${entry.ufs.join(', ')}` : ''}
                  </Text>
                  <Text style={styles.itemMeta}>
                    Comissão: {entry.commissionSummary ?? 'a combinar com a construtora'}
                  </Text>
                </View>
                {entry.adopted ? (
                  <View style={styles.pillOk}>
                    <Text style={styles.pillOkText}>Já no{'\n'}seu app</Text>
                  </View>
                ) : (
                  <Text style={styles.openHint}>Adotar ›</Text>
                )}
              </Pressable>
            ))
          )}
        </>
      )}

      {openCatalog ? (
        <CatalogSheet
          entry={openCatalog}
          busy={adopting}
          onClose={() => setOpenCatalog(null)}
          onAdopt={() => void adopt(openCatalog)}
          onRemove={() => confirmUnadopt(openCatalog.company)}
        />
      ) : null}
    </Screen>
  );
}

/** Etiqueta discreta de "veio do catálogo, você não edita". */
function SystemBadge() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>Do sistema</Text>
    </View>
  );
}

/**
 * O aviso de aceite (e a ficha da empresa já adotada).
 *
 * O texto é longo de propósito: o corretor está autorizando dados de fora a
 * entrarem no app dele e a mudarem sozinhos depois. Um "OK?" seco esconderia
 * justamente o que ele precisa entender antes de aceitar.
 */
function CatalogSheet({
  entry,
  busy,
  onClose,
  onAdopt,
  onRemove,
}: {
  entry: CatalogCompany;
  busy: boolean;
  onClose: () => void;
  onAdopt: () => void;
  onRemove: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { company, developmentCount, developmentNames, commissionSummary, adopted } = entry;
  const hidden = developmentCount - developmentNames.length;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {adopted ? 'Construtora do sistema' : 'Usar esta construtora no seu app?'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Fechar">
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetIdentity}>
              <EntityAvatar photoUrl={company.photoUrl} name={company.name} size={56} />
              <View style={styles.flex1}>
                <Text style={styles.sheetName}>{company.name}</Text>
                <Text style={styles.itemMeta}>
                  {developmentCountLabel(developmentCount)}
                  {entry.ufs.length > 0 ? ` · ${entry.ufs.join(', ')}` : ''}
                </Text>
                <Text style={styles.itemMeta}>
                  Comissão: {commissionSummary ?? 'a combinar com a construtora'}
                </Text>
              </View>
              {adopted ? <SystemBadge /> : null}
            </View>

            <Text style={styles.sheetSection}>
              {adopted ? 'Empreendimentos que você já usa' : 'Empreendimentos que vão entrar'}
            </Text>
            {developmentNames.length === 0 ? (
              <Text style={styles.sheetHint}>
                Esta construtora ainda não tem empreendimentos publicados. Os que o POUP cadastrar
                depois aparecem sozinhos no seu app.
              </Text>
            ) : (
              <View style={styles.devList}>
                {developmentNames.map((devName) => (
                  <Text key={devName} style={styles.devItem}>
                    • {devName}
                  </Text>
                ))}
                {hidden > 0 ? (
                  <Text style={styles.devMore}>
                    e mais {hidden} {hidden === 1 ? 'empreendimento' : 'empreendimentos'}
                  </Text>
                ) : null}
              </View>
            )}

            <Text style={styles.sheetSection}>Como funciona</Text>
            <View style={styles.explainBox}>
              <Text style={styles.explainItem}>
                • A empresa e os empreendimentos ficam{' '}
                <Text style={styles.strong}>somente leitura</Text> no seu app: quem mantém os dados
                é o POUP.
              </Text>
              <Text style={styles.explainItem}>
                • <Text style={styles.strong}>As atualizações chegam sozinhas</Text> — regra de
                comissão nova, empreendimento novo, material atualizado. Você não reimporta nada.
              </Text>
              <Text style={styles.explainItem}>
                • <Text style={styles.strong}>Seu histórico não muda</Text>: simulações, vendas e
                comissões já lançadas guardam os valores do dia em que foram feitas.
              </Text>
              <Text style={styles.explainItem}>
                • Mudou de ideia? Você remove da sua lista quando quiser, sem perder nada do que já
                lançou.
              </Text>
            </View>

            {adopted ? (
              <>
                <Button label="Remover da minha lista" variant="danger" onPress={onRemove} />
                <Button
                  label="Fechar"
                  variant="ghost"
                  onPress={onClose}
                  style={styles.sheetCancel}
                />
              </>
            ) : (
              <>
                <Button
                  label="Aceitar e usar no meu app"
                  onPress={onAdopt}
                  loading={busy}
                />
                <Button
                  label="Cancelar"
                  variant="ghost"
                  onPress={onClose}
                  style={styles.sheetCancel}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.lg,
      padding: 4,
      marginBottom: spacing.lg,
    },
    segmentItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md },
    segmentItemActive: { backgroundColor: colors.surface },
    segmentText: { ...typography.label, color: colors.inkMuted, textAlign: 'center' },
    segmentTextActive: { color: colors.primary },

    intro: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    flash: {
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.success,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    flashText: { ...typography.caption, color: colors.success },

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
    pressed: { opacity: 0.7 },
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
    itemActions: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
    editLink: { ...typography.label, color: colors.primary },
    deleteLink: { ...typography.label, color: colors.danger, textAlign: 'right' },
    openHint: { ...typography.label, color: colors.primary },

    badge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    badgeText: { ...typography.caption, fontSize: 11, fontWeight: '700', color: colors.primary },
    pillOk: {
      backgroundColor: colors.successSoft,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    pillOkText: {
      ...typography.caption,
      fontSize: 12,
      fontWeight: '700',
      color: colors.success,
      textAlign: 'center',
    },

    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    emptyTitle: { ...typography.label, color: colors.ink },
    emptyText: { ...typography.caption, color: colors.inkMuted },

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
    sheetIdentity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    sheetName: { ...typography.body, color: colors.ink, fontWeight: '700' },
    sheetSection: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    sheetHint: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    devList: { marginBottom: spacing.lg, gap: 2 },
    devItem: { ...typography.caption, color: colors.ink },
    devMore: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    explainBox: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    explainItem: { ...typography.caption, color: colors.inkMuted },
    strong: { color: colors.ink, fontWeight: '700' },
    sheetCancel: { marginTop: spacing.sm },

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
