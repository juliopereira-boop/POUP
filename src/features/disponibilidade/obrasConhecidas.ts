/**
 * O NOME DAS OBRAS DO UAU QUE O POUP JÁ CONHECE.
 *
 * A consulta de obras do UAU devolve só empresa e código ("1/259V"); o nome
 * comercial não vem. Esta lista (a mesma do ALPHA, em 20/10/2026) põe nome nas
 * conhecidas, para o admin achar a obra certa sem decorar código. Obra nova
 * aparece pelo código, e o admin dá o nome na importação.
 *
 * É só rótulo: o vínculo é sempre pela empresa/obra, nunca pelo nome.
 */
export const OBRAS_CONHECIDAS: Record<string, string> = {
  '1/155V': 'Ventos II',
  '1/201V': 'Árvores 3',
  '1/210V': 'Reserva 2 - Mod. I',
  '1/223V': 'Natureza II - Mod. I',
  '1/258V': 'Village Prime Eldorado',
  '1/259V': 'Village Connect I',
  '1/264V': 'Village Parque Ville',
  '1/271V': 'Village das Estrelas',
  '1/273VB': 'Condomínio Oliveiras',
  '1/274VB': 'Village Reserva II - Mod. II',
  '3/127V': 'Village Del Ville II',
  '3/236V': 'Village Del Ville - ITZ',
  '17/02': 'Gran Village Eusébio',
  '36/241V': 'Village Natureza - Mod. I',
  '36/241VB': 'Village Natureza - Mod. II',
};

export function nomeDaObra(empresa: number, obra: string): string | null {
  return OBRAS_CONHECIDAS[`${empresa}/${obra}`] ?? null;
}
