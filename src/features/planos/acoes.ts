/**
 * A TELA "PLANOS" — as regras, sem tela (roda nos testes em Node).
 *
 * Três perguntas que a tela responde:
 *   1. Em que situação a conta está? (teste, paga, acesso concedido, sem plano)
 *   2. O que o botão de cada plano faz? (assinar, fazer upgrade, mudar para o
 *      Start, seu plano atual)
 *   3. Descendo de plano ou cancelando: o que muda, e por quê? (o motivo é
 *      obrigatório e vai para `mudancas_de_plano`)
 */
import type { PlanTier, Subscription } from '@/data/types';
import { isTrialActive } from '@/data/types';
import { PLAN_FEATURES, PLANS } from '../plans';

export type SituacaoDaConta = 'teste' | 'paga' | 'concedida' | 'sem_plano';

export interface EstadoDaConta {
  situacao: SituacaoDaConta;
  /** Plano em uso (no teste, o gravado é o Start, mas libera quase tudo). */
  tier: PlanTier | null;
  /** Assinatura paga marcada para terminar no fim do período. */
  cancelaNoFim: boolean;
}

export function estadoDaConta(sub: Subscription | null, agora: number = Date.now()): EstadoDaConta {
  if (!sub) return { situacao: 'sem_plano', tier: null, cancelaNoFim: false };
  if (sub.status === 'trialing') {
    return isTrialActive(sub, agora)
      ? { situacao: 'teste', tier: sub.tier ?? 'start', cancelaNoFim: false }
      : { situacao: 'sem_plano', tier: null, cancelaNoFim: false };
  }
  if (sub.status === 'active' || sub.status === 'past_due') {
    // Ativa sem loja/Stripe por trás = acesso concedido pelo POUP (sem cobrança).
    const situacao: SituacaoDaConta = sub.billingProvider ? 'paga' : 'concedida';
    return { situacao, tier: sub.tier ?? null, cancelaNoFim: Boolean(sub.cancelAtPeriodEnd) };
  }
  return { situacao: 'sem_plano', tier: null, cancelaNoFim: false };
}

export type TipoDeAcao = 'assinar' | 'upgrade' | 'downgrade' | 'atual';

export interface AcaoDoPlano {
  tipo: TipoDeAcao;
  rotulo: string;
}

/** O botão do cartão de cada plano, conforme a situação da conta. */
export function acaoDoPlano(plano: PlanTier, estado: EstadoDaConta): AcaoDoPlano {
  const nome = PLANS[plano].name;
  if (estado.situacao === 'paga' && estado.tier) {
    if (estado.tier === plano) return { tipo: 'atual', rotulo: 'Seu plano atual' };
    return plano === 'pro'
      ? { tipo: 'upgrade', rotulo: 'Fazer upgrade para o Pro' }
      : { tipo: 'downgrade', rotulo: `Mudar para o ${nome}` };
  }
  // Acesso concedido: o plano que ele tem aparece como atual; o outro, para assinar.
  if (estado.situacao === 'concedida' && estado.tier === plano) return { tipo: 'atual', rotulo: 'Seu plano atual' };
  return { tipo: 'assinar', rotulo: `Assinar o ${nome}` };
}

/** O cabeçalho da tela: a situação em uma frase. */
export function resumoDaConta(estado: EstadoDaConta, diasDeTeste: number | null): { titulo: string; detalhe: string } {
  if (estado.situacao === 'teste') {
    const dias = diasDeTeste === 1 ? 'Último dia' : diasDeTeste != null ? `Faltam ${diasDeTeste} dias` : 'Em andamento';
    return {
      titulo: 'Teste gratuito',
      detalhe: `${dias}. No teste, tudo está liberado, menos a LIA e o ranking — que são do Pro assinado.`,
    };
  }
  if (estado.situacao === 'paga' && estado.tier) {
    return {
      titulo: `Plano ${PLANS[estado.tier].name}`,
      detalhe: estado.cancelaNoFim ? 'Cancelado: o acesso vai até o fim do período já pago.' : 'Assinatura ativa.',
    };
  }
  if (estado.situacao === 'concedida' && estado.tier) {
    return { titulo: `Plano ${PLANS[estado.tier].name}`, detalhe: 'Acesso concedido pelo POUP, sem cobrança.' };
  }
  return { titulo: 'Sem plano ativo', detalhe: 'Escolha um plano para usar o POUP.' };
}

// ------------------------------------------------------ descer ou cancelar

export type DestinoDaMudanca = 'start' | 'cancelar';

export const MOTIVOS = [
  { chave: 'caro', rotulo: 'Está caro para mim agora' },
  { chave: 'nao_uso_pro', rotulo: 'Não uso os recursos do Pro' },
  { chave: 'pouco_uso', rotulo: 'Vou usar pouco o app por um tempo' },
  { chave: 'faltou_funcao', rotulo: 'Falta uma função que eu preciso' },
  { chave: 'problema_tecnico', rotulo: 'Tive problemas técnicos' },
  { chave: 'outro_app', rotulo: 'Vou usar outro sistema' },
  { chave: 'outro', rotulo: 'Outro motivo' },
] as const;

export type Motivo = (typeof MOTIVOS)[number]['chave'];

/** O que o corretor deixa de ter ao descer para o Start (a mesma lista do paywall). */
export function recursosQueSaem(de: PlanTier, para: PlanTier): string[] {
  return PLAN_FEATURES.filter((f) => f.includedIn.includes(de) && !f.includedIn.includes(para)).map((f) => f.label);
}

/** "O que muda" — escrito para o corretor, sem letra miúda. */
export function oQueMuda(de: PlanTier, destino: DestinoDaMudanca): { perde: string[]; fica: string[] } {
  if (destino === 'start') {
    return {
      perde: recursosQueSaem(de, 'start'),
      fica: [
        'Suas vendas e comissões ficam salvas: voltam a aparecer se você assinar o Pro de novo.',
        'Você sai do ranking; a sua escolha de participar fica guardada para quando voltar ao Pro.',
        'Leads, simulações, propostas, agenda e cadastros continuam como estão.',
      ],
    };
  }
  return {
    perde: ['O acesso ao POUP, no fim do período que já está pago.'],
    fica: [
      'Seus leads, simulações, vendas e cadastros ficam salvos na sua conta.',
      'Você pode voltar a assinar quando quiser, e encontra tudo como deixou.',
    ],
  };
}

/** `null` = pode seguir. */
export function erroDoMotivo(motivo: Motivo | null, comentario: string): string | null {
  if (!motivo) return 'Escolha um motivo para continuar.';
  if (motivo === 'outro' && comentario.trim().length < 3) return 'Conte em poucas palavras o motivo.';
  if (comentario.length > 500) return 'O comentário pode ter até 500 caracteres.';
  return null;
}
