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
import { db, type Company, type Development, type Lead, type LeadStatus } from '@/data';
import { formatPhone } from '@/lib/masks';
import { env } from '@/lib/env';
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
  meta: 'Facebook/Instagram',
  manual: 'Manual',
};

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
        <ProspeccaoTab userId={user?.id ?? null} brokerPhone={profile?.phone ?? null} />
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
  brokerPhone,
}: {
  userId: string | null;
  brokerPhone: string | null;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View>
      <LandingPageCard userId={userId} />
      <WhatsAppCard brokerPhone={brokerPhone} />
      <MetaLeadAdsCard userId={userId} />
      <View style={styles.googleNote}>
        <Text style={styles.googleNoteText}>
          Google Local Services (anúncios locais do Google) ainda não tem uma integração
          self-service disponível — é um programa por convite, com painel próprio do Google. Por
          enquanto, acompanhe esses leads direto no painel do Google.
        </Text>
      </View>
    </View>
  );
}

function LandingPageCard({ userId }: { userId: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    Promise.all([db.companies.list(userId), db.developments.list(userId)]).then(
      ([comps, devs]) => {
        setCompanies(comps);
        setDevelopments(devs);
      },
    );
  }, [userId]);

  const developmentOptions = useMemo(
    () => developments.filter((d) => !companyId || d.companyId === companyId),
    [developments, companyId],
  );

  const link = useMemo(() => {
    if (!userId) return '';
    const params = new URLSearchParams();
    if (companyId) params.set('empresa', companyId);
    if (developmentId) params.set('empreendimento', developmentId);
    const qs = params.toString();
    return `${env.appUrl}/captar/${userId}${qs ? `?${qs}` : ''}`;
  }, [userId, companyId, developmentId]);

  async function onCopy() {
    const result = await shareOrCopy(link);
    if (result === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📝 Página de captação</Text>
      <Text style={styles.cardText}>
        Um link público com um formulário simples (nome e telefone). Compartilhe no Instagram,
        WhatsApp ou anúncios — cada envio vira um lead automaticamente na Gestão de Leads.
      </Text>

      <Select
        label="Empresa (opcional)"
        placeholder="Todas"
        value={companyId}
        options={companies.map((c) => ({ value: c.id, label: c.name }))}
        onChange={(v) => {
          setCompanyId(v);
          setDevelopmentId(null);
        }}
      />
      <Select
        label="Empreendimento (opcional)"
        placeholder="Todos"
        value={developmentId}
        options={developmentOptions.map((d) => ({ value: d.id, label: d.name }))}
        onChange={setDevelopmentId}
      />

      <View style={styles.linkBox}>
        <Text style={styles.linkText} numberOfLines={1}>
          {link}
        </Text>
      </View>
      <View style={styles.cardActions}>
        <Button label={copied ? 'Copiado!' : 'Copiar link'} variant="secondary" onPress={onCopy} />
        <Button label="Abrir" onPress={() => void Linking.openURL(link)} />
      </View>
    </View>
  );
}

function WhatsAppCard({ brokerPhone }: { brokerPhone: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const digits = (brokerPhone ?? '').replace(/\D/g, '');
  const message = 'Olá! Vi seu contato e gostaria de saber mais sobre imóveis disponíveis.';
  const link = digits ? `https://wa.me/55${digits}?text=${encodeURIComponent(message)}` : '';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>💬 Link do WhatsApp</Text>
      <Text style={styles.cardText}>
        Um link (e um QR code) que abre uma conversa direto com você no WhatsApp — ótimo pra bio
        do Instagram, cartão ou placa. Esses contatos não entram sozinhos na lista; adicione-os
        manualmente em Gestão de Leads depois de conversar.
      </Text>
      {!digits ? (
        <Text style={styles.warn}>
          Cadastre seu telefone em Configurações › Editar perfil para gerar o link.
        </Text>
      ) : (
        <>
          <View style={styles.linkBox}>
            <Text style={styles.linkText} numberOfLines={1}>
              {link}
            </Text>
          </View>
          <View style={styles.qrWrap}>
            <Image source={{ uri: qrCodeUrl(link) }} style={styles.qrImage} />
          </View>
          <View style={styles.cardActions}>
            <Button
              label="Copiar link"
              variant="secondary"
              onPress={() => void shareOrCopy(link)}
            />
            <Button label="Abrir" onPress={() => void Linking.openURL(link)} />
          </View>
        </>
      )}
    </View>
  );
}

function MetaLeadAdsCard({ userId }: { userId: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  const [pageId, setPageId] = useState('');
  const [token, setToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    db.leads.getMetaIntegration(userId).then((integration) => {
      if (!integration) {
        setVerifyToken(Math.random().toString(36).slice(2, 15));
        return;
      }
      setPageId(integration.pageId);
      setToken(integration.pageAccessToken);
      setVerifyToken(integration.verifyToken);
    });
  }, [userId]);

  const webhookUrl = `${env.supabaseUrl}/functions/v1/meta-leads-webhook`;

  async function onSave() {
    if (!userId) return;
    setError(null);
    if (!pageId.trim() || !token.trim()) {
      setError('Informe o Page ID e o token de acesso da página.');
      return;
    }
    setSaving(true);
    const res = await db.leads.saveMetaIntegration(userId, {
      pageId: pageId.trim(),
      pageAccessToken: token.trim(),
      verifyToken,
      companyId: null,
      developmentId: null,
    });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📘 Facebook/Instagram (Lead Ads)</Text>
      <Text style={styles.cardText}>
        Recebe automaticamente, aqui na Gestão de Leads, os contatos que preenchem o formulário
        dos seus anúncios de captação de leads no Facebook/Instagram.
      </Text>
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.link}>{expanded ? 'Ocultar' : 'Como configurar'}</Text>
      </Pressable>
      {expanded ? (
        <Text style={styles.cardText}>
          1) Isso exige um App no Meta for Developers com a permissão{' '}
          <Text style={styles.bold}>leads_retrieval</Text> aprovada pelo Meta (App Review — feito
          no painel do Meta, não aqui).{'\n'}
          2) No seu App, configure o Webhook com a URL abaixo e o verify token gerado.{'\n'}
          3) Cole o Page ID e o Page Access Token (gerados no Meta Business Suite) nos campos
          abaixo e salve.
        </Text>
      ) : null}

      <Text style={styles.label}>Webhook URL</Text>
      <View style={styles.linkBox}>
        <Text style={styles.linkText} numberOfLines={1}>
          {webhookUrl}
        </Text>
      </View>
      <Text style={styles.label}>Verify token</Text>
      <View style={styles.linkBox}>
        <Text style={styles.linkText} numberOfLines={1}>
          {verifyToken}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Input label="Page ID" value={pageId} onChangeText={setPageId} placeholder="123456789" />
      <Input
        label="Page Access Token"
        value={token}
        onChangeText={setToken}
        placeholder="EAAxxxxxxxx..."
        autoCapitalize="none"
      />
      <Button label={saved ? 'Salvo!' : 'Salvar integração'} onPress={onSave} loading={saving} />
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
    linkBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.md,
    },
    linkText: { ...typography.caption, color: colors.ink },
    cardActions: { flexDirection: 'row', gap: spacing.md },
    link: { ...typography.label, color: colors.primary, marginBottom: spacing.md },
    bold: { fontWeight: '700' },
    qrWrap: { alignItems: 'center', marginBottom: spacing.md },
    qrImage: { width: 160, height: 160, borderRadius: radius.md },
    googleNote: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    googleNoteText: { ...typography.caption, color: colors.inkSubtle },
  });
