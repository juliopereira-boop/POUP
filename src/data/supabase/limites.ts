/**
 * TETO EXPLÍCITO NAS LISTAS QUE CRESCEM.
 *
 * ===========================================================================
 * O PROBLEMA: O POSTGREST JÁ CORTA, E CORTA CALADO
 * ===========================================================================
 * Um `select` sem `limit` não devolve tudo. O PostgREST tem um teto próprio de
 * linhas configurado no projeto (`db-max-rows`), e ao alcançá-lo ele devolve as
 * primeiras N linhas **com status 200 e sem nenhum aviso**.
 *
 * O resultado é a pior classe de defeito que existe num CRM: a lista parece
 * completa, o corretor confere e conclui que perdeu leads. Ninguém abre um
 * relatório de erro para isso — a pessoa desconfia do produto e vai embora.
 *
 * Com um teto explícito aqui, o corte deixa de ser um efeito colateral da
 * configuração do servidor e passa a ser uma decisão nossa, escrita, que
 * podemos mostrar na tela quando alcançada.
 *
 * ===========================================================================
 * POR QUE ESTES NÚMEROS
 * ===========================================================================
 * O alvo declarado é aguentar cinco mil corretores no Supabase atual. A conta
 * que importa não é o total de linhas da tabela — o RLS já reduz toda consulta
 * ao `user_id` de quem pediu —, é quanto UM corretor acumula.
 *
 * Um corretor muito ativo faz algumas centenas de leads por ano e algumas
 * dezenas de simulações por mês. Mil é bem acima do teto real de uso de um ano
 * e ainda é uma resposta que o aparelho renderiza sem engasgar. Cinco mil, para
 * as listas que são o histórico da vida profissional dele (vendas, comissões),
 * porque ali cortar é perder registro financeiro.
 *
 * Quando um destes tetos começar a ser alcançado de verdade, a resposta é
 * paginação na tela — não um número maior aqui.
 */

/**
 * Listas operacionais do dia a dia: leads, simulações, compromissos.
 *
 * Ordenadas do mais novo para o mais antigo, então o corte, se acontecer,
 * derruba o passado distante e não o trabalho de agora.
 */
export const LIMITE_LISTA = 1000;

/**
 * Histórico financeiro: vendas, comissões, parcelas.
 *
 * Mais folgado porque aqui uma linha que não aparece é uma comissão que o
 * corretor acha que não recebeu.
 */
export const LIMITE_HISTORICO = 5000;
