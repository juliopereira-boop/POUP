/**
 * OS CÓDIGOS DAS UNIDADES, GERADOS A PARTIR DOS PAVIMENTOS.
 *
 * ===========================================================================
 * POR QUE O CORRETOR NÃO DIGITA UNIDADE POR UNIDADE
 * ===========================================================================
 * Um prédio de 15 andares com 8 apartamentos por andar tem 120 unidades.
 * Cadastrar uma por uma é o tipo de tarefa que ninguém termina — e cadastro
 * que ninguém termina é cadastro que não existe. O que o corretor sabe de cabeça
 * é a FORMA do bloco: quantos pavimentos, quantas unidades em cada um. É isso
 * que ele informa, e os códigos saem daqui.
 *
 * ===========================================================================
 * A REGRA DE NUMERAÇÃO
 * ===========================================================================
 * O pavimento 1 é o TÉRREO. O código da unidade é o ANDAR seguido da posição
 * com dois dígitos — e o andar do térreo é zero:
 *
 *     pavimento 1 (térreo), 4 unidades   →  001  002  003  004
 *     pavimento 2 (1º andar), 4 unidades →  101  102  103  104
 *     pavimento 11 (10º andar)           →  1001 1002 ...
 *
 * É a convenção das construtoras brasileiras, e é a que aparece nas tabelas de
 * preço — o que importa, porque a atualização de preços vai casar a unidade da
 * tabela com a unidade daqui pelo código.
 *
 * ===========================================================================
 * POR QUE NO MÁXIMO 99 UNIDADES POR PAVIMENTO
 * ===========================================================================
 * Com dois dígitos fixos para a posição, o código é inequívoco por construção:
 * "1001" só pode ser o 10º andar, unidade 01. Com três dígitos ele passaria a
 * ser também o 1º andar, unidade 001 — e dois apartamentos diferentes com o
 * mesmo código é exatamente o erro que faria a tabela de preço atualizar a
 * unidade errada. Nenhum andar de verdade tem cem apartamentos; um loteamento
 * com mais de 99 lotes numa quadra se divide em mais de uma quadra.
 *
 * Mesmo assim a geração confere a unicidade no fim. Não custa nada, e se um dia
 * alguém mexer na regra acima, o erro aparece aqui e não no banco.
 */

export interface Pavimento {
  /** O número que o corretor digita. 1 = térreo. */
  numero: number;
  /** Quantas unidades existem neste pavimento. */
  unidades: number;
}

export interface UnidadeGerada {
  codigo: string;
  pavimento: number;
  /** Posição dentro do bloco, do térreo para cima: é a ordem da lista. */
  ordem: number;
}

export const LIMITES = {
  pavimento: 200,
  unidadesPorPavimento: 99,
  unidadesPorBloco: 2000,
  blocos: 50,
  nomeBloco: 60,
} as const;

/** O primeiro pavimento de um bloco novo. É o exemplo que se vê em quase toda obra. */
export const PAVIMENTO_INICIAL: Pavimento = { numero: 1, unidades: 4 };

/** O andar é o prefixo do código. O térreo — pavimento 1 — é o andar zero. */
export function andarDoPavimento(numero: number): number {
  return numero - 1;
}

export function codigoDaUnidade(pavimento: number, posicao: number): string {
  return `${andarDoPavimento(pavimento)}${String(posicao).padStart(2, '0')}`;
}

export function rotuloDoPavimento(numero: number): string {
  return numero === 1 ? 'Térreo' : `${andarDoPavimento(numero)}º andar`;
}

