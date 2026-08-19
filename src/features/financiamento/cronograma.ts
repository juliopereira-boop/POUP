/**
 * O CRONOGRAMA MENSAL — a ordem oficial do cálculo.
 *
 * ===========================================================================
 * A ORDEM É A ESPECIFICAÇÃO, LITERALMENTE — §28
 * ===========================================================================
 *      1. Saldo inicial
 *      2. Aplicar indexador
 *      3. Saldo atualizado
 *      4. Calcular juros
 *      5. Calcular amortização
 *      6. Atualizar saldo
 *      7. Calcular MIP
 *      8. Calcular DFI
 *      9. Calcular tarifa
 *     10. Total da prestação
 *
 * O laço abaixo segue essa ordem passo a passo, e os comentários numerados
 * marcam cada etapa. Isso não é zelo decorativo: **a ordem muda o resultado**.
 * Aplicar a TR depois dos juros, em vez de antes, subestima o total pago de um
 * financiamento de 420 meses em dezenas de milhares de reais.
 *
 * ===========================================================================
 * ENCARGO PRINCIPAL ≠ PRESTAÇÃO TOTAL — §23 e §32
 * ===========================================================================
 * "Separar encargo principal de encargo total." A tabela devolve os dois,
 * sempre, e nunca deixa o corretor confundi-los:
 *
 *     encargoPrincipal = amortização + juros
 *     prestacaoTotal   = encargoPrincipal + MIP + DFI + tarifa
 *
 * §23 tem um aviso que vale repetir: **PRICE não significa prestação total
 * fixa.** O encargo principal é constante; o MIP cai junto com o saldo, então a
 * prestação total de um PRICE indexado cai devagar — e o cliente que esperava
 * "parcela fixa" precisa ver isso na tabela, não descobrir no boleto.
 *
 * ===========================================================================
 * CARÊNCIA — §37
 * ===========================================================================
 * Durante a carência não há amortização. Pagam-se os encargos acessórios, e o
 * que fica suspenso (juros e correção) **é incorporado ao saldo devedor**,
 * conforme a especificação. Por isso o saldo SOBE durante a carência, e a
 * amortização começa depois sobre um saldo maior — que é exatamente o que o
 * cliente precisa entender antes de pedir carência.
 */
import {
  ZERO,
  arredondar,
  conformePolitica,
  deCentavos,
  paraCentavos,
  preciso,
  somar,
  type Centavos,
  type PoliticaArredondamento,
  type Preciso,
} from './dinheiro';
import type { SistemaAmortizacao } from './amortizacao';
import { encargosDoMes, type EncargosDoMes, type RegrasSeguros } from './seguros';
import type { ProponenteResolvido } from './proponentes';

/** Uma linha da tabela, com a decomposição completa (§57, §58). */
export interface ParcelaCronograma {
  numero: number;
  /** Saldo no começo do mês, antes de qualquer coisa. */
  saldoInicial: Centavos;
  /** Quanto o indexador acrescentou ao saldo. Zero no prefixado. */
  correcaoIndexador: Centavos;
  /** Saldo depois da correção — é sobre ELE que os juros incidem. */
  saldoAtualizado: Centavos;
  /**
   * Os juros do mês, SEMPRE — mesmo quando não são pagos.
   *
   * Durante a carência eles existem e são capitalizados; mostrar zero aqui
   * esconderia justamente o custo que a carência tem. O que o cliente PAGA
   * naquele mês é o `encargoPrincipal`.
   */
  juros: Centavos;
  /** A parte dos juros que entrou no saldo em vez de ser paga (carência). */
  jurosCapitalizados: Centavos;
  amortizacao: Centavos;
  /** O que é PAGO de dívida no mês: amortização + juros efetivamente cobrados. */
  encargoPrincipal: Centavos;
  mip: Centavos | null;
  dfi: Centavos | null;
  tarifa: Centavos | null;
  /** encargo principal + acessórios calculáveis. */
  prestacaoTotal: Centavos;
  /** `true` quando algum acessório ficou de fora por falta de parâmetro. */
  parcial: boolean;
  saldoFinal: Centavos;
  /** Este mês é de carência (sem amortização)? */
  carencia: boolean;
}

export interface Cronograma {
  sistema: SistemaAmortizacao;
  parcelas: ParcelaCronograma[];

