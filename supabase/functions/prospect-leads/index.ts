// Edge Function: PROSPECÇÃO ATIVA de leads a partir de dados PÚBLICOS de CNPJ
// da Receita Federal, via API da Nuvem Fiscal.
//
// O corretor escolhe UF + cidade + segmento (CNAE) e recebe uma lista de
// empresas locais com nome do dono (sócio) e telefone público — donos de
// negócios (clínicas, escritórios, lojas) são o público de renda mais alta
// que compra imóvel. Tudo dado público e legal (nada de raspar renda de
// pessoa física).
//
// Segredos necessários (Supabase → Edge Functions → Secrets):
//   NUVEMFISCAL_CLIENT_ID       (Nuvem Fiscal → Conta → Credenciais de API)
//   NUVEMFISCAL_CLIENT_SECRET
//
// Chamada pelo app logado via supabase.functions.invoke('prospect-leads'),
// que envia o JWT do usuário no header Authorization.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLIENT_ID = Deno.env.get('NUVEMFISCAL_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('NUVEMFISCAL_CLIENT_SECRET') ?? '';
const AUTH_URL = 'https://auth.nuvemfiscal.com.br/oauth/token';
const API_URL = 'https://api.nuvemfiscal.com.br';

interface CnpjTelefone {
  ddd?: string;
  numero?: string;
}
interface CnpjSocio {
  nome?: string;
}
interface CnpjEndereco {
  municipio?: string;
  uf?: string;
}
interface CnpjEmpresa {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  telefones?: CnpjTelefone[];
  email?: string;
  endereco?: CnpjEndereco;
  atividade_principal?: { codigo?: string; descricao?: string };
  socios?: CnpjSocio[];
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Token OAuth2 (client_credentials) com escopo cnpj. */
async function getToken(): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'cnpj',
  });
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    console.error('Falha no OAuth Nuvem Fiscal:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return (data.access_token as string) ?? null;
}

/** Resolve UF + nome da cidade -> código IBGE (7 dígitos), via API pública do IBGE. */
async function resolveMunicipio(uf: string, cidade: string): Promise<string | null> {
  const res = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`,
  );
  if (!res.ok) return null;
  const list = (await res.json()) as { id: number; nome: string }[];
  const alvo = normalize(cidade);
  const match = list.find((m) => normalize(m.nome) === alvo) ?? list.find((m) => normalize(m.nome).includes(alvo));
  return match ? String(match.id) : null;
}

function pickPhone(tels?: CnpjTelefone[]): string | null {
  for (const t of tels ?? []) {
    const digits = `${t.ddd ?? ''}${t.numero ?? ''}`.replace(/\D/g, '');
    if (digits.length >= 10) return digits;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await admin.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json(
        { error: 'Prospecção não configurada (credenciais da Nuvem Fiscal ausentes).' },
        500,
      );
    }

    const { uf, cidade, cnae, top } = (await req.json().catch(() => ({}))) as {
      uf?: string;
      cidade?: string;
      cnae?: string;
      top?: number;
    };
    if (!uf || !cidade || !cnae) {
      return json({ error: 'Informe estado, cidade e segmento.' }, 400);
    }

    const municipio = await resolveMunicipio(uf, cidade);
    if (!municipio) {
      return json({ error: `Cidade "${cidade}" não encontrada em ${uf}.` }, 400);
    }

    const token = await getToken();
    if (!token) return json({ error: 'Falha ao autenticar na Nuvem Fiscal.' }, 502);

    const limit = Math.min(Math.max(top ?? 30, 1), 100);
    const params = new URLSearchParams({
      cnae_principal: cnae.replace(/\D/g, ''),
      municipio,
      top: String(limit),
      inlinecount: 'true',
    });
    const res = await fetch(`${API_URL}/cnpj?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Erro na API Nuvem Fiscal:', res.status, errBody);
      return json({ error: 'Falha ao buscar empresas. Tente novamente.' }, 502);
    }

    const payload = (await res.json()) as { data?: CnpjEmpresa[] };
    const empresas = payload.data ?? [];

    const leads = empresas
      .map((e) => {
        const phone = pickPhone(e.telefones);
        if (!phone) return null;
        const nomeEmpresa = e.nome_fantasia?.trim() || e.razao_social?.trim() || 'Empresa';
        const dono = e.socios?.[0]?.nome?.trim() || null;
        return {
          cnpj: e.cnpj ?? '',
          empresa: nomeEmpresa,
          nome: dono ?? nomeEmpresa,
          phone,
          email: e.email?.trim() || null,
          atividade: e.atividade_principal?.descricao ?? null,
          cidade: e.endereco?.municipio ?? cidade,
          uf: e.endereco?.uf ?? uf,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return json({ leads, total: leads.length, sem_telefone: empresas.length - leads.length });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
