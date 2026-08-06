/**
 * Unidades da Federação.
 *
 * Onde isso importa no produto: o corretor cadastra o estado em que atua e
 * passa a ver, no catálogo do sistema, apenas os empreendimentos daquele
 * estado. Um corretor do Maranhão não perde tempo com uma unidade de Fortaleza.
 */

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type UF = (typeof UFS)[number];

const NOMES: Record<UF, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

/** Opções para o `Select`, em ordem alfabética de NOME (é como se procura). */
export const UF_OPTIONS: { value: string; label: string }[] = UFS.map((uf) => ({
  value: uf,
  label: `${uf} — ${NOMES[uf]}`,
})).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

/** `'ma'` -> `'MA'`. `null` quando não é uma UF válida. */
export function normalizeUF(value: string | null | undefined): string | null {
  const clean = (value ?? '').trim().toUpperCase();
  return (UFS as readonly string[]).includes(clean) ? clean : null;
}

export function ufLabel(value: string | null | undefined): string {
  const uf = normalizeUF(value);
  return uf ? `${uf} — ${NOMES[uf as UF]}` : '—';
}

/**
 * O corretor pode trabalhar este empreendimento?
 *
 * Duas aberturas de propósito, para nada sumir da tela por descuido:
 * - corretor **sem UF** cadastrada vê tudo (ele ainda não escolheu);
 * - empreendimento **sem UF** aparece para todos (o admin não restringiu).
 */
export function matchesUF(
  brokerUF: string | null | undefined,
  developmentUF: string | null | undefined,
): boolean {
  const broker = normalizeUF(brokerUF);
  const development = normalizeUF(developmentUF);
  if (!broker || !development) return true;
  return broker === development;
}
