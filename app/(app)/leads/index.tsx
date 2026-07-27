import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import {
  db,
  type Company,
  type Development,
  type Lead,
  type LeadStage,
  type StorageEntry,
} from '@/data';
import { formatPhone } from '@/lib/masks';
import { env } from '@/lib/env';
import {
  generateInvite,
  generatePitch,
  prospectLeads,
  type ProspectedLead,
} from '@/lib/prospeccao';
import { sessionStorage } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

type Tab = 'gestao' | 'prospeccao';

const SHOW_CAPTACAO_CARD = false;

const MEDIA_LINK_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_WA_TEXT_LENGTH = 1800;

const SOURCE_LABEL: Record<Lead['source'], string> = {
  landing: 'Página de captação',
  whatsapp: 'WhatsApp',
  prospeccao: 'Prospecção',
  meta: 'Facebook/Instagram',
  manual: 'Manual',
};

const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

async function shareOrCopy(text: string): Promise<'copied' | 'shared' | 'failed'> {
  if (Platform.OS === 'web') {
    const nav = (
      globalThis as unknown as {
        navigator?: { clipboard?: { writeText: (s: string) => Promise<void> } };
      }
    ).navigator;
    if (nav?.clipboard) {
      try {
        await nav.clipboard.writeText(text);
        return 'copied';
      } catch {
        return 'failed';
      }
    }
    return 'failed';
  }
  try {
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}

function qrCodeUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}`;
}

export default function LeadsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [tab, setTab] = useState<Tab>('gestao');

  return (
    <Screen>
      <Text style={styles.title}>Leads</Text>

      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentItem, tab === 'gestao' && styles.segmentItemActive]}
          onPress={() => setTab('gestao')}
        >
          <Text style={[styles.segmentText, tab === 'gestao' && styles.segmentTextActive]}>
            Gestão de Leads
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentItem, tab === 'prospeccao' && styles.segmentItemActive]}
          onPress={() => setTab('prospeccao')}
        >
          <Text style={[styles.segmentText, tab === 'prospeccao' && styles.segmentTextActive]}>
            Prospecção
          </Text>
        </Pressable>
      </View>

      {tab === 'gestao' ? (
        <GestaoLeadsTab userId={user?.id ?? null} brokerName={profile?.fullName ?? null} />
      ) : (
        <ProspeccaoTab
          userId={user?.id ?? null}
          brokerName={profile?.fullName ?? null}
          brokerPhone={profile?.phone ?? null}
        />
      )}
    </Screen>
  );
}

function GestaoLeadsTab({
  userId,
  brokerName,
}: {
  userId: string | null;
  brokerName: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [atendimento, setAtendimento] = useState<Lead | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fCompany, setFCompany] = useState<string | null>(null);
  const [fDevelopment, setFDevelopment] = useState<string | null>(null);
  const [fStage, setFStage] = useState<string | null>(null);
  const [fBusca, setFBusca] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [list, stageList, comps, devs] = await Promise.all([
      db.leads.list(userId),
      db.leads.listStages(userId),
      db.companies.list(userId),
      db.developments.list(userId),
    ]);
    setLeads(list);
    setStages(stageList);
    setCompanies(comps);
    setDevelopments(devs);
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onAdd() {
    if (!userId) return;
    setError(null);
    if (!newName.trim()) return setError('Informe o nome.');
    if (newPhone.replace(/\D/g, '').length < 10) return setError('Informe um telefone válido.');
    const res = await db.leads.create(userId, { name: newName.trim(), phone: newPhone });
    if (!res.ok) return setError(res.error);
    setNewName('');
    setNewPhone('');
    setAdding(false);
    void load();
  }

  const filterDevs = useMemo(
    () => (fCompany ? developments.filter((d) => d.companyId === fCompany) : developments),
    [developments, fCompany],
  );

  const activeFilters =
    (fCompany ? 1 : 0) + (fDevelopment ? 1 : 0) + (fStage ? 1 : 0) + (fBusca.trim() ? 1 : 0);

  const filtered = useMemo(() => {
    const termo = fBusca.trim().toLowerCase();
    const termoDigits = fBusca.replace(/\D/g, '');
    return leads.filter((l) => {
      if (fCompany && l.companyId !== fCompany) return false;
      if (fDevelopment && l.developmentId !== fDevelopment) return false;
      if (fStage && l.stageId !== fStage) return false;
      if (!termo) return true;
      if (l.name.toLowerCase().includes(termo)) return true;
      const cpfDigits = (l.cpf ?? '').replace(/\D/g, '');
      return termoDigits.length > 0 && cpfDigits.includes(termoDigits);
    });
  }, [leads, fCompany, fDevelopment, fStage, fBusca]);

  function limparFiltros() {
    setFCompany(null);
    setFDevelopment(null);
    setFStage(null);
    setFBusca('');
  }

  function onRemove(lead: Lead) {
    const doRemove = async () => {
      const res = await db.leads.remove(lead.id);
      if (res.ok) setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    };
    const msg = `Excluir o lead "${lead.name}"?`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(msg)) void doRemove();
    } else {
      Alert.alert('Excluir lead', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doRemove() },
      ]);
    }
  }

  return (
    <View>
      <Button
        label={adding ? '− Adicionar lead' : '+ Adicionar lead'}
        variant="secondary"
        onPress={() => setAdding((v) => !v)}
        style={styles.addToggle}
      />
      {adding ? (
        <View style={styles.addCard}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Input label="Nome" value={newName} onChangeText={setNewName} autoCapitalize="words" />
          <Input
            label="Telefone"
            value={newPhone}
            onChangeText={(t) => setNewPhone(formatPhone(t))}
            placeholder="(00) 00000-0000"
            keyboardType="phone-pad"
          />
          <Button label="Salvar lead" onPress={onAdd} />
        </View>
      ) : null}

      {!loading && leads.length > 0 ? (
        <View style={styles.filterWrap}>
          <Pressable
            style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
            onPress={() => setFiltersOpen((v) => !v)}
            accessibilityRole="button"
          >
            <Text style={styles.filterToggleText}>
              Filtros{activeFilters > 0 ? ` (${activeFilters})` : ''}
            </Text>
            <Text style={styles.filterChevron}>{filtersOpen ? '⌃' : '⌄'}</Text>
          </Pressable>

          {filtersOpen ? (
            <View style={styles.filterBody}>
              <Input
                label="Buscar por nome ou CPF"
                value={fBusca}
                onChangeText={setFBusca}
                placeholder="Digite o nome ou o CPF"
                autoCapitalize="none"
              />
              <Select
                label="Empresa"
                placeholder="Todas as empresas"
                value={fCompany}
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(v) => {
                  setFCompany(v);
                  setFDevelopment(null);
                }}
                emptyHint="Nenhuma empresa cadastrada."
              />
              <Select
                label="Empreendimento"
                placeholder="Todos os empreendimentos"
                value={fDevelopment}
                options={filterDevs.map((d) => ({ value: d.id, label: d.name }))}
                onChange={setFDevelopment}
                emptyHint="Nenhum empreendimento cadastrado."
              />
              <Select
                label="Etapa"
                placeholder="Todas as etapas"
                value={fStage}
                options={stages.map((st) => ({ value: st.id, label: st.nome }))}
                onChange={setFStage}
                emptyHint="Configure as etapas em Configurações › Workflow de Leads."
              />
              {activeFilters > 0 ? (
                <Button label="Limpar filtros" variant="secondary" onPress={limparFiltros} />
              ) : null}
            </View>
          ) : null}

          {activeFilters > 0 ? (
            <Text style={styles.filterCount}>
              {filtered.length} de {leads.length} lead(s)
            </Text>
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : leads.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📇</Text>
          <Text style={styles.emptyText}>
            Nenhum lead ainda. Toque em “Prospecção” acima para começar a captar.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyText}>Nenhum lead encontrado com esses filtros.</Text>
        </View>
      ) : (
        filtered.map((lead) => {
          const stage = stages.find((s) => s.id === lead.stageId) ?? null;
          return (
            <View key={lead.id} style={styles.leadRow}>
              <Pressable
                style={({ pressed }) => [styles.leadMain, pressed && styles.pressed]}
                onPress={() =>
                  router.push({ pathname: '/(app)/leads/[id]', params: { id: lead.id } })
                }
                accessibilityRole="button"
              >
                <Text style={styles.leadName} numberOfLines={1}>
                  {lead.name}
                </Text>
                <Text style={styles.leadMeta}>
                  {formatPhone(lead.phone)} · {lead.source === 'whatsapp' ? '💬 ' : ''}
                  {SOURCE_LABEL[lead.source]}
                </Text>
                {stage ? (
                  <Text style={[styles.leadStage, { color: stage.cor }]}>{stage.nome}</Text>
                ) : null}
                {lead.developmentName ? (
                  <Text style={styles.leadMeta}>{lead.developmentName}</Text>
                ) : null}
              </Pressable>
              <View style={styles.leadActions}>
                <Pressable onPress={() => setAtendimento(lead)} hitSlop={8}>
                  <Text style={styles.leadIcon}>💬</Text>
                </Pressable>
                <Pressable onPress={() => onRemove(lead)} hitSlop={8}>
                  <Text style={styles.leadIcon}>🗑️</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      <AtendimentoModal
        visible={!!atendimento}
        lead={atendimento}
        userId={userId}
        brokerName={brokerName}
        onClose={() => setAtendimento(null)}
      />
    </View>
  );
}

function defaultPitch(brokerName: string | null, developmentName: string | null): string {
  const quem = brokerName?.trim() ? brokerName.trim().split(' ')[0] : null;
  const imovel = developmentName ? `o ${developmentName}` : 'um imóvel que combina com você';
  return [
    `Olá! ${quem ? `Aqui é ${quem}, corretor(a) de imóveis.` : 'Tudo bem?'}`,
    '',
    `Separei ${imovel} pra te mostrar — acho que você vai gostar 🏡`,
    '',
    'Quer conhecer pessoalmente? Consigo agendar sua visita e também fazer uma análise de crédito sem compromisso pra você saber exatamente quanto pode investir.',
  ].join('\n');
}

function AtendimentoModal({
  visible,
  lead,
  userId,
  brokerName,
  onClose,
}: {
  visible: boolean;
  lead: Lead | null;
  userId: string | null;
  brokerName: string | null;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [folderSegs, setFolderSegs] = useState<string[]>([]);
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [selected, setSelected] = useState<StorageEntry[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    let active = true;
    void Promise.all([db.companies.list(userId), db.developments.list(userId)]).then(
      ([comps, devs]) => {
        if (!active) return;
        setCompanies(comps);
        setDevelopments(devs);
      },
    );
    return () => {
      active = false;
    };
  }, [visible, userId]);

  useEffect(() => {
    if (!visible) return;
    setCompanyId(null);
    setDevelopmentId(null);
    setMessage('');
    setError(null);
    setMediaOpen(false);
    setFolderSegs([]);
    setEntries([]);
    setSelected([]);
    setMediaUrls({});
  }, [visible]);

  const companyDevs = useMemo(
    () => developments.filter((d) => d.companyId === companyId),
    [developments, companyId],
  );

  const development = useMemo(
    () => developments.find((d) => d.id === developmentId) ?? null,
    [developments, developmentId],
  );

  const mediaPath = useMemo(() => {
    if (!companyId || !developmentId) return null;
    return ['material', companyId, developmentId, ...folderSegs].join('/');
  }, [companyId, developmentId, folderSegs]);

  useEffect(() => {
    if (!mediaOpen || !userId || !mediaPath) return;
    let active = true;
    setLoadingEntries(true);
    void db.material.list(userId, mediaPath).then((list) => {
      if (!active) return;
      setEntries(list);
      setLoadingEntries(false);
    });
    return () => {
      active = false;
    };
  }, [mediaOpen, userId, mediaPath]);

  const gerar = useCallback(
    async (dev: Development) => {
      setGenerating(true);
      setError(null);
      const res = await generatePitch({
        developmentName: dev.name,
        companyName: dev.companyName,
        descricao: dev.description,
        brokerName,
      });
      setGenerating(false);
      if (!res.ok) {
        setMessage(defaultPitch(brokerName, dev.name));
        setError('A IA não respondeu agora — deixamos uma mensagem padrão pra você ajustar.');
        return;
      }
      setMessage(res.data.mensagem);
    },
    [brokerName],
  );

  function onSelectCompany(v: string) {
    setCompanyId(v);
    setDevelopmentId(null);
    setMessage('');
    setSelected([]);
    setMediaUrls({});
    setFolderSegs([]);
    setMediaOpen(false);
    setError(null);
  }

  function onSelectDevelopment(v: string) {
    setDevelopmentId(v);
    setSelected([]);
    setMediaUrls({});
    setFolderSegs([]);
    setMediaOpen(false);
    const dev = developments.find((d) => d.id === v);
    if (dev) void gerar(dev);
  }

  function toggleFile(entry: StorageEntry) {
    const alreadySelected = selected.some((s) => s.path === entry.path);
    setSelected((prev) =>
      alreadySelected ? prev.filter((s) => s.path !== entry.path) : [...prev, entry],
    );
    if (alreadySelected || mediaUrls[entry.path]) return;
    setOpening(true);
    void db.material
      .signedUrl(entry.path, MEDIA_LINK_TTL_SECONDS)
      .then((url) => {
        if (url) setMediaUrls((prev) => ({ ...prev, [entry.path]: url }));
      })
      .catch(() => undefined)
      .finally(() => setOpening(false));
  }

  function onAbrirConversa() {
    if (!lead) return;
    const links = selected.map((f) => mediaUrls[f.path]).filter((u): u is string => Boolean(u));
    const digits = lead.phone.replace(/\D/g, '');
    if (!digits) {
      setError('Este lead não tem telefone cadastrado.');
      return;
    }

    let texto = message;
    const kept: string[] = [];
    for (const link of links) {
      const tentativa = [message, '', ...kept, link].join('\n');
      if (encodeURIComponent(tentativa).length > MAX_WA_TEXT_LENGTH) break;
      kept.push(link);
      texto = tentativa;
    }

    const faltando = selected.length - kept.length;
    try {
      void Linking.openURL(`https://wa.me/55${digits}?text=${encodeURIComponent(texto)}`);
    } catch {
      setError('Não foi possível abrir o WhatsApp. Copie a mensagem e envie manualmente.');
      return;
    }
    if (faltando > 0) {
      setError(
        `${faltando} arquivo(s) não entraram na mensagem (limite do WhatsApp). Envie em uma segunda mensagem.`,
      );
      return;
    }
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              💬 Atender {lead?.name ?? ''}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Select
              label="Empresa"
              placeholder="Selecione a empresa"
              value={companyId}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              onChange={onSelectCompany}
              emptyHint="Nenhuma empresa cadastrada."
            />

            <Select
              label="Empreendimento"
              placeholder={companyId ? 'Selecione o empreendimento' : 'Escolha a empresa primeiro'}
              value={developmentId}
              options={companyDevs.map((d) => ({ value: d.id, label: d.name }))}
              onChange={onSelectDevelopment}
              emptyHint={
                companyId
                  ? 'Nenhum empreendimento para esta empresa.'
                  : 'Escolha a empresa primeiro.'
              }
            />

            {developmentId ? (
              <>
                <Input
                  label="Mensagem"
                  value={message}
                  onChangeText={setMessage}
                  placeholder={generating ? 'A IA está escrevendo…' : 'Escreva sua mensagem'}
                  multiline
                  numberOfLines={8}
                  editable={!generating}
                  style={styles.messageArea}
                />
                {generating ? (
                  <View style={styles.generatingRow}>
                    <ActivityIndicator />
                    <Text style={styles.caption}>Gerando mensagem com IA…</Text>
                  </View>
                ) : (
                  <Button
                    label="✨ Gerar novamente"
                    variant="secondary"
                    onPress={() => development && void gerar(development)}
                  />
                )}
                {error ? <Text style={styles.subtleError}>{error}</Text> : null}

                <Button
                  label={mediaOpen ? '− Selecione sua mídia' : '📎 Selecione sua mídia'}
                  variant="secondary"
                  onPress={() => setMediaOpen((v) => !v)}
                  style={styles.mediaToggle}
                />
                <Text style={styles.caption}>As mídias vão como links prontos na mensagem.</Text>

                {mediaOpen ? (
                  <View style={styles.mediaBox}>
                    {folderSegs.length > 0 ? (
                      <Pressable onPress={() => setFolderSegs(folderSegs.slice(0, -1))} hitSlop={6}>
                        <Text style={styles.mediaBack}>‹ {folderSegs.join(' / ')}</Text>
                      </Pressable>
                    ) : null}
                    {loadingEntries ? (
                      <ActivityIndicator style={styles.loader} />
                    ) : entries.length === 0 ? (
                      <Text style={styles.caption}>
                        Nenhum arquivo aqui. Suba os materiais em Material de Vendas.
                      </Text>
                    ) : (
                      entries.map((e) => {
                        const isSel = selected.some((s) => s.path === e.path);
                        return (
                          <Pressable
                            key={e.path}
                            onPress={() =>
                              e.isFolder ? setFolderSegs([...folderSegs, e.name]) : toggleFile(e)
                            }
                            style={({ pressed }) => [
                              styles.mediaRow,
                              isSel && styles.mediaRowSelected,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.mediaIcon}>
                              {e.isFolder ? '📁' : isSel ? '☑️' : '⬜'}
                            </Text>
                            <Text style={styles.mediaName} numberOfLines={1}>
                              {e.name}
                            </Text>
                            {e.isFolder ? <Text style={styles.mediaChevron}>›</Text> : null}
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                ) : null}

                {selected.length > 0 ? (
                  <Text style={styles.selectedCount}>
                    {selected.length} mídia(s) selecionada(s):{' '}
                    {selected.map((s) => s.name).join(', ')}
                    {opening ? ' — preparando os links…' : ''}
                  </Text>
                ) : null}

                <Button
                  label="Abrir conversa"
                  onPress={onAbrirConversa}
                  loading={opening}
                  disabled={!message.trim() || generating || opening}
                  style={styles.modalCta}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ProspeccaoTab({
  userId,
  brokerName,
  brokerPhone,
}: {
  userId: string | null;
  brokerName: string | null;
  brokerPhone: string | null;
}) {
  return (
    <View>
      <ProspectarCard userId={userId} />
      {SHOW_CAPTACAO_CARD ? <CaptacaoCard userId={userId} brokerName={brokerName} /> : null}
      <WhatsAppCard userId={userId} brokerPhone={brokerPhone} />
    </View>
  );
}

function ProspectarCard({ userId }: { userId: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const [uf, setUf] = useState<string | null>(null);
  const [cidade, setCidade] = useState('');
  const [cidadeOptions, setCidadeOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProspectedLead[] | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState<string[]>([]);

  const storeKey = userId ? `prospect:${userId}` : null;

  useEffect(() => {
    if (!storeKey) return;
    let active = true;
    sessionStorage.getItem(storeKey).then((raw) => {
      if (!active || !raw) return;
      try {
        const s = JSON.parse(raw) as {
          uf?: string | null;
          cidade?: string;
          results?: ProspectedLead[];
          saved?: Record<string, boolean>;
          seen?: string[];
        };
        if (s.uf) setUf(s.uf);
        if (s.cidade) setCidade(s.cidade);
        if (Array.isArray(s.results)) setResults(s.results);
        if (s.saved) setSaved(s.saved);
        if (Array.isArray(s.seen)) setSeen(s.seen);
      } catch {}
    });
    return () => {
      active = false;
    };
  }, [storeKey]);

  useEffect(() => {
    if (!uf) {
      setCidadeOptions([]);
      return;
    }
    let active = true;
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then((r) => r.json())
      .then((list: { nome: string }[]) => {
        if (!active || !Array.isArray(list)) return;
        setCidadeOptions(list.map((m) => ({ value: m.nome, label: m.nome })));
      })
      .catch(() => {
        if (active) setCidadeOptions([]);
      });
    return () => {
      active = false;
    };
  }, [uf]);

  function persist(next: {
    results: ProspectedLead[] | null;
    saved: Record<string, boolean>;
    ufV: string | null;
    cidadeV: string;
    seenV: string[];
  }) {
    if (!storeKey) return;
    void sessionStorage.setItem(
      storeKey,
      JSON.stringify({
        uf: next.ufV,
        cidade: next.cidadeV,
        results: next.results,
        saved: next.saved,
        seen: next.seenV,
      }),
    );
  }

  function onChangeUf(v: string) {
    setUf(v);
    setCidade('');
    setSeen([]);
  }
  function onChangeCidade(v: string) {
    setCidade(v);
    setSeen([]);
  }

  async function onProspectar() {
    setError(null);
    if (!uf) return setError('Escolha o estado.');
    if (!cidade.trim()) return setError('Escolha a cidade.');
    setLoading(true);
    const res = await prospectLeads({ uf, cidade: cidade.trim(), excluir: seen });
    setLoading(false);
    if (!res.ok) return setError(res.error);
    if (res.data.leads.length === 0) {
      setError('Nenhum lead novo encontrado nessa cidade. Tente outra cidade.');
      return;
    }
    const novosCnpjs = res.data.leads.map((l) => l.cnpj).filter(Boolean);
    const nextSeen = [...seen, ...novosCnpjs];
    setResults(res.data.leads);
    setSaved({});
    setSeen(nextSeen);
    persist({
      results: res.data.leads,
      saved: {},
      ufV: uf,
      cidadeV: cidade.trim(),
      seenV: nextSeen,
    });
  }

  async function onSave(lead: ProspectedLead) {
    if (!userId) return;
    const res = await db.leads.create(userId, {
      name: lead.nome,
      phone: lead.phone,
      email: lead.email,
      message: `${lead.cidade}/${lead.uf}`,
      source: 'prospeccao',
    });
    if (res.ok) {
      const nextSaved = { ...saved, [lead.cnpj]: true };
      setSaved(nextSaved);
      persist({ results, saved: nextSaved, ufV: uf, cidadeV: cidade, seenV: seen });
    }
  }

  return (
    <View style={[styles.card, styles.prospectCard]}>
      <Text style={styles.cardTitle}>🎯 Prospectar Leads</Text>
      <Text style={styles.cardText}>
        Encontre leads locais — pessoas com negócio próprio na região escolhida. Escolha o estado e
        a cidade e receba uma lista com nome e telefone pra ligar. Cada nova busca traz contatos
        diferentes. Sem criar página, sem anúncio.
      </Text>

      <Select
        label="Estado"
        placeholder="UF"
        value={uf}
        options={UFS.map((u) => ({ value: u, label: u }))}
        onChange={onChangeUf}
        searchable
      />
      <Select
        label="Cidade"
        placeholder={uf ? 'Escolha a cidade' : 'Escolha o estado primeiro'}
        value={cidade || null}
        options={cidadeOptions}
        onChange={onChangeCidade}
        emptyHint={uf ? 'Carregando municípios…' : 'Escolha o estado primeiro.'}
        searchable
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={loading ? 'Buscando…' : '🎯 Prospectar'}
        onPress={onProspectar}
        loading={loading}
        style={styles.primaryCta}
      />

      {results && results.length > 0 ? (
        <View style={styles.results}>
          <Text style={styles.resultsCount}>{results.length} encontrados</Text>
          {results.map((lead) => (
            <View key={lead.cnpj} style={styles.resultRow}>
              <View style={styles.resultMain}>
                <Text style={styles.resultName} numberOfLines={1}>
                  {lead.nome}
                </Text>
                <Text style={styles.resultMeta}>{formatPhone(lead.phone)}</Text>
              </View>
              <View style={styles.resultActions}>
                <Pressable
                  onPress={() => void Linking.openURL(`https://wa.me/55${lead.phone}`)}
                  hitSlop={8}
                >
                  <Text style={styles.resultIcon}>💬</Text>
                </Pressable>
                {saved[lead.cnpj] ? (
                  <Text style={styles.savedTag}>Salvo ✓</Text>
                ) : (
                  <Button label="Salvar" variant="secondary" onPress={() => void onSave(lead)} />
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function defaultConvite(brokerName: string | null): string {
  const quem = brokerName?.trim() ? brokerName.trim().split(' ')[0] : 'eu';
  return `🏡 Sonhando com o imóvel próprio? Me manda seu nome e telefone que ${quem === 'eu' ? 'eu' : quem} te ajudo a simular e realizar esse sonho! 👇`;
}

function CaptacaoCard({
  userId,
  brokerName,
}: {
  userId: string | null;
  brokerName: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState('');
  const [convite, setConvite] = useState(() => defaultConvite(brokerName));
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    db.developments.list(userId).then(setDevelopments);
  }, [userId]);

  const link = useMemo(() => {
    if (!userId) return '';
    const e = developmentId ? `&e=${developmentId}` : '';
    return `${env.appUrl}/captar?c=${userId}${e}`;
  }, [userId, developmentId]);

  const developmentName = useMemo(
    () => developments.find((d) => d.id === developmentId)?.name ?? null,
    [developments, developmentId],
  );

  async function onGerar() {
    setError(null);
    setFeedback(null);
    setGenerating(true);
    const res = await generateInvite({ developmentName, detalhes: detalhes.trim() || null });
    setGenerating(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConvite(res.data.convite);
    setPageTitle(res.data.titulo);
    setFeedback('Página criada pela IA! Já está no ar — é só divulgar.');
    setTimeout(() => setFeedback(null), 5000);
  }

  async function onDivulgar() {
    setFeedback(null);
    const result = await shareOrCopy(`${convite}\n\n${link}`);
    if (result === 'copied') {
      setFeedback('Copiado! Cole no Instagram, WhatsApp ou onde quiser divulgar.');
      setTimeout(() => setFeedback(null), 4000);
    }
  }

  async function onCopyLink() {
    const result = await shareOrCopy(link);
    if (result === 'copied') {
      setFeedback('Link copiado!');
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📣 Crie sua página e receba leads</Text>
      <Text style={styles.cardText}>
        Descreva o empreendimento e a IA cria pra você uma página de captação bonita + o convite
        pronto pra postar. Quem deixar nome e telefone vira lead automaticamente aqui na Gestão de
        Leads — sem configurar nada.
      </Text>

      {developments.length > 0 ? (
        <Select
          label="Empreendimento (opcional)"
          placeholder="Geral (qualquer imóvel)"
          value={developmentId}
          options={developments.map((d) => ({ value: d.id, label: d.name }))}
          onChange={setDevelopmentId}
        />
      ) : null}

      <Input
        label="Descreva o empreendimento e os detalhes"
        value={detalhes}
        onChangeText={setDetalhes}
        placeholder="Ex.: Apês de 2 e 3 quartos no Centro, a partir de R$ 350 mil, lazer completo, entrada facilitada em até 60x…"
        multiline
        numberOfLines={4}
        style={styles.textArea}
      />

      <Button
        label={generating ? 'Criando página…' : '✨ Criar página com IA'}
        onPress={onGerar}
        loading={generating}
        style={styles.primaryCta}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      {pageTitle ? (
        <>
          <Text style={styles.label}>Prévia da chamada da página</Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewHeadline}>{pageTitle}</Text>
          </View>
        </>
      ) : null}

      <Text style={styles.label}>Convite pronto pra postar</Text>
      <View style={styles.previewBox}>
        <Text style={styles.previewText}>{convite}</Text>
      </View>

      <View style={styles.cardActions}>
        <Button label="📣 Divulgar" onPress={onDivulgar} style={styles.flexBtn} />
        <Button
          label="Copiar link"
          variant="secondary"
          onPress={onCopyLink}
          style={styles.flexBtn}
        />
      </View>
      <Pressable onPress={() => void Linking.openURL(link)} hitSlop={6}>
        <Text style={styles.link}>Ver minha página de captação</Text>
      </Pressable>
    </View>
  );
}

function WhatsAppCard({
  userId,
  brokerPhone,
}: {
  userId: string | null;
  brokerPhone: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const digits = (brokerPhone ?? '').replace(/\D/g, '');
  const link = userId && digits ? `${env.appUrl}/captar?c=${userId}&wa=1` : '';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>💬 Falar direto no WhatsApp</Text>
      <Text style={styles.cardText}>
        Um link e um QR code que abrem uma conversa direto com você — ótimo pra bio do Instagram,
        cartão ou placa. Quem chega por aqui é cadastrado automaticamente na Gestão de Leads, com a
        origem “WhatsApp”, antes de cair na conversa.
      </Text>
      {!digits ? (
        <Text style={styles.warn}>
          Cadastre seu telefone em Configurações › Editar perfil para gerar o link.
        </Text>
      ) : (
        <>
          <View style={styles.qrWrap}>
            <Image source={{ uri: qrCodeUrl(link) }} style={styles.qrImage} />
          </View>
          <View style={styles.cardActions}>
            <Button
              label="Copiar link"
              variant="secondary"
              onPress={() => void shareOrCopy(link)}
              style={styles.flexBtn}
            />
            <Button
              label="Abrir"
              onPress={() => void Linking.openURL(link)}
              style={styles.flexBtn}
            />
          </View>
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    title: { ...typography.title, color: colors.primary, marginBottom: spacing.lg },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: 3,
      marginBottom: spacing.xl,
    },
    segmentItem: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      alignItems: 'center',
    },
    segmentItemActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentText: { ...typography.label, color: colors.inkMuted },
    segmentTextActive: { color: colors.primary },

    addToggle: { marginBottom: spacing.md },
    filterWrap: { marginBottom: spacing.md },
    filterToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    filterToggleText: { ...typography.label, color: colors.primary },
    filterChevron: { ...typography.label, color: colors.primary },
    filterBody: {
      borderWidth: 1,
      borderColor: colors.border,
      borderTopWidth: 0,
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    filterCount: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm },
    addCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      backgroundColor: colors.surface,
    },
    loader: { marginTop: spacing.xl },
    empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
    emptyEmoji: { fontSize: 40 },
    emptyText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    warn: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },

    leadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    leadMain: { flex: 1 },
    leadName: { ...typography.body, color: colors.ink, fontWeight: '600' },
    leadMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
    leadStage: { ...typography.caption, fontWeight: '700', marginTop: 2 },
    leadActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    leadIcon: { fontSize: 16 },

    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      backgroundColor: colors.surface,
    },
    cardTitle: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm },
    cardText: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.md },
    label: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.sm },
    previewBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    previewText: { ...typography.body, color: colors.ink, lineHeight: 22 },
    previewHeadline: { ...typography.heading, color: colors.ink },
    textArea: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
    prospectCard: { borderColor: colors.primary, borderWidth: 1.5 },
    results: { marginTop: spacing.lg, gap: spacing.md },
    resultsCount: { ...typography.label, color: colors.inkMuted },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    resultMain: { flex: 1 },
    resultName: { ...typography.body, color: colors.ink, fontWeight: '600' },
    resultMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
    resultActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    resultIcon: { fontSize: 18 },
    savedTag: { ...typography.caption, color: colors.success, fontWeight: '700' },
    feedback: {
      ...typography.caption,
      color: colors.success,
      backgroundColor: colors.successSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    cardActions: { flexDirection: 'row', gap: spacing.md },
    flexBtn: { flex: 1 },
    primaryCta: { marginBottom: spacing.md },
    link: {
      ...typography.label,
      color: colors.primary,
      marginTop: spacing.md,
      textAlign: 'center',
    },
    qrWrap: { alignItems: 'center', marginBottom: spacing.md },
    qrImage: { width: 160, height: 160, borderRadius: radius.md },

    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    modalSheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '92%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    modalTitle: { ...typography.heading, color: colors.ink, flex: 1 },
    modalClose: { ...typography.heading, color: colors.inkMuted },
    modalCta: { marginTop: spacing.lg, marginBottom: spacing.lg },
    messageArea: { minHeight: 160, paddingTop: spacing.md, textAlignVertical: 'top' },
    generatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    caption: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.sm },
    subtleError: { ...typography.caption, color: colors.warning, marginTop: spacing.sm },
    mediaToggle: { marginTop: spacing.lg },
    mediaBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    mediaBack: { ...typography.label, color: colors.primary, marginBottom: spacing.sm },
    mediaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
    },
    mediaRowSelected: { backgroundColor: colors.successSoft },
    mediaIcon: { fontSize: 16 },
    mediaName: { ...typography.body, color: colors.ink, flex: 1 },
    mediaChevron: { ...typography.body, color: colors.inkSubtle },
    pressed: { opacity: 0.6 },
    selectedCount: { ...typography.caption, color: colors.success, marginTop: spacing.md },
  });
