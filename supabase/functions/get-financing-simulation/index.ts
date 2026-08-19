/**
 * A SIMULAÇÃO VISTA PELO CLIENTE, por um link.
 *
 * ===========================================================================
 * POR QUE ISTO É UMA EDGE FUNCTION, E NÃO UMA POLICY
 * ===========================================================================
 * O cliente não tem conta no POUP. Para ele ver a simulação seria preciso ou
 * abrir a tabela para leitura anônima — o que exporia as simulações de todos os
 * corretores a quem soubesse um id — ou fazer a leitura aqui, com service role,
 * devolvendo **apenas os campos daquela simulação** depois de conferir o token.
 *
 * A segunda opção é a única aceitável, e é esta.
 *
 * ===========================================================================
 * O TOKEN É COMPARADO POR HASH
 * ===========================================================================
 * O banco guarda `sha256(token)`, nunca o token. Aqui recalculamos o hash do
 * que chegou e procuramos por ele. Consequência: um vazamento da tabela não
 * entrega nenhum link em funcionamento — mesmo raciocínio de senha.
 *
 * ===========================================================================
 * O QUE ESTE ENDPOINT NÃO DEVOLVE
 * ===========================================================================
 * Nada que identifique o corretor além do nome, nada de outras simulações,
 * nada da entrada bruta (que contém renda e idade). Sai o RESUMO — os números
 * que o corretor já mostrou ao cliente na tela — e o aviso legal.
 *
 * A renda fica de fora de propósito: ela está no `input`, mas quem recebe o
 * link pode ser qualquer pessoa a quem o cliente reencaminhou. O que o cliente
 * já sabe sobre si mesmo não precisa trafegar de novo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

/** Tokens são hex/base36 de 48 caracteres. Formato errado nem vai ao banco. */
const TOKEN_RE = /^[a-z0-9]{24,96}$/;

async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body?.token === 'string' ? body.token.trim().toLowerCase() : '';
  if (!TOKEN_RE.test(token)) return json({ error: 'Link inválido.' }, 400);

  const hash = await sha256Hex(token);

  const { data: link } = await admin
    .from('financing_share_tokens')
    .select('id, simulation_id, expires_at, revoked_at, views')
    .eq('token_hash', hash)
    .maybeSingle();

  /*
   * A MESMA RESPOSTA PARA "NÃO EXISTE", "EXPIROU" E "FOI REVOGADO".
   *
   * Diferenciá-las diria a quem está sondando que aquele token um dia foi
   * válido — informação que não ajuda ninguém legítimo e ajuda quem está
   * tentando adivinhar.
   */
  const invalido = () => json({ error: 'Este link não está mais disponível.' }, 404);
  if (!link) return invalido();
  if (link.revoked_at) return invalido();
  if (new Date(link.expires_at).getTime() < Date.now()) return invalido();

  const { data: sim } = await admin
    .from('financing_simulations')
    .select(
      'client_name, development_name, unit, block, result, rule_version, created_at, user_id',
    )
    .eq('id', link.simulation_id)
    .maybeSingle();
  if (!sim) return invalido();

  const { data: perfil } = await admin
    .from('profiles')
    .select('full_name, agency, creci, phone')
    .eq('id', sim.user_id)
    .maybeSingle();

  // Contador de visualizações: serve para o corretor saber que o cliente abriu.
  // Falhar aqui não pode derrubar a resposta — o link já foi conferido.
  await admin
    .from('financing_share_tokens')
    .update({ views: (link.views ?? 0) + 1, last_viewed_at: new Date().toISOString() })
    .eq('id', link.id);

  const r = (sim.result ?? {}) as Record<string, unknown>;

  return json({
    cliente: sim.client_name ?? null,
    empreendimento: sim.development_name ?? null,
    unidade: sim.unit ?? null,
    bloco: sim.block ?? null,
    criadaEm: sim.created_at,
    versaoRegras: sim.rule_version,

    corretor: {
      nome: perfil?.full_name ?? null,
      imobiliaria: perfil?.agency ?? null,
      creci: perfil?.creci ?? null,
      telefone: perfil?.phone ?? null,
    },

    // Só os números do resumo. `input` (com renda e idade) NÃO viaja.
    resumo: {
      valorImovel: r.valorImovel ?? null,
      entradaTotal: r.entradaTotal ?? null,
      valorFinanciado: r.valorFinanciado ?? null,
      prazoMeses: r.prazoMeses ?? null,
      sistema: r.sistema ?? null,
      taxaAnualPct: r.taxaAnualPct ?? null,
      primeira: (r.primeira as { total?: unknown })?.total ?? null,
      ultima: (r.ultima as { total?: unknown })?.total ?? null,
      totalJuros: r.totalJuros ?? null,
      elegivel: (r.elegibilidade as { elegivel?: unknown })?.elegivel ?? null,
      parcial: (r.primeira as { parcial?: unknown })?.parcial ?? null,
    },

    aviso:
      'Simulação estimada. Não é proposta de crédito nem garantia de aprovação. As condições finais — taxa, prazo, seguros, tarifas e enquadramento — dependem de análise da instituição financeira.',
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
