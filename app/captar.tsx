import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { WordMark } from '@/components/WordMark';
import { supabase } from '@/lib/supabase';
import { formatPhone } from '@/lib/masks';
import { getLeadPage } from '@/lib/prospeccao';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, shadow, type AppColors } from '@/theme';

/**
 * Landing page PÚBLICA de captação de leads — sem login, aberta pra qualquer
 * visitante que recebeu o link (Instagram, WhatsApp, anúncio, etc.).
 *
 * IMPORTANTE: esta é uma rota ESTÁTICA (/captar) e o corretor vem por query
 * string (?c=<id>&e=<empreendimento>), de propósito. Rotas dinâmicas de
 * segmento (/captar/[id]) viram um arquivo com colchetes no export estático e
 * exigem rewrite especial no host — o que já quebrou em produção. Query string
 * cai sempre no mesmo arquivo estático e funciona em qualquer hospedagem.
 */
const DEFAULT_TITLE = 'Realize o sonho do seu imóvel';
const DEFAULT_SUBTITLE = 'Deixe seu contato e um especialista fala com você — sem compromisso.';
const DEFAULT_BENEFITS = [
  'Atendimento personalizado e sem compromisso',
  'Simulação de financiamento na hora',
  'As melhores condições e oportunidades',
];

export default function CaptarLeadScreen() {
  const styles = useThemedStyles(makeStyles);
  const { c: brokerId, e: developmentId } = useLocalSearchParams<{ c?: string; e?: string }>();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [subtitle, setSubtitle] = useState(DEFAULT_SUBTITLE);
  const [descricao, setDescricao] = useState('');
  const [beneficios, setBeneficios] = useState<string[]>(DEFAULT_BENEFITS);
  const [brokerName, setBrokerName] = useState<string | null>(null);
  const [agency, setAgency] = useState<string | null>(null);

  // Carrega os textos da campanha do corretor (gerados pela IA), se houver.
  useEffect(() => {
    if (!brokerId) return;
    let active = true;
    getLeadPage(brokerId).then((info) => {
      if (!active || !info) return;
      if (info.titulo) setTitle(info.titulo);
      if (info.subtitulo) setSubtitle(info.subtitulo);
      if (info.descricao) setDescricao(info.descricao);
      if (info.beneficios && info.beneficios.length > 0) setBeneficios(info.beneficios);
      setBrokerName(info.brokerName);
      setAgency(info.agency);
    });
    return () => {
      active = false;
    };
  }, [brokerId]);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Informe seu nome.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Informe um telefone válido.');
    setSending(true);
    const { data, error: fnError } = await supabase.functions.invoke('capture-lead', {
      body: {
        brokerUserId: brokerId,
        name: name.trim(),
        phone,
        developmentId,
      },
    });
    setSending(false);
    if (fnError || data?.error) {
      setError((data?.error as string) ?? 'Não foi possível enviar. Tente novamente.');
      return;
    }
    setDone(true);
  }

  const footer = brokerName
    ? `Atendimento por ${brokerName}${agency ? ` · ${agency}` : ''}`
    : null;

  return (
    <Screen>
      <View style={styles.hero}>
        <WordMark size={28} color="#FFFFFF" />
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>

      {done ? (
        <View style={styles.card}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>Recebemos seu contato!</Text>
          <Text style={styles.doneText}>
            {brokerName ? `${brokerName} vai` : 'Um especialista vai'} falar com você em breve.
            Obrigado pelo interesse!
          </Text>
        </View>
      ) : (
        <>
          {descricao ? <Text style={styles.descricao}>{descricao}</Text> : null}

          <View style={styles.benefits}>
            {beneficios.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={styles.check}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.formTitle}>Quero saber mais</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Input
              label="Nome"
              value={name}
              onChangeText={setName}
              placeholder="Seu nome completo"
              autoCapitalize="words"
            />
            <Input
              label="Telefone (com DDD)"
              value={phone}
              onChangeText={(t) => setPhone(formatPhone(t))}
              placeholder="(00) 00000-0000"
              keyboardType="phone-pad"
            />
            <Button label="Enviar meu contato" onPress={submit} loading={sending} style={styles.cta} />
            <Text style={styles.privacy}>
              Seus dados são usados só para o corretor entrar em contato.
            </Text>
          </View>
        </>
      )}

      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    hero: {
      backgroundColor: colors.primary,
      borderRadius: radius.xl,
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.xl,
      ...shadow.card,
    },
    heroTitle: {
      ...typography.display,
      color: '#FFFFFF',
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    heroSubtitle: {
      ...typography.body,
      color: 'rgba(255,255,255,0.9)',
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    descricao: {
      ...typography.body,
      color: colors.inkMuted,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    benefits: { gap: spacing.md, marginBottom: spacing.xl },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    check: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.successSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkMark: { color: colors.success, fontWeight: '800', fontSize: 15 },
    benefitText: { ...typography.body, color: colors.ink, flex: 1 },
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      ...shadow.card,
    },
    formTitle: { ...typography.heading, color: colors.ink, marginBottom: spacing.lg },
    cta: { marginTop: spacing.sm },
    privacy: {
      ...typography.caption,
      color: colors.inkSubtle,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    doneEmoji: { fontSize: 44, textAlign: 'center', marginBottom: spacing.md },
    doneTitle: {
      ...typography.heading,
      color: colors.ink,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    doneText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
    footer: {
      ...typography.caption,
      color: colors.inkSubtle,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
  });
