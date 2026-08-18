/**
 * A LIA ACHANDO MATERIAL DE VENDA POR VOZ.
 *
 * ===========================================================================
 * A CONVERSA
 * ===========================================================================
 *   LIA:      Qual empreendimento?
 *   corretor: "Connect"
 *   LIA:      Achei. E o que você quer? Book · Posts · Plantas · Vídeos
 *   corretor: "posts"
 *   LIA:      [mostra as mídias da pasta, ele toca e envia]
 *
 * ===========================================================================
 * POR QUE ISTO NÃO USA O MODELO
 * ===========================================================================
 * Aqui não há nada para *interpretar*: existe uma lista fechada de nomes na
 * tela e o corretor falou um deles. Mandar isso para um modelo custaria
 * dinheiro e — o que importa mais — **um segundo de espera** num fluxo cujo
 * valor inteiro é ser mais rápido que tocar em três botões.
 *
 * O casamento é local e instantâneo. E é mais confiável do que parece, porque
 * o problema é fácil: comparar uma fala curta com cinco nomes conhecidos não é
 * a mesma coisa que entender uma negociação inteira.
 *
 * ===========================================================================
 * COMO O CASAMENTO AGUENTA A TRANSCRIÇÃO
 * ===========================================================================
 * O reconhecimento de voz erra acento, junta palavra, troca letra parecida e
 * enfia "o", "a", "do" no meio. Então:
 *
 *   1. normaliza (sem acento, sem pontuação, sem palavra-cola);
 *   2. tenta igualdade exata;
 *   3. tenta um conter o outro ("connect" ↔ "residencial connect");
 *   4. tenta por palavra em comum ("parque aguas" ↔ "parque das águas");
 *   5. por último, distância de edição, para "conect" achar "connect".
 *
 * Empate entre dois candidatos NÃO escolhe: devolve os dois para o corretor
 * desempatar tocando. Escolher no chute é como um assistente perde a confiança
 * de quem usa.
 */

/** Palavras que só atrapalham a comparação. */
const COLA = new Set([
  'o',
  'a',
  'os',
  'as',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'em',
  'no',
  'na',
  'pra',
  'para',
  'quero',
  'queria',
  'me',
  'manda',
  'mostra',
  'abre',
  'ver',
  'the',
  'residencial',
  'condominio',
  'edificio',
  'loteamento',
]);

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    // Tira os acentos: "águas" e "aguas" têm que casar.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function palavrasUteis(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length > 1 && !COLA.has(p));
}

/** Levenshtein simples. As listas são curtas; não vale otimizar. */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0]!;
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j]!;
      linha[j] = Math.min(
        linha[j]! + 1,
        linha[j - 1]! + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = guardado;
    }
  }
  return linha[b.length]!;
}

export interface Candidato<T> {
  item: T;
  nome: string;
}

export interface Casamento<T> {
  /** Um só candidato claro. */
  achado: T | null;
  /** Mais de um plausível: a tela pergunta em vez de chutar. */
  ambiguos: T[];
}

/**
 * Acha, entre `candidatos`, aquele que o corretor falou.
 *
 * A ordem das estratégias é do mais seguro para o mais tolerante, e a primeira
 * que resolver ganha. Isso importa: se a distância de edição viesse antes da
 * palavra em comum, "parque sul" acharia "parque norte" por estar a duas letras
 * de distância.
 */
export function casarPorVoz<T>(fala: string, candidatos: Candidato<T>[]): Casamento<T> {
  const dito = normalizar(fala);
  const ditoUtil = palavrasUteis(fala);
  if (!dito || candidatos.length === 0) return { achado: null, ambiguos: [] };

  const alvos = candidatos.map((c) => ({
    ...c,
    normal: normalizar(c.nome),
    palavras: palavrasUteis(c.nome),
  }));

  // 1. igual
  const exatos = alvos.filter((a) => a.normal === dito);
  if (exatos.length === 1) return { achado: exatos[0]!.item, ambiguos: [] };

  // 2. um contém o outro
  const contidos = alvos.filter(
    (a) => a.normal.includes(dito) || dito.includes(a.normal),
  );
  if (contidos.length === 1) return { achado: contidos[0]!.item, ambiguos: [] };
  if (contidos.length > 1) return { achado: null, ambiguos: contidos.map((c) => c.item) };

  // 3. palavra significativa em comum
  if (ditoUtil.length > 0) {
    const porPalavra = alvos.filter((a) => a.palavras.some((p) => ditoUtil.includes(p)));
    if (porPalavra.length === 1) return { achado: porPalavra[0]!.item, ambiguos: [] };
    if (porPalavra.length > 1) return { achado: null, ambiguos: porPalavra.map((c) => c.item) };
  }

  /*
   * 4. quase igual — o socorro para a transcrição que erra uma letra.
   *
   * A comparação é contra o nome inteiro E contra cada palavra significativa
   * dele, ficando com a menor distância. Sem a parte por palavra, "conect" não
   * acharia "Residencial Connect": comparado com o nome inteiro (19 letras) a
   * distância é enorme, mas comparado com "connect" é 1 — e é exatamente esse
   * o erro que o reconhecimento de voz comete.
   *
   * O limite é relativo ao tamanho do que foi comparado (um erro a cada quatro
   * letras), e não fixo. Fixo seria frouxo demais para nome curto e apertado
   * demais para nome longo.
   */
  const perto = alvos
    .map((a) => {
      const candidatas = [a.normal, ...a.palavras];
      let melhor = Infinity;
      for (const c of candidatas) {
        const d = distancia(dito, c);
        // Só conta se estiver dentro do limite DAQUELA comparação.
        if (d <= Math.max(1, Math.floor(c.length / 4))) melhor = Math.min(melhor, d);
      }
      return { a, d: melhor };
    })
    .filter(({ d }) => Number.isFinite(d))
    .sort((x, y) => x.d - y.d);

  if (perto.length === 1) return { achado: perto[0]!.a.item, ambiguos: [] };
  if (perto.length > 1) {
    // Empate técnico: não chuta.
    if (perto[0]!.d === perto[1]!.d) return { achado: null, ambiguos: perto.map((p) => p.a.item) };
    return { achado: perto[0]!.a.item, ambiguos: [] };
  }

  return { achado: null, ambiguos: [] };
}
