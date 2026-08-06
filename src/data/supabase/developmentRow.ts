/**
 * Leitura de `developments` compartilhada entre dois repositórios.
 *
 * Mora num módulo à parte porque `SupabaseDevelopmentRepository` (a visão do
 * corretor) e `SupabaseCatalogRepository` (a visão do admin) precisam do MESMO
 * `select` e do mesmo mapeamento. Importar um do outro fecharia um ciclo — o
 * repositório de empreendimentos já importa `fetchAdoptedCompanyIds` do
 * catálogo —, e duplicar o mapper deixaria as duas visões divergirem na
 * primeira coluna nova.
 */
import type { Development } from '../types';

/**
 * `companies(name, is_catalog)` vem embutido porque `isCatalog` do
 * empreendimento é DERIVADO da empresa: não existe coluna própria no banco.
 */
export const DEVELOPMENT_SELECT =
  'id, company_id, name, description, delivery_date, manager_name, photo_url, uf, ' +
  'created_at, updated_at, companies(name, is_catalog)';

export interface DevelopmentJoinRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  delivery_date: string | null;
  manager_name: string | null;
  photo_url: string | null;
  uf: string | null;
  created_at: string;
  updated_at: string;
  companies: { name: string; is_catalog: boolean } | null;
}

export function mapDevelopment(row: DevelopmentJoinRow): Development {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    companyName: row.companies?.name ?? null,
    description: row.description ?? null,
    deliveryDate: row.delivery_date,
    managerName: row.manager_name,
    uf: row.uf,
    photoUrl: row.photo_url,
    // Empresa do catálogo => empreendimento somente leitura para o corretor.
    isCatalog: row.companies?.is_catalog ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