  /** Todos os juros do contrato, inclusive os capitalizados na carência. */
  totalJuros: Centavos;
  /** Só os juros efetivamente pagos mês a mês. */
  totalJurosPagos: Centavos;
  totalAmortizado: Centavos;
  totalCorrecao: Centavos;
  totalEncargoPrincipal: Centavos;
  /** MIP + DFI somados ao longo do contrato. `null` se não calculáveis. */
  totalSeguros: Centavos | null;
  totalTarifas: Centavos | null;
  /** Tudo que o cliente desembolsa. Parcial quando faltou acessório. */
  totalPago: Centavos;
  totalPagoParcial: boolean;

  primeira: ParcelaCronograma | null;
  ultima: ParcelaCronograma | null;
}

export interface EntradaCronograma {
  financiado: Centavos;
  prazoMeses: number;
  sistema: SistemaAmortizacao;
  /** Taxa de juros MENSAL, fração. Já convertida pelo regime do produto. */
  taxaMensal: number;
  /** Correção mensal do indexador, fração. Zero no prefixado. */
  correcaoMensal: number;
  /** Meses sem amortização, no começo do contrato (§37). */
  carenciaMeses: number;
  /**
   * Durante a carência, os juros e a correção são incorporados ao saldo?
   *
   * §37 diz que "a atualização monetária, juros e amortização suspensos podem
   * ser incorporados ao saldo devedor" — *podem*, e por isso é parâmetro. Com
   * `false`, os juros da carência são PAGOS no mês e o saldo não cresce.
   */
  carenciaCapitalizaJuros: boolean;
  valorAvaliacao: Centavos;
  proponentes: ProponenteResolvido[];
  seguros: RegrasSeguros;
  politica: PoliticaArredondamento;
}

const VAZIO: Cronograma = {
  sistema: 'SAC',
  parcelas: [],
  totalJuros: ZERO,
  totalJurosPagos: ZERO,
  totalAmortizado: ZERO,
  totalCorrecao: ZERO,
  totalEncargoPrincipal: ZERO,
  totalSeguros: null,
  totalTarifas: null,
  totalPago: ZERO,
  totalPagoParcial: true,
  primeira: null,
  ultima: null,
};

