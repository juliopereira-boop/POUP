/**
 * A MENSAGEM DE ERRO QUE A EDGE FUNCTION ESCREVEU, E NÃO A DO SUPABASE.
 *
 * ===========================================================================
 * O PROBLEMA
 * ===========================================================================
 * `supabase.functions.invoke` devolve `{ data, error }`. Quando a função
 * responde com status 2xx, a mensagem que ela escreveu chega em `data.error` e
 * o aplicativo mostra a frase certa. Quando responde 4xx ou 5xx, `error` vem
 * preenchido com um `FunctionsHttpError` cujo `.message` é sempre a mesma
 * frase genérica — **"Edge Function returned a non-2xx status code"** — e o
 * corpo da resposta, onde está a explicação de verdade, fica escondido em
 * `error.context`.
 *
 * O efeito prático: um limite de uso atingido (429) ou uma falha da Anthropic
 * (502) chegavam ao corretor como uma frase em inglês sobre status HTTP. Um
 * limitador que se explica assim parece defeito, não regra.
 *
 * ===========================================================================
 * POR QUE NÃO RESOLVER DEVOLVENDO 200 EM TUDO
 * ===========================================================================
 * Seria mais curto — e foi o que a prospecção fez, respondendo 200 com um
 * campo `error`. Mas status HTTP correto é o que faz o log do Supabase, o
 * painel e qualquer futura política de retentativa distinguirem "recusei de
 * propósito" (429) de "quebrou" (500). Mentir no status para contornar uma
 * limitação do client troca uma linha de código por uma cegueira permanente na
 * observabilidade.
 */

/** Um erro do `functions.invoke` que carrega a resposta HTTP original. */
interface ErroComResposta {
  message?: string;
  context?: { json?: () => Promise<unknown> };
}

/**
 * Extrai a frase que a Edge Function escreveu no corpo da resposta.
 *
 * `padrao` é usada quando não há corpo legível — função fora do ar, rede caída,
 * resposta que não é JSON. Escreva-a pensando no corretor, não no log.
 */
export async function mensagemDoErro(erro: unknown, padrao: string): Promise<string> {
  const e = erro as ErroComResposta | null;
  if (!e) return padrao;

  const ler = e.context?.json;
  if (typeof ler === 'function') {
    try {
      const corpo = (await ler.call(e.context)) as { error?: unknown } | null;
      const msg = corpo?.error;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    } catch {
      // Corpo ilegível (vazio, HTML de gateway, JSON truncado). Cai no padrão.
    }
  }

  /*
   * A mensagem crua do supabase-js só serve quando NÃO é a frase genérica de
   * status. "Failed to fetch", por exemplo, diz algo de útil: está sem rede.
   */
  const crua = e.message?.trim();
  if (crua && !/non-2xx status code/i.test(crua)) return crua;
  return padrao;
}
