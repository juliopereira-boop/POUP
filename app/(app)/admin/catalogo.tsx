/**
 * Painel de administração do CATÁLOGO DO SISTEMA.
 *
 * Aqui o dono do POUP pré-cadastra construtoras prontas para uso: regra de
 * comissão, empreendimentos, material de venda e foto redonda. O corretor
 * depois apenas ADOTA a empresa na aba "Catálogo do sistema".
 *
 * A responsabilidade desta tela é diferente da de um cadastro comum: adotar é
 * VÍNCULO, não cópia — quem adotou lê a MESMA empresa. Logo, salvar um campo
 * aqui muda o simulador de todos os adotantes na hora. É por isso que o aviso
 * do topo é permanente e cada seção repete de quem é o dado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import {
  CommissionRuleForm,
  describeCommissionRule,
  parseDecimalBR,
  useCommissionRuleForm,
} from '@/components/CommissionRuleForm';
import { EntityAvatar } from '@/components/EntityAvatar';
import { Input } from '@/components/Input';
import { LoadingScreen } from '@/components/Loading';
import { MonthYearField } from '@/components/MonthYearField';
import { Screen } from '@/components/Screen';
import { ToggleField } from '@/components/ToggleField';
import {
  db,
  type CatalogPhotoKind,
  type CommissionRule,
  type Company,
  type CompanyInput,
  type Development,
} from '@/data';
import { useIsAdmin } from '@/features/admin';
import { MONTHS } from '@/features/agenda/dates';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const MAX_PHOTO_MB = 5;
const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024;

const REFLECT_WARNING =
  'Tudo que for salvo aqui vale imediatamente para TODOS os corretores que já adotaram a ' +
  'construtora: regra de comissão, empreendimentos, material e foto. A adoção é um vínculo, ' +
  'não uma cópia — não existe "versão antiga" para quem já adotou.';

/* ------------------------------------------------------------------------- *
 * Foto: escolha do arquivo pela web
 * ------------------------------------------------------------------------- */

interface WebFile {
  name: string;
  type: string;
  size: number;
}
interface WebInput {
  type: string;
  accept: string;
  onchange: (() => void) | null;
  click: () => void;
  files: ArrayLike<WebFile> | null;
}

interface PickedImage {
  blob: Blob;
  contentType: string;
  size: number;
}

/**
 * Abre o seletor de arquivos do navegador para UMA imagem.
 *
 * Mesmo caminho do material de venda: `<input type="file">` criado na hora,
 * sem dependência nova. `null` = o admin fechou o seletor sem escolher.
 */
function pickImageWeb(): Promise<PickedImage | null> {
  const doc = (globalThis as unknown as { document?: { createElement: (t: string) => WebInput } })
    .document;
  if (!doc) return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({
        blob: file as unknown as Blob,
        contentType: file.type || 'image/jpeg',
        size: file.size,
      });
    };
    input.click();
  });
}

/** `2026-03-01` -> `Março/2026`, sem passar por `Date` (fuso não atrapalha). */
function formatDeliveryBR(ymd: string | null): string {
  if (!ymd) return '—';
  const [year, month] = ymd.split('-');
  const index = Number(month) - 1;
  const name = MONTHS[index];
  return name && year ? `${name}/${year}` : ymd;
}

function confirmDestructive(title: string, message: string, run: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) run();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', style: 'destructive', onPress: run },
  ]);
}

/* ------------------------------------------------------------------------- *
 * Tela
 * ------------------------------------------------------------------------- */

