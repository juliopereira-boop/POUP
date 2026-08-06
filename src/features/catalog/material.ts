/**
 * Onde o material de venda de uma empresa mora no Storage.
 *
 * Duas raízes possíveis, e a diferença importa:
 * - material do próprio corretor  -> `<userId>/...`  (conta dele, cota dele)
 * - material do catálogo do POUP  -> `catalog/...`   (admin escreve, adotantes leem)
 *
 * Centralizado aqui porque a escolha da raiz é uma REGRA, não um detalhe de
 * tela: se uma tela montar o caminho na mão e errar, ou o corretor não acha o
 * material que o admin subiu, ou tenta escrever numa pasta em que não tem
 * permissão e leva um erro sem explicação.
 */
import type { Company } from '@/data/types';

/** Primeira pasta do material do catálogo. Precisa casar com a policy do Storage. */
export const CATALOG_MATERIAL_ROOT = 'catalog';

/**
 * A raiz do material da empresa.
 *
 * @param company A empresa selecionada. `null` quando nada está selecionado.
 * @param userId  O corretor logado.
 */
export function materialRoot(company: Company | null, userId: string): string {
  return company?.isCatalog ? CATALOG_MATERIAL_ROOT : userId;
}

/**
 * O corretor pode SUBIR/APAGAR material nesta empresa.
 *
 * Material do catálogo é mantido pelo admin: para os outros a pasta é apenas
 * leitura. A trava real está na policy do Storage — isto serve para a tela não
 * oferecer um botão que vai falhar.
 */
export function canEditMaterial(company: Company | null, isAdmin: boolean): boolean {
  if (!company) return false;
  return company.isCatalog ? isAdmin : true;
}
