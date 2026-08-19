/**
 * Leitura de `developments` compartilhada entre dois repositórios.
 *
 * Mora num módulo à parte porque `SupabaseDevelopmentRepository` (a visão do
 * corretor) e `SupabaseCatalogRepository` (a visão do admin) precisam do MESMO
 * `select` e do mesmo mapeamento. Importar um do outro fecharia um ciclo — o
 * repositório de empreendimentos já importa `fetchAdoptedCompanyIds` do
 * catálogo —, e duplicar o mapper deixaria as duas visões divergirem na
 * primeira coluna nova.
 *
 * ===========================================================================
 * A COLUNA QUE PODE NÃO EXISTIR AINDA
 * ===========================================================================
 * As migrações deste projeto são aplicadas à mão no SQL Editor do Supabase.
 * Isso significa que existe uma janela — entre o deploy do aplicativo e o
 * momento em que alguém roda o SQL — em que o código pede uma coluna que o
 * banco ainda não tem.
 *
 * O PostgREST responde a isso com erro `42703` e **descarta a consulta
 * inteira**. Como `list()` devolve lista vazia quando dá erro, o efeito
 * prático seria brutal e silencioso: os empreendimentos sumiriam de todas as
 * telas do aplicativo — do simulador de poupança ao cadastro — por causa de
 * uma coluna que só o simulador de financiamento usa.
 *
 * Então a leitura degrada: na primeira vez que o banco disser que
 * `unit_value_from` não existe, este módulo passa a montar o `select` sem ela e
 * repete a consulta. O corretor perde um campo opcional em vez de perder o
 * cadastro inteiro, e volta ao normal sozinho assim que a migração for
 * aplicada e o aplicativo recarregado.
 */
import type { Development } from '../types';

/** Ligado quando o banco recusa `unit_value_from` — ver o comentário do topo. */
let semColunaValorInicial = false;

const SELECT_BASE =
  'id, company_id, name, description, delivery_date, manager_name, photo_url, uf, ';
const SELECT_FIM = 'created_at, updated_at, companies(name, is_catalog)';

/**
 * `companies(name, is_catalog)` vem embutido porque `isCatalog` do
 * empreendimento é DERIVADO da empresa: não existe coluna própria no banco.
 */
export function developmentSelect(): string {
  return SELECT_BASE + (semColunaValorInicial ? '' : 'unit_value_from, ') + SELECT_FIM;
}

interface ErroPostgrest {
  code?: string;
  message?: string;
}

/**
 * O erro é "esta coluna não existe"? Se for, liga o modo degradado.
 *
 * A checagem olha o código `42703` do Postgres **e** o nome da coluna na
 * mensagem: o PostgREST nem sempre repassa o código do banco, e cair no
 * fallback por causa de outro erro qualquer esconderia o problema de verdade.
 */
export function ehColunaValorAusente(erro: ErroPostgrest | null | undefined): boolean {
  if (!erro) return false;
  const mensagem = erro.message ?? '';
  if (!mensagem.includes('unit_value_from')) return false;
  if (erro.code === '42703' || /does not exist|não existe/i.test(mensagem)) {
    semColunaValorInicial = true;
    return true;
  }
  return false;
}

/** O pedaço do corpo de escrita referente à coluna — vazio no modo degradado. */
export function payloadValorInicial(valor: number | null | undefined) {
  return semColunaValorInicial ? {} : { unit_value_from: valor ?? null };
}

/**
 * A resposta crua do PostgREST, sem tipo de linha.
 *
 * `data` é `unknown` porque o `select` aqui é montado em tempo de execução — e
 * com string dinâmica o supabase-js não tem como inferir o formato da linha.
 * Quem chama já fazia o `as unknown as DevelopmentJoinRow[]` de qualquer jeito.
 */
interface Resposta {
  data: unknown;
  error: ErroPostgrest | null;
}

/**
 * Roda a consulta e, se ela morrer só por causa da coluna nova, roda de novo
 * sem ela.
 *
 * A segunda tentativa acontece no máximo uma vez por consulta, porque
 * `ehColunaValorAusente` já deixou o modo degradado ligado — a repetição usa um
 * `select` que não menciona mais a coluna.
 */
export async function comFallbackDeColuna(
  consulta: (select: string) => PromiseLike<Resposta>,
): Promise<Resposta> {
  const primeira = await consulta(developmentSelect());
  if (primeira.error && ehColunaValorAusente(primeira.error)) {
    return await consulta(developmentSelect());
  }
  return primeira;
}

export interface DevelopmentJoinRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  delivery_date: string | null;
  manager_name: string | null;
  photo_url: string | null;
  uf: string | null;
  unit_value_from?: number | null;
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
    unitValueFrom: row.unit_value_from ?? null,
    // Empresa do catálogo => empreendimento somente leitura para o corretor.
    isCatalog: row.companies?.is_catalog ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
