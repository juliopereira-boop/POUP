/**
 * Emissão de nota fiscal da comissão.
 *
 * A plataforma de emissão (NFS-e/NFe) ainda não está contratada. Este módulo
 * existe para que o botão "Gerar Nota Fiscal" já esteja no lugar certo do
 * fluxo, com o contrato definido, e para que ligar o provedor depois seja uma
 * mudança em UM arquivo só — sem tocar em tela nem em banco.
 *
 * Enquanto não houver provedor, `issueNfse` responde `notConfigured: true` e a
 * tela cai no registro manual da nota (número, data e link), que já funciona e
 * já grava em `commission_installments`.
 *
 * ## Como ligar o provedor depois
 *
 * 1. Publique uma Edge Function `issue-nfse` no Supabase que fale com a API do
 *    provedor. A chave do provedor mora **nos segredos da função**, nunca no
 *    app: o bundle do cliente é público.
 * 2. Preencha `EXPO_PUBLIC_NFSE_ENABLED=1` no ambiente (Vercel + `.env`).
 * 3. Nada mais. A tela já trata os três resultados possíveis.
 *
 * A função deve receber o corpo de `NfseIssueRequest` e responder no formato de
 * `NfseIssueResult`, para o app não precisar conhecer o provedor.
 */
import { supabase } from '@/lib/supabase';

export interface NfseIssueRequest {
  installmentId: string;
  /** Valor da nota, em reais. */
  amount: number;
  clientName: string;
  /** Descrição do serviço prestado, que vai no corpo da nota. */
  description: string;
  dueDate: string;
}

export type NfseIssueResult =
  | { ok: true; invoiceNumber: string; invoiceUrl: string | null; issuedAt: string }
  | { ok: false; error: string; notConfigured?: boolean };

const FUNCTION_NAME = 'issue-nfse';

/**
 * A emissão automática está disponível.
 *
 * Lê a variável de ambiente em vez de tentar a chamada e falhar: assim a tela
 * pode oferecer o registro manual de cara, sem um round-trip que já se sabe
 * que vai dar errado.
 */
export function isNfseConfigured(): boolean {
  return process.env.EXPO_PUBLIC_NFSE_ENABLED === '1';
}

export async function issueNfse(req: NfseIssueRequest): Promise<NfseIssueResult> {
  if (!isNfseConfigured()) {
    return {
      ok: false,
      notConfigured: true,
      error: 'A emissão automática de nota fiscal ainda não está conectada.',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: req });
    if (error) return { ok: false, error: error.message };

    const res = data as Partial<Extract<NfseIssueResult, { ok: true }>> & { error?: string };
    if (!res?.invoiceNumber) {
      return { ok: false, error: res?.error ?? 'O provedor não devolveu o número da nota.' };
    }
    return {
      ok: true,
      invoiceNumber: res.invoiceNumber,
      invoiceUrl: res.invoiceUrl ?? null,
      issuedAt: res.issuedAt ?? new Date().toISOString(),
    };
  } catch {
    return { ok: false, error: 'Não foi possível falar com o emissor de notas agora.' };
  }
}

/** Descrição padrão do serviço, usada quando a tela não informa uma. */
export function defaultInvoiceDescription(
  clientName: string,
  developmentName: string | null,
): string {
  const imovel = developmentName ? ` — ${developmentName}` : '';
  return `Comissão de intermediação imobiliária${imovel}. Cliente: ${clientName}.`;
}
