// Edge Function: PROSPECÇÃO ATIVA de leads a partir de dados PÚBLICOS de CNPJ
// da Receita Federal, via API da Casa dos Dados.
//
// O corretor escolhe UF + cidade + segmento (CNAE) e recebe uma lista de
// empresas locais com nome e telefone público — donos de negócios (clínicas,
// escritórios, lojas) são o público de renda mais alta que compra imóvel.
// Tudo dado público e legal (nada de raspar renda de pessoa física).
//
// Limite: até 10 leads no período da manhã e 10 à tarde (horário de Brasília).
//
// Segredo necessário (Supabase → Edge Functions → Secrets):
//   CASADOSDADOS_API_KEY   (Casa dos Dados → Conta → API / Integrações)
//
// Requer a migration 0010_prospect_usage.sql.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API_KEY = Deno.env.get('CASADOSDADOS_API_KEY') ?? '';
const BASE = 'https://api.casadosdados.com.br/v2/public/cnpj';
const PERIOD_CAP = 10; // 10 de manhã + 10 à tarde = 20/dia

function normalizeCidade(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

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

async function fetchDetail(cnpj: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE}/${cnpj.replace(/\D/g, '')}`, {
      headers: { 'api-key': API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.cnpj ?? data?.data ?? data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Período (manhã/tarde) e dia no horário de Brasília (UTC-3, sem horário de verão). */
function brasiliaPeriodo(): { dia: string; periodo: 'manha' | 'tarde' } {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  const dia = brt.toISOString().slice(0, 10);
  const periodo = brt.getUTCHours() < 12 ? 'manha' : 'tarde';
  return { dia, periodo };
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
      return json({ error: 'Prospecção não configurada (CASADOSDADOS_API_KEY ausente).' });
    }

    const { uf, cidade, cnae } = (await req.json().catch(() => ({}))) as {
      uf?: string;
      cidade?: string;
      cnae?: string;
    };
    if (!uf || !cidade) return json({ error: 'Informe estado e cidade.' });

    // --- Limite por período (manhã/tarde) ---
    const { dia, periodo } = brasiliaPeriodo();
    const { data: usage } = await admin
      .from('prospect_usage')
      .select('usados')
      .eq('user_id', user.id)
      .eq('dia', dia)
      .eq('periodo', periodo)
      .maybeSingle();
    const usados = (usage?.usados as number) ?? 0;
    const restante = PERIOD_CAP - usados;
    if (restante <= 0) {
      const proximo = periodo === 'manha' ? 'à tarde' : 'amanhã de manhã';
      return json({
        error: `Você já usou seus ${PERIOD_CAP} leads do período da ${periodo === 'manha' ? 'manhã' : 'tarde'}. Volte ${proximo} para prospectar mais.`,
      });
    }
    const limit = Math.min(restante, PERIOD_CAP);

    const cnaeDigits = (cnae ?? '').replace(/\D/g, ''); // '' = todos os segmentos
    const body = {
      query: {
        termo: [],
        atividade_principal: cnaeDigits ? [cnaeDigits] : [],
        natureza_juridica: [],
        uf: [uf.toUpperCase()],
        municipio: [normalizeCidade(cidade)],
        situacao_cadastral: 'ATIVA',
      },
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

    let res: Response;
    try {
      res = await fetch(`${BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      return json({ error: 'Não consegui falar com a Casa dos Dados.', detail: String(e) });
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('Casa dos Dados', res.status, errBody);
      return json({
        error: `A Casa dos Dados recusou a busca (HTTP ${res.status}). Verifique sua chave/plano.`,
        detail: errBody.slice(0, 400),
      });
    }

    const payload = await res.json().catch(() => ({}));
    const raw: Record<string, unknown>[] =
      payload?.data?.cnpj ?? payload?.cnpj ?? payload?.data ?? payload?.results ?? [];
    const candidatos = Array.isArray(raw) ? raw.slice(0, limit) : [];

    // Enriquece em paralelo: se o item da busca não trouxe telefone, busca o
    // detalhe do CNPJ (com timeout, pra função nunca travar → nada de 502).
    const enriched = await Promise.all(
      candidatos.map(async (item) => {
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
        return { item, full, phone };
      }),
    );

    const leads = enriched
      .filter((e) => e.phone)
      .map(({ item, full, phone }) => {
        const empresa =
          str(full.nome_fantasia) ?? str(full.razao_social) ?? str(item.razao_social) ?? 'Empresa';
        const socios = full.socios ?? full.qsa;
        let dono: string | null = null;
        if (Array.isArray(socios) && socios.length > 0) {
          const s = socios[0] as Record<string, unknown>;
          dono = str(s.nome) ?? str(s.nome_socio) ?? null;
        }
        return {
          cnpj: str(item.cnpj) ?? '',
          empresa,
          nome: dono ?? empresa,
          phone: phone as string,
          email: str(full.email) ?? str(full.correio_eletronico),
          atividade:
            str((full.atividade_principal as Record<string, unknown>)?.descricao as string) ??
            str(full.cnae_principal) ??
            null,
          cidade: str(full.municipio) ?? cidade,
          uf: str(full.uf) ?? uf,
        };
      });

    // Consome a cota do período pela quantidade efetivamente retornada.
    if (leads.length > 0) {
      await admin.from('prospect_usage').upsert(
        { user_id: user.id, dia, periodo, usados: usados + leads.length, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,dia,periodo' },
      );
    }

    return json({
      leads,
      total: leads.length,
      sem_telefone: candidatos.length - leads.length,
      restante: restante - leads.length,
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'Erro interno na prospecção.', detail: (e as Error).message });
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
