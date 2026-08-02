import { supabase } from '@/lib/supabase';
import { dateKey } from '@/features/agenda/dates';
import { resolvePeriod } from '@/features/vendas/period';
import type { CommissionRepository } from '../repositories';
import {
  type Commission,
  type CommissionCampaign,
  type CommissionCampaignInput,
  type CommissionFilters,
  type CommissionInstallment,
  type CommissionInstallmentStatus,
  type CommissionRule,
  type CommissionRuleInput,
  type CommissionSource,
  type CommissionWithInstallments,
  type InvoiceStatus,
  type Result,
  type SaleFilters,
  err,
  ok,
} from '../types';

const RULE_SELECT =
  'id, company_id, default_pct, installments_count, installments_split, ' +
  'first_payment_days, interval_days, notes, created_at, updated_at';

const CAMPAIGN_SELECT = 'id, company_id, name, pct, starts_on, ends_on, created_at';

const COMMISSION_SELECT =
  'id, sale_id, company_id, company_name, development_name, client_name, ' +
  'sale_value, sale_date, pct, source, campaign_name, total_value, notes, ' +
  'created_at, updated_at';

const INSTALLMENT_SELECT =
  'id, commission_id, number, due_date, value, status, paid_date, paid_value, ' +
  'invoice_status, invoice_number, invoice_url, invoice_issued_at, notes';

/** Comissão + parcelas em uma única ida ao servidor (embed do PostgREST). */
const COMMISSION_WITH_INSTALLMENTS_SELECT =
  `${COMMISSION_SELECT}, commission_installments(${INSTALLMENT_SELECT})`;

/** Tamanho máximo da busca livre enviada ao servidor. */
const QUERY_MAX_LEN = 60;

/** Código do Postgres para violação de índice único. */
const UNIQUE_VIOLATION = '23505';

/* ------------------------------------------------------------------------- *
 * Linhas do banco
 * ------------------------------------------------------------------------- */

