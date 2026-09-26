/**
 * A LIA JÁ SABE O PREÇO.
 *
 * Quando o texto traz empreendimento, bloco e unidade, e o valor não veio, a
 * LIA busca o preço na tabela de preço do empreendimento — a mesma conta que o
 * simulador faz no "Usar tabela de preço" (`precificarBlocos`). O corretor
 * escreve "estrelas bloco 3 apto 204" e o valor da unidade aparece sozinho.
 */
import { db } from '@/data';
import { comPrazo } from '@/features/tabelaPreco/cache';
import { chaveDaUnidade, chaveDoBloco } from '@/features/tabelaPreco/chaves';
import { precificarBlocos } from '@/features/tabelaPreco/preco';

export interface PrecoDaTabela {
  venda: number;
  /** "Setembro", "Julho 2026": de que tabela veio. */
  referencia: string | null;
}

export async function precoPelaTabela(
  developmentId: string,
  bloco: string,
  unidade: string,
): Promise<PrecoDaTabela | null> {
  try {
    const [b, t] = await comPrazo(Promise.all([db.unidades.listarBlocos(developmentId), db.tabelaPreco.carregar(developmentId)]));
    if (!b.ok || !t.ok || !t.data) return null;
    const blocos = precificarBlocos(b.data, t.data);
    const chaveBloco = chaveDoBloco(bloco);
    const chaveUnid = chaveDaUnidade(unidade);
    for (const bl of blocos) {
      if (chaveDoBloco(bl.nome) !== chaveBloco) continue;
      const u = bl.unidades.find((x) => chaveDaUnidade(x.codigo) === chaveUnid);
      if (u?.valorDeVenda) return { venda: u.valorDeVenda, referencia: t.data.referencia || null };
    }
    return null;
  } catch {
    return null;
  }
}
