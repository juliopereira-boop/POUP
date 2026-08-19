/**
 * PODER DE COMPRA — a pergunta invertida.
 *
 * ===========================================================================
 * ESTA É A TELA COMERCIAL DO MÓDULO
 * ===========================================================================
 * O simulador do banco responde "esse imóvel custa X, a parcela é Y". Aqui é o
 * contrário, e é o que o cliente pergunta primeiro: *"ganho R$ 5.000 e tenho
 * R$ 40 mil, dá para comprar o quê?"*.
 *
 * O remate é a lista de unidades: em vez de terminar num número abstrato, a
 * tela mostra **quais empreendimentos do catálogo do corretor cabem** — e quais
 * ficaram por pouco, com o quanto falta. É a diferença entre uma calculadora e
 * uma ferramenta de venda.
 *
 * ===========================================================================
 * DIZER O QUE TRAVOU É METADE DA RESPOSTA
 * ===========================================================================
 * O teto vem da renda OU da entrada, e a ação do corretor muda completamente
 * conforme o caso: travou na renda, compõe renda com o cônjuge; travou na
 * entrada, negocia o ato ou usa mais FGTS. Um simulador que só devolve o
 * número deixa essa decisão no escuro.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { formatCurrencyBRL } from '@/lib/masks';
import { useFinanciamento } from '@/features/financiamento/FinanciamentoProvider';
import { formatarBRL, formatarPct, reaisParaCentavos } from '@/features/financiamento/dinheiro';
import { PRAZOS_COMUNS, decimal, dinheiro, inteiro } from '@/features/financiamento/formulario';
import { LIMITANTE_TEXTO, poderDeCompra, unidadesCompativeis } from '@/features/financiamento/reverso';
import { acharProduto } from '@/features/financiamento/regras';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function PoderDeCompra() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { form, set, aplicar, regras, empreendimentos } = useFinanciamento();
  const [erroLocal] = useState<string | null>(null);

  const produto = acharProduto(regras, form.produtoId) ?? regras.produtos[0]!;

  const resultado = useMemo(() => {
    if (dinheiro(form.rendaFamiliar) <= 0) return null;
    return poderDeCompra({
      rendaFamiliarMensal: dinheiro(form.rendaFamiliar),
      entradaPropria: dinheiro(form.entradaPropria),
      fgts: dinheiro(form.fgts),
      subsidio: dinheiro(form.subsidio),
      produto,
      regras,
      prazoMeses: inteiro(form.prazoMeses) ?? 360,
      sistema: form.sistema,
      taxaAnualPctInformada: decimal(form.taxaAnual),
      quotaMaxPctInformada: decimal(form.quotaMax),
      comprometimentoMaxPctInformado: decimal(form.comprometimento),
    });
  }, [form, produto, regras]);

  /**
   * As unidades do corretor que cabem.
   *
   * Só entram empreendimentos com preço cadastrado — um empreendimento sem
   * valor não pode ser oferecido como "cabe" nem como "não cabe", e listá-lo
   * numa das duas colunas seria inventar informação.
   */
  const estoque = useMemo(
    () =>
      empreendimentos
        .filter((d) => typeof d.unitValueFrom === 'number' && d.unitValueFrom > 0)
        .map((d) => ({ item: d, valor: reaisParaCentavos(d.unitValueFrom as number) })),
    [empreendimentos],
  );

  const compatibilidade = useMemo(
    () => (resultado?.ok ? unidadesCompativeis(estoque, resultado.valorImovelMax, 10) : null),
    [estoque, resultado],
  );

  return (
    <Screen>
      <Text style={styles.titulo}>Quanto esse cliente compra?</Text>
      <Text style={styles.sub}>
        Informe a renda e o que ele tem de entrada. O resultado diz o teto e — o que mais importa —
        o que travou nele.
      </Text>

      <Input
        label="Renda familiar bruta"
        value={form.rendaFamiliar}
        onChangeText={(t) => set('rendaFamiliar', formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />

      <View style={styles.linha}>
        <View style={styles.col}>
          <Input
            label="Entrada própria"
            value={form.entradaPropria}
            onChangeText={(t) => set('entradaPropria', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.col}>
          <Input
            label="FGTS"
            value={form.fgts}
            onChangeText={(t) => set('fgts', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
      </View>

      <Select
        label="Prazo"
        value={form.prazoMeses}
        options={PRAZOS_COMUNS}
        onChange={(v) => set('prazoMeses', v)}
      />

      {produto.parametrosManuais ? (
        <View style={styles.linha}>
          <View style={styles.col}>
            <Input
              label="Taxa ao ano (%)"
              value={form.taxaAnual}
              onChangeText={(t) => set('taxaAnual', t.replace(/[^\d,.]/g, '').slice(0, 6))}
              placeholder="Ex.: 9,5"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.col}>
            <Input
              label="Quota (%)"
              value={form.quotaMax}
              onChangeText={(t) => set('quotaMax', t.replace(/[^\d,.]/g, '').slice(0, 5))}
              placeholder="Ex.: 80"
              keyboardType="numeric"
            />
          </View>
        </View>
      ) : null}

      {/* ------------------------------------------------------- resposta */}

      {resultado && !resultado.ok ? (
        <Text style={styles.erro}>{resultado.erro ?? erroLocal}</Text>
      ) : null}

      {resultado?.ok ? (
        <>
          <View style={styles.destaque}>
            <Text style={styles.destaqueRotulo}>Ele consegue comprar até</Text>
            <Text style={styles.destaqueValor}>{formatarBRL(resultado.valorImovelMax)}</Text>
            <Text style={styles.destaqueSub}>
              Financiando {formatarBRL(resultado.valorFinanciadoMax)} (
              {formatarPct(resultado.quotaAplicadaPct, 1)} do imóvel) com entrada de{' '}
              {formatarBRL(resultado.entradaTotal)}.
            </Text>
          </View>

          <View style={styles.limitante}>
            <Text style={styles.limitanteTitulo}>O que limitou</Text>
            <Text style={styles.limitanteTexto}>{LIMITANTE_TEXTO[resultado.limitante]}</Text>
          </View>

          <View style={styles.grade}>
            <Mini rotulo="Parcela máxima" valor={formatarBRL(resultado.parcelaMaxima)} />
            <Mini rotulo="1ª parcela no teto" valor={formatarBRL(resultado.primeiraPrestacao)} />
            <Mini rotulo="Sistema" valor={resultado.sistema} />
            <Mini rotulo="Taxa" valor={`${formatarPct(resultado.taxaAnualPct)} a.a.`} />
          </View>

          {resultado.avisos.map((a) => (
            <Text key={a} style={styles.aviso}>
              {a}
            </Text>
          ))}

          {/* ------------------------------------------ o remate comercial */}
          <Text style={styles.secao}>O que cabe no seu estoque</Text>
          {estoque.length === 0 ? (
            <Text style={styles.vazio}>
              Nenhum empreendimento seu tem valor de unidade cadastrado. Preencha o valor em
              Cadastros e esta lista se monta sozinha.
            </Text>
          ) : compatibilidade && compatibilidade.compativeis.length === 0 && compatibilidade.quaseLa.length === 0 ? (
            <Text style={styles.vazio}>
              Nenhuma unidade sua cabe neste valor. Vale tentar aumentar a entrada, compor renda ou
              alongar o prazo.
            </Text>
          ) : (
            <>
              {compatibilidade?.compativeis.map((d) => (
                <View key={d.id} style={styles.unidade}>
                  <View style={styles.unidadeTexto}>
                    <Text style={styles.unidadeNome}>{d.name}</Text>
                    <Text style={styles.unidadeValor}>
                      {formatarBRL(reaisParaCentavos(d.unitValueFrom ?? 0))}
                    </Text>
                  </View>
                  <Button
                    label="Simular"
                    variant="secondary"
                    onPress={() => {
                      aplicar({
                        developmentId: d.id,
                        companyId: d.companyId,
                        valorImovel: formatCurrencyBRL(
                          String(Math.round((d.unitValueFrom ?? 0) * 100)),
                        ),
                      });
                      router.push('/(app)/financiamento/simular');
                    }}
                  />
                </View>
              ))}

              {compatibilidade?.quaseLa.length ? (
                <>
                  <Text style={styles.quaseTitulo}>Por pouco</Text>
                  {compatibilidade.quaseLa.map(({ item, falta }) => (
                    <View key={item.id} style={[styles.unidade, styles.unidadeQuase]}>
                      <View style={styles.unidadeTexto}>
                        <Text style={styles.unidadeNome}>{item.name}</Text>
                        <Text style={styles.unidadeValor}>
                          {formatarBRL(reaisParaCentavos(item.unitValueFrom ?? 0))} · faltam{' '}
                          {formatarBRL(falta)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : null}
            </>
          )}
        </>
      ) : (
        <Text style={styles.vazio}>Informe a renda familiar para ver o poder de compra.</Text>
      )}

      <Text style={styles.legal}>
        Estimativa a partir dos parâmetros informados. Não é proposta de crédito nem garantia de
        aprovação.
      </Text>
    </Screen>
  );
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.mini}>
      <Text style={styles.miniRotulo}>{rotulo}</Text>
      <Text style={styles.miniValor}>{valor}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    titulo: { ...typography.title, color: colors.primary },
    sub: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 19 },
    linha: { flexDirection: 'row', gap: spacing.lg },
    col: { flex: 1 },

    destaque: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: 3,
      marginTop: spacing.md,
    },
    destaqueRotulo: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    destaqueValor: { ...typography.title, color: colors.primary, fontSize: 34, lineHeight: 40 },
    destaqueSub: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },

    limitante: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      gap: 2,
    },
    limitanteTitulo: { ...typography.label, color: colors.ink },
    limitanteTexto: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },

    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
    mini: {
      minWidth: 140,
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 1,
    },
    miniRotulo: { ...typography.caption, color: colors.inkMuted, fontSize: 11.5 },
    miniValor: { ...typography.heading, color: colors.ink, fontSize: 15 },

    aviso: { ...typography.caption, color: colors.warning, marginTop: spacing.sm, lineHeight: 18 },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginTop: spacing.md,
      overflow: 'hidden',
    },

    secao: { ...typography.heading, color: colors.ink, marginTop: spacing.xl, marginBottom: spacing.md },
    vazio: { ...typography.caption, color: colors.inkMuted, lineHeight: 19 },
    unidade: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    unidadeQuase: { opacity: 0.75, borderStyle: 'dashed' },
    unidadeTexto: { flex: 1, gap: 1 },
    unidadeNome: { ...typography.label, color: colors.ink },
    unidadeValor: { ...typography.caption, color: colors.inkMuted },
    quaseTitulo: {
      ...typography.label,
      color: colors.inkMuted,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },

    legal: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xl, lineHeight: 17 },
  });
