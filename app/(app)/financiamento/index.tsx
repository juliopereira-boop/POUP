/**
 * A PORTA DO SIMULADOR: QUAL BANCO.
 *
 * ===========================================================================
 * A PERGUNTA QUE O CORRETOR JÁ SABE RESPONDER
 * ===========================================================================
 * A primeira versão desta tela oferecia quatro ferramentas e, lá dentro, um
 * formulário com "linha de financiamento", "sistema de amortização", "regime da
 * taxa", "quota", "comprometimento". São os termos do banco, não os da venda —
 * e cada um deles é uma chance de o corretor travar ou errar.
 *
 * Agora a tela faz uma pergunta só, e é a que ele responde sem pensar: **em
 * qual banco você vai levar essa proposta?**
 *
 * Escolhido o banco, tudo o que é regra daquele banco — taxa, quota máxima,
 * prazo máximo, teto de renda, comprometimento, indexador, sistema — entra
 * sozinho e **não aparece na tela**. Sobra o que só o corretor sabe: quanto
 * custa o imóvel, quanto o cliente tem, quanto ganha e em quantos anos.
 *
 * ===========================================================================
 * POR QUE A CAIXA É A PRIMEIRA
 * ===========================================================================
 * Não é ordem alfabética: é a instituição que opera o FGTS e o Minha Casa
 * Minha Vida, e é por onde passa a maior parte do financiamento residencial no
 * Brasil. Ela vem primeiro e é a única que já chega com as condições
 * documentadas cadastradas.
 *
 * ===========================================================================
 * OS OUTROS BANCOS NÃO CHEGAM COM TABELA — E ISSO É DE PROPÓSITO
 * ===========================================================================
 * Não temos as tabelas do BB, do Itaú, do Bradesco e do Santander, e a §74
 * proíbe inventar taxa, quota ou prazo. Eles aparecem porque o corretor
 * trabalha com eles de verdade; ao escolhê-los, o simulador vai direto para
 * "informe a condição que o correspondente aprovou". O motor é o mesmo — muda
 * só de onde vêm os números.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { BancoMarca } from '@/components/BancoMarca';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { BANCO_OUTRO, BANCOS } from '@/features/financiamento/bancos';
import { useFinanciamento } from '@/features/financiamento/FinanciamentoProvider';
import { AVISO_LEGAL } from '@/features/financiamento/motor';
import { produtoPadraoDoBanco } from '@/features/financiamento/regras';
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

export default function EscolherBanco() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { regras, escolherBanco, form, admin } = useFinanciamento();

  /*
   * O selo de cada banco sai do cadastro de regras, não de uma lista à parte:
   * é ele que sabe se aquele banco tem linha própria calculável ou se o
   * caminho é a condição informada. No dia em que alguém cadastrar a tabela do
   * Itaú, o selo dele muda sozinho.
   */
  const linhas = useMemo(
    () =>
      [...BANCOS]
        .sort((a, b) => a.ordem - b.ordem)
        .map((banco) => {
          const produto = produtoPadraoDoBanco(regras, banco.id);
          const proprio = produto !== null && !produto.parametrosManuais;
          /*
           * Três estados, e a diferença importa para o corretor saber onde
           * consegue simular:
           *   - linha cadastrada  → entra e simula, sem digitar condição;
           *   - "Outro banco"     → ele mesmo informa taxa, prazo e quota;
           *   - os demais sem     → dependem do administrador cadastrar.
           */
          const aberto = banco.id === BANCO_OUTRO;
          return {
            banco,
            proprio,
            selo: proprio
              ? 'Condições cadastradas'
              : aberto
                ? 'Você informa a condição'
                : 'Aguardando cadastro',
            detalhe: proprio
              ? (produto?.nome ?? '')
              : aberto
                ? banco.linha
                : 'As condições deste banco ainda não foram cadastradas pelo administrador.',
          };
        }),
    [regras],
  );

  const abrir = (bancoId: string) => {
    escolherBanco(bancoId);
    router.push('/(app)/financiamento/simular');
  };

  return (
    <Screen>
      <Text style={styles.titulo}>Simulador de financiamento</Text>
      <Text style={styles.sub}>Em qual banco você vai levar essa proposta?</Text>

      <View style={styles.lista}>
        {linhas.map(({ banco, selo, proprio, detalhe }) => (
          <Pressable
            key={banco.id}
            onPress={() => abrir(banco.id)}
            accessibilityRole="button"
            accessibilityLabel={`Simular no ${banco.nome}`}
            style={({ pressed }) => [
              styles.cartao,
              form.bancoId === banco.id && styles.cartaoAtual,
              pressed && styles.pressionado,
            ]}
          >
            <BancoMarca banco={banco} tamanho={52} />
            <View style={styles.texto}>
              <Text style={styles.nome}>{banco.nome}</Text>
              <Text style={styles.detalhe}>{detalhe}</Text>
              <View style={[styles.selo, proprio ? styles.seloForte : styles.seloFraco]}>
                <Text style={[styles.seloTexto, proprio && styles.seloTextoForte]}>{selo}</Text>
              </View>
            </View>
            <Icon name="chevronRight" size={18} color={colors.inkSubtle} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.nota}>
        As condições cadastradas entram sozinhas — taxa, prazo, quota e limite de renda ficam por
        trás. Você preenche só o valor do imóvel, o que o cliente tem, a renda e o prazo. Para
        digitar a condição que o correspondente aprovou, escolha{' '}
        <Text style={styles.forte}>Outro banco</Text>.
      </Text>

      {/* -------------------------------------------------- outras ferramentas */}
      <View style={styles.divisor} />

      <View style={styles.lista}>
        {ATALHOS.map((a) => (
          <Pressable
            key={a.chave}
            onPress={() => router.push(a.rota)}
            accessibilityRole="button"
            accessibilityLabel={a.titulo}
            style={({ pressed }) => [styles.atalho, pressed && styles.pressionado]}
          >
            <View style={styles.icone}>
              <Icon name={a.icone} size={20} color={colors.primary} strokeWidth={1.8} />
            </View>
            <View style={styles.texto}>
              <Text style={styles.atalhoTitulo}>{a.titulo}</Text>
              <Text style={styles.detalhe}>{a.descricao}</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.inkSubtle} />
          </Pressable>
        ))}

        {admin ? (
          <Pressable
            onPress={() => router.push('/(app)/admin/financiamento')}
            accessibilityRole="button"
            accessibilityLabel="Regras de financiamento"
            style={({ pressed }) => [styles.atalho, styles.atalhoAdmin, pressed && styles.pressionado]}
          >
            <View style={[styles.icone, styles.iconeAdmin]}>
              <Icon name="gear" size={20} color={colors.inkMuted} strokeWidth={1.8} />
            </View>
            <View style={styles.texto}>
              <Text style={styles.atalhoTitulo}>Regras de financiamento</Text>
              <Text style={styles.detalhe}>
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
    sub: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
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
    cartaoAtual: { borderColor: colors.primary, borderWidth: 1.5 },
    pressionado: { opacity: 0.85 },
    texto: { flex: 1, gap: 3 },
    nome: { ...typography.heading, color: colors.ink, fontSize: 16 },
    detalhe: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },
    selo: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      marginTop: 2,
    },
    seloForte: { backgroundColor: colors.successSoft },
    seloFraco: { backgroundColor: colors.surfaceAlt },
    seloTexto: { ...typography.caption, color: colors.inkMuted, fontSize: 11.5, fontWeight: '600' },
    seloTextoForte: { color: colors.success },
    nota: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: spacing.lg,
      lineHeight: 18,
    },
    forte: { fontWeight: '700', color: colors.ink },
    divisor: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.xl,
    },
    atalho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    atalhoAdmin: { backgroundColor: colors.surfaceAlt },
    atalhoTitulo: { ...typography.label, color: colors.ink },
    icone: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    iconeAdmin: { backgroundColor: colors.border },
    legal: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: spacing.xl,
      lineHeight: 17,
      fontSize: 11.5,
    },
  });
