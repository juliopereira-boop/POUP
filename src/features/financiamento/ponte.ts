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
 * Viaja **tudo o que o financiamento já sabe**: imóvel, unidade, valor, o que o
 * banco cobre (financiado + subsídio + FGTS), a parcela da CEF, e os
 * proponentes com renda. Cada campo que não atravessa é um campo que o corretor
 * digita de novo com o cliente esperando.
 *
 * O SALDO A PARCELAR NÃO PRECISA ATRAVESSAR — ele nasce do outro lado.
 * `computePoupanca` faz `unidade − financiado − subsídio − FGTS`, que é
 * exatamente a `entradaCalculada` do simulador de financiamento. Mandando as
 * quatro parcelas certas, a conta bate sozinha; mandar o total junto seria
 * criar uma quinta fonte de verdade para o mesmo número.
 *
 * **Não viaja a DISTRIBUIÇÃO do fluxo** — quanto vai no ato, quantas mensais,
 * semestrais e anuais. Isso é negociação com a construtora e é justamente o que
 * o corretor vai montar na tela seguinte. Preencher aquilo com um chute o faria
 * apagar campo por campo.
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
  /**
   * A primeira prestação do financiamento, em REAIS — a "parcela CEF".
   *
   * O simulador de poupança tem campo próprio para ela porque ela entra na
   * proposta impressa: o cliente precisa ver, lado a lado, o que paga ao banco
   * e o que paga à construtora.
   */
  firstInstallment?: number | null;
}

/** Um proponente do financiamento, do jeito que ele viaja. */
interface ProponenteDaEntrada {
  nome?: unknown;
  rendaBruta?: unknown;
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

function nomeDoProponente(p: ProponenteDaEntrada | undefined): string {
  return typeof p?.nome === 'string' ? p.nome.trim() : '';
}

function rendaDe(p: ProponenteDaEntrada | undefined): unknown {
  return p?.rendaBruta;
}

export function pontePoupanca(
  sim: SimulacaoParaPonte,
  cliente: ClienteParaPonte | null,
): LeadPrefill {
  const entrada = (sim.input ?? {}) as Record<string, unknown>;
  const proponentes: ProponenteDaEntrada[] = Array.isArray(entrada.proponentes)
    ? (entrada.proponentes as ProponenteDaEntrada[])
    : [];

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
    /*
     * `fgtsUsado`, e não `fgtsDisponivel`.
     *
     * O que entra no negócio é o que foi USADO. O saldo disponível pode ser
     * maior — e mandá-lo faria a poupança sair menor do que é, subestimando
     * justamente o valor que a construtora vai parcelar.
     */
    fgts: deCentavos(entrada.fgtsUsado),

    /*
     * A PARCELA DA CEF — e só ela.
     *
     * Ela não é dedução da poupança: é o que o cliente vai pagar ao banco em
     * paralelo ao que paga à construtora, e entra lado a lado na proposta.
     *
     * `cefInstallment` fica de fora de propósito. Apesar do nome, ele não é
     * "tem parcela do banco": é "a TAXA da CEF será parcelada?", uma decisão
     * comercial que o simulador de financiamento não pergunta. Ligá-lo daria
     * ao corretor um campo a desligar — exatamente o retrabalho que a ponte
     * existe para eliminar.
     */
    cefParcela: deReais(sim.firstInstallment),

    proponent1: {
      name: nomeDoProponente(proponentes[0]) || (sim.clientName ?? cliente?.name ?? ''),
      cpf: cliente?.cpf ?? '',
      email: cliente?.email ?? '',
      contact: cliente?.phone ?? '',
      rendaBruta: deCentavos(rendaDe(proponentes[0])),
    },

    /*
     * O SEGUNDO PROPONENTE ATRAVESSA JUNTO.
     *
     * Compor renda é decisão tomada no financiamento — quem compôs lá compõe
     * aqui. `association` fica em branco de propósito: o vínculo (cônjuge,
     * parente, fiador, sócio) é informação jurídica que o simulador de
     * financiamento não pergunta, e chutá-la entraria num documento assinado.
     */
    ...(proponentes.length > 1
      ? {
          hasSecondProponent: true,
          proponent2: {
            name: nomeDoProponente(proponentes[1]),
            cpf: '',
            email: '',
            contact: '',
            rendaBruta: deCentavos(rendaDe(proponentes[1])),
          },
        }
      : {}),
  };

  return {
    leadId: sim.leadId ?? undefined,
    companyId: sim.companyId,
    developmentId: sim.developmentId,
    estado,
  };
}
