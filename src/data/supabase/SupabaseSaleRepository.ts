import { supabase } from '@/lib/supabase';
import { endOfDay, startOfDay } from '@/features/agenda/dates';
import { resolvePeriod } from '@/features/vendas/period';
import type { SaleRepository } from '../repositories';
import {
  type Result,
  type Sale,
  type SaleFilters,
  type SaleInput,
  type SaleStatus,
  err,
  ok,
} from '../types';

const SELECT =
  'id, simulation_id, lead_id, client_name, client_cpf, client_phone, client_email, ' +
  'company_id, company_name, development_id, development_name, block, unit, ' +
  'sale_value, financed_value, subsidy_value, fgts_value, own_resources_value, ' +
  'commission_pct, commission_value, sale_date, status, distrato_date, distrato_reason, ' +
  'origin_started_at, notes, created_at, updated_at';

/** Tamanho máximo da busca livre enviada ao servidor. */
const QUERY_MAX_LEN = 60;

/** Código do Postgres para violação de índice único. */
const UNIQUE_VIOLATION = '23505';

interface SaleRow {
  id: string;
  simulation_id: string | null;
  lead_id: string | null;
  client_name: string;
  client_cpf: string | null;
  client_phone: string | null;
  client_email: string | null;
  company_id: string | null;
  company_name: string | null;
  development_id: string | null;
  development_name: string | null;
  block: number | string | null;
  unit: string | null;
  sale_value: number | string;
  financed_value: number | string | null;
  subsidy_value: number | string | null;
  fgts_value: number | string | null;
  own_resources_value: number | string | null;
  commission_pct: number | string | null;
  commission_value: number | string | null;
  sale_date: string;
  status: string;
  distrato_date: string | null;
  distrato_reason: string | null;
  origin_started_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SaleWriteRow {
  simulation_id?: string | null;
  lead_id?: string | null;
  client_name?: string;
  client_cpf?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  development_id?: string | null;
  development_name?: string | null;
  block?: number | null;
  unit?: string | null;
  sale_value?: number;
  financed_value?: number | null;
  subsidy_value?: number | null;
  fgts_value?: number | null;
  own_resources_value?: number | null;
  commission_pct?: number | null;
  commission_value?: number | null;
  sale_date?: string;
  status?: SaleStatus;
  distrato_date?: string | null;
  distrato_reason?: string | null;
  origin_started_at?: string | null;
  notes?: string | null;
}

/** O PostgREST devolve `numeric` como string — converte sem inventar valor. */
function toNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapSale(row: SaleRow): Sale {
  return {
    id: row.id,
    simulationId: row.simulation_id,
    leadId: row.lead_id,

    clientName: row.client_name,
    clientCpf: row.client_cpf,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,

    companyId: row.company_id,
    companyName: row.company_name,
    developmentId: row.development_id,
    developmentName: row.development_name,
    block: toNumber(row.block ?? null),
    unit: row.unit,

    saleValue: toNumber(row.sale_value) ?? 0,
    financedValue: toNumber(row.financed_value ?? null),
    subsidyValue: toNumber(row.subsidy_value ?? null),
    fgtsValue: toNumber(row.fgts_value ?? null),
    ownResourcesValue: toNumber(row.own_resources_value ?? null),

    commissionPct: toNumber(row.commission_pct ?? null),
    commissionValue: toNumber(row.commission_value ?? null),

    saleDate: row.sale_date,
    status: (row.status as SaleStatus) ?? 'ativa',
    distratoDate: row.distrato_date,
    distratoReason: row.distrato_reason,

    originStartedAt: row.origin_started_at,

    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Payload completo (insert): todas as colunas, sem exceção. */
function buildInsert(data: SaleInput): Required<SaleWriteRow> {
  return {
    simulation_id: data.simulationId,
    lead_id: data.leadId,
    client_name: data.clientName,
    client_cpf: data.clientCpf,
    client_phone: data.clientPhone,
    client_email: data.clientEmail,
    company_id: data.companyId,
    company_name: data.companyName,
    development_id: data.developmentId,
    development_name: data.developmentName,
    block: data.block,
    unit: data.unit,
    sale_value: data.saleValue,
    financed_value: data.financedValue,
    subsidy_value: data.subsidyValue,
    fgts_value: data.fgtsValue,
    own_resources_value: data.ownResourcesValue,
    commission_pct: data.commissionPct,
    commission_value: data.commissionValue,
    sale_date: data.saleDate,
    status: data.status,
    distrato_date: data.distratoDate,
    distrato_reason: data.distratoReason,
    origin_started_at: data.originStartedAt,
    notes: data.notes,
  };
}

/** Patch parcial: só emite as chaves realmente informadas. */
function buildPatch(patch: Partial<SaleInput>): SaleWriteRow {
  const out: SaleWriteRow = {};
  if (patch.simulationId !== undefined) out.simulation_id = patch.simulationId;
  if (patch.leadId !== undefined) out.lead_id = patch.leadId;
  if (patch.clientName !== undefined) out.client_name = patch.clientName;
  if (patch.clientCpf !== undefined) out.client_cpf = patch.clientCpf;
  if (patch.clientPhone !== undefined) out.client_phone = patch.clientPhone;
  if (patch.clientEmail !== undefined) out.client_email = patch.clientEmail;
  if (patch.companyId !== undefined) out.company_id = patch.companyId;
  if (patch.companyName !== undefined) out.company_name = patch.companyName;
  if (patch.developmentId !== undefined) out.development_id = patch.developmentId;
  if (patch.developmentName !== undefined) out.development_name = patch.developmentName;
  if (patch.block !== undefined) out.block = patch.block;
  if (patch.unit !== undefined) out.unit = patch.unit;
  if (patch.saleValue !== undefined) out.sale_value = patch.saleValue;
  if (patch.financedValue !== undefined) out.financed_value = patch.financedValue;
  if (patch.subsidyValue !== undefined) out.subsidy_value = patch.subsidyValue;
  if (patch.fgtsValue !== undefined) out.fgts_value = patch.fgtsValue;
  if (patch.ownResourcesValue !== undefined) out.own_resources_value = patch.ownResourcesValue;
  if (patch.commissionPct !== undefined) out.commission_pct = patch.commissionPct;
  if (patch.commissionValue !== undefined) out.commission_value = patch.commissionValue;
  if (patch.saleDate !== undefined) out.sale_date = patch.saleDate;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.distratoDate !== undefined) out.distrato_date = patch.distratoDate;
  if (patch.distratoReason !== undefined) out.distrato_reason = patch.distratoReason;
  if (patch.originStartedAt !== undefined) out.origin_started_at = patch.originStartedAt;
  if (patch.notes !== undefined) out.notes = patch.notes;
  return out;
}

/**
 * O filtro `or()` do PostgREST é um texto com vírgulas e parênteses: um valor
 * cru vindo da UI conseguiria fechar o `ilike` e acrescentar condições próprias
 * (por exemplo `,user_id.neq.null`), vazando vendas de outros corretores.
 * Aqui os caracteres de estrutura são REMOVIDOS antes de qualquer interpolação,
 * junto com os curingas do `like`, e o tamanho é limitado.
 */
export function sanitizeSaleQuery(raw: string): string {
  return raw
    .replace(/[,()*\\"%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUERY_MAX_LEN)
    .trim();
}

/** Só os dígitos — usado para casar CPF salvo formatado com busca sem pontos. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * `created_at` dos leads é timestamptz e o filtro chega como data pura
 * (YYYY-MM-DD). As bordas são montadas pelas PARTES LOCAIS da data — nunca por
 * `new Date('YYYY-MM-DD')`, que seria lido como UTC e no Brasil cairia no dia
 * anterior. O fim do dia usa 23:59:59.999 para o último dia do período entrar
 * inteiro (senão a taxa de conversão erra sempre no último dia).
 */
function ymdToLocalDate(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayStartISO(ymd: string): string | null {
  const d = ymdToLocalDate(ymd);
  return d ? startOfDay(d).toISOString() : null;
}

function dayEndISO(ymd: string): string | null {
  const d = ymdToLocalDate(ymd);
  return d ? endOfDay(d).toISOString() : null;
}

export class SupabaseSaleRepository implements SaleRepository {
  async list(userId: string, filters: SaleFilters): Promise<Sale[]> {
    const { from, to } = resolvePeriod(filters);

    let query = supabase.from('sales').select(SELECT).eq('user_id', userId);

    if (from) query = query.gte('sale_date', from);
    if (to) query = query.lte('sale_date', to);
    if (filters.companyId) query = query.eq('company_id', filters.companyId);
    if (filters.developmentId) query = query.eq('development_id', filters.developmentId);
    if (filters.status !== 'todas') query = query.eq('status', filters.status);

    const term = sanitizeSaleQuery(filters.query ?? '');
    if (term) {
      const conditions = [
        `client_name.ilike.%${term}%`,
        `unit.ilike.%${term}%`,
        `client_cpf.ilike.%${term}%`,
      ];
      // CPF pode estar salvo formatado e ser digitado sem pontos (ou o
      // contrário): a coluna gerada client_cpf_digits resolve os dois lados.
      const digits = digitsOnly(term);
      if (digits.length >= 3) conditions.push(`client_cpf_digits.ilike.%${digits}%`);
      query = query.or(conditions.join(','));
    }

    const { data, error } = await query
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as unknown as SaleRow[]).map(mapSale);
  }

  async get(id: string): Promise<Sale | null> {
    const { data, error } = await supabase
      .from('sales')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapSale(data as unknown as SaleRow);
  }

  async getBySimulation(simulationId: string): Promise<Sale | null> {
    const { data, error } = await supabase
      .from('sales')
      .select(SELECT)
      .eq('simulation_id', simulationId)
      .maybeSingle();
    if (error || !data) return null;
    return mapSale(data as unknown as SaleRow);
  }

  async create(userId: string, data: SaleInput): Promise<Result<Sale>> {
    const { data: row, error } = await supabase
      .from('sales')
      .insert({ user_id: userId, ...buildInsert(data) })
      .select(SELECT)
      .single();
    if (error || !row) {
      // Índice único parcial de simulation_id: a simulação já virou venda.
      if (
        error &&
        (error.code === UNIQUE_VIOLATION || error.message.includes('sales_simulation_unique'))
      ) {
        return err('Esta simulação já foi registrada como venda.');
      }
      return err(error?.message ?? 'Falha ao salvar a venda.');
    }
    return ok(mapSale(row as unknown as SaleRow));
  }

  async update(id: string, data: Partial<SaleInput>): Promise<Result<Sale>> {
    const { data: row, error } = await supabase
      .from('sales')
      .update(buildPatch(data))
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao atualizar a venda.');
    return ok(mapSale(row as unknown as SaleRow));
  }

  async setStatus(
    id: string,
    status: SaleStatus,
    extra?: { distratoDate?: string | null; distratoReason?: string | null },
  ): Promise<Result<Sale>> {
    // Voltar para 'ativa' apaga o distrato: manter data/motivo antigos deixaria
    // a venda ativa parecendo distratada nos relatórios.
    const patch: SaleWriteRow =
      status === 'distratada'
        ? {
            status,
            distrato_date: extra?.distratoDate ?? null,
            distrato_reason: extra?.distratoReason ?? null,
          }
        : { status, distrato_date: null, distrato_reason: null };

    const { data: row, error } = await supabase
      .from('sales')
      .update(patch)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao atualizar o status da venda.');
    return ok(mapSale(row as unknown as SaleRow));
  }

  async remove(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }

  async countLeadsInRange(
    userId: string,
    from: string | null,
    to: string | null,
  ): Promise<number> {
    let query = supabase
      .from('leads')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', userId);

    if (from) {
      const start = dayStartISO(from);
      if (start) query = query.gte('created_at', start);
    }
    if (to) {
      const end = dayEndISO(to);
      if (end) query = query.lte('created_at', end);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  }
}
