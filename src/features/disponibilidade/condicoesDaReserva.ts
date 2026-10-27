/**
 * O FLUXO DA SIMULAÇÃO VIRA AS CONDIÇÕES DA RESERVA NO CV.
 *
 * No CV, a reserva leva uma condição por SÉRIE de pagamento: série,
 * quantidade de parcelas, valor da parcela e primeiro vencimento
 * (`POST /api/v1/comercial/reservas`, campo `condicoes`). Cada parte do fluxo
 * do simulador vira uma condição; qual série do CV recebe cada parte, o
 * admin escolhe uma vez no cadastro da construtora (o de-para fica no
 * servidor).
 *
 * Só entra a parte com valor. O cupom não vira condição: ele já desconta da
 * poupança (o ato e as parcelas saem dela). Financiamento, FGTS e subsídio
 * vão em uma parcela, sem vencimento: quem marca a data é o banco.
 *
 * Tudo aqui é puro (sem React, sem banco): roda nos testes em Node.
 */

export type ParteDaReserva = 'ato' | 'mensal' | 'semestral' | 'anual' | 'financiamento' | 'fgts' | 'subsidio';

export const PARTES_DA_RESERVA: { parte: ParteDaReserva; rotulo: string }[] = [
  { parte: 'ato', rotulo: 'Ato' },
  { parte: 'mensal', rotulo: 'Mensais' },
  { parte: 'semestral', rotulo: 'Semestrais' },
  { parte: 'anual', rotulo: 'Anuais' },
  { parte: 'financiamento', rotulo: 'Financiamento' },
  { parte: 'fgts', rotulo: 'FGTS' },
  { parte: 'subsidio', rotulo: 'Subsídio' },
];

/** O fluxo como o simulador calcula (`buildFlow`), em números. Datas "AAAA-MM-DD". */
export interface FluxoParaReserva {
  ato: number;
  atoVencimento: string | null;
  mensaisQuantidade: number;
  mensalValor: number;
  mensalPrimeiroVencimento: string | null;
  semestralQuantidade: number;
  semestralValor: number;
  semestralPrimeiroVencimento: string | null;
  anualQuantidade: number;
  anualValor: number;
  anualPrimeiroVencimento: string | null;
  financiamento: number;
  fgts: number;
  subsidio: number;
}

export interface CondicaoDaReserva {
  parte: ParteDaReserva;
  quantidade: number;
  /** Em reais, arredondado ao centavo (o CV não recalcula). */
  valorParcela: number;
  /** "AAAA-MM-DD"; nulo para financiamento, FGTS e subsídio. */
  primeiroVencimento: string | null;
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const data = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function condicoesDaReserva(f: FluxoParaReserva): CondicaoDaReserva[] {
  const out: CondicaoDaReserva[] = [];
  const parcelada = (parte: ParteDaReserva, quantidade: number, valor: number, vencimento: string | null) => {
    const q = Math.trunc(quantidade);
    const v = centavos(valor);
    if (q >= 1 && v > 0) out.push({ parte, quantidade: q, valorParcela: v, primeiroVencimento: data(vencimento) });
  };
  const unica = (parte: ParteDaReserva, valor: number) => {
    const v = centavos(valor);
    if (v > 0) out.push({ parte, quantidade: 1, valorParcela: v, primeiroVencimento: null });
  };
  parcelada('ato', 1, f.ato, f.atoVencimento);
  parcelada('mensal', f.mensaisQuantidade, f.mensalValor, f.mensalPrimeiroVencimento);
  parcelada('semestral', f.semestralQuantidade, f.semestralValor, f.semestralPrimeiroVencimento);
  parcelada('anual', f.anualQuantidade, f.anualValor, f.anualPrimeiroVencimento);
  unica('financiamento', f.financiamento);
  unica('fgts', f.fgts);
  unica('subsidio', f.subsidio);
  return out;
}

/** Quanto as condições somam (para conferir com o valor da unidade). */
export function totalDasCondicoes(c: CondicaoDaReserva[]): number {
  return centavos(c.reduce((s, x) => s + x.quantidade * x.valorParcela, 0));
}
