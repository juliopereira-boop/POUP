/**
 * O RESULTADO — a tela que o corretor VIRA para o cliente.
 *
 * ===========================================================================
 * ISTO NÃO PODE PARECER UMA PLANILHA DE BANCO
 * ===========================================================================
 * A ordem da tela é a ordem em que o cliente pergunta:
 *
 *   1. "Quanto vou pagar por mês?"      → a parcela, em corpo grande
 *   2. "Quanto entro?"                  → os números do negócio
 *   3. "Eu consigo?"                    → o enquadramento, item a item
 *   4. "E se fosse em 30 anos?"         → o comparador
 *   5. "Como isso evolui?"              → os gráficos
 *   6. "Me manda isso"                  → PDF, WhatsApp, link
 *
 * Nada de tabela de 420 linhas na primeira dobra. Ela existe, mas atrás de um
 * toque — quem quer conferir abre; quem quer decidir não precisa passar por
 * ela.
 *
 * ===========================================================================
 * O QUE NÃO FOI CALCULADO APARECE, E APARECE ANTES DO PDF
 * ===========================================================================
 * Se o MIP não está cadastrado, a parcela mostrada não é a parcela final. O
 * corretor precisa saber disso ANTES de mandar o documento para o cliente — daí
 * o bloco ficar acima dos botões de compartilhar, e não escondido no rodapé.
 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { BancoMarca } from '@/components/BancoMarca';
import { Screen } from '@/components/Screen';
import { EvolutionChart, StackedShare } from '@/components/charts';
import { useFinanciamento } from '@/features/financiamento/FinanciamentoProvider';
import {
  centavosParaReais,
  formatarBRL,
  formatarPct,
  formatarPrazo,
} from '@/features/financiamento/dinheiro';
import { SISTEMA_ROTULO } from '@/features/financiamento/amortizacao';
import { acharBanco } from '@/features/financiamento/bancos';
import { AVISO_LEGAL, STATUS_ROTULO } from '@/features/financiamento/motor';
import { compararCenarios, montarCenarios, variacoesPadrao, vencedores } from '@/features/financiamento/cenarios';
import { paraEntrada } from '@/features/financiamento/formulario';
import { gerarRelatorio, resumoParaWhatsapp } from '@/features/financiamento/relatorio';
import { hojeISO } from '@/features/financiamento/formulario';
import { pontePoupanca } from '@/features/financiamento/ponte';
import { sessionStorage } from '@/lib/storage';
import { PREFILL_KEY } from '@/features/simulador/SimuladorProvider';
import { db } from '@/data';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function ResultadoFinanciamento() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { profile } = useProfile();
  const { user } = useAuth();
  const { form, resultado, erro, regras, empresas, empreendimentos, salvar } = useFinanciamento();

  const [mostrarTabela, setMostrarTabela] = useState(false);
  const [mostrarTrace, setMostrarTrace] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const empresaNome = empresas.find((c) => c.id === form.companyId)?.name ?? null;
  const empreendimentoNome = empreendimentos.find((d) => d.id === form.developmentId)?.name ?? null;

  const cenarios = useMemo(
    () =>
      resultado
        ? montarCenarios(paraEntrada(form), regras, variacoesPadrao(resultado.prazoMeses))
        : [],
    [form, regras, resultado],
  );
  const comparativo = useMemo(() => compararCenarios(cenarios), [cenarios]);

  if (!resultado) {
    return (
      <Screen>
        <Text style={styles.titulo}>Sem resultado</Text>
        <Text style={styles.texto}>{erro ?? 'Volte e complete os dados da simulação.'}</Text>
        <Button
          label="Voltar para a simulação"
          onPress={() => router.back()}
          style={{ marginTop: spacing.lg }}
        />
      </Screen>
    );
  }

  const r = resultado;
  // O cronograma só é vazio quando o financiamento é zero — e aí não há
  // resultado a mostrar. Guardar as duas pontas aqui evita a checagem de nulo
  // repetida vinte vezes no JSX.
  const pri = r.primeira;
  const ult = r.ultima;
  const contexto = {
    resultado: r,
    perfil: profile,
    clienteNome: form.proponentes[0]?.nome.trim() || null,
    empresaNome,
    empreendimentoNome,
    bloco: form.block || null,
    unidade: form.unit.trim() || null,
    operacao: form.operacao,
    hojeISO: hojeISO(),
  };

  async function aoSalvar() {
    setSalvando(true);
    const res = await salvar();
    setSalvando(false);
    if (res.ok) setAviso('Simulação salva e ligada ao cliente.');
    else setAviso(res.erro);
  }

  /**
   * Salva e atravessa para o outro simulador com tudo preenchido.
   *
   * Salva ANTES de atravessar, e não depois, de propósito: é o salvamento que
   * cria o vínculo com o cliente, e é esse vínculo que faz a simulação de
   * financiamento aparecer na ficha dele depois. Atravessar sem salvar deixaria
   * o trabalho existindo só na sessão do aparelho.
   */
  async function aoLevarParaPoupanca() {
    setSalvando(true);
    const res = await salvar();
    setSalvando(false);
    if (!res.ok) {
      setAviso(res.erro);
      return;
    }
    const prefill = pontePoupanca(
      {
        leadId: form.leadId,
        clientName: form.proponentes[0]?.nome.trim() || null,
        companyId: form.companyId,
        developmentId: form.developmentId,
        block: form.block || null,
        unit: form.unit.trim() || null,
        input: paraEntrada(form),
        financedValue: centavosParaReais(r.valorFinanciado),
        // A parcela da CEF entra na proposta impressa lado a lado com o que o
        // cliente paga à construtora — por isso ela atravessa junto.
        firstInstallment: centavosParaReais(r.primeira?.prestacaoTotal ?? (0 as never)),
      },
      null,
    );
    await sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
    router.push('/(app)/simulador');
  }

  /**
   * Um link público, expirável, para o cliente abrir no navegador.
   *
   * Trinta dias. É prazo de negociação — mais que isso e o link vira um
   * documento eterno circulando no WhatsApp de alguém, com uma condição que já
   * mudou. O corretor pode gerar outro a qualquer momento.
   *
   * O token em claro só existe no retorno desta chamada; o banco guarda o hash.
   * Por isso ele é copiado NA HORA: não há como recuperá-lo depois.
   */
  async function aoCriarLink() {
    if (!user) return;
    setSalvando(true);
    const salvo = await salvar();
    if (!salvo.ok) {
      setSalvando(false);
      setAviso(salvo.erro);
      return;
    }
    const link = await db.financing.criarLink(user.id, salvo.id, 30);
    setSalvando(false);
    if (!link.ok) {
      setAviso(link.error);
      return;
    }
    const nav = globalThis as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } };
    if (nav.navigator?.clipboard) {
      void nav.navigator.clipboard.writeText(link.data.url);
      setAviso(`Link copiado. Vale por 30 dias: ${link.data.url}`);
    } else {
      Alert.alert('Link para o cliente', `${link.data.url}\n\nVálido por 30 dias.`);
    }
  }

  async function aoGerarPdf() {
    try {
      await gerarRelatorio(contexto);
    } catch (e) {
      setAviso((e as Error).message || 'Não foi possível gerar o PDF.');
    }
  }

  function aoCopiarResumo() {
    const texto = resumoParaWhatsapp(contexto);
    const nav = globalThis as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } };
    if (nav.navigator?.clipboard) {
      void nav.navigator.clipboard.writeText(texto).then(
        () => setAviso('Resumo copiado. É só colar no WhatsApp.'),
        () => setAviso('Não foi possível copiar automaticamente.'),
      );
      return;
    }
    // Sem área de transferência (celular sem expo-clipboard), mostra o texto
    // para o corretor copiar à mão — melhor que um botão que não faz nada.
    Alert.alert('Resumo para o cliente', texto);
  }

  // De qual instituição é este resultado — para o corretor não confundir duas
  // simulações do mesmo cliente em bancos diferentes.
  const bancoDoResultado = acharBanco(r.produto.bancoId);

  return (
    <Screen>
      {/* --------------------------------------------- em qual banco */}
      {bancoDoResultado ? (
        <View style={styles.faixaBanco}>
          <BancoMarca banco={bancoDoResultado} tamanho={36} />
          <View style={styles.faixaTexto}>
            <Text style={styles.faixaNome}>{bancoDoResultado.nome}</Text>
            <Text style={styles.faixaLinha}>{r.produto.nome}</Text>
          </View>
        </View>
      ) : null}

      {/* -------------------------------------------------- a parcela */}
      <View style={styles.herói}>
        <Text style={styles.heroiRotulo}>Primeira parcela estimada</Text>
        <Text style={styles.heroiValor}>{formatarBRL(pri?.prestacaoTotal ?? (0 as never))}</Text>
        <Text style={styles.heroiSub}>
          {SISTEMA_ROTULO[r.sistema]} · {formatarPrazo(r.prazoMeses)} ·{' '}
          {formatarPct(r.taxaAnualPct)} a.a.
        </Text>
        {pri?.parcial ? (
          <Text style={styles.heroiParcial}>
            Sem seguros e tarifa — os parâmetros não estão cadastrados. A parcela real será um pouco
            maior.
          </Text>
        ) : null}
      </View>

      {/* ------------------------------------------- procedência do número */}
      <View style={styles.procedencia}>
        <Text style={styles.procedenciaTitulo}>{STATUS_ROTULO[r.status]}</Text>
        <Text style={styles.procedenciaTexto}>{r.correcao.explicacao}</Text>
        <Text style={styles.procedenciaTexto}>
          Taxa {formatarPct(r.taxaAnualPct)} ao ano {r.regimeTaxa} ={' '}
          {formatarPct(r.taxaAnualEfetivaPct)} efetivos · {r.enquadramentoSfh} ·{' '}
          {r.restricaoQueMandou}
        </Text>
        {/*
          A versão de regras só pode ser chamada de oficial quando tem fonte,
          URL, data de verificação e a confirmação de quem publicou. Sem os
          quatro, o cliente precisa ver que aquilo é estimativa — e vê aqui e no
          PDF, não escondido num rodapé.
        */}
        {r.confiabilidade !== 'oficial_configurado' ? (
          <Text style={styles.procedenciaAlerta}>
            Parâmetros sem procedência oficial confirmada — trate como estimativa.
          </Text>
        ) : null}
      </View>

      {/* ------------------------------- o que entrou e o que ficou de fora */}
      <View style={styles.componentes}>
        <Text style={styles.componentesTitulo}>O que está nesta prestação</Text>
        <Text style={styles.componentesLinha}>{r.componentes.incluidos.join(' · ')}</Text>
        {r.componentes.naoIncluidos.length > 0 ? (
          <>
            <Text style={styles.componentesTituloFora}>O que NÃO está incluído</Text>
            {r.componentes.naoIncluidos.map((c) => (
              <Text key={c} style={styles.componentesFora}>
                • {c}
              </Text>
            ))}
            <Text style={styles.componentesNota}>
              A prestação real será maior que a mostrada aqui.
            </Text>
          </>
        ) : null}
      </View>

      {/* ------------------------------------------------- o negócio */}
      <View style={styles.grade}>
        <Bloco rotulo="🏠 Imóvel" valor={formatarBRL(r.valorImovel)} />
        <Bloco rotulo="🏦 O banco financia" valor={formatarBRL(r.valorFinanciado)} />
        {/*
          A ENTRADA É A POUPANÇA.
          
          Numa venda de construtora, o que o banco não cobre é exatamente o que
          ela vai parcelar em ato, mensais, semestrais e anuais. Chamar isso de
          "entrada total" escondia a informação que o corretor leva para a mesa.
        */}
        <Bloco
          rotulo="💰 Entrada (poupança)"
          valor={formatarBRL(r.entradaCalculada)}
          nota="a construtora parcela"
        />
        <Bloco rotulo="🤝 FGTS + subsídio" valor={formatarBRL((r.fgtsUsado + r.subsidio) as never)} />
        <Bloco rotulo="📅 Prazo" valor={`${r.prazoMeses} meses`} />
        <Bloco rotulo="📉 Última parcela" valor={formatarBRL(ult?.prestacaoTotal ?? (0 as never))} />
        <Bloco
          rotulo="💵 Renda mínima"
          valor={r.rendaMinimaEstimada ? formatarBRL(r.rendaMinimaEstimada) : 'não calculada'}
        />
        <Bloco rotulo="📊 Juros totais" valor={formatarBRL(r.totalJuros)} />
        <Bloco
          rotulo="🧾 Total pago"
          valor={`${formatarBRL(r.totalPago)}${r.totalPagoParcial ? ' *' : ''}`}
        />
        <Bloco
          rotulo="🛡️ Seguros no contrato"
          valor={r.totalSeguros !== null ? formatarBRL(r.totalSeguros) : 'não calculado'}
        />
        <Bloco
          rotulo="📈 Correção do saldo"
          valor={r.totalCorrecao > 0 ? formatarBRL(r.totalCorrecao) : 'sem correção'}
        />
      </View>

      {/* -------------------------------------------- enquadramento */}
      <Titulo texto="Enquadramento estimado" />
      <View
        style={[styles.selo, r.elegibilidade.elegivel ? styles.seloOk : styles.seloRuim]}
      >
        <Text
          style={[
            styles.seloTexto,
            { color: r.elegibilidade.elegivel ? colors.success : colors.danger },
          ]}
        >
          {r.elegibilidade.elegivel ? '🟢 APTO (estimado)' : '🔴 NÃO ENQUADRA'}
        </Text>
        <Text style={styles.seloNota}>Sujeito à análise de crédito da instituição financeira.</Text>
      </View>

      <View style={styles.itens}>
        {r.elegibilidade.itens.map((i) => (
          <View key={i.chave} style={styles.item}>
            <Text style={styles.itemBolinha}>{marcador(i.situacao)}</Text>
            <View style={styles.itemTexto}>
              <Text style={styles.itemRotulo}>{i.rotulo}</Text>
              <Text style={styles.itemDetalhe}>{i.detalhe}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ------------------------------------------ composição da parcela */}
      <Titulo texto="Composição da 1ª prestação" />
      <StackedShare
        data={[
          {
            label: 'Amortização',
            value: centavosParaReais(pri?.amortizacao ?? (0 as never)),
            color: colors.primary,
          },
          { label: 'Juros', value: centavosParaReais(pri?.juros ?? (0 as never)), color: colors.warning },
          ...(pri?.mip != null
            ? [{ label: 'MIP', value: centavosParaReais(pri.mip), color: colors.success }]
            : []),
          ...(pri?.dfi != null
            ? [{ label: 'DFI', value: centavosParaReais(pri.dfi), color: colors.inkMuted }]
            : []),
          ...(pri?.tarifa != null
            ? [
                {
                  label: 'Tarifa',
                  value: centavosParaReais(pri.tarifa),
                  color: colors.borderStrong,
                },
              ]
            : []),
        ]}
      />

      {/* ------------------------------------------------------ gráficos */}
      <Titulo texto="Evolução da parcela" />
      <EvolutionChart
        series={[
          {
            label: 'Prestação (amortização + juros)',
            color: colors.primary,
            values: r.tabela.map((l) => centavosParaReais(l.encargoPrincipal)),
          },
          {
            label: 'Juros do mês',
            color: colors.warning,
            values: r.tabela.map((l) => centavosParaReais(l.juros)),
          },
        ]}
        legendaInicio="parcela 1"
        legendaFim={`parcela ${r.prazoMeses}`}
      />

      <Titulo texto="Saldo devedor" />
      <EvolutionChart
        series={[
          {
            label: 'Saldo devedor',
            color: colors.primary,
            values: r.tabela.map((l) => centavosParaReais(l.saldoFinal)),
          },
        ]}
        legendaInicio="parcela 1"
        legendaFim={`parcela ${r.prazoMeses}`}
      />

      {/* ---------------------------------------------------- comparador */}
      {cenarios.length > 1 ? (
        <>
          <Titulo texto="Comparação de cenários" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.compLinha}>
                <Text style={[styles.compCabeca, styles.compPrimeira]}>Indicador</Text>
                {cenarios.map((c) => (
                  <Text key={c.id} style={styles.compCabeca}>
                    {c.rotulo}
                  </Text>
                ))}
              </View>
              {comparativo.map((linha) => {
                const venc = vencedores(linha);
                return (
                  <View key={linha.chave} style={styles.compLinha}>
                    <Text style={[styles.compCelula, styles.compPrimeira]}>{linha.rotulo}</Text>
                    {linha.valores.map((v, i) => (
                      <Text
                        key={`${linha.chave}-${i}`}
                        style={[styles.compCelula, venc.includes(i) && styles.compVencedor]}
                      >
                        {formatarCelula(v, linha.formato)}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <Text style={styles.notaPequena}>
            Destacado em laranja: o melhor de cada linha. A primeira parcela costuma decidir a
            venda; os juros totais decidem quanto o cliente paga no fim.
          </Text>
        </>
      ) : null}

      {/* ------------------------------------------------------- a tabela */}
      <Pressable onPress={() => setMostrarTabela((v) => !v)} style={styles.expandir}>
        <Text style={styles.expandirTexto}>
          {mostrarTabela ? 'Esconder' : 'Ver'} a evolução parcela a parcela
        </Text>
      </Pressable>
      {mostrarTabela ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.tabLinha}>
              {['#', 'Saldo', 'Correção', 'Juros', 'Amortiz.', 'Encargo', 'Prestação'].map((h) => (
                <Text key={h} style={[styles.tabCelula, styles.tabCabeca]}>
                  {h}
                </Text>
              ))}
            </View>
            {amostrarTabela(r.tabela).map((l) => (
              <View key={l.numero} style={[styles.tabLinha, l.carencia && styles.tabCarencia]}>
                <Text style={styles.tabCelula}>
                  {l.numero}
                  {l.carencia ? '*' : ''}
                </Text>
                <Text style={styles.tabCelula}>{formatarBRL(l.saldoInicial)}</Text>
                <Text style={styles.tabCelula}>{formatarBRL(l.correcaoIndexador)}</Text>
                <Text style={styles.tabCelula}>{formatarBRL(l.juros)}</Text>
                <Text style={styles.tabCelula}>{formatarBRL(l.amortizacao)}</Text>
                <Text style={styles.tabCelula}>{formatarBRL(l.encargoPrincipal)}</Text>
                <Text style={styles.tabCelula}>{formatarBRL(l.prestacaoTotal)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {/* --------------------------------------------- o que não foi feito */}
      {r.naoCalculados.length ? (
        <View style={styles.pendentes}>
          <Text style={styles.pendentesTitulo}>O que não foi calculado</Text>
          {r.naoCalculados.map((n) => (
            <Text key={n.o_que} style={styles.pendenteItem}>
              <Text style={styles.forte}>{n.o_que}</Text> — {n.motivo}
            </Text>
          ))}
        </View>
      ) : null}

      {/* ------------------------------------------------- §69: o trace */}
      <Pressable onPress={() => setMostrarTrace((v) => !v)} style={styles.expandir}>
        <Text style={styles.expandirTexto}>
          {mostrarTrace ? 'Esconder' : 'Ver'} como o sistema chegou a estes valores
        </Text>
      </Pressable>
      {mostrarTrace ? (
        <View style={styles.trace}>
          {r.trace.map((t, i) => (
            <View key={`${t.etapa}-${i}`} style={styles.tracePasso}>
              <Text style={styles.traceEtapa}>{t.etapa}</Text>
              <Text style={styles.traceValor}>{t.valor}</Text>
              {t.detalhe ? <Text style={styles.traceDetalhe}>{t.detalhe}</Text> : null}
            </View>
          ))}
          <Text style={styles.traceDetalhe}>
            Custo Efetivo Total (CET): não calculado — depende de todos os componentes contratuais
            (tarifas de contratação, avaliação, registro e apólices efetivas). Um CET incompleto
            seria pior que nenhum, porque é com ele que o cliente compara bancos.
          </Text>
        </View>
      ) : null}

      {aviso ? <Text style={styles.avisoTela}>{aviso}</Text> : null}

      {/* ---------------------------------------------------------- ações */}
      <View style={styles.acoes}>
        <Button
          label={salvando ? 'Salvando…' : 'Salvar simulação'}
          onPress={() => void aoSalvar()}
          disabled={salvando}
        />
        <Button label="Gerar PDF" variant="secondary" onPress={() => void aoGerarPdf()} />
        <Button label="Resumo para o cliente" variant="secondary" onPress={aoCopiarResumo} />
        <Button
          label={salvando ? 'Gerando…' : 'Gerar link para o cliente'}
          variant="secondary"
          onPress={() => void aoCriarLink()}
          disabled={salvando}
        />
        <Button
          label="Levar para o simulador de poupança"
          variant="secondary"
          onPress={() => void aoLevarParaPoupanca()}
        />
      </View>

      <Text style={styles.legal}>{AVISO_LEGAL}</Text>
      <Text style={styles.legal}>
        Regras versão {r.versaoRegras}, vigente desde {r.vigenciaRegras}.
      </Text>
    </Screen>
  );
}

/**
 * A tabela na tela sai amostrada.
 *
 * 420 linhas de `View` no React Native travam a rolagem no celular — e ninguém
 * lê a parcela 217. Saem o primeiro ano inteiro, um marco por ano e as três
 * últimas. Quem precisa da tabela completa gera o PDF, que também é recortado,
 * ou confere os totais, que são exatos.
 */
function amostrarTabela<T extends { numero: number }>(linhas: T[]): T[] {
  const total = linhas.length;
  const indices = new Set<number>();
  for (let i = 0; i < Math.min(12, total); i++) indices.add(i);
  for (let m = 12; m < total; m += 12) indices.add(m - 1);
  for (let i = Math.max(0, total - 3); i < total; i++) indices.add(i);
  return [...indices].sort((a, b) => a - b).map((i) => linhas[i]!);
}

function marcador(situacao: string): string {
  if (situacao === 'ok') return '🟢';
  if (situacao === 'atencao') return '🟡';
  if (situacao === 'reprova') return '🔴';
  return '⚪';
}

function formatarCelula(v: unknown, formato: string): string {
  if (v === null || v === undefined) return '—';
  if (formato === 'dinheiro' && typeof v === 'number') return formatarBRL(v as never);
  if (formato === 'percentual' && typeof v === 'number') return formatarPct(v);
  return String(v);
}

function Titulo({ texto }: { texto: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.secao}>{texto}</Text>;
}

function Bloco({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bloco}>
      <Text style={styles.blocoRotulo}>{rotulo}</Text>
      <Text style={styles.blocoValor}>{valor}</Text>
      {nota ? <Text style={styles.blocoNota}>{nota}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    blocoNota: { ...typography.caption, color: colors.inkSubtle, fontSize: 10.5 },
    procedenciaAlerta: {
      ...typography.caption,
      color: colors.warning,
      fontWeight: '700',
      marginTop: 2,
    },
    componentes: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      gap: 3,
    },
    componentesTitulo: { ...typography.label, color: colors.ink, fontWeight: '700' },
    componentesLinha: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },
    componentesTituloFora: {
      ...typography.label,
      color: colors.warning,
      fontWeight: '700',
      marginTop: spacing.sm,
    },
    componentesFora: { ...typography.caption, color: colors.ink, lineHeight: 18 },
    componentesNota: {
      ...typography.caption,
      color: colors.inkMuted,
      fontStyle: 'italic',
      marginTop: 2,
    },
    faixaBanco: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    faixaTexto: { flex: 1, gap: 1 },
    faixaNome: { ...typography.label, color: colors.ink, fontWeight: '700' },
    faixaLinha: { ...typography.caption, color: colors.inkMuted, fontSize: 11.5 },

    titulo: { ...typography.title, color: colors.primary },
    texto: { ...typography.body, color: colors.inkMuted },

    herói: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: 3,
      marginBottom: spacing.lg,
    },
    heroiRotulo: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    heroiValor: { ...typography.title, color: colors.primary, fontSize: 38, lineHeight: 44 },
    heroiSub: { ...typography.caption, color: colors.inkMuted },
    heroiParcial: { ...typography.caption, color: colors.warning, marginTop: spacing.sm, lineHeight: 18 },

    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    bloco: {
      minWidth: 148,
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 2,
    },
    blocoRotulo: { ...typography.caption, color: colors.inkMuted, fontSize: 11.5 },
    blocoValor: { ...typography.heading, color: colors.ink, fontSize: 16 },

    secao: {
      ...typography.heading,
      color: colors.ink,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },

    selo: { padding: spacing.md, borderRadius: radius.md, gap: 3 },
    seloOk: { backgroundColor: colors.successSoft },
    seloRuim: { backgroundColor: colors.dangerSoft },
    seloTexto: { ...typography.heading, fontSize: 15 },
    seloNota: { ...typography.caption, color: colors.inkMuted },

    itens: { gap: spacing.sm, marginTop: spacing.md },
    item: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    itemBolinha: { fontSize: 13, marginTop: 1 },
    itemTexto: { flex: 1, gap: 1 },
    itemRotulo: { ...typography.label, color: colors.ink },
    itemDetalhe: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },

    compLinha: { flexDirection: 'row' },
    compCabeca: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.ink,
      width: 118,
      padding: spacing.sm,
      backgroundColor: colors.surfaceAlt,
    },
    compCelula: {
      ...typography.caption,
      color: colors.inkMuted,
      width: 118,
      padding: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    compPrimeira: { width: 150, fontWeight: '600', color: colors.ink },
    compVencedor: { color: colors.primary, fontWeight: '700' },

    expandir: { paddingVertical: spacing.md, marginTop: spacing.lg },
    expandirTexto: { ...typography.label, color: colors.primary },

    tabLinha: { flexDirection: 'row' },
    tabCelula: {
      ...typography.caption,
      color: colors.inkMuted,
      width: 104,
      padding: spacing.xs,
      textAlign: 'right',
      fontSize: 11.5,
    },
    tabCabeca: { fontWeight: '700', color: colors.ink, backgroundColor: colors.surfaceAlt },

    pendentes: {
      marginTop: spacing.xl,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.warningSoft,
      gap: spacing.xs,
    },
    pendentesTitulo: { ...typography.label, color: colors.warning, fontWeight: '700' },
    pendenteItem: { ...typography.caption, color: colors.ink, lineHeight: 18 },
    forte: { fontWeight: '700' },

    notaPequena: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 18 },
    procedencia: {
      marginTop: spacing.md,
      marginBottom: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      gap: 3,
    },
    procedenciaTitulo: { ...typography.label, color: colors.ink, fontWeight: '700' },
    procedenciaTexto: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },
    tabCarencia: { backgroundColor: colors.warningSoft },
    trace: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    tracePasso: { gap: 1 },
    traceEtapa: { ...typography.caption, color: colors.inkMuted, fontSize: 11.5 },
    traceValor: { ...typography.label, color: colors.ink, fontWeight: '700' },
    traceDetalhe: { ...typography.caption, color: colors.inkSubtle, lineHeight: 17, fontSize: 11.5 },
    avisoTela: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.surfaceAlt,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginTop: spacing.lg,
      overflow: 'hidden',
    },
    acoes: { gap: spacing.sm, marginTop: spacing.lg },
    legal: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md, lineHeight: 17, fontSize: 11.5 },
  });