interface RuleRow {
  id: string;
  company_id: string;
  default_pct: number | string;
  installments_count: number | string;
  installments_split: unknown;
  first_payment_days: number | string;
  interval_days: number | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CampaignRow {
  id: string;
  company_id: string;
  name: string;
  pct: number | string;
  starts_on: string;
  ends_on: string;
  created_at: string;
}

interface CommissionRow {
  id: string;
  sale_id: string;
  company_id: string | null;
  company_name: string | null;
  development_name: string | null;
  client_name: string;
  sale_value: number | string;
  sale_date: string;
  pct: number | string;
  source: string;
  campaign_name: string | null;
  total_value: number | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InstallmentRow {
  id: string;
  commission_id: string;
  number: number | string;
  due_date: string;
  value: number | string;
  status: string;
  paid_date: string | null;
  paid_value: number | string | null;
  invoice_status: string;
  invoice_number: string | null;
  invoice_url: string | null;
  invoice_issued_at: string | null;
  notes: string | null;
}

/** Comissão com as parcelas embutidas, como o embed devolve. */
type CommissionRowWithInstallments = CommissionRow & {
  commission_installments: InstallmentRow[] | null;
};

interface InstallmentWriteRow {
  number?: number;
  due_date?: string;
  value?: number;
  status?: CommissionInstallmentStatus;
  paid_date?: string | null;
  paid_value?: number | null;
  invoice_status?: InvoiceStatus;
  invoice_number?: string | null;
  invoice_url?: string | null;
  invoice_issued_at?: string | null;
  notes?: string | null;
}

/* ------------------------------------------------------------------------- *
 * Conversões
 * ------------------------------------------------------------------------- */

/** O PostgREST devolve `numeric` como string — converte sem inventar valor. */
function toNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * `installments_split` é jsonb: no papel é `number[]`, na prática pode voltar
 * qualquer coisa (linha antiga, edição manual no SQL Editor). Só um array de
 * números finitos é aceito; qualquer outra forma vira `null`, que a UI já
 * entende como "divide igualmente".
 */
function toSplit(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value
    .map((item) => (typeof item === 'number' || typeof item === 'string' ? toNumber(item) : null))
    .filter((n): n is number => n !== null);
  return parsed.length === value.length && parsed.length > 0 ? parsed : null;
}

function mapRule(row: RuleRow): CommissionRule {
  return {
    companyId: row.company_id,
    defaultPct: toNumber(row.default_pct) ?? 0,
    installmentsCount: toNumber(row.installments_count) ?? 1,
    installmentsSplit: toSplit(row.installments_split),
    firstPaymentDays: toNumber(row.first_payment_days) ?? 0,
    intervalDays: toNumber(row.interval_days) ?? 0,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function mapCampaign(row: CampaignRow): CommissionCampaign {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    pct: toNumber(row.pct) ?? 0,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    createdAt: row.created_at,
  };
}

function mapCommission(row: CommissionRow): Commission {
  return {
    id: row.id,
    saleId: row.sale_id,
    companyId: row.company_id,
    companyName: row.company_name,
    developmentName: row.development_name,
    clientName: row.client_name,
    saleValue: toNumber(row.sale_value) ?? 0,
    saleDate: row.sale_date,
    pct: toNumber(row.pct) ?? 0,
    source: (row.source as CommissionSource) ?? 'padrao',
    campaignName: row.campaign_name,
    totalValue: toNumber(row.total_value) ?? 0,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInstallment(row: InstallmentRow): CommissionInstallment {
  return {
    id: row.id,
    commissionId: row.commission_id,
    number: toNumber(row.number) ?? 0,
    dueDate: row.due_date,
    value: toNumber(row.value) ?? 0,
    status: (row.status as CommissionInstallmentStatus) ?? 'pendente',
    paidDate: row.paid_date,
    paidValue: toNumber(row.paid_value ?? null),
    invoiceStatus: (row.invoice_status as InvoiceStatus) ?? 'nao_emitida',
    invoiceNumber: row.invoice_number,
    invoiceUrl: row.invoice_url,
    invoiceIssuedAt: row.invoice_issued_at,
    notes: row.notes,
  };
}

/** Parcelas sempre na ordem de vencimento — a tela numera 1, 2, 3… */
function byNumber(a: CommissionInstallment, b: CommissionInstallment): number {
  return a.number - b.number;
}

function mapRowWithInstallments(row: CommissionRowWithInstallments): CommissionWithInstallments {
  return {
    commission: mapCommission(row),
    installments: (row.commission_installments ?? []).map(mapInstallment).sort(byNumber),
  };
}

/* ------------------------------------------------------------------------- *
 * Escrita
 * ------------------------------------------------------------------------- */

type NewInstallment = Omit<CommissionInstallment, 'id' | 'commissionId'>;

function buildInstallmentInsert(
  userId: string,
  commissionId: string,
  data: NewInstallment,
): Required<InstallmentWriteRow> & { user_id: string; commission_id: string } {
  return {
    user_id: userId,
    commission_id: commissionId,
    number: data.number,
    due_date: data.dueDate,
    value: data.value,
    // Coerência que o banco também exige (check paid_date_required): parcela
    // marcada como recebida sem data de recebimento não existe.
    status: data.status,
    paid_date: data.status === 'recebida' ? (data.paidDate ?? todayYmd()) : null,
    paid_value: data.status === 'recebida' ? (data.paidValue ?? data.value) : null,
    invoice_status: data.invoiceStatus,
    invoice_number: data.invoiceNumber,
    invoice_url: data.invoiceUrl,
    invoice_issued_at: data.invoiceIssuedAt,
    notes: data.notes,
  };
}

/** Patch parcial: só emite as chaves realmente informadas. */
function buildInstallmentPatch(patch: Partial<NewInstallment>): InstallmentWriteRow {
  const out: InstallmentWriteRow = {};
  if (patch.number !== undefined) out.number = patch.number;
  if (patch.dueDate !== undefined) out.due_date = patch.dueDate;
  if (patch.value !== undefined) out.value = patch.value;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.paidDate !== undefined) out.paid_date = patch.paidDate;
  if (patch.paidValue !== undefined) out.paid_value = patch.paidValue;
  if (patch.invoiceStatus !== undefined) out.invoice_status = patch.invoiceStatus;
  if (patch.invoiceNumber !== undefined) out.invoice_number = patch.invoiceNumber;
  if (patch.invoiceUrl !== undefined) out.invoice_url = patch.invoiceUrl;
  if (patch.invoiceIssuedAt !== undefined) out.invoice_issued_at = patch.invoiceIssuedAt;
  if (patch.notes !== undefined) out.notes = patch.notes;
  return out;
}

/* ------------------------------------------------------------------------- *
 * Datas e busca
 * ------------------------------------------------------------------------- */

/**
 * ARMADILHA DE FUSO (já custou bugs neste repo): no Brasil (UTC-3)
 * `new Date('2026-03-01')` é lido como UTC e vira 28/02 local, e
 * `toISOString().slice(0, 10)` adianta o dia depois das 21h. Hoje é sempre
 * montado por PARTES LOCAIS — `dateKey` usa getFullYear/getMonth/getDate.
 */
function todayYmd(): string {
  return dateKey(new Date());
}

/**
 * `resolvePeriod` recebe `SaleFilters`, mas usa apenas `preset`/`from`/`to` —
 * exatamente os campos que `CommissionFilters` também tem (e
 * `CommissionPeriodPreset` é o mesmo tipo de `SalePeriodPreset`). A ponte é
 * feita com um objeto `SaleFilters` completo e tipado, para não duplicar a
 * lógica de período nem recorrer a `as any`.
 */
function resolveCommissionPeriod(filters: CommissionFilters): { from: string | null; to: string | null } {
  const asSaleFilters: SaleFilters = {
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    companyId: filters.companyId,
    developmentId: null,
    status: 'todas',
    query: '',
  };
  return resolvePeriod(asSaleFilters);
}

/**
 * O filtro `or()` do PostgREST é um texto com vírgulas e parênteses: um valor
 * cru vindo da UI conseguiria fechar o `ilike` e acrescentar condições próprias
 * (por exemplo `,user_id.neq.null`), vazando comissões de outros corretores.
 * Aqui os caracteres de estrutura são REMOVIDOS antes de qualquer interpolação,
 * junto com os curingas do `like`, e o tamanho é limitado.
 */
export function sanitizeCommissionQuery(raw: string): string {
  return raw
    .replace(/[,()*\\"%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUERY_MAX_LEN)
    .trim();
}

/**
 * Aplica os filtros que são de PARCELA (status, atraso e o período quando a base
 * é vencimento/recebimento).
 *
 * Por que no cliente: no PostgREST, filtro em tabela embutida NÃO filtra o pai —
 * `commission_installments.status=eq.recebida` esconde parcelas mas mantém a
 * comissão na resposta (e, com `!inner`, o comportamento passa a depender da
 * versão do servidor). Como as parcelas precisam vir narrowed para os KPIs
 * somarem só o que passou pelo filtro, e o volume por corretor é baixo (centenas
 * de linhas), a decisão é: UMA consulta em `commissions` com as parcelas
 * embutidas (sem N+1) e o recorte das parcelas feito aqui, com semântica
 * explícita e sob controle.
 */
function filterInstallments(
  installments: CommissionInstallment[],
  filters: CommissionFilters,
  period: { from: string | null; to: string | null },
  today: string,
): CommissionInstallment[] {
  return installments.filter((inst) => {
    if (filters.status !== 'todas' && inst.status !== filters.status) return false;
    // Atrasada: venceu, não foi recebida e não foi cancelada.
    if (filters.onlyLate && !(inst.status === 'pendente' && inst.dueDate < today)) return false;

    if (filters.basis === 'vencimento') {
      if (period.from && inst.dueDate < period.from) return false;
      if (period.to && inst.dueDate > period.to) return false;
    }
    if (filters.basis === 'recebimento') {
      // Sem recebimento não há data para o período comparar: fica fora.
      if (!inst.paidDate) return false;
      if (period.from && inst.paidDate < period.from) return false;
      if (period.to && inst.paidDate > period.to) return false;
    }
    return true;
  });
}

/** `true` quando algum filtro de parcela está ativo. */
function hasInstallmentFilter(filters: CommissionFilters): boolean {
  return filters.status !== 'todas' || filters.onlyLate || filters.basis !== 'venda';
}

export class SupabaseCommissionRepository implements CommissionRepository {
  /* --- regras, no cadastro da construtora ------------------------------- */

  /** `null` quando a construtora não tem regra: a UI cai no `DEFAULT_COMMISSION_RULE`. */
  async getRule(companyId: string): Promise<CommissionRule | null> {
    const { data, error } = await supabase
      .from('commission_rules')
      .select(RULE_SELECT)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error || !data) return null;
    return mapRule(data as unknown as RuleRow);
  }

  /** Upsert por `company_id` (índice único): uma regra por construtora. */
  async saveRule(
    userId: string,
    companyId: string,
    input: CommissionRuleInput,
  ): Promise<Result<CommissionRule>> {
    const { data, error } = await supabase
      .from('commission_rules')
      .upsert(
        {
          user_id: userId,
          company_id: companyId,
          default_pct: input.defaultPct,
          installments_count: input.installmentsCount,
          installments_split: input.installmentsSplit,
          first_payment_days: input.firstPaymentDays,
          interval_days: input.intervalDays,
          notes: input.notes,
        },
        { onConflict: 'company_id' },
      )
      .select(RULE_SELECT)
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao salvar a regra de comissão.');
    return ok(mapRule(data as unknown as RuleRow));
  }

  async listCampaigns(companyId: string): Promise<CommissionCampaign[]> {
    const { data, error } = await supabase
      .from('commission_campaigns')
      .select(CAMPAIGN_SELECT)
      .eq('company_id', companyId)
      .order('starts_on', { ascending: false });
    if (error || !data) return [];
    return (data as unknown as CampaignRow[]).map(mapCampaign);
  }

  async addCampaign(
    userId: string,
    companyId: string,
    input: CommissionCampaignInput,
  ): Promise<Result<CommissionCampaign>> {
    const { data, error } = await supabase
      .from('commission_campaigns')
      .insert({
        user_id: userId,
        company_id: companyId,
        name: input.name,
        pct: input.pct,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
      })
      .select(CAMPAIGN_SELECT)
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao salvar a campanha.');
    return ok(mapCampaign(data as unknown as CampaignRow));
  }

  async updateCampaign(
    id: string,
    input: CommissionCampaignInput,
  ): Promise<Result<CommissionCampaign>> {
    const { data, error } = await supabase
      .from('commission_campaigns')
      .update({
        name: input.name,
        pct: input.pct,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
      })
      .eq('id', id)
      .select(CAMPAIGN_SELECT)
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao atualizar a campanha.');
    return ok(mapCampaign(data as unknown as CampaignRow));
  }

  async removeCampaign(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('commission_campaigns').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }

  /* --- comissões e parcelas --------------------------------------------- */

  async list(userId: string, filters: CommissionFilters): Promise<CommissionWithInstallments[]> {
    const period = resolveCommissionPeriod(filters);

    let query = supabase
      .from('commissions')
      .select(COMMISSION_WITH_INSTALLMENTS_SELECT)
      .eq('user_id', userId);

    if (filters.companyId) query = query.eq('company_id', filters.companyId);

    // Só a base 'venda' filtra uma coluna da própria comissão; 'vencimento' e
    // 'recebimento' vivem na parcela e são aplicados depois (ver filterInstallments).
    if (filters.basis === 'venda') {
      if (period.from) query = query.gte('sale_date', period.from);
      if (period.to) query = query.lte('sale_date', period.to);
    }

    const term = sanitizeCommissionQuery(filters.query ?? '');
    if (term) {
      query = query.or(
        [
          `client_name.ilike.%${term}%`,
          `development_name.ilike.%${term}%`,
          `company_name.ilike.%${term}%`,
        ].join(','),
      );
    }

    const { data, error } = await query
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error || !data) return [];

    const today = todayYmd();
    const rows = (data as unknown as CommissionRowWithInstallments[]).map(mapRowWithInstallments);
    if (!hasInstallmentFilter(filters)) return rows;

    // Comissão que não sobrou nenhuma parcela dentro do filtro sai da lista:
    // se ela ficasse, os KPIs contariam comissão que o filtro descartou.
    return rows
      .map((item) => ({
        commission: item.commission,
        installments: filterInstallments(item.installments, filters, period, today),
      }))
      .filter((item) => item.installments.length > 0);
  }

  async get(id: string): Promise<CommissionWithInstallments | null> {
    const { data, error } = await supabase
      .from('commissions')
      .select(COMMISSION_WITH_INSTALLMENTS_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapRowWithInstallments(data as unknown as CommissionRowWithInstallments);
  }

  async getBySale(saleId: string): Promise<CommissionWithInstallments | null> {
    const { data, error } = await supabase
      .from('commissions')
      .select(COMMISSION_WITH_INSTALLMENTS_SELECT)
      .eq('sale_id', saleId)
      .maybeSingle();
    if (error || !data) return null;
    return mapRowWithInstallments(data as unknown as CommissionRowWithInstallments);
  }

  /**
   * Idempotente por venda: o índice único em `sale_id` é a fonte da verdade —
   * se a comissão já existe, devolve a existente em vez de erro (dois toques no
   * botão "Venda realizada" não podem gerar comissão dobrada).
   *
   * O PostgREST não tem transação: a comissão e as parcelas vão em dois
   * comandos. Se o insert das parcelas falhar, a comissão recém-criada é
   * APAGADA aqui — comissão sem parcela nenhuma apareceria como "a receber"
   * sem nada a receber e travaria a próxima tentativa pelo unique.
   */
  async createForSale(
    userId: string,
    data: {
      commission: Omit<Commission, 'id' | 'createdAt' | 'updatedAt'>;
      installments: NewInstallment[];
    },
  ): Promise<Result<CommissionWithInstallments>> {
    const { commission, installments } = data;

    const { data: row, error } = await supabase
      .from('commissions')
      .insert({
        user_id: userId,
        sale_id: commission.saleId,
        company_id: commission.companyId,
        company_name: commission.companyName,
        development_name: commission.developmentName,
        client_name: commission.clientName,
        sale_value: commission.saleValue,
        sale_date: commission.saleDate,
        pct: commission.pct,
        source: commission.source,
        campaign_name: commission.campaignName,
        total_value: commission.totalValue,
        notes: commission.notes,
      })
      .select(COMMISSION_SELECT)
      .single();

    if (error || !row) {
      // Unique em sale_id: a venda já tem comissão. Devolve a que existe.
      if (
        error &&
        (error.code === UNIQUE_VIOLATION || error.message.includes('commissions_sale_unique'))
      ) {
        const existing = await this.getBySale(commission.saleId);
        if (existing) return ok(existing);
      }
      return err(error?.message ?? 'Falha ao lançar a comissão da venda.');
    }

    const created = mapCommission(row as unknown as CommissionRow);
    if (installments.length === 0) return ok({ commission: created, installments: [] });

    const { data: instRows, error: instError } = await supabase
      .from('commission_installments')
      .insert(installments.map((inst) => buildInstallmentInsert(userId, created.id, inst)))
      .select(INSTALLMENT_SELECT);

    if (instError || !instRows) {
      // Desfaz a comissão órfã (as parcelas que tenham entrado somem por cascata).
      await supabase.from('commissions').delete().eq('id', created.id);
      return err(instError?.message ?? 'Falha ao gerar as parcelas da comissão.');
    }

    return ok({
      commission: created,
      installments: (instRows as unknown as InstallmentRow[]).map(mapInstallment).sort(byNumber),
    });
  }

  /**
   * Troca o parcelamento inteiro. Sem transação no PostgREST, o roteiro é:
   * guardar as parcelas atuais, apagar, inserir as novas — e, se o insert
   * falhar, RESTAURAR as antigas (com os mesmos ids) para a comissão não ficar
   * sem parcela nenhuma.
   */
  async replaceInstallments(
    commissionId: string,
    installments: NewInstallment[],
  ): Promise<Result<CommissionWithInstallments>> {
    const current = await this.get(commissionId);
    if (!current) return err('Comissão não encontrada.');

    const { data: previous, error: readError } = await supabase
      .from('commission_installments')
      .select('*')
      .eq('commission_id', commissionId);
    if (readError) return err(readError.message);

    const backup = previous ?? [];
    // O user_id das novas parcelas vem das antigas (ou da comissão, quando não
    // havia nenhuma parcela): a RLS exige que ele seja o do corretor logado.
    const userId = await this.resolveOwner(commissionId, backup);
    if (!userId) return err('Não foi possível identificar o dono da comissão.');

    const { error: deleteError } = await supabase
      .from('commission_installments')
      .delete()
      .eq('commission_id', commissionId);
    if (deleteError) return err(deleteError.message);

    if (installments.length === 0) {
      return ok({ commission: current.commission, installments: [] });
    }

    const { data: instRows, error: insertError } = await supabase
      .from('commission_installments')
      .insert(installments.map((inst) => buildInstallmentInsert(userId, commissionId, inst)))
      .select(INSTALLMENT_SELECT);

    if (insertError || !instRows) {
      // Volta ao estado anterior: melhor o parcelamento antigo do que nenhum.
      if (backup.length > 0) await supabase.from('commission_installments').insert(backup);
      return err(insertError?.message ?? 'Falha ao regravar as parcelas da comissão.');
    }

    return ok({
      commission: current.commission,
      installments: (instRows as unknown as InstallmentRow[]).map(mapInstallment).sort(byNumber),
    });
  }

  async updateCommission(
    id: string,
    patch: Partial<Pick<Commission, 'pct' | 'totalValue' | 'source' | 'campaignName' | 'notes'>>,
  ): Promise<Result<Commission>> {
    const out: {
      pct?: number;
      total_value?: number;
      source?: CommissionSource;
      campaign_name?: string | null;
      notes?: string | null;
    } = {};
    if (patch.pct !== undefined) out.pct = patch.pct;
    if (patch.totalValue !== undefined) out.total_value = patch.totalValue;
    if (patch.source !== undefined) out.source = patch.source;
    if (patch.campaignName !== undefined) out.campaign_name = patch.campaignName;
    if (patch.notes !== undefined) out.notes = patch.notes;

    const { data, error } = await supabase
      .from('commissions')
      .update(out)
      .eq('id', id)
      .select(COMMISSION_SELECT)
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao atualizar a comissão.');
    return ok(mapCommission(data as unknown as CommissionRow));
  }

  async updateInstallment(
    id: string,
    patch: Partial<
      Pick<CommissionInstallment, 'dueDate' | 'value' | 'status' | 'paidDate' | 'paidValue' | 'notes'>
    >,
  ): Promise<Result<CommissionInstallment>> {
    const out = buildInstallmentPatch(patch);

    // Mexer no status pelo update genérico não pode produzir estado que o banco
    // recusa (recebida sem paid_date) nem sobra de recebimento em parcela que
    // voltou a pendente. As mesmas regras do setInstallmentStatus valem aqui.
    if (patch.status !== undefined) {
      if (patch.status === 'recebida') {
        const current = await this.getInstallmentRow(id);
        if (patch.paidDate === undefined && !current?.paid_date) out.paid_date = todayYmd();
        if (out.paid_date === null) out.paid_date = todayYmd();
        if (patch.paidValue === undefined && toNumber(current?.paid_value ?? null) === null) {
          out.paid_value = patch.value ?? toNumber(current?.value ?? null);
        }
      } else {
        out.paid_date = null;
        out.paid_value = null;
      }
    }

    const { data, error } = await supabase
      .from('commission_installments')
      .update(out)
      .eq('id', id)
      .select(INSTALLMENT_SELECT)
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao atualizar a parcela.');
    return ok(mapInstallment(data as unknown as InstallmentRow));
  }

  /**
   * Marca a parcela como recebida, pendente ou cancelada.
   *
   * - `recebida` sem `paidDate` usa HOJE em partes locais (nunca
   *   `toISOString`, que no Brasil adianta o dia à noite) e, sem `paidValue`,
   *   assume o valor previsto da parcela.
   * - `pendente` e `cancelada` LIMPAM data e valor recebido: deixar o
   *   recebimento antigo faria a parcela contar como recebida nos KPIs.
   */
  async setInstallmentStatus(
    id: string,
    status: CommissionInstallmentStatus,
    extra?: { paidDate?: string | null; paidValue?: number | null },
  ): Promise<Result<CommissionInstallment>> {
    let patch: InstallmentWriteRow;

    if (status === 'recebida') {
      const current = await this.getInstallmentRow(id);
      if (!current) return err('Parcela não encontrada.');
      patch = {
        status,
        paid_date: extra?.paidDate ?? todayYmd(),
        paid_value: extra?.paidValue ?? toNumber(current.value) ?? 0,
      };
    } else {
      patch = { status, paid_date: null, paid_value: null };
    }

    const { data, error } = await supabase
      .from('commission_installments')
      .update(patch)
      .eq('id', id)
      .select(INSTALLMENT_SELECT)
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao atualizar a parcela.');
    return ok(mapInstallment(data as unknown as InstallmentRow));
  }

  async setInvoice(
    id: string,
    data: {
      invoiceStatus: InvoiceStatus;
      invoiceNumber?: string | null;
      invoiceUrl?: string | null;
      invoiceIssuedAt?: string | null;
    },
  ): Promise<Result<CommissionInstallment>> {
    const patch: InstallmentWriteRow = { invoice_status: data.invoiceStatus };
    if (data.invoiceNumber !== undefined) patch.invoice_number = data.invoiceNumber;
    if (data.invoiceUrl !== undefined) patch.invoice_url = data.invoiceUrl;
    if (data.invoiceIssuedAt !== undefined) patch.invoice_issued_at = data.invoiceIssuedAt;

    // 'nao_emitida' com número e link de nota é estado incoerente: ao voltar
    // para não emitida os dados da nota são limpos, a não ser que venham
    // explicitamente no chamador. 'cancelada' mantém o número, que é histórico.
    if (data.invoiceStatus === 'nao_emitida') {
      if (data.invoiceNumber === undefined) patch.invoice_number = null;
      if (data.invoiceUrl === undefined) patch.invoice_url = null;
      if (data.invoiceIssuedAt === undefined) patch.invoice_issued_at = null;
    }

    const { data: row, error } = await supabase
      .from('commission_installments')
      .update(patch)
      .eq('id', id)
      .select(INSTALLMENT_SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao registrar a nota fiscal.');
    return ok(mapInstallment(row as unknown as InstallmentRow));
  }

  /** As parcelas somem por cascata (FK on delete cascade). */
  async removeCommission(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('commissions').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }

  /* --- apoio ------------------------------------------------------------- */

  /** Linha crua da parcela — usada para completar valores que não vieram no patch. */
  private async getInstallmentRow(id: string): Promise<InstallmentRow | null> {
    const { data, error } = await supabase
      .from('commission_installments')
      .select(INSTALLMENT_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as InstallmentRow;
  }

  /** Dono da comissão: vem das parcelas atuais ou, sem elas, da própria comissão. */
  private async resolveOwner(
    commissionId: string,
    backup: { user_id?: string }[],
  ): Promise<string | null> {
    const fromBackup = backup.find((row) => typeof row.user_id === 'string')?.user_id;
    if (fromBackup) return fromBackup;

    const { data, error } = await supabase
      .from('commissions')
      .select('user_id')
      .eq('id', commissionId)
      .maybeSingle();
    if (error || !data) return null;
    return data.user_id;
  }
}
