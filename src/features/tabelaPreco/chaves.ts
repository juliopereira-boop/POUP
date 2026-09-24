/**
 * COMO A TABELA DA CONSTRUTORA E O CADASTRO DO POUP SE RECONHECEM.
 *
 * A tabela escreve "BL 02 APTO 001"; o corretor cadastrou o bloco como
 * "Bloco 2" e o gerador numerou a unidade "001". Para os dois lados falarem da
 * mesma unidade, cada um é reduzido à sua CHAVE: o bloco vira "2" e a unidade
 * vira "1". É por essa chave que o de-para das vagas acontece — e ele é refeito
 * a cada leitura, então cadastrar ou mudar blocos depois de enviar a tabela
 * não exige enviar a tabela de novo.
 */

/** Maiúsculas, sem acento, espaços comuns. "1º" vira "1O" (NFKD). */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .toUpperCase();
}

/**
 * O nome do bloco reduzido ao que o identifica.
 *
 * "BL 02", "Bloco 2", "BLOCO 02" e "2" viram "2". Nome sem número ("Torre A")
 * vira "A" — e só casa com outro "A".
 */
export function chaveDoBloco(nome: string): string {
  const semPrefixo = normalizar(nome)
    .trim()
    .replace(/^(?:BLOCO|BL|TORRE|QUADRA|QD)\.?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /^\d+$/.test(semPrefixo) ? String(Number.parseInt(semPrefixo, 10)) : semPrefixo;
}

/**
 * "001" e "1" são a mesma unidade? São — a numeração do gerador nunca produz
 * dois códigos com o mesmo número (ver `gerador.ts`). Códigos com letra
 * precisam ser iguais.
 */
export function chaveDaUnidade(codigo: string): string {
  const c = normalizar(codigo).trim();
  return /^\d+$/.test(c) ? String(Number.parseInt(c, 10)) : c;
}

export function chaveDaUnidadeNoBloco(bloco: string, unidade: string): string {
  return `${chaveDoBloco(bloco)}|${chaveDaUnidade(unidade)}`;
}
