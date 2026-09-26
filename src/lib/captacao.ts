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
 * convite e da abordagem para quem JÁ é lead — hoje no próprio aparelho, sem
 * IA (`textosDeCaptacao.ts`). Escrever uma mensagem para um
 * contato consentido é outra coisa, completamente diferente de montar uma
 * lista de estranhos.
 */
import { supabase } from './supabase';
import { escreverAbordagem, escreverConvite } from './textosDeCaptacao';
import { type LeadCampaign, type Result, err, ok } from '@/data';

/**
 * Os textos da página de captação, escritos no aparelho (`textosDeCaptacao.ts`)
 * e guardados na campanha do corretor — a mesma linha que a página pública lê.
 */
export async function generateInvite(input?: {
  developmentName?: string | null;
  detalhes?: string | null;
}): Promise<Result<LeadCampaign>> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return err('Entre na sua conta para criar a página.');
  const { data: perfil } = await supabase.from('profiles').select('full_name, agency').eq('id', user.id).maybeSingle();
  const p = perfil as { full_name?: string | null; agency?: string | null } | null;
  const campanha = escreverConvite({
    developmentName: input?.developmentName,
    detalhes: input?.detalhes,
    brokerName: p?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
    agency: p?.agency ?? null,
  });
  const { error } = await supabase.from('lead_campaigns').upsert(
    {
      user_id: user.id,
      titulo: campanha.titulo,
      subtitulo: campanha.subtitulo,
      descricao: campanha.descricao,
      beneficios: campanha.beneficios,
      convite: campanha.convite,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return err('Não foi possível salvar a página agora. Tente de novo.');
  return ok(campanha);
}

/** A mensagem de abordagem para um lead, escrita no aparelho. */
export async function generatePitch(input: {
  developmentName?: string | null;
  companyName?: string | null;
  descricao?: string | null;
  brokerName?: string | null;
}): Promise<Result<{ mensagem: string }>> {
  return ok({ mensagem: escreverAbordagem(input) });
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