export function gerarCronograma(e: EntradaCronograma): Cronograma {
  if (e.financiado <= 0 || e.prazoMeses <= 0) return { ...VAZIO, sistema: e.sistema };

  const carencia = Math.max(0, Math.min(e.carenciaMeses, e.prazoMeses - 1));
  const mesesDeAmortizacao = e.prazoMeses - carencia;

  /*
   * A PRESTAÇÃO DA PRICE É RECALCULADA DEPOIS DA CARÊNCIA.
   *
   * Com carência capitalizando juros, o saldo no fim dela é maior que o
   * financiado — então a prestação precisa sair desse saldo maior, e não do
   * original. Calcular antes daria uma parcela que não quita o contrato.
   *
   * Por isso o valor é resolvido dentro do laço, no primeiro mês de
   * amortização, quando o saldo já é o definitivo.
   */
  let prestacaoPriceFixa: Preciso | null = null;
  let amortizacaoSacFixa: Preciso | null = null;

  const parcelas: ParcelaCronograma[] = [];
  let saldo: Preciso = deCentavos(e.financiado);

  let totalJuros = ZERO;
  let totalJurosPagos = ZERO;
  let totalAmortizado = ZERO;
  let totalCorrecao = ZERO;
  let totalEncargoPrincipal = ZERO;
  let somaSeguros: Centavos = ZERO;
  let somaTarifas: Centavos = ZERO;
  let segurosCompletos = true;
  let tarifasCompletas = true;

  for (let mes = 1; mes <= e.prazoMeses; mes++) {
    const emCarencia = mes <= carencia;

    // ---- 1. saldo inicial ------------------------------------------------
    const saldoInicial = saldo;

    // ---- 2 e 3. aplicar indexador -> saldo atualizado --------------------
    const correcao = conformePolitica(preciso(saldoInicial * e.correcaoMensal), e.politica);
    const saldoAtualizado = preciso(saldoInicial + correcao);

    // ---- 4. juros sobre o saldo ATUALIZADO -------------------------------
    const juros = conformePolitica(preciso(saldoAtualizado * e.taxaMensal), e.politica);

    // ---- 5. amortização --------------------------------------------------
    let amortizacao: Preciso = preciso(0);
    let jurosPagos: Preciso = juros;

    if (emCarencia) {
      /*
       * §37: durante a carência não se amortiza. Capitalizando, os juros
       * também não são pagos — entram no saldo. É por isso que o saldo SOBE
       * na carência, e é o que o cliente precisa ver na tabela antes de pedir
       * seis meses "de folga".
       */
      if (e.carenciaCapitalizaJuros) jurosPagos = preciso(0);
    } else {
      const primeiroDeAmortizacao = mes === carencia + 1;
      const ultimo = mes === e.prazoMeses;

      /*
       * ===================================================================
       * COM INDEXADOR, O ENCARGO É RECALCULADO TODO MÊS
       * ===================================================================
       * Esta é a diferença entre um cronograma que fecha e um que estoura na
       * última parcela.
       *
       * Numa PRICE clássica (sem correção), a prestação é calculada uma vez e
       * vale até o fim. Com TR ou IPCA o saldo SOBE a cada mês — e uma
       * prestação nominal congelada deixa de amortizar: a dívida cresce mais
       * do que a parcela paga, e o contrato termina com um saldo enorme.
       *
       * O contrato indexado brasileiro recalcula o encargo sobre o **saldo
       * atualizado** e o **prazo remanescente**, todo mês. É por isso que a
       * parcela de um financiamento com TR sobe ao longo do tempo, coisa que
       * o cliente estranha e o corretor precisa saber explicar.
       *
       * Sem correção, os dois sistemas se comportam como o livro-texto: a
       * amortização do SAC e a prestação da PRICE são fixadas uma vez.
       */
      const recalculaTodoMes = e.correcaoMensal > 0;
      const mesesRestantes = e.prazoMeses - mes + 1;

      if (e.sistema === 'SAC') {
        /*
         * A amortização do SAC sai do saldo do PRIMEIRO mês de amortização —
         * que, com carência capitalizando juros, é maior que o financiado.
         * Calculá-la sobre o valor original deixaria saldo em aberto no fim.
         */
        if (recalculaTodoMes || primeiroDeAmortizacao || amortizacaoSacFixa === null) {
          amortizacaoSacFixa = conformePolitica(
            preciso(saldoAtualizado / (recalculaTodoMes ? mesesRestantes : mesesDeAmortizacao)),
            e.politica,
          );
        }
        amortizacao = ultimo ? saldoAtualizado : amortizacaoSacFixa;
      } else {
        if (recalculaTodoMes || primeiroDeAmortizacao || prestacaoPriceFixa === null) {
          prestacaoPriceFixa = conformePolitica(
            preciso(
              pmt(
                saldoAtualizado,
                e.taxaMensal,
                recalculaTodoMes ? mesesRestantes : mesesDeAmortizacao,
              ),
            ),
            e.politica,
          );
        }
        /*
         * A ÚLTIMA PARCELA LIQUIDA O SALDO.
         *
         * A prestação foi arredondada, então ao fim do prazo sobra uma
         * diferença de centavos. A última amortiza o que restou e a prestação
         * dela é recalculada a partir disso — é como o contrato funciona, e é
         * por isso que a última parcela de um PRICE real quase nunca é
         * idêntica às anteriores.
         */
        amortizacao = ultimo
          ? saldoAtualizado
          : preciso(Math.min(Math.max(prestacaoPriceFixa - juros, 0), saldoAtualizado));
      }
    }

    // ---- 6. atualizar saldo ----------------------------------------------
    const jurosCapitalizados = preciso(juros - jurosPagos);
    saldo = preciso(saldoAtualizado - amortizacao + jurosCapitalizados);
    // Sujeira numérica abaixo de meio centavo vira zero: o contrato acabou.
    if (Math.abs(saldo) < 0.5) saldo = preciso(0);

    // ---- 7, 8 e 9. MIP, DFI e tarifa -------------------------------------
    const acessorios: EncargosDoMes = encargosDoMes({
      saldoDevedor: paraCentavos(saldoAtualizado),
      valorAvaliacao: e.valorAvaliacao,
      proponentes: e.proponentes,
      regras: e.seguros,
    });

    // ---- 10. total da prestação ------------------------------------------
    const cJuros = paraCentavos(jurosPagos);
    const cAmort = paraCentavos(amortizacao);
    const encargoPrincipal = somar(cAmort, cJuros);
    const prestacaoTotal = somar(encargoPrincipal, acessorios.total);

    const linha: ParcelaCronograma = {
      numero: mes,
      saldoInicial: paraCentavos(saldoInicial),
      correcaoIndexador: paraCentavos(correcao),
      saldoAtualizado: paraCentavos(saldoAtualizado),
      juros: paraCentavos(juros),
      jurosCapitalizados: paraCentavos(jurosCapitalizados),
      amortizacao: cAmort,
      encargoPrincipal,
      mip: acessorios.mip,
      dfi: acessorios.dfi,
      tarifa: acessorios.tarifa,
      prestacaoTotal,
      parcial: acessorios.parcial,
      saldoFinal: paraCentavos(saldo),
      carencia: emCarencia,
    };
    parcelas.push(linha);

    totalJuros = somar(totalJuros, paraCentavos(juros));
    totalJurosPagos = somar(totalJurosPagos, cJuros);
    totalAmortizado = somar(totalAmortizado, cAmort);
    totalCorrecao = somar(totalCorrecao, linha.correcaoIndexador);
    totalEncargoPrincipal = somar(totalEncargoPrincipal, encargoPrincipal);

    if (acessorios.mip === null || acessorios.dfi === null) segurosCompletos = false;
    else somaSeguros = somar(somaSeguros, acessorios.mip, acessorios.dfi);

    if (acessorios.tarifa === null) tarifasCompletas = false;
    else somaTarifas = somar(somaTarifas, acessorios.tarifa);
  }

  const totalSeguros = segurosCompletos ? somaSeguros : null;
  const totalTarifas = tarifasCompletas ? somaTarifas : null;

  return {
    sistema: e.sistema,
    parcelas,
    totalJuros,
    totalJurosPagos,
    totalAmortizado,
    totalCorrecao,
    totalEncargoPrincipal,
    totalSeguros,
    totalTarifas,
    totalPago: somar(totalEncargoPrincipal, totalSeguros ?? ZERO, totalTarifas ?? ZERO),
    totalPagoParcial: !segurosCompletos || !tarifasCompletas,
    primeira: parcelas[0] ?? null,
    ultima: parcelas[parcelas.length - 1] ?? null,
  };
}

