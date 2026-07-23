import { supabase } from './supabase';
import { type LeadCampaign, type Result, err, ok } from '@/data';

/**
 * Pede à Edge Function `generate-invite` que o Claude escreva os textos de
 * captação do corretor (título/subtítulo da página + convite pra postar) e
 * salve como a campanha ativa. Opcionalmente personaliza por empreendimento.
 */
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
  if (error) return err(error.message);
  if (data?.error) return err(data.error as string);
  return ok(data as LeadCampaign);
}

/** Textos exibidos na página pública de captação (retornados por get-lead-page). */
export interface LeadPageInfo {
  brokerName: string | null;
  agency: string | null;
  titulo: string | null;
  subtitulo: string | null;
  descricao: string | null;
  beneficios: string[];
}

/** Busca (público) os textos da página de captação de um corretor. */
export async function getLeadPage(brokerId: string): Promise<LeadPageInfo | null> {
  const { data, error } = await supabase.functions.invoke('get-lead-page', {
    body: { brokerId },
  });
  if (error || !data || data.error) return null;
  return data as LeadPageInfo;
}

/** Um lead prospectado a partir de dados públicos de CNPJ (ainda não salvo). */
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
  /** Página a enviar na próxima busca (com os mesmos filtros) p/ trazer novos. */
  proximaPagina: number;
}

/**
 * Prospecção ativa: busca empresas locais (dados públicos de CNPJ) por
 * estado + cidade + segmento e devolve donos/telefones pra ligar.
 * `pagina` permite avançar para novos resultados a cada nova busca.
 */
export async function prospectLeads(input: {
  uf: string;
  cidade: string;
  cnae: string;
  pagina?: number;
}): Promise<Result<ProspectResult>> {
  const { data, error } = await supabase.functions.invoke('prospect-leads', {
    body: input,
  });
  if (error) return err(error.message);
  if (data?.error) return err(data.error as string);
  return ok({
    leads: (data.leads ?? []) as ProspectedLead[],
    total: (data.total as number) ?? 0,
    proximaPagina: (data.proxima_pagina as number) ?? 1,
  });
}