function inteiroEntre(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

export type ResultadoGeracao =
  | { ok: true; unidades: UnidadeGerada[] }
  | { ok: false; erro: string };

/**
 * Transforma a forma do bloco na lista de unidades.
 *
 * Os pavimentos saem em ordem crescente mesmo que tenham sido informados fora
 * de ordem: o corretor pode inserir o térreo depois, e a lista final não pode
 * depender da ordem em que ele pensou.
 */
export function gerarUnidades(pavimentos: Pavimento[]): ResultadoGeracao {
  if (pavimentos.length === 0) {
    return { ok: false, erro: 'Adicione pelo menos um pavimento.' };
  }

  const vistos = new Set<number>();
  for (const p of pavimentos) {
    if (!inteiroEntre(p.numero, 1, LIMITES.pavimento)) {
      return {
        ok: false,
        erro: `O número do pavimento precisa ser um inteiro entre 1 e ${LIMITES.pavimento}.`,
      };
    }
    if (vistos.has(p.numero)) {
      return { ok: false, erro: `O pavimento ${p.numero} aparece duas vezes.` };
    }
    vistos.add(p.numero);
    if (!inteiroEntre(p.unidades, 1, LIMITES.unidadesPorPavimento)) {
      return {
        ok: false,
        erro: `O pavimento ${p.numero} precisa ter entre 1 e ${LIMITES.unidadesPorPavimento} unidades.`,
      };
    }
  }

  const total = pavimentos.reduce((s, p) => s + p.unidades, 0);
  if (total > LIMITES.unidadesPorBloco) {
    return {
      ok: false,
      erro: `Um bloco pode ter no máximo ${LIMITES.unidadesPorBloco.toLocaleString('pt-BR')} unidades.`,
    };
  }

  const unidades: UnidadeGerada[] = [];
  const ordenados = [...pavimentos].sort((a, b) => a.numero - b.numero);
  for (const p of ordenados) {
    for (let posicao = 1; posicao <= p.unidades; posicao++) {
      unidades.push({
        codigo: codigoDaUnidade(p.numero, posicao),
        pavimento: p.numero,
        ordem: unidades.length,
      });
    }
  }

  const codigos = new Set(unidades.map((u) => u.codigo));
  if (codigos.size !== unidades.length) {
    return { ok: false, erro: 'Dois pavimentos geraram o mesmo código de unidade.' };
  }

  return { ok: true, unidades };
}

/**
 * O pavimento seguinte, já preenchido.
 *
 * Copia a quantidade do último porque é o caso comum: num prédio, quase todo
 * andar repete o de baixo. O corretor só mexe quando o andar é diferente.
 */
export function proximoPavimento(pavimentos: Pavimento[]): Pavimento {
  if (pavimentos.length === 0) return PAVIMENTO_INICIAL;
  const ultimo = pavimentos.reduce((a, b) => (b.numero > a.numero ? b : a));
  return { numero: ultimo.numero + 1, unidades: ultimo.unidades };
}

/**
 * Completa os pavimentos até `ate`, repetindo a quantidade do último.
 *
 * É o atalho de um prédio inteiro: térreo com 4, "repetir até o 15" e está
 * feito. Se `ate` não passa do último pavimento, nada muda — encolher o bloco
 * é remover pavimento, uma decisão que merece ser feita de propósito.
 */
export function repetirAte(pavimentos: Pavimento[], ate: number): Pavimento[] {
  if (!inteiroEntre(ate, 1, LIMITES.pavimento)) return pavimentos;
  const resultado = [...pavimentos];
  let proximo = proximoPavimento(resultado);
  while (proximo.numero <= ate) {
    resultado.push(proximo);
    proximo = proximoPavimento(resultado);
  }
  return resultado;
}

/**
 * O caminho de volta: das unidades salvas para a forma do bloco.
 *
 * O banco guarda só as unidades, que são o que existe de fato. A forma é
 * reconstruída contando quantas há em cada pavimento — assim não existe uma
 * segunda fonte de verdade que possa discordar da primeira.
 */
export function pavimentosDasUnidades(unidades: { pavimento: number }[]): Pavimento[] {
  const contagem = new Map<number, number>();
  for (const u of unidades) contagem.set(u.pavimento, (contagem.get(u.pavimento) ?? 0) + 1);
  return [...contagem.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, qtd]) => ({ numero, unidades: qtd }));
}

/** "Bloco 1", "Bloco 2"... pulando os nomes que já existem. */
export function proximoNomeDeBloco(nomesExistentes: string[]): string {
  const usados = new Set(nomesExistentes.map((n) => n.trim().toLowerCase()));
  let n = nomesExistentes.length + 1;
  while (usados.has(`bloco ${n}`)) n++;
  return `Bloco ${n}`;
}

/** Uma linha da prévia: "Térreo · 001 a 004 · 4 unidades". */
export function resumoDoPavimento(p: Pavimento): {
  rotulo: string;
  primeiro: string;
  ultimo: string;
} {
  return {
    rotulo: rotuloDoPavimento(p.numero),
    primeiro: codigoDaUnidade(p.numero, 1),
    ultimo: codigoDaUnidade(p.numero, p.unidades),
  };
}
