/**
 * CAPTAÇÃO DE LEADS — só o que a pessoa mesma inicia.
 *
 * ===========================================================================
 * O QUE SAIU DAQUI, E POR QUE NÃO VOLTA
 * ===========================================================================
 * Este arquivo se chamava `prospeccao.ts` e tinha um `prospectLeads()` que
 * consultava uma base pública de CNPJ e devolvia nome, telefone e e-mail de
 * pessoas que nunca pediram contato. Foi removido junto com a Edge Function
 * `prospect-leads`.
 *
 * O motivo é a regra **5.1.1(viii)** da App Store: um aplicativo não pode
 * compilar informações pessoais obtidas fora do próprio usuário nem sem
 * consentimento explícito — **inclusive quando vêm de bancos de dados
 * públicos**. Ter contratado uma API legítima e usar dado público não resolve;
 * a regra é sobre o consentimento de quem está na lista, não sobre a origem.
 *
 * ===========================================================================
 * O QUE FICOU: O CAMINHO OPT-IN
 * ===========================================================================
 * O corretor publica um convite e a pessoa decide entrar:
 *
 *   * **página de captação** com QR Code (`getLeadPage`, `app/captar.tsx`);
 *   * **link de WhatsApp** que cadastra antes de abrir a conversa;
 *   * **indicação** e cadastro manual.
 *
 * `generateInvite` e `generatePitch` continuam: eles escrevem o texto do
 * convite e da abordagem para quem JÁ é lead. Escrever uma mensagem para um
 * contato consentido é outra coisa, completamente diferente de montar uma
 * lista de estranhos.
 */
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