/** `PMT = PV · [i(1+i)^n] / [(1+i)^n − 1]` — §22. Taxa zero divide por zero. */
function pmt(pv: number, i: number, n: number): number {
  if (n <= 0) return 0;
  if (i <= 0) return pv / n;
  const f = Math.pow(1 + i, n);
  return (pv * (i * f)) / (f - 1);
}

/**
 * A primeira prestação TOTAL sem montar o cronograma inteiro.
 *
 * Existe para o cálculo reverso, que avalia dezenas de candidatos por busca
 * binária (§44): gerar 420 linhas a cada tentativa travaria a tela do celular.
 * O primeiro mês é o que decide a capacidade, porque é o de maior prestação
 * nos dois sistemas.
 */
export function primeiraPrestacaoTotal(
  e: Omit<EntradaCronograma, 'carenciaMeses' | 'carenciaCapitalizaJuros'> & {
    carenciaMeses?: number;
  },
): { total: Centavos; encargoPrincipal: Centavos; parcial: boolean } {
  if (e.financiado <= 0 || e.prazoMeses <= 0) {
    return { total: ZERO, encargoPrincipal: ZERO, parcial: true };
  }
  const saldoAtualizado = e.financiado * (1 + e.correcaoMensal);
  const juros = saldoAtualizado * e.taxaMensal;
  const amortizacao =
    e.sistema === 'SAC'
      ? saldoAtualizado / e.prazoMeses
      : Math.max(pmt(saldoAtualizado, e.taxaMensal, e.prazoMeses) - juros, 0);

  const acessorios = encargosDoMes({
    saldoDevedor: arredondar(saldoAtualizado) as Centavos,
    valorAvaliacao: e.valorAvaliacao,
    proponentes: e.proponentes,
    regras: e.seguros,
  });

  const encargoPrincipal = (arredondar(juros) + arredondar(amortizacao)) as Centavos;
  return {
    total: somar(encargoPrincipal, acessorios.total),
    encargoPrincipal,
    parcial: acessorios.parcial,
  };
}
