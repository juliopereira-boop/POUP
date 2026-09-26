/**
 * O TEXTO QUE O CÉREBRO DA LIA LÊ.
 *
 * Tudo o que o cérebro procura (palavras-chave, números, datas) é procurado
 * num texto NORMALIZADO: minúsculo e sem acento. Mas o que ele mostra ao
 * corretor ("ganha 3.500" como prova de onde veio a renda) tem que sair do
 * texto ORIGINAL, do jeito que foi digitado.
 *
 * Por isso a normalização aqui troca caractere por caractere, sem mudar o
 * comprimento: a posição 42 do texto normalizado é a posição 42 do original.
 * Uma busca no normalizado devolve, de graça, o trecho certo no original.
 */

/** Minúsculo, sem acento, MESMO comprimento do original. */
export function normalizarMesmoTamanho(texto: string): string {
  let saida = '';
  for (const ch of texto) {
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Um caractere que vira dois (raro: ligaduras) ou nenhum mantém o tamanho
    // com espaço; os de fora do BMP (emoji) ocupam 2 posições no JS.
    if (base.length === ch.length) saida += base;
    else saida += ' '.repeat(ch.length);
  }
  return saida;
}

/** Minúsculo, sem acento, espaços colapsados — para comparar palavras. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Troca um pedaço por espaços, sem mudar posições: "já usei isto". */
export function apagar(texto: string, inicio: number, fim: number): string {
  return texto.slice(0, inicio) + ' '.repeat(Math.max(0, fim - inicio)) + texto.slice(fim);
}

/**
 * O pedaço do texto original em volta de uma posição, no máximo 12 palavras.
 * É a "prova" que a tela mostra embaixo de cada campo capturado.
 */
export function trechoEmVolta(original: string, inicioBruto: number, fimBruto: number, palavras = 12): string {
  // Nunca corta palavra ao meio ("2 semestra is").
  let inicio = inicioBruto;
  let fim = fimBruto;
  while (inicio > 0 && /\S/.test(original[inicio - 1]!) && /\S/.test(original[inicio]!)) inicio -= 1;
  while (fim < original.length && /\S/.test(original[fim]!) && /\S/.test(original[fim - 1] ?? ' ')) fim += 1;
  const antes = original.slice(0, inicio).split(/\s+/).filter(Boolean);
  const meio = original.slice(inicio, fim).trim();
  const depois = original.slice(fim).split(/\s+/).filter(Boolean);
  const nMeio = meio.split(/\s+/).filter(Boolean).length;
  const sobra = Math.max(0, palavras - nMeio);
  const nAntes = Math.min(antes.length, Math.ceil(sobra / 2));
  const nDepois = Math.min(depois.length, sobra - nAntes);
  return [...antes.slice(antes.length - nAntes), meio, ...depois.slice(0, nDepois)]
    .join(' ')
    .replace(/^[,.;:\s]+|[,;:\s]+$/g, '')
    .trim();
}

/**
 * As frases/cláusulas do texto, com as posições. Vírgula separa cláusula,
 * mas não a vírgula decimal ("3,5 mil"): só a que não está entre dígitos.
 */
export function clausulas(normal: string): { inicio: number; fim: number }[] {
  const cortes: number[] = [];
  for (let i = 0; i < normal.length; i++) {
    const c = normal[i];
    if (c === '\n' || c === ';' || c === '!' || c === '?') cortes.push(i);
    else if (c === '.' && !(isDigito(normal[i - 1]) && isDigito(normal[i + 1]))) cortes.push(i);
    else if (c === ',' && !(isDigito(normal[i - 1]) && isDigito(normal[i + 1]))) cortes.push(i);
  }
  const partes: { inicio: number; fim: number }[] = [];
  let inicio = 0;
  for (const c of [...cortes, normal.length]) {
    if (normal.slice(inicio, c).trim()) partes.push({ inicio, fim: c });
    inicio = c + 1;
  }
  return partes;
}

function isDigito(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}
