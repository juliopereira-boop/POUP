/**
 * APAGAR O QUE FICOU NO APARELHO.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * `supabase.auth.signOut()` limpa o token da sessão e mais nada. Tudo o que o
 * POUP guardou por conta própria — rascunho de simulação, consentimentos,
 * prefill da poupança, o cache da antiga prospecção — continua no
 * AsyncStorage depois de sair da conta.
 *
 * Num CRM isso é grave: o aparelho pode ser compartilhado, vendido ou
 * assistido. Quem sai da conta espera que os dados do cliente saiam junto, e
 * quem **exclui** a conta tem esse direito por lei — a LGPD não faz exceção
 * para "ficou só no celular".
 *
 * Também é o conserto de um achado da auditoria: o cache
 * `prospect:<userId>` sobrevivia ao logout e à exclusão da conta, guardando
 * nome e telefone de terceiros indefinidamente. A prospecção saiu do produto,
 * mas o cache continua nos aparelhos que já rodaram a versão antiga — e por
 * isso ele é apagado aqui, e não só esquecido.
 *
 * ===========================================================================
 * LISTA EXPLÍCITA, NÃO `clear()`
 * ===========================================================================
 * `AsyncStorage.clear()` seria mais curto e está errado: ele apagaria também o
 * tema escolhido e o aviso de instalação já dispensado, que não são dados de
 * ninguém e cuja perda só irrita. Pior: apagaria chaves de bibliotecas de
 * terceiros que não são nossas para apagar.
 *
 * Então a lista é explícita. **Ao criar uma chave nova em `sessionStorage`,
 * acrescente-a aqui.** Uma chave que guarda dado de cliente e não está nesta
 * lista é um vazamento silencioso.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sessionStorage } from './storage';

/** Chaves de prefixo fixo: apagadas sempre, independentemente de quem sai. */
const CHAVES_FIXAS = [
  // Rascunhos do simulador de financiamento: renda, CPF e nome do cliente.
  'poup.financiamento.rascunho.v1',
  'poup.financiamento.draft',
  // Rascunhos do simulador de poupança: valor do imóvel, proponentes, fluxo.
  'poup.simulador.draft',
  'poup.simulador.edit.draft',
  // O que atravessa do financiamento para a poupança.
  'poup.simulador.prefill.v1',
  // Consentimentos: precisam ser pedidos de novo para o próximo usuário do
  // aparelho. Consentimento herdado de outra pessoa não é consentimento.
  'poup.scan.aiConsent.v1',
  'poup.lia.consent.v1',
  'poup.lia.consentimento',
  // Miniaturas de material de venda (índice e blobs).
  'poup.material.thumbs.v1',
  // Última visita, usada para medir retorno.
  'poup.analytics.ultimaVisita.v1',
];

/*
 * O que NÃO entra na lista, de propósito: `poup.theme` e
 * `poup.install.dismissed.v1`. São preferências do aparelho, não dado de
 * ninguém, e apagá-las só faz o app parecer quebrado depois do logout.
 */

/**
 * Prefixos de chaves que terminam com o id do usuário.
 *
 * `prospect:` está aqui por dívida: a prospecção não existe mais, mas o cache
 * continua nos aparelhos que rodaram a versão anterior, com nome e telefone de
 * pessoas que nunca pediram contato. Some no primeiro logout depois desta
 * versão. Não remova esta entrada antes de ter certeza de que ninguém mais
 * abre o app numa versão antiga.
 */
const PREFIXOS = ['prospect:', 'poup.material.thumb.'];

/**
 * Apaga os dados locais do usuário.
 *
 * Nunca lança: é chamada no caminho de sair da conta e no de excluir a conta, e
 * em nenhum dos dois uma falha de armazenamento pode impedir a ação principal.
 * O pior caso é sobrar lixo no aparelho — ruim, mas melhor do que prender
 * alguém numa conta que ele pediu para deixar.
 */
export async function limparDadosLocais(userId?: string | null): Promise<void> {
  try {
    await Promise.all(CHAVES_FIXAS.map((k) => sessionStorage.removeItem(k)));
  } catch {
    /* segue para os prefixos: cada bloco falha por conta própria. */
  }

  try {
    /*
     * `getAllKeys` para varrer os prefixos: o id do usuário resolve
     * `prospect:<id>`, mas o cache de miniatura tem o caminho do arquivo no
     * nome e não dá para reconstruir. Varrer é o único jeito de não deixar
     * nada para trás.
     */
    const todas = await AsyncStorage.getAllKeys();
    const alvo = todas.filter(
      (k) => PREFIXOS.some((p) => k.startsWith(p)) || (userId ? k.includes(userId) : false),
    );
    if (alvo.length > 0) await AsyncStorage.multiRemove(alvo);
  } catch {
    /* Sem armazenamento não há o que apagar. */
  }
}
