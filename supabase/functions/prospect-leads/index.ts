import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API_KEY = Deno.env.get('CASADOSDADOS_API_KEY') ?? '';
const PESQUISA_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo';
const CONSULTA_BASE = 'https://api.casadosdados.com.br/v4/cnpj';
const PERIOD_CAP = 10;

const UNLIMITED_EMAILS = new Set(['julio.pereira@sellmyhouse.com.br']);
const UNLIMITED_PER_SEARCH_CAP = 5;

const ALLOWED_UF = new Set([
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt',
  'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to',
]);
const MAX_CIDADE = 120;

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function extractPhone(obj: Record<string, unknown> | null): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const sources: Record<string, unknown>[] = [obj];
  const est = obj.estabelecimento;
  if (est && typeof est === 'object') sources.push(est as Record<string, unknown>);

  for (const src of sources) {
    const tels = src.telefones ?? src.telefone ?? src.contato_telefonico;
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
    for (const [dddKey, numKey] of [
      ['ddd1', 'telefone1'],
      ['ddd2', 'telefone2'],
      ['ddd_1', 'telefone_1'],
    ]) {
      const d = `${src[dddKey] ?? ''}${src[numKey] ?? ''}`.replace(/\D/g, '');
      if (d.length >= 10) return d;
    }
    for (const key of ['ddd_telefone_1', 'ddd_telefone_2', 'telefone_1', 'telefone', 'telefone1']) {
      const v = src[key];
      if (typeof v === 'string') {
        const d = v.replace(/\D/g, '');
        if (d.length >= 10) return d;
      }
    }
  }
  return null;
}

function extractEmail(obj: Record<string, unknown> | null): string | null {
  if (!obj) return null;
  const est = (obj.estabelecimento as Record<string, unknown>) ?? {};
  return str(obj.email) ?? str(est.email) ?? str(obj.correio_eletronico) ?? null;
}

