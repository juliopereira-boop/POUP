/**
 * REGRAS DE FINANCIAMENTO — a tela do administrador.
 *
 * ===========================================================================
 * ELA EXISTE PARA QUE MUDANÇA DE TAXA NÃO SEJA MUDANÇA DE CÓDIGO
 * ===========================================================================
 * Quando a CAIXA reajusta uma faixa do Minha Casa Minha Vida — e ela reajusta —,
 * o certo é o administrador abrir esta tela, digitar o número novo, informar a
 * fonte e o motivo, e publicar. Sem republicar aplicativo, sem esperar loja,
 * sem mexer numa linha de TypeScript.
 *
 * ===========================================================================
 * TRÊS COISAS QUE ESTA TELA COBRA, E NÃO ABRE MÃO
 * ===========================================================================
 *   1. **A fonte.** Todo parâmetro tem que dizer de onde veio e quando foi
 *      verificado. É o que separa "oficial" de "achismo" na hora em que o
 *      corretor apresenta a condição ao cliente.
 *   2. **O motivo.** Toda publicação exige uma frase. Seis meses depois, "por
 *      que a taxa da Faixa 2 mudou em setembro?" precisa ter resposta.
 *   3. **Uma versão nova, não uma edição.** Publicar cria/atualiza uma versão
 *      datada, e as simulações antigas continuam carregando o snapshot delas.
 *      A proposta de ontem não muda porque a regra de hoje mudou.
 *
 * ===========================================================================
 * O QUE FALTA APARECE PRIMEIRO
 * ===========================================================================
 * O topo é a lista de pendências — todo parâmetro ainda não confirmado, com o
 * motivo e onde conferir. É a lista de tarefas do administrador, e enquanto ela
 * não esvaziar há linha de financiamento que o corretor não consegue usar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { useIsAdmin } from '@/features/admin';
import {
  BASE_COMPROMETIMENTO_ROTULO,
  TRATAMENTO_CARENCIA_ROTULO,
  acharProduto,
  confiabilidadeDaVersao,
  oficial,
  parametrosPendentes,
  produtoCalculavel,
  temValor,
  versaoValida,
  type BaseComprometimento,
  type Parametro,
  type ProdutoFinanciamento,
  type TratamentoCarencia,
  type VersaoRegras,
} from '@/features/financiamento/regras';
import type { FaixaMip } from '@/features/financiamento/seguros';
import type { RegimeTaxa } from '@/features/financiamento/dinheiro';
import { BANCOS } from '@/features/financiamento/bancos';
import { REGRAS_PADRAO } from '@/features/financiamento/regrasPadrao';
import { hojeISO } from '@/features/financiamento/formulario';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/** Os campos numéricos de um produto que a tela edita. */
const CAMPOS: {
  chave: keyof ProdutoFinanciamento;
  rotulo: string;
  sufixo: string;
  ajuda: string;
}[] = [
  { chave: 'taxaAnualPct', rotulo: 'Taxa ao ano', sufixo: '%', ajuda: 'Ex.: 8,66' },
  { chave: 'quotaMaxPct', rotulo: 'Quota máxima financiada', sufixo: '%', ajuda: 'Ex.: 80' },
  { chave: 'prazoMaxMeses', rotulo: 'Prazo máximo', sufixo: 'meses', ajuda: 'Ex.: 420' },
  { chave: 'valorImovelMax', rotulo: 'Valor máximo do imóvel', sufixo: 'R$', ajuda: 'Ex.: 500000' },
  {
    chave: 'comprometimentoRendaMaxPct',
    rotulo: 'Comprometimento máximo de renda',
    sufixo: '%',
    ajuda: 'Ex.: 30',
  },
  {
    chave: 'idadeMaisPrazoMaxAnos',
    rotulo: 'Idade + prazo (limite)',
    sufixo: 'anos',
    ajuda: 'Ex.: 80',
  },
  { chave: 'subsidioMax', rotulo: 'Subsídio máximo', sufixo: 'R$', ajuda: '0 se não houver' },
  { chave: 'entradaMinimaPct', rotulo: 'Entrada mínima', sufixo: '%', ajuda: 'Ex.: 20' },
  { chave: 'carenciaMaxMeses', rotulo: 'Carência máxima', sufixo: 'meses', ajuda: '0 se não houver' },
];

