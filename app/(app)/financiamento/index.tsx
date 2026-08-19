/**
 * A porta do módulo de financiamento.
 *
 * Quatro caminhos, na ordem em que a venda acontece de verdade:
 *
 *   1. **Simulação rápida** — cinco campos, resultado em trinta segundos. É o
 *      que o corretor abre com o cliente na frente.
 *   2. **Poder de compra** — a pergunta invertida ("ganho X, compro o quê?"),
 *      que costuma vir ANTES de existir um imóvel escolhido.
 *   3. **Minhas simulações** — o histórico, ligado ao cliente.
 *   4. **Regras** — só para o administrador, e por isso só aparece para ele.
 *
 * O aviso de regras de fábrica fica no topo e é deliberadamente difícil de
 * ignorar: enquanto ninguém cadastrar os parâmetros oficiais, o corretor
 * precisa saber que as linhas do MCMV e do SBPE não estão disponíveis e que o
 * caminho é informar a condição aprovada pelo correspondente.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { useFinanciamento } from '@/features/financiamento/FinanciamentoProvider';
import { AVISO_LEGAL } from '@/features/financiamento/motor';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, shadow, spacing, typography, type AppColors } from '@/theme';

interface Atalho {
  chave: string;
  titulo: string;
  descricao: string;
  icone: IconName;
  rota: Href;
}

const ATALHOS: Atalho[] = [
  {
    chave: 'simular',
    titulo: 'Simular financiamento',
    descricao: 'Valor do imóvel, entrada, renda e prazo. O resultado aparece enquanto você digita.',
    icone: 'calculator',
    rota: '/(app)/financiamento/simular',
  },
  {
    chave: 'poder',
    titulo: 'Poder de compra',
    descricao: '"Ganho R$ 5.000, compro o quê?" — e quais unidades suas cabem nesse valor.',
    icone: 'chart',
    rota: '/(app)/financiamento/poder-de-compra',
  },
  {
    chave: 'historico',
    titulo: 'Minhas simulações',
    descricao: 'O histórico por cliente, com as condições congeladas de cada data.',
    icone: 'briefcase',
    rota: '/(app)/financiamento/historico',
  },
];

export default function FinanciamentoHome() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { regrasDeFabrica, carregando } = useFinanciamento();
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    void db.settings.isAdmin().then(setAdmin);
  }, []);

  return (
    <Screen>
      <Text style={styles.titulo}>Financiamento habitacional</Text>
      <Text style={styles.sub}>
        Simulação estimada, com a matemática de SAC e PRICE feita por inteiro. As condições finais
        dependem da instituição financeira.
      </Text>

      {!carregando && regrasDeFabrica ? (
        <View style={styles.aviso}>
          <Text style={styles.avisoTitulo}>As linhas oficiais ainda não foram cadastradas</Text>
          <Text style={styles.avisoTexto}>
            Taxa, faixa de renda, teto do imóvel e prazo do Minha Casa Minha Vida e do SBPE são
            condições oficiais e mudam por normativo — elas precisam ser lidas na fonte e
            cadastradas. Enquanto isso, use <Text style={styles.forte}>Condições informadas</Text> e
            digite a condição que o correspondente bancário aprovou para o cliente. O cálculo é o
            mesmo.
          </Text>
        </View>
      ) : null}

      <View style={styles.lista}>
        {ATALHOS.map((a) => (
          <Pressable
            key={a.chave}
            onPress={() => router.push(a.rota)}
            accessibilityRole="button"
            accessibilityLabel={a.titulo}
            style={({ pressed }) => [styles.cartao, pressed && styles.pressionado]}
          >
            <View style={styles.icone}>
              <Icon name={a.icone} size={22} color={colors.primary} strokeWidth={1.8} />
            </View>
            <View style={styles.texto}>
              <Text style={styles.cartaoTitulo}>{a.titulo}</Text>
              <Text style={styles.cartaoDesc}>{a.descricao}</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.inkSubtle} />
          </Pressable>
        ))}

        {admin ? (
          <Pressable
            onPress={() => router.push('/(app)/admin/financiamento')}
            accessibilityRole="button"
            accessibilityLabel="Regras de financiamento"
            style={({ pressed }) => [styles.cartao, styles.cartaoAdmin, pressed && styles.pressionado]}
          >
            <View style={[styles.icone, styles.iconeAdmin]}>
              <Icon name="gear" size={22} color={colors.inkMuted} strokeWidth={1.8} />
            </View>
            <View style={styles.texto}>
              <Text style={styles.cartaoTitulo}>Regras de financiamento</Text>
              <Text style={styles.cartaoDesc}>
                Taxas, faixas, quotas, prazos e encargos — versionados, com fonte e auditoria.
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.inkSubtle} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.legal}>{AVISO_LEGAL}</Text>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    titulo: { ...typography.title, color: colors.primary },
    sub: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 19 },
    aviso: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    avisoTitulo: { ...typography.label, color: colors.warning, fontWeight: '700' },
    avisoTexto: { ...typography.caption, color: colors.ink, lineHeight: 19 },
    forte: { fontWeight: '700' },
    lista: { gap: spacing.md },
    cartao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    cartaoAdmin: { backgroundColor: colors.surfaceAlt },
    pressionado: { opacity: 0.85 },
    icone: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    iconeAdmin: { backgroundColor: colors.border },
    texto: { flex: 1, gap: 2 },
    cartaoTitulo: { ...typography.heading, color: colors.ink, fontSize: 16 },
    cartaoDesc: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },
    legal: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: spacing.xl,
      lineHeight: 17,
      fontSize: 11.5,
    },
  });
