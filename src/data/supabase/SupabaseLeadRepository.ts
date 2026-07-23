import { supabase } from '@/lib/supabase';
import type { LeadRepository } from '../repositories';
import {
  type Lead,
  type LeadStatus,
  type MetaLeadIntegration,
  type MetaLeadIntegrationInput,
  type Result,
  err,
  ok,
} from '../types';

const SELECT =
  'id, name, phone, email, message, source, company_id, development_id, status, created_at, updated_at, companies(name), developments(name)';

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
  created_at: string;
  updated_at: string;
  companies: { name: string } | null;
  developments: { name: string } | null;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    data: { name: string; phone: string; email?: string | null },
  ): Promise<Result<Lead>> {
    const { data: row, error } = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        name: data.name,
        phone: data.phone,
        email: data.email ?? null,
        source: 'manual',
      })
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar o lead.');
    return ok(mapLead(row as unknown as LeadRow));
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

  async getMetaIntegration(userId: string): Promise<MetaLeadIntegration | null> {
    const { data, error } = await supabase
      .from('meta_lead_integrations')
      .select('page_id, page_access_token, verify_token, company_id, development_id, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      pageId: data.page_id,
      pageAccessToken: data.page_access_token,
      verifyToken: data.verify_token,
      companyId: data.company_id,
      developmentId: data.development_id,
      updatedAt: data.updated_at,
    };
  }

  async saveMetaIntegration(
    userId: string,
    data: MetaLeadIntegrationInput,
  ): Promise<Result<MetaLeadIntegration>> {
    const { data: row, error } = await supabase
      .from('meta_lead_integrations')
      .upsert(
        {
          user_id: userId,
          page_id: data.pageId,
          page_access_token: data.pageAccessToken,
          verify_token: data.verifyToken,
          company_id: data.companyId,
          development_id: data.developmentId,
        },
        { onConflict: 'user_id' },
      )
      .select('page_id, page_access_token, verify_token, company_id, development_id, updated_at')
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar a integração.');
    return ok({
      pageId: row.page_id,
      pageAccessToken: row.page_access_token,
      verifyToken: row.verify_token,
      companyId: row.company_id,
      developmentId: row.development_id,
      updatedAt: row.updated_at,
    });
  }
}
