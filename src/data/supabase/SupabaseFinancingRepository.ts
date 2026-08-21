/**
 * As simulações de financiamento e as regras que as produzem, no Supabase.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO NÃO FAZ
 * ===========================================================================
 * Não calcula nada. Zero matemática financeira aqui — isso é
 * `src/features/financiamento/motor.ts`, que é função pura e testada. Este
 * arquivo grava, lê e mapeia colunas.
 *
 * A separação é o que permite que os 157 testes do motor rodem em Node puro,
 * sem banco, sem rede e sem mock: se a conta morasse junto do acesso a dados,
 * testar exigiria subir um Postgres.
 */
import { supabase } from '@/lib/supabase';
import { LIMITE_LISTA } from './limites';
import type { Json } from '@/data/database.types';
import { getAppUrl } from '@/lib/appUrl';
import type { FinancingRepository } from '../repositories';
import {
  err,
  ok,
  type FinancingShareLink,
  type FinancingSimulation,
  type FinancingSimulationInput,
  type Result,
} from '../types';

const SELECT =
  'id, lead_id, client_name, company_id, development_id, development_name, block, unit, input, result, rules_snapshot, rule_version, property_value, financed_value, first_installment, term_months, amortization, eligible, status, created_at, updated_at';

interface Row {
  id: string;
  lead_id: string | null;
  client_name: string | null;
  company_id: string | null;
  development_id: string | null;
  development_name: string | null;
  block: number | null;
  unit: string | null;
  input: unknown;
  result: unknown;
  rules_snapshot: unknown;
  rule_version: string;
  property_value: number | null;
  financed_value: number | null;
  first_installment: number | null;
  term_months: number | null;
  amortization: string | null;
  eligible: boolean | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapear(row: Row): FinancingSimulation {
  return {
    id: row.id,
    leadId: row.lead_id,
    clientName: row.client_name,
    companyId: row.company_id,
    developmentId: row.development_id,
    developmentName: row.development_name,
    block: row.block,
    unit: row.unit,
    input: row.input,
    result: row.result,
    rulesSnapshot: row.rules_snapshot,
    ruleVersion: row.rule_version,
    propertyValue: row.property_value,
    financedValue: row.financed_value,
    firstInstallment: row.first_installment,
    termMonths: row.term_months,
    amortization: row.amortization,
    eligible: row.eligible,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function corpo(data: Partial<FinancingSimulationInput>) {
  const p: Record<string, unknown> = {};
  const set = (coluna: string, valor: unknown) => {
    if (valor !== undefined) p[coluna] = valor;
  };
  set('lead_id', data.leadId);
  set('client_name', data.clientName);
  set('company_id', data.companyId);
  set('development_id', data.developmentId);
  set('development_name', data.developmentName);
  set('block', data.block);
  set('unit', data.unit);
  set('input', data.input as Json);
  set('result', data.result as Json);
  set('rules_snapshot', data.rulesSnapshot as Json);
  set('rule_version', data.ruleVersion);
  set('property_value', data.propertyValue);
  set('financed_value', data.financedValue);
  set('first_installment', data.firstInstallment);
  set('term_months', data.termMonths);
  set('amortization', data.amortization);
  set('eligible', data.eligible);
  return p;
}

/**
 * SHA-256 do token, em hexadecimal.
 *
 * O banco guarda o hash e nunca o token. Se o banco vazar, os links já
 * emitidos continuam inúteis — é o mesmo raciocínio de não guardar senha em
 * texto claro. `crypto.subtle` existe na web e no React Native moderno (via
 * `expo-crypto` no runtime do Expo); onde não existir, o método devolve erro
 * em vez de gravar um token fraco.
 */
async function hashDoToken(token: string): Promise<string | null> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) return null;
  const bytes = new TextEncoder().encode(token);
  const digest = await c.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 32 bytes aleatórios em base36. Sorteado no aparelho, nunca no servidor. */
function sortearToken(): string | null {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) return null;
  const bytes = new Uint8Array(24);
  c.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('');
}

export class SupabaseFinancingRepository implements FinancingRepository {
  /* ------------------------------------------------------------- regras */

  async regrasVigentes(): Promise<unknown | null> {
    const { data, error } = await supabase.rpc('financing_active_rules');
    if (error) return null;
    return data ?? null;
  }

