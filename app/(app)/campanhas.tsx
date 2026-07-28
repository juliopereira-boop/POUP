import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import {
  TRIAL_DAYS_MAX,
  TRIAL_DAYS_MIN,
  db,
  isValidTrialDays,
  type TrialCampaign,
} from '@/data';
import { useIsAdmin } from '@/features/admin';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const DEACTIVATE_MESSAGE =
  'Ao desativar, quem já está em período de teste continua usando até o fim do prazo dele. ' +
  'As contas novas que entrarem daqui para frente vão direto para a tela de pagamento.';

export default function CampanhasScreen() {
  const styles = useThemedStyles(makeStyles);
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();

  const [campaign, setCampaign] = useState<TrialCampaign | null>(null);
  const [activeTrials, setActiveTrials] = useState<number | null>(null);
  const [days, setDays] = useState('7');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [current, count] = await Promise.all([
      db.settings.getTrialCampaign(),
      db.settings.countActiveTrials(),
    ]);
    setCampaign(current);
    setActiveTrials(count);
    if (current) setDays(String(current.trialDays));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [isAdmin, load]);

  function parseDays(): number | null {
    const parsed = Number(days.trim());
    return isValidTrialDays(parsed) ? parsed : null;
  }

  async function save(enabled: boolean, trialDays: number) {
    setError(null);
    setFeedback(null);
    setSaving(true);
    const result = await db.settings.saveTrialCampaign({ enabled, trialDays });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCampaign(result.data);
    setDays(String(result.data.trialDays));
    setFeedback(
      enabled
        ? `Campanha ativa: contas novas ganham ${result.data.trialDays} ${
            result.data.trialDays === 1 ? 'dia' : 'dias'
          } de teste.`
        : 'Campanha desativada. Contas novas vão direto para o pagamento.',
    );
    setActiveTrials(await db.settings.countActiveTrials());
  }

  function activate() {
    const parsed = parseDays();
    if (parsed == null) {
      setFeedback(null);
      setError(
        `Informe a quantidade de dias do teste: um número inteiro de ${TRIAL_DAYS_MIN} a ${TRIAL_DAYS_MAX}.`,
      );
      return;
    }
    void save(true, parsed);
  }

  function saveDays() {
    const parsed = parseDays();
    if (parsed == null) {
      setFeedback(null);
      setError(
        `Informe a quantidade de dias do teste: um número inteiro de ${TRIAL_DAYS_MIN} a ${TRIAL_DAYS_MAX}.`,
      );
      return;
    }
    void save(true, parsed);
  }

  function deactivate() {
    const current = campaign?.trialDays ?? parseDays() ?? 7;
    const doDeactivate = () => void save(false, current);
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`${DEACTIVATE_MESSAGE}\n\nDesativar a campanha agora?`)) doDeactivate();
    } else {
      Alert.alert('Desativar período de teste', DEACTIVATE_MESSAGE, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desativar', style: 'destructive', onPress: doDeactivate },
      ]);
    }
  }

  if (loadingAdmin || loading) {
    return (
      <Screen>
        <Text style={styles.muted}>Carregando...</Text>
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen>
        <Text style={styles.sectionLabel}>Acesso restrito</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            Esta tela é exclusiva do administrador do POUP. Se você precisa de acesso, fale com o
            responsável pela conta.
          </Text>
        </View>
      </Screen>
    );
  }

  const enabled = campaign?.enabled ?? false;

  return (
    <Screen>
      <Text style={styles.intro}>
        Campanha de lançamento: enquanto ela estiver ativa, toda conta que ainda não usou o teste
        (inclusive login com Google) ganha um período de teste gratuito — as contas novas no
        primeiro acesso, e as que já existiam assim que abrirem o app. Quando o prazo termina, o
        acesso trava e o corretor vai para a tela de assinatura.
      </Text>

      <Text style={styles.sectionLabel}>Situação atual</Text>
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, enabled ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.statusText}>
            {enabled ? 'Campanha ativa' : 'Campanha desativada'}
          </Text>
        </View>
        <Text style={styles.cardText}>
          {enabled
            ? `Quem ainda não usou o teste recebe ${campaign?.trialDays} ${
                campaign?.trialDays === 1 ? 'dia' : 'dias'
              } de teste gratuito.`
            : 'Ninguém recebe teste: contas sem assinatura vão direto para a tela de pagamento.'}
        </Text>
        <View style={styles.divider} />
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Em teste agora</Text>
          <Text style={styles.metaValue}>
            {activeTrials == null
              ? '—'
              : `${activeTrials} ${activeTrials === 1 ? 'conta' : 'contas'}`}
          </Text>
        </View>
        {campaign?.updatedAt ? (
          <>
            <View style={styles.divider} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Última alteração</Text>
              <Text style={styles.metaValue}>
                {new Date(campaign.updatedAt).toLocaleString('pt-BR')}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>Período de teste</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      <Input
        label={`Quantidade de dias (${TRIAL_DAYS_MIN} a ${TRIAL_DAYS_MAX})`}
        value={days}
        onChangeText={(text) => {
          setDays(text.replace(/[^0-9]/g, ''));
          setError(null);
          setFeedback(null);
        }}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="7"
      />

      {enabled ? (
        <View style={styles.actions}>
          <Button
            label="Salvar quantidade de dias"
            onPress={saveDays}
            loading={saving}
            disabled={String(campaign?.trialDays ?? '') === days.trim()}
          />
          <Button
            label="Desativar campanha"
            variant="danger"
            onPress={deactivate}
            disabled={saving}
          />
          <Text style={styles.hint}>{DEACTIVATE_MESSAGE}</Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button label="Ativar campanha" onPress={activate} loading={saving} />
          <Text style={styles.hint}>
            Ao ativar, a contagem começa no primeiro acesso de cada conta — contas que já existiam
            e nunca usaram o teste também recebem, assim que abrirem o app. Ninguém ganha um
            segundo teste, e quem já assina não é afetado. Mudar a quantidade de dias depois não
            altera o prazo de quem já está em teste.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    intro: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
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
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    cardText: { ...typography.caption, color: colors.inkMuted },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    dot: { width: 10, height: 10, borderRadius: radius.pill },
    dotOn: { backgroundColor: colors.success },
    dotOff: { backgroundColor: colors.inkSubtle },
    statusText: { ...typography.heading, color: colors.ink },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
    },
    metaLabel: { ...typography.body, color: colors.inkMuted },
    metaValue: { ...typography.body, color: colors.ink, flexShrink: 1, textAlign: 'right' },
    actions: { gap: spacing.md },
    hint: { ...typography.caption, color: colors.inkMuted },
    muted: { ...typography.body, color: colors.inkSubtle },
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
