// Edge Function: PROSPECÇÃO ATIVA de leads a partir de dados PÚBLICOS de CNPJ
// da Receita Federal, via API da Casa dos Dados.
//
// O corretor escolhe UF + cidade + segmento (CNAE) e recebe uma lista de
// empresas locais com nome e telefone público — donos de negócios (clínicas,
// escritórios, lojas) são o público de renda mais alta que compra imóvel.
// Tudo dado público e legal (nada de raspar renda de pessoa física).
//
// Segredo necessário (Supabase → Edge Functions → Secrets):
//   CASADOSDADOS_API_KEY   (Casa dos Dados → Conta → API / Integrações)
//
// Chamada pelo app logado via supabase.functions.invoke('prospect-leads'),
// que envia o JWT do usuário no header Authorization.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API_KEY = Deno.env.get('CASADOSDADOS_API_KEY') ?? '';
const BASE = 'https://api.casadosdados.com.br/v2/public/cnpj';

function normalizeCidade(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/** Extrai o primeiro telefone válido de um objeto de empresa, testando os
 * vários formatos que a Casa dos Dados pode devolver. */
function extractPhone(obj: Record<string, unknown>): string | null {
  const tels = obj.telefones ?? obj.telefone ?? obj.contato_telefonico;
  if (Array.isArray(tels)) {
    for (const t of tels) {
      if (typeof t === 'string') {
        const d = t.replace(/\D/g, '');
        if (d.length >= 10) return d;
      } else if (t && typeof t === 'object') {
        const o = t as Record<string, unknown>;
        const d = `${o.ddd ?? ''}${o.numero ?? o.telefone ?? ''}`.replace(/\D/g, '');
        if (d.length >= 10) return d;
      }
    }
  }
  for (const key of ['ddd_telefone_1', 'ddd_telefone_2', 'telefone_1', 'telefone', 'telefone1']) {
    const v = obj[key];
    if (typeof v === 'string') {
      const d = v.replace(/\D/g, '');
      if (d.length >= 10) return d;
    }
  }
  const combo = `${obj.ddd ?? ''}${obj.numero ?? ''}`.replace(/\D/g, '');
  if (combo.length >= 10) return combo;
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Busca detalhes de um CNPJ (inclui telefone), best-effort. */
async function fetchDetail(cnpj: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE}/${cnpj.replace(/\D/g, '')}`, {
      headers: { 'api-key': API_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.cnpj ?? data?.data ?? data) as Record<string, unknown>;
  } catch {
    return null;
  }
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

    if (!API_KEY) {
      return json({ error: 'Prospecção não configurada (CASADOSDADOS_API_KEY ausente).' }, 500);
    }

    const { uf, cidade, cnae, top } = (await req.json().catch(() => ({}))) as {
      uf?: string;
      cidade?: string;
      cnae?: string;
      top?: number;
    };
    if (!uf || !cidade) return json({ error: 'Informe estado e cidade.' }, 400);

    const cnaeDigits = (cnae ?? '').replace(/\D/g, ''); // '' = todos os segmentos
    const limit = Math.min(Math.max(top ?? 20, 1), 30);

    const query: Record<string, unknown> = {
      termo: [],
      atividade_principal: cnaeDigits ? [cnaeDigits] : [],
      natureza_juridica: [],
      uf: [uf.toUpperCase()],
      municipio: [normalizeCidade(cidade)],
      situacao_cadastral: 'ATIVA',
    };
    const body = {
      query,
      range_query: {
        data_abertura: { lte: null, gte: null },
        capital_social: { lte: null, gte: null },
      },
      extras: {
        somente_mei: false,
        excluir_mei: false,
        com_email: true,
        incluir_atividade_secundaria: false,
        com_contato_telefonico: true,
        somente_fixo: false,
        somente_celular: false,
        somente_matriz: false,
        somente_filial: false,
      },
      page: 1,
    };

    const res = await fetch(`${BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': API_KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Erro na API Casa dos Dados:', res.status, errBody);
      return json({ error: 'Falha ao buscar empresas. Verifique a chave e tente de novo.' }, 502);
    }

    const payload = await res.json();
    const raw: Record<string, unknown>[] =
      payload?.data?.cnpj ?? payload?.cnpj ?? payload?.data ?? payload?.results ?? [];
    const candidatos = Array.isArray(raw) ? raw.slice(0, limit) : [];

    // Monta os leads. Se o item da busca já vier com telefone, usa; senão,
    // busca o detalhe do CNPJ (best-effort) para pegar o telefone.
    const leads = [];
    for (const item of candidatos) {
      let phone = extractPhone(item);
      let full = item;
      const cnpj = str(item.cnpj) ?? '';
      if (!phone && cnpj) {
        const detail = await fetchDetail(cnpj);
        if (detail) {
          full = { ...item, ...detail };
          phone = extractPhone(full);
        }
      }
      if (!phone) continue;
      const empresa =
        str(full.nome_fantasia) ?? str(full.razao_social) ?? str(item.razao_social) ?? 'Empresa';
      const socios = full.socios ?? full.qsa;
      let dono: string | null = null;
      if (Array.isArray(socios) && socios.length > 0) {
        const s = socios[0] as Record<string, unknown>;
        dono = str(s.nome) ?? str(s.nome_socio) ?? null;
      }
      leads.push({
        cnpj,
        empresa,
        nome: dono ?? empresa,
        phone,
        email: str(full.email) ?? str(full.correio_eletronico),
        atividade:
          str((full.atividade_principal as Record<string, unknown>)?.descricao as string) ??
          str(full.cnae_principal) ??
          null,
        cidade: str(full.municipio) ?? cidade,
        uf: str(full.uf) ?? uf,
      });
    }

    return json({ leads, total: leads.length, sem_telefone: candidatos.length - leads.length });
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