  async listarVersoes() {
    const { data, error } = await supabase
      .from('financing_rule_versions')
      .select('id, version, effective_from, status, payload')
      .order('effective_from', { ascending: false });
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      versao: r.version,
      vigenciaInicio: r.effective_from,
      status: r.status,
      payload: r.payload as unknown,
    }));
  }

  /**
   * Grava a versão e registra o que mudou.
   *
   * A auditoria é gravada DEPOIS do upsert e não bloqueia o retorno: se ela
   * falhar, a regra já está salva e o admin não fica preso numa tela de erro
   * por causa do registro. Perder uma linha de auditoria é ruim; perder a
   * alteração da regra que o admin acabou de digitar é pior.
   */
  async salvarVersao(input: {
    versao: string;
    vigenciaInicio: string;
    vigenciaFim: string | null;
    status: string;
    payload: unknown;
    motivo: string;
    fonte?: string | null;
    fonteUrl?: string | null;
    notas?: string | null;
  }): Promise<Result<void>> {
    const { data: sessao } = await supabase.auth.getUser();
    const uid = sessao.user?.id ?? null;

    const anterior = await supabase
      .from('financing_rule_versions')
      .select('id, payload')
      .eq('version', input.versao)
      .maybeSingle();

    /*
     * Ativar uma versão encerra a anterior.
     *
     * O banco tem índice único parcial garantindo UMA versão ativa; sem
     * encerrar a anterior aqui, o upsert falharia com violação de unicidade e
     * o admin veria um erro de banco em vez de a regra entrar em vigor.
     */
    if (input.status === 'ativa') {
      await supabase
        .from('financing_rule_versions')
        .update({ status: 'encerrada', effective_to: input.vigenciaInicio })
        .eq('status', 'ativa')
        .neq('version', input.versao);
    }

    const { error } = await supabase.from('financing_rule_versions').upsert(
      {
        version: input.versao,
        effective_from: input.vigenciaInicio,
        effective_to: input.vigenciaFim,
        status: input.status,
        payload: input.payload as Json,
        source: input.fonte ?? null,
        source_url: input.fonteUrl ?? null,
        notes: input.notas ?? null,
        created_by: uid,
      },
      { onConflict: 'version' },
    );
    if (error) return err(error.message);

    await supabase.from('financing_rule_audit').insert({
      version_id: anterior.data?.id ?? null,
      version: input.versao,
      campo: 'payload',
      valor_anterior: (anterior.data?.payload ?? null) as Json,
      valor_novo: input.payload as Json,
      motivo: input.motivo,
      changed_by: uid,
    });

    return ok(undefined);
  }

  async listarAuditoria(versao: string) {
    const { data, error } = await supabase
      .from('financing_rule_audit')
      .select('campo, valor_anterior, valor_novo, motivo, changed_at')
      .eq('version', versao)
      .order('changed_at', { ascending: false })
      .limit(LIMITE_LISTA);
    if (error || !data) return [];
    return data.map((r) => ({
      campo: r.campo,
      anterior: r.valor_anterior as unknown,
      novo: r.valor_novo as unknown,
      motivo: r.motivo,
      em: r.changed_at,
    }));
  }

  /* --------------------------------------------------------- simulações */

  async list(userId: string, filtros?: { leadId?: string | null }): Promise<FinancingSimulation[]> {
    let q = supabase
      .from('financing_simulations')
      .select(SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (filtros?.leadId) q = q.eq('lead_id', filtros.leadId);
    const { data, error } = await q.limit(LIMITE_LISTA);
    if (error || !data) return [];
    return (data as unknown as Row[]).map(mapear);
  }

  async get(id: string): Promise<FinancingSimulation | null> {
    const { data, error } = await supabase
      .from('financing_simulations')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapear(data as unknown as Row);
  }

  async ultimaDoCliente(userId: string, leadId: string): Promise<FinancingSimulation | null> {
    const { data, error } = await supabase
      .from('financing_simulations')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapear(data as unknown as Row);
  }

  async create(
    userId: string,
    data: FinancingSimulationInput,
  ): Promise<Result<FinancingSimulation>> {
    const { data: row, error } = await supabase
      .from('financing_simulations')
      .insert({
        user_id: userId,
        input: data.input as Json,
        result: data.result as Json,
        rules_snapshot: data.rulesSnapshot as Json,
        rule_version: data.ruleVersion,
        ...corpo(data),
      })
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar a simulação.');
    return ok(mapear(row as unknown as Row));
  }

  async update(
    id: string,
    data: Partial<FinancingSimulationInput>,
  ): Promise<Result<FinancingSimulation>> {
    const { data: row, error } = await supabase
      .from('financing_simulations')
      .update({ ...corpo(data), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao atualizar a simulação.');
    return ok(mapear(row as unknown as Row));
  }

  async remove(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('financing_simulations').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }

  /* ----------------------------------------------------- compartilhamento */

  async criarLink(
    userId: string,
    simulationId: string,
    validadeDias: number,
  ): Promise<Result<FinancingShareLink>> {
    const token = sortearToken();
    if (!token) {
      return err('Este dispositivo não consegue gerar um link seguro. Envie o PDF no lugar.');
    }
    const hash = await hashDoToken(token);
    if (!hash) {
      return err('Este dispositivo não consegue gerar um link seguro. Envie o PDF no lugar.');
    }

    const expira = new Date(Date.now() + validadeDias * 86400000).toISOString();
    const { data, error } = await supabase
      .from('financing_share_tokens')
      .insert({
        simulation_id: simulationId,
        user_id: userId,
        token_hash: hash,
        expires_at: expira,
      })
      .select('id')
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao criar o link.');

    return ok({
      id: data.id,
      simulationId,
      // O token em claro só existe aqui. Depois desta linha, ninguém mais o vê.
      url: `${getAppUrl()}/simulacao/${token}`,
      expiresAt: expira,
    });
  }

  async revogarLink(id: string): Promise<Result<void>> {
    const { error } = await supabase
      .from('financing_share_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }
}
