import { supabase } from './supabase';
import { type LeadCampaign, type Result, err, ok } from '@/data';

/**
 * Pede à Edge Function `generate-invite` que o Claude escreva os textos de
 * captação do corretor (título/subtítulo da página + convite pra postar) e
 * salve como a campanha ativa. Opcionalmente personaliza por empreendimento.
 */
export async function generateInvite(input?: {
  developmentName?: string | null;
  extra?: string | null;
}): Promise<Result<LeadCampaign>> {
  const { data, error } = await supabase.functions.invoke('generate-invite', {
    body: {
      developmentName: input?.developmentName ?? undefined,
      extra: input?.extra ?? undefined,
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
}

/** Busca (público) os textos da página de captação de um corretor. */
export async function getLeadPage(brokerId: string): Promise<LeadPageInfo | null> {
  const { data, error } = await supabase.functions.invoke('get-lead-page', {
    body: { brokerId },
  });
  if (error || !data || data.error) return null;
  return data as LeadPageInfo;
}
