import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { openGuide } from '@/features/guide';

import { Button } from '@/components/Button';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { InstallHowToModal, useInstallPrompt } from '@/components/InstallAppCard';
import { ReportarProblema } from '@/components/ReportarProblema';
import { Screen } from '@/components/Screen';
import { canPromptInstall, promptInstall } from '@/features/install/pwa';
import { abrirPortalDeCobranca } from '@/features/cobranca/abrirCobranca';
import { useIsAdmin } from '@/features/admin';
import {
  consentimentoScanEm,
  revogarConsentimentoScan,
} from '@/features/scan/consent';
import { canShowBilling } from '@/features/store';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors, type ColorScheme } from '@/theme';

/** ISO -> DD/MM/AAAA. Sem hora: a data basta para saber "quando eu autorizei". */
function dataCurtaBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Período de teste',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  none: 'Sem assinatura',
};

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { subscription, plan } = useSubscription();
  const { isAdmin } = useIsAdmin();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const { plataforma, instalavel, jaInstalado } = useInstallPrompt();
  const [comoInstalar, setComoInstalar] = useState(false);
  const [reportando, setReportando] = useState(false);
  const [consentScanEm, setConsentScanEm] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void consentimentoScanEm().then((v) => {
      if (vivo) setConsentScanEm(v);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function desligarScan() {
    await revogarConsentimentoScan();
    setConsentScanEm(null);
  }

  /**
   * Instala pelo botão do navegador quando ele existe; caso contrário abre o
   * passo a passo. É o mesmo caminho do convite da tela inicial — aqui ele fica
   * guardado para quem dispensou o convite e depois se arrependeu.
   */
  async function instalarNaTelaInicial() {
    if (canPromptInstall()) {
      const aceitou = await promptInstall();
      if (aceitou) return;
    }
    setComoInstalar(true);
  }

  /*
   * Quem sai do app é o `abrirPortalDeCobranca`, não esta tela — o endereço do
   * portal do Stripe nem chega até aqui. Era esse retorno de URL, numa tela
   * compilada também para o iOS, que deixava o caminho de cobrança externa
   * dentro do binário das lojas. Ver `src/features/cobranca/abrirCobranca.native.ts`.
   *
   * O botão que chama isto já está atrás de `canShowBilling`.
   */
  async function openBillingPortal() {
    setLoadingPortal(true);
    const result = await abrirPortalDeCobranca();
    setLoadingPortal(false);
    // Sucesso significa que o navegador já está indo embora. Só o erro sobra —
    // e ele vai para o log, porque o portal é caminho de mão única: não há o
    // que o corretor faça nesta tela além de tentar de novo.
    if (!result.ok) console.error('[configuracoes] portal de cobrança:', result.error);
  }

  const statusLabel = STATUS_LABEL[subscription?.status ?? 'none'] ?? 'Sem assinatura';

  return (
    <Screen>
      <Text style={styles.sectionLabel}>Conta</Text>
      <View style={styles.card}>
        <Row label="Nome" value={profile?.fullName ?? user?.displayName ?? '—'} />
        <Divider />
        <Row label="Imobiliária" value={profile?.agency ?? '—'} />
        <Divider />
        <Row label="Email" value={user?.email ?? '—'} />
        <Divider />
        <NavRow label="Editar perfil" onPress={() => router.push('/(app)/perfil')} />
      </View>

      <Text style={styles.sectionLabel}>Aparência</Text>
      <View style={styles.card}>
        <View style={styles.themeRow}>
          <Text style={styles.rowLabel}>Tema</Text>
          <ThemeToggle />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Ajuda</Text>
      <View style={styles.card}>
        <NavRow
          label="Guia do app"
          subtitle="Rever o passo a passo de como usar o POUP"
          onPress={openGuide}
        />
        {Platform.OS === 'web' && !jaInstalado ? (
          <>
            <Divider />
            <NavRow
              label="Instalar na tela de início"
              subtitle={
                instalavel
                  ? 'Deixe o POUP como um ícone no seu aparelho'
                  : 'Veja como deixar o POUP como um ícone no seu aparelho'
              }
              onPress={() => void instalarNaTelaInicial()}
            />
          </>
        ) : null}
        <Divider />
        {/* Antes do Suporte de propósito: quem tem um problema concreto acha
            aqui o caminho curto, que já leva a tela e a etapa junto. O Suporte
            continua para o que não é sobre uma tela específica. */}
        <NavRow
          label="Reportar problema ou dar sugestão"
          subtitle="A gente já sabe em qual tela você estava"
          onPress={() => setReportando(true)}
        />
        <Divider />
        <NavRow label="Suporte" onPress={() => router.push('/suporte')} />
        <Divider />
        <NavRow label="Política de Privacidade" onPress={() => router.push('/privacidade')} />
      </View>

      {/*
        REVOGAR O CONSENTIMENTO DA IA.

        Consentimento que não se pode retirar não é consentimento — vale para a
        LGPD e para a regra 5.1.2(i) da App Store. A leitura de documento manda
        a foto do RG de um cliente para a Anthropic, e o corretor precisa poder
        desligar isso sem falar com ninguém.

        A data fica à vista porque "você autorizou" sem dizer quando é uma
        afirmação que ninguém consegue conferir.
      */}
      <Text style={styles.sectionLabel}>Privacidade</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Leitura de documento por IA</Text>
          <Text style={styles.rowValue}>
            {consentScanEm ? `Autorizada em ${dataCurtaBR(consentScanEm)}` : 'Não autorizada'}
          </Text>
        </View>
        {consentScanEm ? (
          <View style={styles.cardAction}>
            <Button
              label="Desligar a leitura por IA"
              variant="secondary"
              onPress={() => void desligarScan()}
            />
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>Cadastros</Text>
      <View style={styles.card}>
        <NavRow label="Empresas e empreendimentos" onPress={() => router.push('/(app)/cadastros')} />
      </View>

      <Text style={styles.sectionLabel}>Leads</Text>
      <View style={styles.card}>
        <NavRow
          label="Workflow de Leads"
          subtitle="Etapas, ordem e cores do seu funil"
          onPress={() => router.push('/(app)/workflow')}
        />
      </View>

      {isAdmin ? (
        <>
          <Text style={styles.sectionLabel}>Administração</Text>
          <View style={styles.card}>
            <NavRow
              label="Período de teste"
              subtitle="Ligar/desligar o teste gratuito e definir os dias"
              onPress={() => router.push('/(app)/campanhas')}
            />
            <Divider />
            <NavRow
              label="Catálogo do sistema"
              subtitle="Construtoras prontas para os corretores adotarem"
              onPress={() => router.push('/(app)/admin/catalogo')}
            />
            <Divider />
            <NavRow
              label="Rastreabilidade"
              subtitle="Funil, consumo de IA e recados dos corretores"
              onPress={() => router.push('/(app)/admin/rastreabilidade')}
            />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionLabel}>Assinatura</Text>
      <View style={styles.card}>
        <Row label="Plano" value={plan?.name ?? '—'} />
        <Divider />
        <Row label="Status" value={statusLabel} />
        {subscription?.currentPeriodEnd ? (
          <>
            <Divider />
            <Row
              label="Renova em"
              value={new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
            />
          </>
        ) : null}
        {/* O portal do Stripe é cobrança de fora da loja: mostrar o botão no
            app publicado é apontar o caminho, e é rejeição na revisão. Plano e
            status continuam visíveis — informar não é vender. */}
        {canShowBilling ? (
          <View style={styles.cardAction}>
            <Button
              label="Gerenciar assinatura"
              variant="secondary"
              onPress={openBillingPortal}
              loading={loadingPortal}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.signOut}>
        <Button label="Sair da conta" variant="danger" onPress={() => void signOut()} />
      </View>

      {/* Longe do "Sair da conta" de propósito: as duas ações se parecem no
          texto e não se parecem em nada nas consequências. */}
      <Text style={styles.sectionLabel}>Excluir conta</Text>
      <View style={styles.card}>
        <DeleteAccountButton />
      </View>

      <ReportarProblema visible={reportando} onClose={() => setReportando(false)} />

      <InstallHowToModal
        visible={comoInstalar}
        plataforma={plataforma}
        onClose={() => setComoInstalar(false)}
      />
    </Screen>
  );
}

function ThemeToggle() {
  const styles = useThemedStyles(makeStyles);
  const { scheme, setScheme } = useTheme();
  const options: { key: ColorScheme; label: string }[] = [
    { key: 'light', label: '☀️ Claro' },
    { key: 'dark', label: '🌙 Escuro' },
  ];
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const active = scheme === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => setScheme(opt.key)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function NavRow({
  label,
  subtitle,
  onPress,
}: {
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.navRowText}>
        <Text style={styles.navRowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.navRowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function Divider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.lg,
      gap: spacing.lg,
    },
    rowLabel: { ...typography.body, color: colors.inkMuted },
    rowValue: { ...typography.body, color: colors.ink, flexShrink: 1, textAlign: 'right' },
    divider: { height: 1, backgroundColor: colors.border },
    cardAction: { paddingVertical: spacing.lg },
    navRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    navRowPressed: { opacity: 0.6 },
    navRowText: { flex: 1, gap: 2 },
    navRowLabel: { ...typography.body, color: colors.ink },
    navRowSubtitle: { ...typography.caption, color: colors.inkMuted },
    chevron: { ...typography.title, color: colors.inkSubtle },
    themeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.lg,
      gap: spacing.lg,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: 3,
    },
    segmentItem: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    segmentItemActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentText: { ...typography.label, color: colors.inkMuted },
    segmentTextActive: { color: colors.ink },
    signOut: { marginTop: spacing.xxl },
  });
