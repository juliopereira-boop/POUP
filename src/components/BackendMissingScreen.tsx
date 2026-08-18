/**
 * Tela mostrada quando o app foi construído sem as chaves do Supabase.
 *
 * ------------------------------------------------------------------
 * POR QUE ISSO EXISTE
 * ------------------------------------------------------------------
 * `src/lib/env.ts` cai num endereço de mentira (`placeholder.supabase.co`)
 * quando `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` não
 * chegam ao build. O app **abre normalmente** e nada funciona: login não
 * responde, listas ficam vazias, e não há uma única pista do motivo.
 *
 * Isso é fácil de acontecer justamente no primeiro build do EAS, porque essas
 * variáveis vivem nos segredos da conta, não no repositório. Perder uma tarde
 * procurando bug em código que está certo é o desperdício que esta tela evita.
 *
 * A checagem já existia em `isBackendConfigured` desde o começo do projeto —
 * mas nunca tinha sido ligada em lugar nenhum.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Logo } from './Logo';
import { Screen } from './Screen';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const FALTANDO = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

export function BackendMissingScreen() {
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen center>
      <View style={styles.wrap}>
        <Logo size={44} />
        <Text style={styles.title}>Este build está sem configuração</Text>
        <Text style={styles.text}>
          O aplicativo foi gerado sem o endereço do servidor, então nada consegue carregar. Não é
          problema da sua conta nem da sua internet.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Para quem for corrigir</Text>
          <Text style={styles.cardText}>
            Faltaram estas variáveis de ambiente no momento da compilação:
          </Text>
          {FALTANDO.map((v) => (
            <Text key={v} style={styles.var}>
              {v}
            </Text>
          ))}
          <Text style={styles.cardText}>
            No EAS elas vêm dos segredos do projeto (Project settings → Environment variables), não
            do repositório.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
    title: {
      ...typography.heading,
      color: colors.ink,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    text: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
    card: {
      alignSelf: 'stretch',
      marginTop: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      gap: spacing.sm,
    },
    cardTitle: { ...typography.label, color: colors.ink },
    cardText: { ...typography.caption, color: colors.inkMuted },
    var: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: '700',
    },
  });
