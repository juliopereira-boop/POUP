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
import { radius, spacing, typography, type AppColors } from '@/theme';

const DEFAULT_TITLE = 'Quero saber mais';
const DEFAULT_SUBTITLE = 'Deixe seu nome e telefone que um corretor entra em contato.';

/**
 * Landing page PÚBLICA de captação de leads — sem login, aberta pra qualquer
 * visitante que recebeu o link (Instagram, WhatsApp, anúncio, etc.). O
 * corretor gera esse link na aba Prospecção (dentro de Leads).
 *
 * Fica fora dos grupos (auth) e (app) de propósito: nenhum dos dois exige
 * login pra esta rota específica.
 */
export default function CaptarLeadScreen() {
  const styles = useThemedStyles(makeStyles);
  const { brokerId, empresa, empreendimento } = useLocalSearchParams<{
    brokerId: string;
    empresa?: string;
    empreendimento?: string;
  }>();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [subtitle, setSubtitle] = useState(DEFAULT_SUBTITLE);

  // Carrega os textos da campanha do corretor (gerados pela IA), se houver.
  useEffect(() => {
    if (!brokerId) return;
    let active = true;
    getLeadPage(brokerId).then((info) => {
      if (!active || !info) return;
      if (info.titulo) setTitle(info.titulo);
      if (info.subtitulo) setSubtitle(info.subtitulo);
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
        companyId: empresa,
        developmentId: empreendimento,
      },
    });
    setSending(false);
    if (fnError || data?.error) {
      setError((data?.error as string) ?? 'Não foi possível enviar. Tente novamente.');
      return;
    }
    setDone(true);
  }

  return (
    <Screen center>
      <View style={styles.header}>
        <WordMark size={30} />
      </View>

      {done ? (
        <View style={styles.card}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>Recebemos seu contato!</Text>
          <Text style={styles.doneText}>
            Um corretor vai falar com você em breve. Obrigado pelo interesse!
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

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

          <Button label="Enviar" onPress={submit} loading={sending} style={styles.cta} />
        </View>
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    header: { marginBottom: spacing.xxl, alignItems: 'center' },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
    },
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.xs },
    subtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
    cta: { marginTop: spacing.sm },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    doneEmoji: { fontSize: 40, textAlign: 'center', marginBottom: spacing.md },
    doneTitle: {
      ...typography.heading,
      color: colors.ink,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    doneText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
  });
