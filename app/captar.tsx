import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { WordMark } from '@/components/WordMark';
import { supabase } from '@/lib/supabase';
import { formatPhone } from '@/lib/masks';
import { getLeadPage } from '@/lib/captacao';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, shadow, type AppColors } from '@/theme';

const DEFAULT_TITLE = 'Realize o sonho do seu imóvel';
const DEFAULT_SUBTITLE = 'Deixe seu contato e um especialista fala com você — sem compromisso.';
const DEFAULT_BENEFITS = [
  'Atendimento personalizado e sem compromisso',
  'Simulação de financiamento na hora',
  'As melhores condições e oportunidades',
];

const WA_TITLE = 'Fale com um especialista';
const WA_SUBTITLE = 'Deixe seu nome e telefone que abrimos o WhatsApp na hora.';

/**
 * Versão do texto de consentimento.
 *
 * **Mudou `TEXTO_CONSENTIMENTO`? Suba este número.** O registro guarda a versão
 * junto com o lead, e sem isso um texto novo invalidaria em silêncio o que já
 * foi consentido — os registros antigos apontariam para uma frase que aquelas
 * pessoas nunca leram.
 */
const VERSAO_CONSENTIMENTO = 1;

const TEXTO_CONSENTIMENTO =
  'Autorizo o corretor a entrar em contato comigo pelos dados informados, para falar sobre ' +
  'imóveis. Posso pedir a exclusão dos meus dados a qualquer momento.';

export default function CaptarLeadScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const {
    c: brokerId,
    e: developmentId,
    wa,
  } = useLocalSearchParams<{ c?: string; e?: string; wa?: string }>();
  const isWhatsAppFlow = wa === '1';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [aceitou, setAceitou] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [title, setTitle] = useState(isWhatsAppFlow ? WA_TITLE : DEFAULT_TITLE);
  const [subtitle, setSubtitle] = useState(isWhatsAppFlow ? WA_SUBTITLE : DEFAULT_SUBTITLE);
  const [descricao, setDescricao] = useState('');
  const [beneficios, setBeneficios] = useState<string[]>(DEFAULT_BENEFITS);
  const [brokerName, setBrokerName] = useState<string | null>(null);
  const [agency, setAgency] = useState<string | null>(null);
  const [brokerPhone, setBrokerPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!brokerId) return;
    let active = true;
    getLeadPage(brokerId).then((info) => {
      if (!active || !info) return;
      if (!isWhatsAppFlow) {
        if (info.titulo) setTitle(info.titulo);
        if (info.subtitulo) setSubtitle(info.subtitulo);
        if (info.descricao) setDescricao(info.descricao);
        if (info.beneficios && info.beneficios.length > 0) setBeneficios(info.beneficios);
      }
      setBrokerName(info.brokerName);
      setAgency(info.agency);
      setBrokerPhone((info as { brokerPhone?: string | null }).brokerPhone ?? null);
    });
    return () => {
      active = false;
    };
  }, [brokerId, isWhatsAppFlow]);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Informe seu nome.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Informe um telefone válido.');
    if (!aceitou) return setError('Marque a autorização para o corretor entrar em contato.');
    setSending(true);
    const { data, error: fnError } = await supabase.functions.invoke('capture-lead', {
      body: {
        brokerUserId: brokerId,
        name: name.trim(),
        phone,
        developmentId,
        source: isWhatsAppFlow ? 'whatsapp' : 'landing',
        /*
         * O consentimento vai junto com o dado, e com a VERSÃO do texto.
         *
         * "Ela aceitou" sem dizer o quê e quando é palavra contra palavra, e a
         * LGPD pede consentimento demonstrável. Só um booleano perderia o
         * sentido no dia em que o texto mudasse: ninguém saberia com o que
         * aquela pessoa concordou.
         */
        consentVersao: VERSAO_CONSENTIMENTO,
        consentTexto: TEXTO_CONSENTIMENTO,
      },
    });
    setSending(false);
    if (fnError || data?.error) {
      setError((data?.error as string) ?? 'Não foi possível enviar. Tente novamente.');
      return;
    }
    if (isWhatsAppFlow) {
      const digits = (brokerPhone ?? '').replace(/\D/g, '');
      if (digits) {
        const texto = `Olá! Meu nome é ${name.trim()} e gostaria de saber mais sobre imóveis.`;
        void Linking.openURL(`https://wa.me/55${digits}?text=${encodeURIComponent(texto)}`);
      }
    }
    setDone(true);
  }

  const footer = brokerName
    ? `Atendimento por ${brokerName}${agency ? ` · ${agency}` : ''}`
    : null;

  return (
    <Screen>
      <View style={styles.hero}>
        <WordMark size={28} color="#FFFFFF" onDark />
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
            {/*
              O CONSENTIMENTO PRECISA SER UM ATO, NÃO UMA FRASE NO RODAPÉ.

              Aqui havia só um aviso embaixo do botão dizendo para que os dados
              seriam usados. Aviso não é consentimento: a LGPD pede manifestação
              livre, informada e INEQUÍVOCA, e ler um rodapé não é manifestar
              nada.

              A caixa começa desmarcada de propósito. Pré-marcada, ela seria o
              mesmo aviso de antes com aparência de escolha — que é pior, porque
              parece consentimento e não é.
            */}
            <Pressable
              onPress={() => setAceitou((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: aceitou }}
              style={styles.consentRow}
            >
              <View style={[styles.checkbox, aceitou && styles.checkboxOn]}>
                {aceitou ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.consentText}>{TEXTO_CONSENTIMENTO}</Text>
            </Pressable>

            <Button label="Enviar meu contato" onPress={submit} loading={sending} style={styles.cta} />
            <Pressable onPress={() => router.push('/privacidade')} hitSlop={8}>
              <Text style={styles.privacyLink}>Ler a Política de Privacidade</Text>
            </Pressable>
          </View>
        </>
      )}

      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: radius.sm,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkboxMark: { color: colors.white, fontWeight: '700', fontSize: 14 },
    consentText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 18 },
    privacyLink: {
      ...typography.caption,
      color: colors.primary,
      textAlign: 'center',
      marginTop: spacing.md,
    },
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