async function fetchDetail(cnpj: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${CONSULTA_BASE}/${cnpj.replace(/\D/g, '')}`, {
      headers: { 'api-key': API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.cnpj && typeof data.cnpj === 'object' ? data.cnpj : data) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

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

    const {
      uf: ufRaw,
      cidade: cidadeRaw,
      excluir,
    } = (await req.json().catch(() => ({}))) as {
      uf?: unknown;
      cidade?: unknown;
      excluir?: unknown;
    };
    const uf = typeof ufRaw === 'string' ? ufRaw.trim().toLowerCase() : '';
    const cidade = typeof cidadeRaw === 'string' ? cidadeRaw.slice(0, MAX_CIDADE).trim() : '';
    if (!uf || !cidade) return json({ error: 'Informe estado e cidade.' });
    if (!ALLOWED_UF.has(uf)) return json({ error: 'Estado inválido.' });
    const excluirCnpjs = Array.isArray(excluir)
      ? excluir.map((c) => String(c).replace(/\D/g, '')).filter(Boolean).slice(0, 2000)
      : [];

    const unlimited = UNLIMITED_EMAILS.has((user.email ?? '').toLowerCase());
    const { dia, periodo } = brasiliaPeriodo();
    let usados = 0;
    let limit = UNLIMITED_PER_SEARCH_CAP;
    if (!unlimited) {
      const { data: usage } = await admin
        .from('prospect_usage')
        .select('usados')
        .eq('user_id', user.id)
        .eq('dia', dia)
        .eq('periodo', periodo)
        .maybeSingle();
      usados = (usage?.usados as number) ?? 0;
      const restante = PERIOD_CAP - usados;
      if (restante <= 0) {
        const proximo = periodo === 'manha' ? 'à tarde' : 'amanhã de manhã';
        return json({
          error: `Você já usou seus ${PERIOD_CAP} leads do período da ${periodo === 'manha' ? 'manhã' : 'tarde'}. Volte ${proximo} para prospectar mais.`,
        });
      }
      limit = Math.min(restante, PERIOD_CAP);
    }

    const buildBody = (page: number, pageSize: number) => ({
      situacao_cadastral: ['ATIVA'],
      uf: [uf.toLowerCase()],
      municipio: [slug(cidade)],
      mei: { optante: true },
      mais_filtros: { com_telefone: true },
      excluir: { cnpj: excluirCnpjs },
      limite: pageSize,
      pagina: page,
    });

    async function fetchPage(
      page: number,
      pageSize: number,
    ): Promise<{ status: number; arr: Record<string, unknown>[]; errText: string }> {
      const r = await fetch(PESQUISA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': API_KEY },
        body: JSON.stringify(buildBody(page, pageSize)),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        return { status: r.status, arr: [], errText: await r.text().catch(() => '') };
      }
      const p = await r.json().catch(() => ({}));
      const arr = p?.cnpjs ?? p?.data?.cnpjs ?? [];
      return { status: 200, arr: Array.isArray(arr) ? arr : [], errText: '' };
    }

    const NOME_RE = /^[\d.\/-]{6,}\s+(.+)$/;

    type Lead = {
      cnpj: string;
      empresa: string;
      nome: string;
      phone: string;
      email: string | null;
      atividade: string | null;
      cidade: string;
      uf: string;
    };

    const PAGE_SIZE = Math.min(limit + 2, 30);
    const MAX_PAGES = 8;
    const leads: Lead[] = [];
    let page = 1;

    for (let i = 0; i < MAX_PAGES && leads.length < limit; i++) {
      let pageData: { status: number; arr: Record<string, unknown>[]; errText: string };
      try {
        pageData = await fetchPage(page, PAGE_SIZE);
      } catch (e) {
        if (i === 0) {
          return json({ error: 'Não consegui falar com a Casa dos Dados.' });
        }
        break;
      }
      if (pageData.status !== 200) {
        if (i === 0) {
          const dica =
            pageData.status === 401
              ? 'chave de API inválida'
              : pageData.status === 403
                ? 'sem saldo para a operação'
                : `HTTP ${pageData.status}`;
          return json({ error: `A Casa dos Dados recusou a busca (${dica}).` });
        }
        break;
      }
      const arr = pageData.arr;
      page++;
      if (arr.length === 0) break;

      const pessoas = arr
        .map((item) => {
          const razao = str(item.razao_social) ?? str(item.nome_fantasia) ?? '';
          if (!razao) return null;
          const m = razao.match(NOME_RE);
          const nome = (m ? m[1] : razao).trim();
          return nome ? { item, nome } : null;
        })
        .filter((x): x is { item: Record<string, unknown>; nome: string } => x !== null);

      const enriched = await Promise.all(
        pessoas.map(async ({ item, nome }) => {
          let phone = extractPhone(item);
          let email = extractEmail(item);
          let full = item;
          const cnpj = str(item.cnpj) ?? '';
          if (!phone && cnpj) {
            const detail = await fetchDetail(cnpj);
            if (detail) {
              full = { ...item, ...detail };
              phone = extractPhone(full);
              email = email ?? extractEmail(full);
            }
          }
          return { item, full, nome, phone, email };
        }),
      );

      for (const e of enriched) {
        if (leads.length >= limit) break;
        if (!e.phone) continue;
        const end = (e.full.endereco as Record<string, unknown>) ?? {};
        leads.push({
          cnpj: str(e.item.cnpj) ?? '',
          empresa: e.nome,
          nome: e.nome,
          phone: e.phone,
          email: e.email,
          atividade:
            str((e.full.atividade_principal as Record<string, unknown>)?.descricao as string) ??
            null,
          cidade: str(end.municipio) ?? str(e.full.municipio) ?? cidade,
          uf: (str(end.uf) ?? str(e.full.uf) ?? uf).toUpperCase(),
        });
      }
    }

    if (!unlimited && leads.length > 0) {
      await admin.from('prospect_usage').upsert(
        {
          user_id: user.id,
          dia,
          periodo,
          usados: usados + leads.length,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,dia,periodo' },
      );
    }

    return json({
      leads,
      total: leads.length,
      restante: unlimited ? null : PERIOD_CAP - usados - leads.length,
    });
  } catch {
    return json({ error: 'Erro interno na prospecção.' });
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
