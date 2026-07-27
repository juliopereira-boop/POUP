import { supabase } from '@/lib/supabase';
import type { LeadRepository } from '../repositories';
import {
  DEFAULT_LEAD_STAGES,
  type Lead,
  type LeadPatch,
  type LeadSource,
  type LeadStage,
  type LeadStageInput,
  type LeadStatus,
  type Result,
  err,
  ok,
} from '../types';

const SELECT =
  'id, name, phone, email, message, source, company_id, development_id, status, stage_id, cpf, income, birth_date, notes, created_at, updated_at, companies(name), developments(name)';

const STAGE_SELECT = 'id, nome, cor, ordem, ativo';

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  source: string;
  company_id: string | null;
  development_id: string | null;
  status: string;
  stage_id: string | null;
  cpf: string | null;
  income: number | string | null;
  birth_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  companies: { name: string } | null;
  developments: { name: string } | null;
}

interface StageRow {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

interface LeadUpdateRow {
  name?: string;
  phone?: string;
  email?: string | null;
  cpf?: string | null;
  income?: number | null;
  birth_date?: string | null;
  notes?: string | null;
  company_id?: string | null;
  development_id?: string | null;
  stage_id?: string | null;
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    source: (row.source as Lead['source']) ?? 'manual',
    companyId: row.company_id,
    companyName: row.companies?.name ?? null,
    developmentId: row.development_id,
    developmentName: row.developments?.name ?? null,
    status: (row.status as LeadStatus) ?? 'novo',
    stageId: row.stage_id ?? null,
    cpf: row.cpf,
    income: toNumber(row.income ?? null),
    birthDate: row.birth_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStage(row: StageRow): LeadStage {
  return {
    id: row.id,
    nome: row.nome,
    cor: row.cor,
    ordem: row.ordem,
    ativo: row.ativo,
  };
}

function buildPatch(patch: LeadPatch): LeadUpdateRow {
  const out: LeadUpdateRow = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.phone !== undefined) out.phone = patch.phone;
  if (patch.email !== undefined) out.email = patch.email;
  if (patch.cpf !== undefined) out.cpf = patch.cpf;
  if (patch.income !== undefined) out.income = patch.income;
  if (patch.birthDate !== undefined) out.birth_date = patch.birthDate;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.companyId !== undefined) out.company_id = patch.companyId;
  if (patch.developmentId !== undefined) out.development_id = patch.developmentId;
  if (patch.stageId !== undefined) out.stage_id = patch.stageId;
  return out;
}

export class SupabaseLeadRepository implements LeadRepository {
  async list(userId: string): Promise<Lead[]> {
    const { data, error } = await supabase
      .from('leads')
      .select(SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as unknown as LeadRow[]).map(mapLead);
  }

  async create(
    userId: string,
    data: {
      name: string;
      phone: string;
      email?: string | null;
      message?: string | null;
      source?: LeadSource;
    },
  ): Promise<Result<Lead>> {
    const { data: row, error } = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        name: data.name,
        phone: data.phone,
        email: data.email ?? null,
        message: data.message ?? null,
        source: data.source ?? 'manual',
      })
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar o lead.');
    return ok(mapLead(row as unknown as LeadRow));
  }

  async get(id: string): Promise<Lead | null> {
    const { data, error } = await supabase.from('leads').select(SELECT).eq('id', id).single();
    if (error || !data) return null;
    return mapLead(data as unknown as LeadRow);
  }

  async update(id: string, patch: LeadPatch): Promise<Result<Lead>> {
    const { data, error } = await supabase
      .from('leads')
      .update(buildPatch(patch))
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error || !data) return err(error?.message ?? 'Falha ao atualizar o lead.');
    return ok(mapLead(data as unknown as LeadRow));
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Result<void>> {
    const { error } = await supabase.from('leads').update({ status }).eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }

  async remove(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }

  async listStages(userId: string): Promise<LeadStage[]> {
    const { data, error } = await supabase
      .from('lead_stages')
      .select(STAGE_SELECT)
      .eq('user_id', userId)
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error || !data) return [];
    return (data as unknown as StageRow[]).map(mapStage);
  }

  async createStage(userId: string, data: LeadStageInput): Promise<Result<LeadStage>> {
    const { data: row, error } = await supabase
      .from('lead_stages')
      .insert({
        user_id: userId,
        nome: data.nome,
        cor: data.cor,
        ordem: data.ordem,
        ativo: data.ativo ?? true,
      })
      .select(STAGE_SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao criar a etapa.');
    return ok(mapStage(row as unknown as StageRow));
  }

  async updateStage(id: string, data: Partial<LeadStageInput>): Promise<Result<LeadStage>> {
    const patch: { nome?: string; cor?: string; ordem?: number; ativo?: boolean } = {};
    if (data.nome !== undefined) patch.nome = data.nome;
    if (data.cor !== undefined) patch.cor = data.cor;
    if (data.ordem !== undefined) patch.ordem = data.ordem;
    if (data.ativo !== undefined) patch.ativo = data.ativo;
    const { data: row, error } = await supabase
      .from('lead_stages')
      .update(patch)
      .eq('id', id)
      .select(STAGE_SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao atualizar a etapa.');
    return ok(mapStage(row as unknown as StageRow));
  }

  async removeStage(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('lead_stages').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }

  async seedDefaultStages(userId: string): Promise<LeadStage[]> {
    const existing = await this.listStages(userId);
    if (existing.length > 0) return existing;
    const { data, error } = await supabase
      .from('lead_stages')
      .insert(
        DEFAULT_LEAD_STAGES.map((s) => ({
          user_id: userId,
          nome: s.nome,
          cor: s.cor,
          ordem: s.ordem,
          ativo: s.ativo ?? true,
        })),
      )
      .select(STAGE_SELECT);
    if (error || !data) return [];
    return (data as unknown as StageRow[]).map(mapStage).sort((a, b) => a.ordem - b.ordem);
  }
}
