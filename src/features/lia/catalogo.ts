/**
 * DO NOME FALADO PARA O CADASTRO.
 *
 * ===========================================================================
 * POR QUE ISTO NÃO É TRABALHO DO MODELO
 * ===========================================================================
 * A primeira versão mandava ao modelo a lista de empreendimentos com os UUIDs
 * e pedia que ele devolvesse o id. Duas coisas davam errado, e as duas eram
 * previsíveis:
 *
 *   1. **Copiar um UUID é a tarefa que um modelo de linguagem faz pior.** Um
 *      dígito trocado no meio de 36 caracteres vira um campo fantasma: a tela
 *      mostra "capturado", o simulador não acha o cadastro e o corretor
 *      descobre na hora de gerar o PDF.
 *   2. **Custava caro à toa.** Cada linha `id — nome — construtora` gasta ~25
 *      tokens; só o nome gasta ~4. Num catálogo de 40 empreendimentos, é a
 *      diferença entre 1.000 e 160 tokens **em toda chamada**.
 *
 * Hoje o modelo devolve o NOME, que é o que ele acerta, e o casamento com o
 * cadastro acontece aqui — local, instantâneo, determinístico e testável.
 * `casarPorVoz` já resolvia exatamente este problema para o material de vendas;
 * é a mesma função, porque é o mesmo problema.
 *
 * ===========================================================================
 * NA DÚVIDA, NÃO PREENCHE — MAS AVISA
 * ===========================================================================
 * Um empreendimento errado contamina a proposta inteira (empresa, gerente,
 * regra de comissão, prazo máximo saem todos dele). Então: nome que não casa
 * com ninguém, ou que casa com dois, **não vira campo**. O corretor recebe uma
 * frase dizendo o que foi ouvido e por que não deu — que é muito melhor do que
 * um campo em branco sem explicação, e infinitamente melhor que o cadastro
 * errado preenchido em silêncio.
 */
import { casarPorVoz, normalizar } from './materialPorVoz';

export interface ItemCatalogo {
  id: string;
  nome: string;
}

export interface Resolucao {
  /** O id do cadastro, ou `null` quando não deu para decidir com segurança. */
  id: string | null;
  /** Frase para o corretor quando não deu. `null` quando resolveu. */
  aviso: string | null;
}

/**
 * Acha o cadastro que o modelo quis dizer ao devolver `nomeDito`.
 *
 * O modelo é instruído a copiar o nome exatamente como está na lista — e aí a
 * primeira estratégia de `casarPorVoz` (igualdade) resolve sem esforço. As
 * outras estratégias existem para quando ele devolve o que OUVIU em vez do que
 * está na lista ("o connect", "conect"), que acontece e é justamente o caso que
 * o corretor reclamou.
 */
export function resolverDoCatalogo(nomeDito: string, itens: ItemCatalogo[]): Resolucao {
  const dito = nomeDito.trim();
  if (!dito) return { id: null, aviso: null };

  if (itens.length === 0) {
    return { id: null, aviso: `Ouvi "${dito}", mas não há nada cadastrado para casar.` };
  }

  const { achado, ambiguos } = casarPorVoz(
    dito,
    itens.map((i) => ({ item: i, nome: i.nome })),
  );

  if (achado) return { id: achado.id, aviso: null };

  if (ambiguos.length > 1) {
    const nomes = ambiguos.map((i) => i.nome).join(', ');
    return { id: null, aviso: `"${dito}" pode ser ${nomes}. Diga o nome completo.` };
  }

  return { id: null, aviso: `Não achei "${dito}" no seu cadastro.` };
}

/**
 * As palavras dos nomes do catálogo, para o gatilho local reconhecê-las.
 *
 * ISTO CORRIGE UM BURACO REAL: o corretor diz "é o connect" e o trecho não tem
 * dígito nenhum nem palavra do vocabulário do negócio — o filtro de custo
 * descartava a janela e o modelo nunca via o nome do empreendimento. O nome
 * cadastrado é, por definição, uma palavra que importa nesta conversa.
 *
 * Só palavras com mais de três letras: "I", "II", "do", "das" apareceriam em
 * qualquer frase e transformariam o filtro num carimbo.
 */
export function vocabularioDoCatalogo(nomes: string[]): Set<string> {
  const palavras = new Set<string>();
  for (const nome of nomes) {
    for (const p of normalizar(nome).split(' ')) {
      if (p.length > 3) palavras.add(p);
    }
  }
  return palavras;
}
