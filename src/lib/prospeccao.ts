import { mensagemDoErro } from './edgeError';
import { supabase } from './supabase';
import { type LeadCampaign, type Result, err, ok } from '@/data';

export async function generateInvite(input?: {
  developmentName?: string | null;
  detalhes?: string | null;
}): Promise<Result<LeadCampaign>> {
  const { data, error } = await supabase.functions.invoke('generate-invite', {
    body: {
      developmentName: input?.developmentName ?? undefined,
      extra: input?.detalhes ?? undefined,
    },
  });
  if (error) return err(await mensagemDoErro(error, 'Não foi possível gerar os textos agora.'));
  if (data?.error) return err(data.error as string);
  return ok(data as LeadCampaign);
}

export async function generatePitch(input: {
  developmentName?: string | null;
  companyName?: string | null;
  descricao?: string | null;
  brokerName?: string | null;
}): Promise<Result<{ mensagem: string }>> {
  const { data, error } = await supabase.functions.invoke('generate-pitch', {
    body: {
      developmentName: input.developmentName ?? undefined,
      companyName: input.companyName ?? undefined,
      descricao: input.descricao ?? undefined,
      brokerName: input.brokerName ?? undefined,
    },
  });
  if (error) return err(await mensagemDoErro(error, 'Não foi possível gerar a mensagem agora.'));
  if (data?.error) return err(data.error as string);
  return ok(data as { mensagem: string });
}

export interface LeadPageInfo {
  brokerName: string | null;
  agency: string | null;
  titulo: string | null;
  subtitulo: string | null;
  descricao: string | null;
  beneficios: string[];
}

export async function getLeadPage(brokerId: string): Promise<LeadPageInfo | null> {
  const { data, error } = await supabase.functions.invoke('get-lead-page', {
    body: { brokerId },
  });
  if (error || !data || data.error) return null;
  return data as LeadPageInfo;
}

export interface ProspectedLead {
  cnpj: string;
  empresa: string;
  nome: string;
  phone: string;
  email: string | null;
  atividade: string | null;
  cidade: string;
  uf: string;
}

export interface ProspectResult {
  leads: ProspectedLead[];
  total: number;
}

export async function prospectLeads(input: {
  uf: string;
  cidade: string;
  excluir?: string[];
}): Promise<Result<ProspectResult>> {
  const { data, error } = await supabase.functions.invoke('prospect-leads', {
    body: input,
  });
  if (error) return err(error.message);
  if (data?.error) return err(data.error as string);
  return ok({
    leads: (data.leads ?? []) as ProspectedLead[],
    total: (data.total as number) ?? 0,
  });
}
