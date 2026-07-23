import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { db, type Development, type Lead, type LeadStatus } from '@/data';
import { formatPhone } from '@/lib/masks';
import { env } from '@/lib/env';
import { generateInvite, prospectLeads, type ProspectedLead } from '@/lib/prospeccao';
import { sessionStorage } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

type Tab = 'gestao' | 'prospeccao';

const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  convertido: 'Convertido',
  perdido: 'Perdido',
};
const STATUS_ORDER: LeadStatus[] = ['novo', 'em_contato', 'convertido', 'perdido'];
const SOURCE_LABEL: Record<Lead['source'], string> = {
  landing: 'Página de captação',
  whatsapp: 'WhatsApp',
  prospeccao: 'Prospecção',
  meta: 'Facebook/Instagram',
  manual: 'Manual',
};

/** Estados (UF) para o filtro de prospecção. */
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/** Copia texto (web) ou abre o compartilhar nativo — sem depender de libs extras. */
async function shareOrCopy(text: string): Promise<'copied' | 'shared' | 'failed'> {
  if (Platform.OS === 'web') {
    const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText: (s: string) => Promise<void> } } })
      .navigator;
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
        <GestaoLeadsTab userId={user?.id ?? null} />
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

// ============================= GESTÃO DE LEADS =============================

function GestaoLeadsTab({ userId }: { userId: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLeads(await db.leads.list(userId));
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

  async function onChangeStatus(lead: Lead) {
    const idx = STATUS_ORDER.indexOf(lead.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: next } : l)));
    await db.leads.updateStatus(lead.id, next);
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

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : leads.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📇</Text>
          <Text style={styles.emptyText}>
            Nenhum lead ainda. Toque em “Prospecção” acima para começar a captar.
          </Text>
        </View>
      ) : (
        leads.map((lead) => (
          <View key={lead.id} style={styles.leadRow}>
            <View style={styles.leadMain}>
              <Text style={styles.leadName} numberOfLines={1}>
                {lead.name}
              </Text>
              <Text style={styles.leadMeta}>
                {formatPhone(lead.phone)} · {SOURCE_LABEL[lead.source]}
              </Text>
              {lead.developmentName ? (
                <Text style={styles.leadMeta}>{lead.developmentName}</Text>
              ) : null}
            </View>
            <View style={styles.leadActions}>
              <Pressable
                onPress={() => onChangeStatus(lead)}
                style={[styles.statusBadge, statusStyle(lead.status, styles)]}
              >
                <Text style={styles.statusText}>{STATUS_LABEL[lead.status]}</Text>
              </Pressable>
              <Pressable
                onPress={() => void Linking.openURL(`https://wa.me/55${lead.phone}`)}
                hitSlop={8}
              >
                <Text style={styles.leadIcon}>💬</Text>
              </Pressable>
              <Pressable onPress={() => onRemove(lead)} hitSlop={8}>
                <Text style={styles.leadIcon}>🗑️</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function statusStyle(status: LeadStatus, styles: ReturnType<typeof makeStyles>) {
  switch (status) {
    case 'convertido':
      return styles.statusOk;
    case 'perdido':
      return styles.statusBad;
    case 'em_contato':
      return styles.statusMid;
    default:
      return styles.statusNeutral;
  }
}

// =============================== PROSPECÇÃO ===============================

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
      <CaptacaoCard userId={userId} brokerName={brokerName} />
      <WhatsAppCard brokerPhone={brokerPhone} />
    </View>
  );
}

/**
 * Prospecção ATIVA: o corretor escolhe estado + cidade + segmento e recebe
 * uma lista de donos de empresas locais (dados públicos de CNPJ) com telefone
 * pra ligar. Salva os que quiser na Gestão de Leads. Sem página, sem anúncio.
 */
function ProspectarCard({ userId }: { userId: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const [uf, setUf] = useState<string | null>(null);
  const [cidade, setCidade] = useState('');
  const [cidadeOptions, setCidadeOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProspectedLead[] | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  // CNPJs já vistos (com os filtros atuais) — novas buscas nunca repetem.
  const [seen, setSeen] = useState<string[]>([]);

  const storeKey = userId ? `prospect:${userId}` : null;

  // Restaura a última prospecção salva (persiste até uma nova busca) — os
  // resultados NÃO somem ao sair/voltar da tela.
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
      } catch {
        /* ignora cache inválido */
      }
    });
    return () => {
      active = false;
    };
  }, [storeKey]);

  // Carrega os municípios do estado escolhido (API pública do IBGE), para a
  // cidade ser selecionável (evita erro de digitação).
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

  // Trocar o local reinicia a lista de "já vistos" (nova busca do zero).
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
      return; // mantém a lista anterior na tela
    }
    const novosCnpjs = res.data.leads.map((l) => l.cnpj).filter(Boolean);
    const nextSeen = [...seen, ...novosCnpjs];
    setResults(res.data.leads);
    setSaved({});
    setSeen(nextSeen);
    persist({ results: res.data.leads, saved: {}, ufV: uf, cidadeV: cidade.trim(), seenV: nextSeen });
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

/** Convite padrão (client-side) para o botão Divulgar já funcionar sem IA. */
function defaultConvite(brokerName: string | null): string {
  const quem = brokerName?.trim() ? brokerName.trim().split(' ')[0] : 'eu';
  return `🏡 Sonhando com o imóvel próprio? Me manda seu nome e telefone que ${quem === 'eu' ? 'eu' : quem} te ajudo a simular e realizar esse sonho! 👇`;
}

/**
 * Coração da prospecção: em 1 toque o corretor divulga sua página de captação
 * (quem preencher nome+telefone vira lead automático). A IA escreve o convite
 * e os textos da página — o corretor não precisa configurar nada.
 */
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

function WhatsAppCard({ brokerPhone }: { brokerPhone: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const digits = (brokerPhone ?? '').replace(/\D/g, '');
  const message = 'Olá! Gostaria de saber mais sobre imóveis disponíveis.';
  const link = digits ? `https://wa.me/55${digits}?text=${encodeURIComponent(message)}` : '';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>💬 Falar direto no WhatsApp</Text>
      <Text style={styles.cardText}>
        Um link e um QR code que abrem uma conversa direto com você — ótimo pra bio do Instagram,
        cartão ou placa.
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
            <Button label="Abrir" onPress={() => void Linking.openURL(link)} style={styles.flexBtn} />
          </View>
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.lg },
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
    segmentItemActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    segmentText: { ...typography.label, color: colors.inkMuted },
    segmentTextActive: { color: colors.primary },

    addToggle: { marginBottom: spacing.md },
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
    leadActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    leadIcon: { fontSize: 16 },
    statusBadge: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    statusText: { ...typography.caption, fontWeight: '700' },
    statusNeutral: { backgroundColor: colors.surfaceAlt },
    statusMid: { backgroundColor: colors.warningSoft },
    statusOk: { backgroundColor: colors.successSoft },
    statusBad: { backgroundColor: colors.dangerSoft },

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
  });
