/**
 * A PONTE ENTRE OS DOIS SIMULADORES.
 *
 * ===========================================================================
 * O PEDIDO, EM UMA FRASE
 * ===========================================================================
 * *"Se um cliente faz uma simulação de financiamento, esses dados já ficam
 * ligados a esse cliente — e quando ele for para o simulador de poupança, lá no
 * fluxo de pagamento esses dados já vão estar preenchidos."*
 *
 * Este arquivo é a tradução. Recebe uma simulação de financiamento salva e
 * devolve o `LeadPrefill` que o simulador de poupança consome.
 *
 * ===========================================================================
 * POR QUE ISTO É UMA FUNÇÃO PURA, E NÃO CÓDIGO DENTRO DA TELA
 * ===========================================================================
 * Porque ela é o ponto exato onde os dois modelos se encontram, e eles usam
 * nomes e UNIDADES diferentes:
 *
 *   - o financiamento guarda dinheiro em **centavos** (inteiros exatos);
 *   - a poupança guarda dinheiro em **texto mascarado** ("R$ 210.000,00");
 *   - `financedValue` está em **reais** (é coluna de banco, para filtro);
 *   - `subsidio` do financiamento é `subsidy` na poupança.
 *
 * Errar uma dessas conversões por um fator de cem produz uma proposta com o
 * valor errado e ninguém percebe até o cliente ler. Isolada aqui, a tradução é
 * testada por `npm run testar:financiamento`.
 *
 * ===========================================================================
 * O QUE VIAJA, E O QUE NÃO
 * ===========================================================================
 * Viaja o que os dois compartilham: imóvel, valor, o que o banco cobre
 * (financiado + subsídio + FGTS) e o proponente.
 *
 * **Não viaja o fluxo de pagamento** — ato, mensais, semestrais, anuais. Isso é
 * negociação com a construtora e é justamente o que o corretor vai montar na
 * tela seguinte. Preencher aquilo com um chute faria ele apagar campo por campo.
 */
import { formatCurrencyBRL } from '@/lib/masks';
import type { LeadPrefill, SimuladorState } from '@/features/simulador/SimuladorProvider';

/** Só o que a ponte precisa saber da simulação salva. */
export interface SimulacaoParaPonte {
  leadId: string | null;
  clientName: string | null;
  companyId: string | null;
  developmentId: string | null;
  block: number | null;
  unit: string | null;
  /** `EntradaSimulacao` serializada — dinheiro em CENTAVOS. */
  input: unknown;
  /** Coluna do banco, em REAIS. */
  financedValue: number | null;
}

export interface ClienteParaPonte {
  cpf: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
}

/** Centavos → a máscara que a poupança guarda. Zero e nulo viram vazio. */
function deCentavos(valor: unknown): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return '';
  return formatCurrencyBRL(String(Math.round(valor)));
}

/** Reais → a mesma máscara. É a unidade das colunas espelhadas do banco. */
function deReais(valor: number | null | undefined): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return '';
  return formatCurrencyBRL(String(Math.round(valor * 100)));
}

export function pontePoupanca(
  sim: SimulacaoParaPonte,
  cliente: ClienteParaPonte | null,
): LeadPrefill {
  const entrada = (sim.input ?? {}) as Record<string, unknown>;

  const estado: Partial<SimuladorState> = {
    companyId: sim.companyId,
    developmentId: sim.developmentId,
    block: sim.block ?? 0,
    unit: sim.unit ?? '',
    unitValue: deCentavos(entrada.valorImovel),

    /*
     * `financingApproved` recebe o VALOR FINANCIADO.
     *
     * É o papel que esse campo tem na poupança: ele é descontado do valor da
     * unidade para achar o saldo que o cliente parcela com a construtora. E o
     * valor financiado da simulação é exatamente quanto o banco cobre.
     */
    financingApproved: deReais(sim.financedValue),
    subsidy: deCentavos(entrada.subsidio),
    fgts: deCentavos(entrada.fgts),

    proponent1: {
      name: sim.clientName ?? cliente?.name ?? '',
      cpf: cliente?.cpf ?? '',
      email: cliente?.email ?? '',
      contact: cliente?.phone ?? '',
      rendaBruta: deCentavos(entrada.rendaFamiliarMensal),
    },
  };

  return {
    leadId: sim.leadId ?? undefined,
    companyId: sim.companyId,
    developmentId: sim.developmentId,
    estado,
  };
}
