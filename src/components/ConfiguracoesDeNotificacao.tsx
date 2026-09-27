/**
 * CONFIGURAÇÕES → NOTIFICAÇÕES — os lembretes da agenda neste aparelho.
 *
 * Liga/desliga, som, com quanta antecedência avisar e um botão de teste (toca
 * em 5 segundos, para o corretor ver e ouvir como fica). Quando o corretor
 * negou a permissão, o iPhone não deixa o app pedir de novo: o único caminho
 * é o Ajustes do celular, e o botão leva direto para lá.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ToggleField } from '@/components/ToggleField';
import {
  carregarPreferencias,
  enviarTeste,
  LEMBRETES_DISPONIVEIS,
  lerPermissao,
  pedirPermissao,
  salvarPreferencias,
  sincronizarLembretes,
  type Permissao,
} from '@/features/notificacoes/lembretes';
import {
  OPCOES_DE_ANTECEDENCIA,
  PREFERENCIAS_PADRAO,
  type PreferenciasDeNotificacao,
} from '@/features/notificacoes/planejar';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export function ConfiguracoesDeNotificacao() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<PreferenciasDeNotificacao>(PREFERENCIAS_PADRAO);
  const [permissao, setPermissao] = useState<Permissao>('indisponivel');
  const [marcados, setMarcados] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const atualizar = useCallback(async () => {
    setPrefs(await carregarPreferencias());
    const p = await lerPermissao();
    setPermissao(p);
    if (user) setMarcados(await sincronizarLembretes(user.id));
  }, [user]);

  useEffect(() => {
    if (!LEMBRETES_DISPONIVEIS) return;
    void atualizar();
    // Voltando do Ajustes do celular, a permissão pode ter mudado.
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') void atualizar();
    });
    return () => sub.remove();
  }, [atualizar]);

  async function mudar(novo: PreferenciasDeNotificacao) {
    setPrefs(novo);
    setAviso(null);
    await salvarPreferencias(novo);
    if (novo.ativadas && permissao !== 'concedida') setPermissao(await pedirPermissao());
    if (user) setMarcados(await sincronizarLembretes(user.id));
  }

  function alternarAntecedencia(minutos: number) {
    const tem = prefs.antecedencias.includes(minutos);
    const lista = tem ? prefs.antecedencias.filter((m) => m !== minutos) : [...prefs.antecedencias, minutos];
    void mudar({ ...prefs, antecedencias: lista.sort((a, b) => b - a) });
  }

  async function testar() {
    const p = await enviarTeste();
    setPermissao(p);
    setAviso(
      p === 'concedida'
        ? 'Pronto: a notificação de teste chega em 5 segundos. Pode bloquear a tela para ver.'
        : 'As notificações do POUP estão desligadas neste celular. Ligue nos Ajustes.',
    );
  }

  if (!LEMBRETES_DISPONIVEIS) {
    return (
      <View style={styles.card}>
        <Text style={styles.texto}>
          Os lembretes da agenda, com som, tocam no app do POUP no iPhone e no Android — mesmo com o
          app fechado. No navegador eles não funcionam.
        </Text>
      </View>
    );
  }

  const negada = permissao === 'negada';

  return (
    <View style={styles.card}>
      {negada ? (
        <View style={styles.alerta}>
          <Text style={styles.alertaTitulo}>Notificações desligadas no celular</Text>
          <Text style={styles.texto}>
            O POUP não consegue avisar dos agendamentos. Abra os Ajustes, toque em Notificações e
            ligue “Permitir Notificações” e “Sons”.
          </Text>
          <Button label="Abrir Ajustes do celular" variant="secondary" onPress={() => void Linking.openSettings()} />
        </View>
      ) : null}

      <ToggleField
        label="Lembretes da agenda"
        value={prefs.ativadas}
        onChange={(v) => void mudar({ ...prefs, ativadas: v })}
        onLabel="Ligado"
        offLabel="Desligado"
      />
      <View style={styles.divisor} />
      <ToggleField
        label="Tocar som"
        value={prefs.som}
        onChange={(v) => void mudar({ ...prefs, som: v })}
        onLabel="Com som"
        offLabel="Sem som"
      />
      <View style={styles.divisor} />

      <Text style={styles.rotulo}>Avisar</Text>
      <View style={styles.chips}>
        {OPCOES_DE_ANTECEDENCIA.map((o) => {
          const ativo = prefs.antecedencias.includes(o.minutos);
          return (
            <Pressable
              key={o.minutos}
              onPress={() => alternarAntecedencia(o.minutos)}
              disabled={!prefs.ativadas}
              style={[styles.chip, ativo && styles.chipAtivo, !prefs.ativadas && styles.chipApagado]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ativo, disabled: !prefs.ativadas }}
            >
              <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{o.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
      {prefs.ativadas && prefs.antecedencias.length === 0 ? (
        <Text style={styles.erro}>Escolha pelo menos um horário, senão nada toca.</Text>
      ) : null}

      <View style={styles.teste}>
        <Button label="Testar notificação" variant="secondary" onPress={() => void testar()} />
      </View>
      {aviso ? <Text style={styles.texto}>{aviso}</Text> : null}
      <Text style={styles.rodape}>
        {prefs.ativadas && permissao === 'concedida' && marcados != null
          ? `${marcados} ${marcados === 1 ? 'lembrete marcado' : 'lembretes marcados'} neste aparelho (próximos 30 dias).`
          : 'Nenhum lembrete marcado neste aparelho.'}{' '}
        Os lembretes tocam mesmo com o app fechado.
      </Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    divisor: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    rotulo: { ...typography.body, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipApagado: { opacity: 0.4 },
    chipTexto: { ...typography.caption, color: colors.ink, fontWeight: '600' },
    chipTextoAtivo: { color: colors.white },
    teste: { marginTop: spacing.lg },
    texto: { ...typography.caption, color: colors.ink, marginVertical: spacing.xs },
    erro: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
    rodape: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm, marginBottom: spacing.sm },
    alerta: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.sm,
      gap: spacing.xs,
    },
    alertaTitulo: { ...typography.label, color: colors.danger },
  });
