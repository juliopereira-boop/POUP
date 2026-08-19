/**
 * MIP, DFI E TARIFA — os encargos acessórios.
 *
 * ===========================================================================
 * A REGRA QUE MANDA AQUI É A §74: NÃO INVENTAR
 * ===========================================================================
 * A especificação lista, entre as coisas que **não** se pode fazer:
 *
 *     NÃO: MIP = financing × 0.01   sem fonte
 *     NÃO: DFI = property × 0.001   sem fonte
 *
 * E a §75 diz o que fazer no lugar: `status = NOT_PUBLICLY_DOCUMENTED`, com a
 * arquitetura pronta para receber a tabela oficial depois.
 *
 * Então este módulo **implementa a fórmula inteira** — inclusive a tabela por
 * faixa etária e a pactuação de renda — e nasce **sem nenhum número**. Assim,
 * no dia em que a apólice chegar, é cadastro; não é código.
 *
 * ===========================================================================
 * AS TRÊS FÓRMULAS, COMO A ESPECIFICAÇÃO AS DEFINE
 * ===========================================================================
 * §34 — MIP (morte e invalidez permanente):
 *
 *     MIP = saldo devedor × taxa(idade) × participação de renda
 *
 * Por PROPONENTE, e somado. O saldo é o do mês (por isso o MIP cai ao longo do
 * contrato), a taxa vem da faixa etária da apólice, e a participação é a
 * pactuação de renda daquela pessoa.
 *
 * §35 — DFI (danos físicos ao imóvel):
 *
 *     DFI = valor de AVALIAÇÃO do imóvel × taxa
 *
 * Sobre a avaliação, não sobre o preço de venda — é o valor da garantia. E é
 * constante ao longo do contrato, porque a garantia não amortiza.
 *
 * §36 — Tarifa de administração: valor fixo mensal, que varia por produto e por
 * enquadramento (SFH/SFI). "Não utilizar um valor universal."
 */
import { ZERO, aplicarTaxa, percentualDe, reaisParaCentavos, somar, type Centavos } from './dinheiro';
import type { Parametro } from './regras';
import { temValor } from './regras';
import type { ProponenteResolvido } from './proponentes';

/** Uma faixa etária da apólice do MIP. */
export interface FaixaMip {
  /** Idade mínima, inclusiva. */
  de: number;
  /** Idade máxima, inclusiva. `null` = sem teto. */
  ate: number | null;
  /** Taxa MENSAL sobre o saldo devedor, em fração (0,00035 = 0,035% a.m.). */
  taxaMensal: number;
}

export interface RegrasSeguros {
  /**
   * A tábua do MIP por faixa etária.
   *
   * Pendente por padrão: §34 diz que "as taxas são definidas na apólice e o
   * valor varia em função da faixa etária dos proponentes" — é dado da
   * seguradora, não é regra pública da CAIXA.
   */
  mipPorIdade: Parametro<FaixaMip[]>;
  /** Taxa mensal do DFI sobre o valor de AVALIAÇÃO, em % (0,015 = 0,015%). */
  dfiPctMensalSobreAvaliacao: Parametro<number>;
  /** Tarifa de administração, em reais por mês. */
  tarifaAdminMensal: Parametro<number>;
}

/** O que foi possível calcular num mês. `null` = parâmetro não cadastrado. */
export interface EncargosDoMes {
  mip: Centavos | null;
  dfi: Centavos | null;
  tarifa: Centavos | null;
  /** A soma do que existe. Nunca soma `null` como zero. */
  total: Centavos;
  /** Verdadeiro quando algum encargo ficou de fora por falta de parâmetro. */
  parcial: boolean;
}

export const SEM_ENCARGOS: EncargosDoMes = {
  mip: null,
  dfi: null,
  tarifa: null,
  total: ZERO,
  parcial: true,
};

/**
 * A taxa de MIP de uma idade. `null` quando a tábua não cobre aquela idade.
 *
 * Devolver `null` para idade descoberta, em vez de cair na faixa mais próxima,
 * é deliberado: uma tábua que vai até 70 anos e um proponente de 72 significa
 * que **aquela apólice não cobre esse caso** — e isso é informação, não um
 * detalhe a contornar.
 */
export function taxaMipDaIdade(faixas: FaixaMip[], idade: number): number | null {
  for (const f of faixas) {
    if (idade >= f.de && (f.ate === null || idade <= f.ate)) return f.taxaMensal;
  }
  return null;
}

export interface EntradaEncargos {
  /** Saldo devedor do mês, já atualizado pelo indexador. */
  saldoDevedor: Centavos;
  /** Valor de AVALIAÇÃO do imóvel — a base do DFI, e não o preço de venda. */
  valorAvaliacao: Centavos;
  proponentes: ProponenteResolvido[];
  regras: RegrasSeguros;
}

/**
 * Os encargos acessórios de UM mês.
 *
 * O MIP é somado proponente a proponente. Se **algum** deles ficar sem taxa
 * (idade não informada, ou fora da tábua), o MIP inteiro vira `null` — um MIP
 * parcial, cobrindo só uma das duas pessoas, seria um número que parece
 * completo e não é. Melhor dizer "não calculado" do que entregar metade.
 */
export function encargosDoMes(e: EntradaEncargos): EncargosDoMes {
  const r = e.regras;

  let mip: Centavos | null = null;
  if (temValor(r.mipPorIdade) && r.mipPorIdade.valor.length > 0 && e.proponentes.length > 0) {
    const faixas = r.mipPorIdade.valor;
    let acumulado: Centavos = ZERO;
    let completo = true;
    for (const p of e.proponentes) {
      if (p.idadeAnos === null) {
        completo = false;
        break;
      }
      const taxa = taxaMipDaIdade(faixas, p.idadeAnos);
      if (taxa === null) {
        completo = false;
        break;
      }
      // §34: saldo × taxa(idade) × participação
      const parte = aplicarTaxa(e.saldoDevedor, taxa * (p.participacaoEfetivaPct / 100));
      acumulado = somar(acumulado, parte);
    }
    if (completo) mip = acumulado;
  }

  const dfi = temValor(r.dfiPctMensalSobreAvaliacao)
    ? percentualDe(e.valorAvaliacao, r.dfiPctMensalSobreAvaliacao.valor)
    : null;

  const tarifa = temValor(r.tarifaAdminMensal)
    ? reaisParaCentavos(r.tarifaAdminMensal.valor)
    : null;

  return {
    mip,
    dfi,
    tarifa,
    total: somar(mip ?? ZERO, dfi ?? ZERO, tarifa ?? ZERO),
    parcial: mip === null || dfi === null || tarifa === null,
  };
}

/**
 * Estimativa dos encargos para o CÁLCULO REVERSO — §40.
 *
 * "Depois retirar encargos acessórios estimados" da parcela disponível. Aqui a
 * conta usa o financiamento como proxy do saldo do primeiro mês, que é o mês em
 * que a parcela é maior e portanto o mês que decide a capacidade.
 *
 * Quando nada está cadastrado o resultado é zero, e o motor reverso avisa que a
 * capacidade calculada ignora os seguros — e que a parcela real será maior.
 */
export function encargosEstimados(
  financiado: Centavos,
  valorAvaliacao: Centavos,
  proponentes: ProponenteResolvido[],
  regras: RegrasSeguros,
): EncargosDoMes {
  return encargosDoMes({
    saldoDevedor: financiado,
    valorAvaliacao,
    proponentes,
    regras,
  });
}
