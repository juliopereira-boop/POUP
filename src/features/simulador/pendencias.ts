/**
 * O QUE FALTA PARA GERAR A PROPOSTA — todas as regras num lugar só.
 *
 * ===========================================================================
 * POR QUE AS REGRAS SAÍRAM DAS TELAS
 * ===========================================================================
 * No simulador de cinco etapas, cada "Avançar" conferia um pedaço: a etapa 1
 * pedia empresa e unidade, a 3 pedia o cliente, a 5 o vencimento do ato. Com
 * dois blocos, o corretor preenche os valores primeiro e a unidade depois — e
 * pode ir e voltar entre os dois. As regras precisam ser conferidas juntas, no
 * fim, e cada pendência precisa dizer EM QUAL BLOCO está, para o botão levar o
 * corretor direto até ela.
 *
 * ===========================================================================
 * NENHUMA REGRA NOVA — COM UMA EXCEÇÃO
 * ===========================================================================
 * Tudo aqui já era exigido pelas cinco telas antigas. A única regra nova é a
 * parcela negativa: se ato, semestrais e anuais somam mais que a poupança, a
 * mensal sai negativa — e a proposta impressa mostraria "12 × −R$ 800,00" para
 * o cliente. Antes isso passava.
 *
 * Os limites da construtora (máximo de mensais, semestrais, anuais) também
 * eram conferidos antes, mas no campo, ao digitar. Agora que os valores vêm
 * ANTES da escolha da construtora, o corretor pode ter digitado 120 parcelas
 * para uma construtora que aceita 60 — e isso só aparece quando ele escolhe.
 */
import { buildFlow } from './calc';
import type { Proponent, SimuladorState } from './estado';
import { currencyToNumber } from '@/lib/masks';

/** 1 = valores, 2 = unidade e cliente. */
export type BlocoDoSimulador = 1 | 2;

export interface Pendencia {
  bloco: BlocoDoSimulador;
  mensagem: string;
}

export interface ContextoPendencias {
  /** A construtora tem correspondentes cadastrados — aí escolher um é obrigatório. */
  exigeCorrespondente: boolean;
}

export function proponenteCompleto(p: Proponent): boolean {
  return Boolean(
    p.name.trim() && p.cpf.trim() && p.email.trim() && p.contact.trim() && p.rendaBruta.trim(),
  );
}

function inteiro(texto: string): number {
  return Number.parseInt(texto || '0', 10) || 0;
}

/** As pendências do bloco de VALORES, na ordem em que os campos aparecem. */
export function pendenciasDosValores(sim: SimuladorState): Pendencia[] {
  const lista: Pendencia[] = [];
  const add = (mensagem: string) => lista.push({ bloco: 1, mensagem });

  if (currencyToNumber(sim.unitValue) <= 0) add('Informe o valor de venda.');
  if (!sim.atoDueDate) add('Informe o vencimento do ato.');

  const mensais = inteiro(sim.mensaisCount);
  if (mensais <= 0) add('Informe a quantidade de parcelas mensais.');

  const max = sim.companyMaxInstallments;
  if (max != null && mensais > max) {
    add(`Esta construtora aceita no máximo ${max} parcelas mensais.`);
  }
  if (sim.semestralEnabled) {
    const maxSem = sim.companyMaxSemiannual;
    if (maxSem != null && inteiro(sim.semestralCount) > maxSem) {
      add(`Esta construtora aceita no máximo ${maxSem} semestrais.`);
    }
  }
  if (sim.anualEnabled) {
    const maxAnu = sim.companyMaxAnnual;
    if (maxAnu != null && inteiro(sim.anualCount) > maxAnu) {
      add(`Esta construtora aceita no máximo ${maxAnu} anuais.`);
    }
  }

  if (mensais > 0 && buildFlow(sim).monthlyValue < 0) {
    add('Ato, semestrais e anuais passam do valor da poupança: a parcela mensal ficaria negativa.');
  }

  return lista;
}

/** As pendências do bloco de UNIDADE E CLIENTE. */
export function pendenciasDosDados(sim: SimuladorState, ctx: ContextoPendencias): Pendencia[] {
  const lista: Pendencia[] = [];
  const add = (mensagem: string) => lista.push({ bloco: 2, mensagem });

  if (!sim.companyId) add('Selecione a construtora.');
  if (!sim.developmentId) add('Selecione o empreendimento.');
  if (!sim.unit.trim()) add('Informe a unidade.');
  if (ctx.exigeCorrespondente && !sim.correspondentId) add('Selecione o correspondente.');

  if (!proponenteCompleto(sim.proponent1)) add('Preencha todos os dados do 1º proponente.');
  if (sim.hasSecondProponent) {
    if (!sim.association) add('Selecione o tipo de associação do 2º proponente.');
    if (!proponenteCompleto(sim.proponent2)) add('Preencha todos os dados do 2º proponente.');
  }

  return lista;
}

/** Tudo o que falta para gerar a proposta. Vazio = pode gerar. */
export function pendencias(sim: SimuladorState, ctx: ContextoPendencias): Pendencia[] {
  return [...pendenciasDosValores(sim), ...pendenciasDosDados(sim, ctx)];
}
