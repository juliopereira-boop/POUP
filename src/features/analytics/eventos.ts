/**
 * TELEMETRIA DO PRODUTO — o que medir no piloto, e o que nunca gravar.
 *
 * ===========================================================================
 * A REGRA QUE VEM ANTES DE TODAS
 * ===========================================================================
 * **Nenhum dado do cliente entra aqui.** Nem nome, nem CPF, nem telefone, nem
 * email, nem renda, nem valor de imóvel, nem trecho de conversa. Só ID interno,
 * etapa, duração e resultado.
 *
 * A garantia não é este comentário: é a assinatura de `registrar`. Não existe
 * parâmetro de texto livre. `etapa` e `resultado` são de listas fechadas, e
 * `refId` é um uuid do nosso próprio banco. Não há como passar um nome de
 * cliente para esta função nem por descuido.
 *
 * O banco repete a mesma trava por CHECK (ver `0029_rastreabilidade.sql`),
 * porque uma regra que só existe no cliente é uma regra que a próxima tela
 * esquece.
 *
 * ===========================================================================
 * TELEMETRIA NUNCA ATRAPALHA O USO
 * ===========================================================================
 * `registrar` não devolve erro, não lança e não é esperada com `await` nas
 * telas. Se a rede caiu, se a migration não foi aplicada, se a tabela não
 * existe — o evento se perde em silêncio e o corretor não vê nada. Perder uma
 * medição é irrelevante; travar uma proposta por causa de uma medição seria
 * absurdo.
 *
 * ===========================================================================
 * POR QUE ESTES ONZE EVENTOS
 * ===========================================================================
 * Cada um responde uma pergunta do piloto que nenhuma opinião responde:
 *
 *   signup_completed / onboarding_completed
 *     Quantos param entre criar a conta e ter o app pronto para usar? É o
 *     buraco mais comum de todo produto novo.
 *
 *   company_created / development_created
 *     O corretor precisa de empresa e empreendimento antes de simular. Se ele
 *     não passa daqui, o resto do produto nunca é visto.
 *
 *   simulation_started / simulation_step_completed / simulation_abandoned
 *     A simulação é o coração do POUP. Saber em QUAL etapa ele desiste é a
 *     diferença entre consertar o formulário certo e mexer no errado.
 *
 *   proposal_generated / proposal_shared
 *     Gerar é uso; ENVIAR ao cliente é valor entregue. A distância entre os
 *     dois números diz se a proposta está boa o suficiente para ser mostrada.
 *
 *   user_returned
 *     A única métrica que não dá para fingir. Quem volta no dia seguinte achou
 *     utilidade.
 *
 *   subscription_viewed
 *     Quem chegou a olhar o preço. Contra os outros números, diz se o bloqueio
 *     está aparecendo no momento certo.
 */
import { db } from '@/data';

/**
 * Lista fechada, igual à do CHECK no banco.
 *
 * Nome de evento não é texto livre de propósito: um nome digitado errado no
 * aplicativo entraria no banco em silêncio e nunca apareceria no painel — é o
 * erro mais chato de achar em telemetria. Aqui o TypeScript recusa antes.
 */
export type Evento =
  | 'signup_completed'
  | 'onboarding_completed'
  | 'company_created'
  | 'development_created'
  | 'simulation_started'
  | 'simulation_step_completed'
  | 'simulation_abandoned'
  | 'proposal_generated'
  | 'proposal_shared'
  | 'user_returned'
  | 'subscription_viewed';

/** Como o evento terminou. Lista curta porque três respostas bastam. */
export type Resultado = 'ok' | 'erro' | 'cancelado';

export interface DetalheEvento {
  /**
   * Onde no fluxo. Rótulo curto do NOSSO vocabulário — `'renda'`,
   * `'entrada'`, `'resultado'` —, nunca algo que o corretor digitou.
   */
  etapa?: string;
  resultado?: Resultado;
  /** Quanto tempo a etapa levou. Use `cronometro()` para medir. */
  duracaoMs?: number;
  /** ID interno (empresa, empreendimento, simulação). Nunca id de terceiro. */
  refId?: string | null;
}

/** Teto igual ao do banco: o rótulo é cortado aqui para não ser recusado lá. */
const MAX_ROTULO = 40;

function rotulo(v: string | undefined): string | null {
  if (!v) return null;
  const limpo = v.trim().toLowerCase().replace(/\s+/g, '_');
  return limpo ? limpo.slice(0, MAX_ROTULO) : null;
}

/**
 * Grava um evento. Dispare e esqueça — não use `await` nas telas.
 *
 * O `void` no retorno é intencional: quem chama não tem nada de útil para fazer
 * com o resultado, e oferecer um `Promise<Result>` convidaria alguém a tratar
 * falha de telemetria como falha de negócio.
 */
export function registrar(evento: Evento, detalhe: DetalheEvento = {}): void {
  void db.analytics
    .registrar({
      evento,
      etapa: rotulo(detalhe.etapa),
      resultado: detalhe.resultado ?? null,
      duracaoMs:
        typeof detalhe.duracaoMs === 'number' && detalhe.duracaoMs >= 0
          ? Math.min(Math.round(detalhe.duracaoMs), 86_400_000)
          : null,
      refId: detalhe.refId ?? null,
    })
    .catch(() => {
      /* Telemetria que falha não vira erro na tela. Ver o cabeçalho. */
    });
}

/**
 * Mede quanto tempo uma etapa levou.
 *
 *   const t = cronometro();
 *   ...
 *   registrar('simulation_step_completed', { etapa: 'renda', duracaoMs: t() });
 *
 * Usa `Date.now()` e não um relógio monotônico porque a diferença entre os dois
 * só apareceria se o relógio do aparelho mudasse no meio da etapa — e para isso
 * já existe o teto de 24 horas no banco.
 */
export function cronometro(): () => number {
  const inicio = Date.now();
  return () => Date.now() - inicio;
}