export default function CatalogoAdminScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [rules, setRules] = useState<Record<string, CommissionRule | null>>({});
  const [developments, setDevelopments] = useState<Development[]>([]);
  /** Quantos empreendimentos cada empresa do catálogo tem DE FATO, por id. */
  const [devCounts, setDevCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  /**
   * Trocar a foto sobrescreve o arquivo no bucket, então a URL pública pode vir
   * igual à anterior e o navegador continuaria mostrando a imagem em cache.
   * Guardamos o instante da troca por id para forçar uma URL nova.
   */
  const [photoNonce, setPhotoNonce] = useState<Record<string, number>>({});
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);

  // Formulário da empresa: `editingId` preenchido = editando; `creating` = nova.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [risk, setRisk] = useState('');
  const [maxInstallments, setMaxInstallments] = useState('');
  const [maxSemiannual, setMaxSemiannual] = useState('');
  const [maxAnnual, setMaxAnnual] = useState('');
  const [coincide, setCoincide] = useState(true);
  const commission = useCommissionRuleForm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Formulário do empreendimento (dentro da empresa aberta).
  const [devFormOpen, setDevFormOpen] = useState(false);
  const [devEditingId, setDevEditingId] = useState<string | null>(null);
  const [devName, setDevName] = useState('');
  const [devDescription, setDevDescription] = useState('');
  const [devDelivery, setDevDelivery] = useState<string | null>(null);
  const [devManager, setDevManager] = useState('');
  const [devSaving, setDevSaving] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const list = await db.catalog.listCompanies();
    const [loadedRules, devs, catalogView] = await Promise.all([
      Promise.all(list.map(async (c) => [c.id, await db.commissions.getRule(c.id)] as const)),
      db.developments.list(user.id),
      db.catalog.list(user.id),
    ]);
    const catalogIds = new Set(list.map((c) => c.id));
    setCompanies(list);
    setRules(Object.fromEntries(loadedRules));
    // A listagem de empreendimentos é a geral (os do usuário + os das empresas
    // que ele adotou); aqui só interessam os das empresas do catálogo.
    setDevelopments(devs.filter((d) => catalogIds.has(d.companyId)));
    // A contagem vem do próprio catálogo porque ela é a ÚNICA visão completa:
    // `db.developments.list` só entrega o que a conta alcança, então sem esta
    // contagem o painel não saberia que existem empreendimentos fora do alcance.
    setDevCounts(Object.fromEntries(catalogView.map((c) => [c.company.id, c.developmentCount])));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [isAdmin, load]);

  const editing = useMemo(
    () => companies.find((c) => c.id === editingId) ?? null,
    [companies, editingId],
  );

  const editingDevelopments = useMemo(
    () => (editingId ? developments.filter((d) => d.companyId === editingId) : []),
    [developments, editingId],
  );

  /**
   * Empreendimentos que existem no catálogo mas não vieram na leitura.
   *
   * `db.developments.list` entrega só o que a CONTA usa (os dela + os das
   * empresas que ela adotou), e o admin não precisa adotar o próprio catálogo.
   * Sem este aviso o painel diria "nenhum empreendimento" para uma construtora
   * que tem vários — e o admin cadastraria tudo de novo, duplicado.
   */
  const outOfReachDevelopments = editingId
    ? Math.max(0, (devCounts[editingId] ?? 0) - editingDevelopments.length)
    : 0;

  /** Adiciona a marca de tempo da última troca para furar o cache do navegador. */
  const photoSrc = useCallback(
    (id: string, url: string | null): string | null => {
      const stamp = photoNonce[id];
      if (!url || !stamp) return url;
      return `${url}${url.includes('?') ? '&' : '?'}v=${stamp}`;
    },
    [photoNonce],
  );

  /* --- formulário da empresa --- */

  function closeForm() {
    setEditingId(null);
    setCreating(false);
    setName('');
    setRisk('');
    setMaxInstallments('');
    setMaxSemiannual('');
    setMaxAnnual('');
    setCoincide(true);
    commission.reset();
    setError(null);
    setFeedback(null);
    closeDevForm();
    setDevError(null);
  }

  function startCreate() {
    closeForm();
    setCreating(true);
  }

  async function startEdit(company: Company) {
    closeForm();
    setEditingId(company.id);
    setName(company.name);
    setRisk(company.risk != null ? String(company.risk) : '');
    setMaxInstallments(company.maxInstallments != null ? String(company.maxInstallments) : '');
    setMaxSemiannual(company.maxSemiannual != null ? String(company.maxSemiannual) : '');
    setMaxAnnual(company.maxAnnual != null ? String(company.maxAnnual) : '');
    setCoincide(company.coincideInstallments);
    await commission.loadFor(company.id);
  }

  async function saveCompany() {
    if (!user) return;
    setError(null);
    setFeedback(null);
    if (!name.trim()) {
      setError('Informe o nome da construtora.');
      return;
    }
    // A regra de comissão é validada ANTES de tocar no banco: nada de publicar
    // a empresa no catálogo e só então descobrir que o percentual estava errado.
    const ruleError = commission.validate();
    if (ruleError) {
      setError(ruleError);
      return;
    }

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
      : await db.catalog.createCompany(user.id, payload);
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return;
    }

    // A regra depende do id da empresa: ao criar, ela só pode ser salva depois
    // que a empresa nasce.
    const companyId = result.data.id;
    const ruleFailure = await commission.persist(user.id, companyId);
    setSaving(false);
    await load();
    if (ruleFailure) {
      // A empresa está salva, só a regra falhou: segue em edição para o admin
      // tentar de novo sem perder o que digitou.
      setEditingId(companyId);
      setCreating(false);
      setError(`Empresa salva, mas a regra de comissão não foi: ${ruleFailure}`);
      return;
    }
    setEditingId(companyId);
    setCreating(false);
    setFeedback(
      editingId
        ? 'Alterações publicadas. Quem já adotou esta construtora está usando a nova regra.'
        : 'Construtora publicada no catálogo. Falta a foto, os empreendimentos e o material.',
    );
  }

  /* --- fotos --- */

  async function changePhoto(kind: CatalogPhotoKind, id: string) {
    setError(null);
    setFeedback(null);
    const picked = await pickImageWeb();
    if (!picked) return;
    if (picked.size > MAX_PHOTO_BYTES) {
      setError(`A imagem tem que ter até ${MAX_PHOTO_MB} MB.`);
      return;
    }
    setPhotoBusyId(id);
    const result = await db.catalog.uploadPhoto(kind, id, picked.blob, picked.contentType);
    setPhotoBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyPhoto(kind, id, result.data);
  }

  function removePhoto(kind: CatalogPhotoKind, id: string, label: string) {
    confirmDestructive(
      'Remover a foto',
      `A foto de "${label}" volta a ser as iniciais para todos os corretores que adotaram.`,
      () => {
        void (async () => {
          setPhotoBusyId(id);
          const result = await db.catalog.removePhoto(kind, id);
          setPhotoBusyId(null);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          applyPhoto(kind, id, null);
        })();
      },
    );
  }

  function applyPhoto(kind: CatalogPhotoKind, id: string, url: string | null) {
    setPhotoNonce((prev) => ({ ...prev, [id]: Date.now() }));
    if (kind === 'company') {
      setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, photoUrl: url } : c)));
    } else {
      setDevelopments((prev) => prev.map((d) => (d.id === id ? { ...d, photoUrl: url } : d)));
    }
  }

  /* --- empreendimentos --- */

  function closeDevForm() {
    setDevFormOpen(false);
    setDevEditingId(null);
    setDevName('');
    setDevDescription('');
    setDevDelivery(null);
    setDevManager('');
    setDevError(null);
  }

  function startCreateDev() {
    closeDevForm();
    setDevFormOpen(true);
  }

  function startEditDev(dev: Development) {
    setDevFormOpen(true);
    setDevEditingId(dev.id);
    setDevName(dev.name);
    setDevDescription(dev.description ?? '');
    setDevDelivery(dev.deliveryDate);
    setDevManager(dev.managerName ?? '');
    setDevError(null);
  }

  async function saveDev() {
    if (!user || !editingId) return;
    setDevError(null);
    if (!devName.trim()) {
      setDevError('Informe o nome do empreendimento.');
      return;
    }
    setDevSaving(true);
    const payload = {
      companyId: editingId,
      name: devName.trim(),
      description: devDescription.trim() || null,
      deliveryDate: devDelivery,
      managerName: devManager.trim() || null,
    };
    const result = devEditingId
      ? await db.developments.update(devEditingId, payload)
      : await db.developments.create(user.id, payload);
    setDevSaving(false);
    if (!result.ok) {
      setDevError(result.error);
      return;
    }
    closeDevForm();
    await load();
  }

  function confirmDeleteDev(dev: Development) {
    confirmDestructive(
      'Excluir empreendimento',
      `"${dev.name}" sai do catálogo e desaparece para todos os corretores que adotaram esta ` +
        'construtora. As simulações e vendas já feitas guardam os dados em snapshot e não mudam.',
      () => {
        void (async () => {
          const result = await db.developments.remove(dev.id);
          if (!result.ok) {
            setDevError(result.error);
            return;
          }
          if (devEditingId === dev.id) closeDevForm();
          await load();
        })();
      },
    );
  }

  /* --- render --- */

  if (loadingAdmin) return <LoadingScreen />;

  if (!isAdmin) {
    return (
      <Screen>
        <Text style={styles.sectionLabel}>Acesso restrito</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            O catálogo do sistema é mantido apenas pelo administrador do POUP. Se você precisa de
            acesso, fale com o responsável pela conta.
          </Text>
        </View>
      </Screen>
    );
  }

  const formOpen = creating || editingId != null;

  return (
    <Screen>
      <View style={styles.warnCard}>
        <Text style={styles.warnTitle}>Isto vale para todo mundo</Text>
        <Text style={styles.warnText}>{REFLECT_WARNING}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      {!formOpen ? (
        <>
          <View style={styles.topAction}>
            <Button label="Nova construtora no catálogo" onPress={startCreate} />
          </View>

          <Text style={styles.sectionLabel}>
            Construtoras do catálogo{companies.length > 0 ? ` (${companies.length})` : ''}
          </Text>
          {loading ? (
            <Text style={styles.muted}>Carregando...</Text>
          ) : companies.length === 0 ? (
            <Text style={styles.muted}>
              Nenhuma construtora no catálogo ainda. Cadastre a primeira: ela aparece na aba
              &quot;Catálogo do sistema&quot; de todos os corretores.
            </Text>
          ) : (
            companies.map((c) => {
              const devCount = devCounts[c.id] ?? 0;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => void startEdit(c)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                >
                  <EntityAvatar photoUrl={photoSrc(c.id, c.photoUrl)} name={c.name} size={48} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{c.name}</Text>
                    <Text style={styles.itemMeta}>
                      Comissão: {describeCommissionRule(rules[c.id] ?? null)} · Risco:{' '}
                      {c.risk != null ? `${c.risk}%` : '—'}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {devCount === 1 ? '1 empreendimento' : `${devCount} empreendimentos`}
                      {c.photoUrl ? '' : ' · sem foto'}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              );
            })
          )}
        </>
      ) : (
        <>
          <View style={styles.backAction}>
            <Button label="‹ Voltar para a lista" variant="ghost" onPress={closeForm} />
          </View>

          <View style={styles.card}>
            <Text style={styles.formTitle}>
              {editing ? editing.name : 'Nova construtora no catálogo'}
            </Text>

            <Text style={styles.sectionTitle}>Foto redonda</Text>
            {editingId ? (
              <View style={styles.photoBlock}>
                <View style={styles.photoRow}>
                  <EntityAvatar
                    photoUrl={photoSrc(editingId, editing?.photoUrl ?? null)}
                    name={name || 'Construtora'}
                    size={64}
                  />
                  <Text style={styles.photoHint}>
                    Aparece na lista do corretor, no seletor do simulador e no topo do PDF da
                    proposta. Imagem quadrada até {MAX_PHOTO_MB} MB fica melhor.
                  </Text>
                </View>
                <View style={styles.photoButtons}>
                  <Button
                    label={editing?.photoUrl ? 'Trocar foto' : 'Enviar foto'}
                    variant="secondary"
                    onPress={() => void changePhoto('company', editingId)}
                    loading={photoBusyId === editingId}
                    style={styles.flex1}
                  />
                  {editing?.photoUrl ? (
                    <Button
                      label="Remover"
                      variant="ghost"
                      onPress={() => removePhoto('company', editingId, editing.name)}
                      disabled={photoBusyId === editingId}
                      style={styles.flex1}
                    />
                  ) : null}
                </View>
              </View>
            ) : (
              <Text style={styles.hint}>Salve a construtora para enviar a foto.</Text>
            )}

            <Text style={styles.sectionTitle}>Identificação</Text>
            <Input
              label="Nome da construtora"
              value={name}
              onChangeText={setName}
              placeholder="Ex.: Construtora Alfa"
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

            <View style={styles.formActions}>
              <Button label="Cancelar" variant="ghost" onPress={closeForm} style={styles.flex1} />
              <Button
                label={editingId ? 'Publicar' : 'Criar'}
                onPress={saveCompany}
                loading={saving}
                style={styles.flex1}
              />
            </View>
          </View>

          {editingId ? (
            <>
              <Text style={styles.sectionLabel}>
                Empreendimentos
                {(devCounts[editingId] ?? 0) > 0 ? ` (${devCounts[editingId]})` : ''}
              </Text>
              <Text style={styles.hint}>
                Empreendimento novo entra na conta de quem já adotou esta construtora sem precisar
                adotar de novo.
              </Text>
              {devError ? <Text style={styles.error}>{devError}</Text> : null}

              {outOfReachDevelopments > 0 ? (
                <View style={styles.warnCard}>
                  <Text style={styles.warnTitle}>
                    {outOfReachDevelopments === 1
                      ? '1 empreendimento fora da sua lista'
                      : `${outOfReachDevelopments} empreendimentos fora da sua lista`}
                  </Text>
                  <Text style={styles.warnText}>
                    Eles existem no catálogo e os corretores que adotaram estão vendo, mas a leitura
                    de empreendimentos só devolve o que a SUA conta usa. Para editá-los aqui, adote
                    esta construtora na aba &quot;Catálogo do sistema&quot;.
                  </Text>
                </View>
              ) : null}

              {editingDevelopments.length === 0 && outOfReachDevelopments === 0 && !devFormOpen ? (
                <Text style={styles.muted}>Nenhum empreendimento cadastrado ainda.</Text>
              ) : null}

              {editingDevelopments.map((d) => (
                <View key={d.id} style={styles.item}>
                  <EntityAvatar photoUrl={photoSrc(d.id, d.photoUrl)} name={d.name} size={40} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{d.name}</Text>
                    <Text style={styles.itemMeta}>
                      Entrega: {formatDeliveryBR(d.deliveryDate)} · Gerente: {d.managerName ?? '—'}
                    </Text>
                    <View style={styles.linkRow}>
                      <Pressable onPress={() => startEditDev(d)} hitSlop={8}>
                        <Text style={styles.editLink}>Editar</Text>
                      </Pressable>
                      <Pressable onPress={() => void changePhoto('development', d.id)} hitSlop={8}>
                        <Text style={styles.editLink}>
                          {photoBusyId === d.id
                            ? 'Enviando...'
                            : d.photoUrl
                              ? 'Trocar foto'
                              : 'Enviar foto'}
                        </Text>
                      </Pressable>
                      {d.photoUrl ? (
                        <Pressable
                          onPress={() => removePhoto('development', d.id, d.name)}
                          hitSlop={8}
                        >
                          <Text style={styles.editLink}>Remover foto</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => confirmDeleteDev(d)} hitSlop={8}>
                        <Text style={styles.deleteLink}>Excluir</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}

              {devFormOpen ? (
                <View style={styles.card}>
                  <Text style={styles.formTitle}>
                    {devEditingId ? 'Editar empreendimento' : 'Novo empreendimento'}
                  </Text>
                  <Input
                    label="Nome do empreendimento"
                    value={devName}
                    onChangeText={setDevName}
                    placeholder="Ex.: Residencial..."
                  />
                  <Input
                    label="Descrição do empreendimento (opcional)"
                    value={devDescription}
                    onChangeText={setDevDescription}
                    placeholder="Ex.: 2 quartos sendo uma suíte, varanda gourmet, lazer completo…"
                    multiline
                    numberOfLines={4}
                    style={styles.textArea}
                  />
                  <MonthYearField
                    label="Data de entrega (mês/ano)"
                    value={devDelivery}
                    onChange={setDevDelivery}
                    placeholder="Selecione mês/ano"
                  />
                  <Input
                    label="Gerente responsável (opcional)"
                    value={devManager}
                    onChangeText={setDevManager}
                    placeholder="Nome do gerente"
                    autoCapitalize="words"
                  />
                  <View style={styles.formActions}>
                    <Button
                      label="Cancelar"
                      variant="ghost"
                      onPress={closeDevForm}
                      style={styles.flex1}
                    />
                    <Button
                      label={devEditingId ? 'Salvar' : 'Adicionar'}
                      onPress={saveDev}
                      loading={devSaving}
                      style={styles.flex1}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.topAction}>
                  <Button
                    label="Adicionar empreendimento"
                    variant="secondary"
                    onPress={startCreateDev}
                  />
                </View>
              )}

              <Text style={styles.sectionLabel}>Material de venda</Text>
              <View style={styles.card}>
                <Text style={styles.cardText}>
                  O material que você subir para uma construtora do catálogo fica na pasta do
                  sistema e é lido por todos os corretores que adotaram — eles não conseguem
                  alterar nem apagar. Na tela do material, escolha
                  {editing ? ` "${editing.name}"` : ' a construtora'} para chegar nessa pasta.
                </Text>
                <View style={styles.cardAction}>
                  <Button
                    label="Abrir material de venda"
                    variant="secondary"
                    onPress={() => router.push('/(app)/material-venda')}
                  />
                </View>
              </View>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    warnCard: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.warning,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },
    warnTitle: { ...typography.label, color: colors.warning },
    warnText: { ...typography.caption, color: colors.ink },
    topAction: { marginBottom: spacing.lg },
    // Hug do conteúdo: no desktop um "voltar" esticado em 1080px fica perdido.
    backAction: { alignSelf: 'flex-start', marginBottom: spacing.lg },
    sectionLabel: {
      ...typography.label,
      color: colors.inkMuted,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    cardText: { ...typography.caption, color: colors.inkMuted },
    cardAction: { marginTop: spacing.lg },
    formTitle: { ...typography.heading, color: colors.ink, marginBottom: spacing.md },
    sectionTitle: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    photoBlock: { marginBottom: spacing.lg, gap: spacing.md },
    photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    photoHint: { ...typography.caption, color: colors.inkMuted, flex: 1 },
    // Teto de largura: sem ele, no desktop os dois botões da foto ocupam a
    // linha inteira do card e parecem a ação principal da tela.
    photoButtons: { flexDirection: 'row', gap: spacing.md, maxWidth: 420 },
    hint: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.md },
    textArea: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
    formActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    flex1: { flex: 1 },
    muted: { ...typography.body, color: colors.inkSubtle, marginBottom: spacing.md },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.lg,
    },
    itemPressed: { opacity: 0.6 },
    itemInfo: { flex: 1, gap: 2 },
    itemName: { ...typography.body, color: colors.ink, fontWeight: '600' },
    itemMeta: { ...typography.caption, color: colors.inkMuted },
    linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.sm },
    editLink: { ...typography.label, color: colors.primary },
    deleteLink: { ...typography.label, color: colors.danger },
    chevron: { ...typography.title, color: colors.inkSubtle },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    feedback: {
      ...typography.caption,
      color: colors.primaryDark,
      backgroundColor: colors.primarySoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
  });