/**
 * Os parâmetros GLOBAIS da versão — os que não pertencem a um produto.
 *
 * Seguros e tarifa vêm da apólice e do contrato, não da linha de
 * financiamento; o limite SFH vem de normativo. Editá-los junto com um produto
 * daria a impressão errada de que a apólice muda por faixa do MCMV.
 */
const CAMPOS_GLOBAIS = [
  {
    chave: 'dfi',
    rotulo: 'DFI — taxa mensal sobre a avaliação (%)',
    ajuda: 'Ex.: 0,015. Vem da apólice, não da CAIXA.',
  },
  {
    chave: 'tarifa',
    rotulo: 'Tarifa de administração (R$/mês)',
    ajuda: 'Varia por tipo de financiamento e por SFH/SFI.',
  },
  {
    chave: 'sfh',
    rotulo: 'Limite de enquadramento SFH (R$)',
    ajuda: 'Acima deste valor de avaliação, a operação é SFI.',
  },
  {
    chave: 'tr',
    rotulo: 'TR observada (% ao mês)',
    ajuda: 'Do Banco Central. Em branco = a tabela sai sem correção.',
  },
];

function textoDe(p: Parametro<number> | undefined): string {
  return temValor(p) ? String(p.valor).replace('.', ',') : '';
}

function numeroDe(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(/\./g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function AdminFinanciamento() {
  const styles = useThemedStyles(makeStyles);
  const { isAdmin, loading } = useIsAdmin();

  const [regras, setRegras] = useState<VersaoRegras>(REGRAS_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [produtoId, setProdutoId] = useState<string>('mcmv_1');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [globais, setGlobais] = useState<Record<string, string>>({});
  const [fonte, setFonte] = useState('CAIXA');
  const [fonteUrl, setFonteUrl] = useState('https://www.caixa.gov.br/');
  const [verificadoEm, setVerificadoEm] = useState('');
  const [versao, setVersao] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /*
   * As três escolhas que não são número.
   *
   * Regime da taxa, base do comprometimento e tratamento da carência mudam o
   * resultado tanto quanto qualquer valor — e presumir qualquer uma delas em
   * silêncio é o tipo de decisão implícita que a especificação proíbe.
   */
  const [regimeTaxa, setRegimeTaxa] = useState<RegimeTaxa>('nominal');
  const [baseComp, setBaseComp] = useState<BaseComprometimento>('prestacao_total');
  const [tratCarencia, setTratCarencia] = useState<TratamentoCarencia>('juros_capitalizados');
  /** A tábua do MIP, editada faixa a faixa. */
  const [mip, setMip] = useState<{ de: string; ate: string; taxa: string }[]>([]);
  /**
   * A confirmação explícita do §8: sem ela, a versão sai como estimativa mesmo
   * com todos os números preenchidos. Digitar não torna nada oficial.
   */
  const [confirmaOficial, setConfirmaOficial] = useState(false);

  const carregar = useCallback(async () => {
    const remotas = await db.financing.regrasVigentes();
    if (remotas && typeof remotas === 'object') setRegras(remotas as VersaoRegras);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // A versão sugerida é AAAA.MM do mês corrente: é assim que o corretor e o
  // administrador se referem a ela ("a regra de agosto").
  useEffect(() => {
    if (versao) return;
    const [ano, mes] = hojeISO().split('-');
    setVersao(`${ano}.${mes}`);
  }, [versao]);

  const produto = acharProduto(regras, produtoId);
  const pendencias = useMemo(() => parametrosPendentes(regras), [regras]);

  // Ao trocar de produto, os campos carregam o que já está cadastrado.
  useEffect(() => {
    if (!produto) return;
    const proximo: Record<string, string> = {};
    for (const c of CAMPOS) {
      proximo[c.chave] = textoDe(produto[c.chave] as Parametro<number>);
    }
    const faixa = produto.faixaRenda;
    proximo.rendaMin = temValor(faixa) ? String(faixa.valor.min).replace('.', ',') : '';
    proximo.rendaMax =
      temValor(faixa) && faixa.valor.max !== null ? String(faixa.valor.max).replace('.', ',') : '';
    setValores(proximo);
    setFonte(produto.fonte ?? 'CAIXA');
    setFonteUrl(produto.fonteUrl ?? 'https://www.caixa.gov.br/');
    setRegimeTaxa(produto.regimeTaxa);
    setBaseComp(produto.baseComprometimento);
    setTratCarencia(produto.tratamentoCarencia);
  }, [produto]);

  // Os globais carregam da versão, e não do produto escolhido.
  useEffect(() => {
    const tr = regras.indexadores.find((i) => i.id === 'TR');
    setGlobais({
      dfi: textoDe(regras.seguros.dfiPctMensalSobreAvaliacao),
      tarifa: textoDe(regras.seguros.tarifaAdminMensal),
      sfh: textoDe(regras.sfh.limiteValorImovel),
      tr: temValor(tr?.taxaMensal) ? String((tr.taxaMensal.valor as number) * 100).replace('.', ',') : '',
    });
    /*
     * A tábua do MIP entra como texto em percentual ao mês, e não na fração que
     * o motor usa. Apólice fala em 0,035% ao mês; ninguém digita 0,00035 sem
     * errar uma casa — e uma casa aqui multiplica o seguro por dez.
     */
    const tabua = temValor(regras.seguros.mipPorIdade) ? regras.seguros.mipPorIdade.valor : [];
    setMip(
      tabua.map((f) => ({
        de: String(f.de),
        ate: f.ate === null ? '' : String(f.ate),
        taxa: String(f.taxaMensal * 100).replace('.', ','),
      })),
    );
    setVerificadoEm(regras.verificadoEm ?? '');
    setConfirmaOficial(confiabilidadeDaVersao(regras) === 'oficial_configurado');
  }, [regras]);

  if (loading || carregando) return <LoadingScreen />;
  if (!isAdmin) {
    return (
      <Screen>
        <Text style={styles.titulo}>Acesso restrito</Text>
        <Text style={styles.texto}>Esta área é do administrador do POUP.</Text>
      </Screen>
    );
  }

  async function publicar() {
    setAviso(null);
    if (!motivo.trim()) {
      setAviso('Explique o motivo da alteração. Ele fica gravado na auditoria.');
      return;
    }
    /*
     * O FORMATO DA VERSÃO É VALIDADO ANTES DE QUALQUER COISA.
     *
     * AAAA.MM é o que faz a lista ordenar sozinha e o que faz todo mundo falar
     * a mesma língua ("a regra de agosto"). Uma versão fora do formato quebra a
     * ordenação e some no meio do histórico.
     */
    if (!versaoValida(versao)) {
      setAviso('A versão precisa estar no formato AAAA.MM — por exemplo 2026.08 (ou 2026.08.1 para uma revisão do mesmo mês).');
      return;
    }
    if (!produto) return;

    /*
     * A VALIDAÇÃO DA QUOTA, ANTES DE GRAVAR.
     *
     * Quota fora de (0, 100] não é condição de banco nenhum: zero significa que
     * nada é financiável, e acima de cem significa financiar mais do que o
     * imóvel vale. Deixar passar contaminaria toda simulação seguinte.
     */
    const quotaDigitada = numeroDe(valores.quotaMaxPct ?? '');
    if (quotaDigitada !== null && (quotaDigitada <= 0 || quotaDigitada > 100)) {
      setAviso('A quota máxima financiada precisa ficar entre 0 e 100%.');
      return;
    }

    const minRenda = numeroDe(valores.rendaMin ?? '');
    const maxRenda = numeroDe(valores.rendaMax ?? '');
    if (minRenda !== null && maxRenda !== null && maxRenda < minRenda) {
      setAviso('A renda máxima da faixa não pode ser menor que a mínima.');
      return;
    }

    /*
     * "OFICIAL" É CONQUISTADO, NÃO DIGITADO — §8.
     *
     * Para a versão sair como `oficial_configurado` são exigidos os quatro:
     * fonte, URL, data de verificação e a confirmação explícita. Faltando
     * qualquer um, ela é publicada como estimativa, e o resultado da simulação
     * carrega esse rótulo até o PDF.
     */
    const dataVerificacao = verificadoEm.trim();
    if (confirmaOficial && (!fonte.trim() || !fonteUrl.trim() || !dataVerificacao)) {
      setAviso('Para publicar como condição oficial, preencha fonte, URL e data de verificação.');
      return;
    }

    const hoje = hojeISO();
    const novoProduto: ProdutoFinanciamento = {
      ...produto,
      regimeTaxa,
      baseComprometimento: baseComp,
      tratamentoCarencia: tratCarencia,
    };

    for (const c of CAMPOS) {
      const n = numeroDe(valores[c.chave] ?? '');
      if (n === null) continue;
      /*
       * Quem digita aqui é o administrador lendo a fonte oficial — então o
       * parâmetro nasce `oficial`, com fonte e data de verificação. É esse
       * carimbo que a tela do corretor e o PDF usam para dizer se a condição é
       * oficial ou estimada; sem ele, tudo viraria "estimativa" e o rótulo
       * perderia o sentido.
       */
      (novoProduto as unknown as Record<string, Parametro<number>>)[c.chave] = oficial(
        n,
        fonte.trim(),
        fonteUrl.trim(),
        // A data de verificação é a do dia em que alguém LEU a fonte, e fica
        // congelada. Sem ela informada, sobra a de hoje.
        dataVerificacao || hoje,
      );
    }

    if (minRenda !== null) {
      novoProduto.faixaRenda = oficial(
        { min: minRenda, max: maxRenda },
        fonte.trim(),
        fonteUrl.trim(),
        dataVerificacao || hoje,
      );
    }
    novoProduto.fonte = fonte.trim() || null;
    novoProduto.fonteUrl = fonteUrl.trim() || null;

    /*
     * Os globais só são gravados quando FOREM PREENCHIDOS.
     *
     * Campo vazio mantém o que já estava — inclusive o `pendente`. Limpar um
     * campo aqui não pode apagar em silêncio uma taxa que alguém cadastrou na
     * semana passada; para remover, o administrador troca o valor.
     */
    /*
     * A tábua do MIP, de texto para o formato do motor.
     *
     * Uma faixa só entra se tiver idade inicial e taxa; a idade final vazia
     * significa "sem teto", que é como as apólices costumam terminar a última
     * faixa. Elas saem ordenadas por idade porque `taxaMipDaIdade` devolve a
     * PRIMEIRA que casar — fora de ordem, uma faixa larga engoliria as
     * estreitas seguintes.
     */
    const faixasMip: FaixaMip[] = mip
      .map((f) => {
        const de = numeroDe(f.de);
        const taxaPct = numeroDe(f.taxa);
        if (de === null || taxaPct === null) return null;
        const ate = f.ate.trim() ? numeroDe(f.ate) : null;
        if (ate !== null && ate < de) return null;
        return { de, ate, taxaMensal: taxaPct / 100 } satisfies FaixaMip;
      })
      .filter((f): f is FaixaMip => f !== null)
      .sort((a2, b2) => a2.de - b2.de);

    const dfi = numeroDe(globais.dfi ?? '');
    const tarifa = numeroDe(globais.tarifa ?? '');
    const sfhLimite = numeroDe(globais.sfh ?? '');
    const trPct = numeroDe(globais.tr ?? '');

    const payload: VersaoRegras = {
      ...regras,
      versao: versao.trim(),
      vigenciaInicio: hoje,
      vigenciaFim: null,
      status: 'ativa',
      produtos: regras.produtos.map((p) => (p.id === produtoId ? novoProduto : p)),
      seguros: {
        ...regras.seguros,
        dfiPctMensalSobreAvaliacao:
          dfi !== null
            ? oficial(dfi, fonte.trim(), fonteUrl.trim(), dataVerificacao || hoje)
            : regras.seguros.dfiPctMensalSobreAvaliacao,
        tarifaAdminMensal:
          tarifa !== null
            ? oficial(tarifa, fonte.trim(), fonteUrl.trim(), dataVerificacao || hoje)
            : regras.seguros.tarifaAdminMensal,
        /*
         * A TÁBUA DO MIP.
         *
         * Só é gravada quando houver ao menos uma faixa completa e coerente.
         * Meia tábua é pior que nenhuma: o motor recusa o MIP inteiro quando um
         * proponente cai fora das faixas, e uma tábua cadastrada pela metade
         * faria a prestação variar conforme a idade de quem compra — sem
         * ninguém entender por quê.
         *
         * O percentual digitado vira fração aqui: a apólice fala 0,035% ao mês,
         * o motor precisa de 0,00035.
         */
        mipPorIdade:
          faixasMip.length > 0
            ? oficial(
                faixasMip,
                fonte.trim() || 'Apólice informada pelo administrador',
                fonteUrl.trim(),
                dataVerificacao || hoje,
              )
            : regras.seguros.mipPorIdade,
      },
      sfh: {
        limiteValorImovel:
          sfhLimite !== null
            ? oficial(sfhLimite, fonte.trim(), fonteUrl.trim(), dataVerificacao || hoje)
            : regras.sfh.limiteValorImovel,
      },
      indexadores: regras.indexadores.map((i) =>
        i.id === 'TR' && trPct !== null
          ? {
              ...i,
              taxaMensal: oficial(
                trPct / 100,
                'Banco Central do Brasil',
                'https://www.bcb.gov.br/',
                hoje,
              ),
            }
          : i,
      ),
      fonte: fonte.trim() || null,
      fonteUrl: fonteUrl.trim() || null,
      notas: null,
      statusConfiabilidade: confirmaOficial ? 'oficial_configurado' : 'estimativa',
      verificadoEm: dataVerificacao || null,
    };

    setSalvando(true);
    const r = await db.financing.salvarVersao({
      versao: versao.trim(),
      vigenciaInicio: hoje,
      vigenciaFim: null,
      status: 'ativa',
      payload,
      motivo: motivo.trim(),
      fonte: fonte.trim() || null,
      fonteUrl: fonteUrl.trim() || null,
    });
    setSalvando(false);

    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setRegras(payload);
    setMotivo('');
    setAviso(
      `Versão ${versao} publicada como ${
        confirmaOficial ? 'condição oficial' : 'estimativa'
      }. As próximas simulações já usam estes parâmetros.`,
    );
  }

  return (
    <Screen>
      <Text style={styles.titulo}>Regras de financiamento</Text>
      <Text style={styles.sub}>
        Versão vigente: <Text style={styles.forte}>{regras.versao}</Text> (desde{' '}
        {regras.vigenciaInicio}). Alterar aqui NÃO recalcula simulação já salva — cada uma guarda
        as regras do dia em que foi feita.
      </Text>

      {/* ------------------------------------------------------ pendências */}
      <Text style={styles.secao}>O que falta confirmar ({pendencias.length})</Text>
      {pendencias.length === 0 ? (
        <Text style={styles.texto}>
          Nenhuma pendência: todas as linhas estão com parâmetros cadastrados.
        </Text>
      ) : (
        <View style={styles.pendencias}>
          {pendencias.slice(0, 12).map((p) => (
            <View key={p.onde} style={styles.pendencia}>
              <Text style={styles.pendenciaOnde}>{p.onde}</Text>
              <Text style={styles.pendenciaMotivo}>{p.motivo}</Text>
            </View>
          ))}
          {pendencias.length > 12 ? (
            <Text style={styles.texto}>e mais {pendencias.length - 12}…</Text>
          ) : null}
        </View>
      )}

      {/* --------------------------------------------------------- produto */}
      <Text style={styles.secao}>Linha de financiamento</Text>
      <Text style={styles.texto}>
        ● já calcula · ○ falta parâmetro. Cada linha pertence a um banco, e é o banco que o corretor
        escolhe na porta do simulador.
      </Text>
      <View style={{ height: spacing.sm }} />
      <View style={styles.chips}>
        {regras.produtos
          .filter((p) => !p.parametrosManuais)
          .map((p) => {
            const ativo = p.id === produtoId;
            const completo = produtoCalculavel(p);
            return (
              <Pressable
                key={p.id}
                onPress={() => setProdutoId(p.id)}
                style={[styles.chip, ativo && styles.chipAtivo]}
              >
                <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
                  {completo ? '● ' : '○ '}
                  {p.nome}
                  {p.bancoId
                    ? ` · ${BANCOS.find((b2) => b2.id === p.bancoId)?.sigla ?? p.bancoId}`
                    : ''}
                </Text>
              </Pressable>
            );
          })}
      </View>

      {produto ? (
        <>
          <Text style={styles.descricao}>{produto.descricao}</Text>

          <View style={styles.linha}>
            <View style={styles.col}>
              <Input
                label="Renda mínima da faixa (R$)"
                value={valores.rendaMin ?? ''}
                onChangeText={(t) => setValores((v) => ({ ...v, rendaMin: t }))}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.col}>
              <Input
                label="Renda máxima (R$)"
                value={valores.rendaMax ?? ''}
                onChangeText={(t) => setValores((v) => ({ ...v, rendaMax: t }))}
                placeholder="em branco = sem teto"
                keyboardType="numeric"
              />
            </View>
          </View>

          {CAMPOS.map((c) => (
            <Input
              key={c.chave}
              label={`${c.rotulo} (${c.sufixo})`}
              value={valores[c.chave] ?? ''}
              onChangeText={(t) => setValores((v) => ({ ...v, [c.chave]: t }))}
              placeholder={c.ajuda}
              keyboardType="numeric"
            />
          ))}

          {/* ------------------------------- as decisões que não são número */}
          <Escolha
            titulo="A taxa acima é"
            ajuda="10% nominais viram 0,8333% ao mês e 10,47% efetivos ao ano; 10% efetivos viram 0,7974% ao mês. Em 35 anos a diferença passa de vinte mil reais."
            opcoes={[
              { valor: 'nominal', rotulo: 'Nominal ao ano (÷ 12)' },
              { valor: 'efetiva', rotulo: 'Efetiva ao ano (raiz 12)' },
            ]}
            escolhido={regimeTaxa}
            aoEscolher={(v) => setRegimeTaxa(v as RegimeTaxa)}
          />

          <Escolha
            titulo="O comprometimento de renda compara"
            ajuda="'Até 30% da renda' não diz de qual prestação se fala — e a mesma operação passa ou não conforme a conta inclua os seguros."
            opcoes={(Object.keys(BASE_COMPROMETIMENTO_ROTULO) as BaseComprometimento[]).map((k) => ({
              valor: k,
              rotulo: BASE_COMPROMETIMENTO_ROTULO[k],
            }))}
            escolhido={baseComp}
            aoEscolher={(v) => setBaseComp(v as BaseComprometimento)}
          />

          <Escolha
            titulo="Durante a carência"
            ajuda="Carência não significa 'não pagar nada'. Capitalizar os juros faz o saldo subir; pagá-los mês a mês mantém o saldo parado."
            opcoes={(Object.keys(TRATAMENTO_CARENCIA_ROTULO) as TratamentoCarencia[]).map((k) => ({
              valor: k,
              rotulo: TRATAMENTO_CARENCIA_ROTULO[k],
            }))}
            escolhido={tratCarencia}
            aoEscolher={(v) => setTratCarencia(v as TratamentoCarencia)}
          />

          <Text style={styles.secao}>Parâmetros globais da versão</Text>
          <Text style={styles.texto}>
            Valem para todas as linhas: os seguros vêm da apólice, a tarifa vem do contrato, e o
            limite SFH vem de normativo. Campo em branco mantém o que já está cadastrado.
          </Text>
          <View style={{ height: spacing.md }} />
          {CAMPOS_GLOBAIS.map((c) => (
            <View key={c.chave}>
              <Input
                label={c.rotulo}
                value={globais[c.chave] ?? ''}
                onChangeText={(t) => setGlobais((v) => ({ ...v, [c.chave]: t }))}
                placeholder={c.ajuda}
                keyboardType="numeric"
              />
            </View>
          ))}
          {/* ---------------------------------------------- a tábua do MIP */}
          <Text style={styles.secao}>MIP — tábua por faixa etária</Text>
          <Text style={styles.texto}>
            O MIP não é um número: é uma tábua da apólice, com uma taxa por faixa de idade. Enquanto
            ela estiver vazia, a prestação sai <Text style={styles.forte}>sem</Text> o seguro de
            morte e invalidez — e o resultado diz isso ao corretor e no PDF.
          </Text>
          <View style={{ height: spacing.md }} />

          {mip.map((f, i) => (
            <View key={`mip-${i}`} style={styles.faixaMip}>
              <View style={styles.linha}>
                <View style={styles.col}>
                  <Input
                    label="De (anos)"
                    value={f.de}
                    onChangeText={(t) =>
                      setMip((v) => v.map((x, j) => (j === i ? { ...x, de: t } : x)))
                    }
                    placeholder="18"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label="Até (anos)"
                    value={f.ate}
                    onChangeText={(t) =>
                      setMip((v) => v.map((x, j) => (j === i ? { ...x, ate: t } : x)))
                    }
                    placeholder="em branco = sem teto"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label="Taxa (% ao mês)"
                    value={f.taxa}
                    onChangeText={(t) =>
                      setMip((v) => v.map((x, j) => (j === i ? { ...x, taxa: t } : x)))
                    }
                    placeholder="0,035"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Pressable
                onPress={() => setMip((v) => v.filter((_, j) => j !== i))}
                accessibilityRole="button"
              >
                <Text style={styles.remover}>Remover faixa</Text>
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={() => setMip((v) => [...v, { de: '', ate: '', taxa: '' }])}
            accessibilityRole="button"
            style={styles.adicionar}
          >
            <Text style={styles.adicionarTexto}>+ Acrescentar faixa etária</Text>
          </Pressable>
          <Text style={styles.ajuda}>
            A taxa é sobre o <Text style={styles.forte}>saldo devedor</Text> do mês, multiplicada
            pela pactuação de renda de cada proponente — por isso o MIP cai ao longo do contrato.
            Faixa incompleta é descartada na publicação: meia tábua faria a prestação mudar conforme
            a idade de quem compra, sem ninguém entender por quê.
          </Text>

          <Text style={styles.secao}>Procedência</Text>
          <Input label="Fonte" value={fonte} onChangeText={setFonte} placeholder="CAIXA" />
          <Input
            label="URL da fonte"
            value={fonteUrl}
            onChangeText={setFonteUrl}
            placeholder="https://www.caixa.gov.br/..."
            autoCapitalize="none"
          />
          <Input
            label="Data de verificação (AAAA-MM-DD)"
            value={verificadoEm}
            onChangeText={setVerificadoEm}
            placeholder={hojeISO()}
            autoCapitalize="none"
          />
          <Text style={styles.ajuda}>
            É o dia em que você <Text style={styles.forte}>abriu a página oficial e leu</Text> os
            números — não a data de hoje por hábito. Ela fica congelada na versão publicada e não é
            atualizada depois.
          </Text>

          <Pressable
            onPress={() => setConfirmaOficial((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmaOficial }}
            style={[styles.confirma, confirmaOficial && styles.confirmaAtiva]}
          >
            <Text style={[styles.confirmaMarca, confirmaOficial && styles.confirmaMarcaAtiva]}>
              {confirmaOficial ? '✓' : ''}
            </Text>
            <Text style={styles.confirmaTexto}>
              Confirmo que conferi estes valores na fonte informada, na data acima. Publicar como{' '}
              <Text style={styles.forte}>condição oficial</Text>.
            </Text>
          </Pressable>
          <Text style={styles.ajuda}>
            Sem esta confirmação — ou faltando fonte, URL ou data — a versão é publicada como{' '}
            <Text style={styles.forte}>estimativa</Text>, e a simulação diz isso ao cliente.
            Digitar números não torna nada oficial.
          </Text>

          <Text style={styles.secao}>Publicar</Text>
          <Input
            label="Versão"
            value={versao}
            onChangeText={setVersao}
            placeholder="2026.08"
            autoCapitalize="none"
          />
          <Input
            label="Motivo da alteração"
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Ex.: reajuste da Faixa 2 publicado em 01/08"
            multiline
          />
          <Text style={styles.ajuda}>
            Fica gravado na trilha de auditoria junto com quem alterou, quando, e os valores antes e
            depois.
          </Text>

          {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

          <Button
            label={salvando ? 'Publicando…' : 'Publicar versão'}
            onPress={() => void publicar()}
            disabled={salvando}
            style={{ marginTop: spacing.md }}
          />
          <Text style={styles.legal}>
            Publicar torna esta versão a vigente e encerra a anterior. Simulações já salvas
            continuam com as regras que tinham.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

/**
 * Um grupo de opções mutuamente exclusivas.
 *
 * Existe porque três parâmetros desta tela **não são números** — regime da
 * taxa, base do comprometimento e tratamento da carência —, e cada um deles
 * muda o resultado tanto quanto uma taxa. Um `Select` escondia as alternativas
 * atrás de um toque; aqui elas ficam à vista, com a explicação do que a escolha
 * significa.
 */
function Escolha({
  titulo,
  ajuda,
  opcoes,
  escolhido,
  aoEscolher,
}: {
  titulo: string;
  ajuda: string;
  opcoes: { valor: string; rotulo: string }[];
  escolhido: string;
  aoEscolher: (valor: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.rotuloEscolha}>{titulo}</Text>
      <View style={styles.escolhas}>
        {opcoes.map((o) => {
          const ativo = o.valor === escolhido;
          return (
            <Pressable
              key={o.valor}
              onPress={() => aoEscolher(o.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativo }}
              style={[styles.escolha, ativo && styles.escolhaAtiva]}
            >
              <Text style={[styles.escolhaTexto, ativo && styles.escolhaTextoAtivo]}>
                {o.rotulo}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.ajuda}>{ajuda}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    titulo: { ...typography.title, color: colors.primary },
    sub: { ...typography.caption, color: colors.inkMuted, lineHeight: 19, marginBottom: spacing.md },
    texto: { ...typography.caption, color: colors.inkMuted, lineHeight: 19 },
    forte: { fontWeight: '700', color: colors.ink },
    secao: {
      ...typography.heading,
      color: colors.ink,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    descricao: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 18 },

    pendencias: { gap: spacing.sm },
    pendencia: {
      padding: spacing.md,
      borderRadius: radius.sm,
      backgroundColor: colors.warningSoft,
      gap: 2,
    },
    pendenciaOnde: { ...typography.label, color: colors.ink, fontSize: 13 },
    pendenciaMotivo: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipAtivo: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    chipTexto: { ...typography.caption, color: colors.inkMuted },
    chipTextoAtivo: { color: colors.primary, fontWeight: '700' },

    linha: { flexDirection: 'row', gap: spacing.lg },
    col: { flex: 1 },

    faixaMip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: colors.surface,
    },
    remover: { ...typography.caption, color: colors.danger },
    adicionar: { paddingVertical: spacing.sm, marginBottom: spacing.md },
    adicionarTexto: { ...typography.label, color: colors.primary },

    confirma: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: spacing.sm,
    },
    confirmaAtiva: { borderColor: colors.success, backgroundColor: colors.successSoft },
    confirmaMarca: {
      width: 22,
      height: 22,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      textAlign: 'center',
      lineHeight: 20,
      color: 'transparent',
      fontWeight: '800',
    },
    confirmaMarcaAtiva: { borderColor: colors.success, color: colors.success },
    confirmaTexto: { ...typography.caption, color: colors.ink, flex: 1, lineHeight: 19 },

    rotuloEscolha: {
      ...typography.label,
      color: colors.ink,
      marginBottom: spacing.sm,
    },
    escolhas: { gap: spacing.sm },
    escolha: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    escolhaAtiva: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    escolhaTexto: { ...typography.caption, color: colors.inkMuted },
    escolhaTextoAtivo: { color: colors.primary, fontWeight: '700' },
    ajuda: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
      lineHeight: 18,
    },
    aviso: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.surfaceAlt,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginTop: spacing.md,
      overflow: 'hidden',
    },
    legal: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md, lineHeight: 17 },
  });
