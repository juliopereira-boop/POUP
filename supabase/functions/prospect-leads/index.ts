// Edge Function: PROSPECÇÃO ATIVA de leads a partir de dados PÚBLICOS de CNPJ
// da Receita Federal, via API da Casa dos Dados (v5 pesquisa + v4 consulta).
//
// O corretor escolhe UF + cidade + segmento (CNAE) e recebe uma lista de
// empresas locais com nome e telefone público — donos de negócios (clínicas,
// escritórios, lojas) são o público de renda mais alta que compra imóvel.
// Tudo dado público e legal (nada de raspar renda de pessoa física).
//
// Limite: até 10 leads no período da manhã e 10 à tarde (horário de Brasília).
//
// Segredo necessário (Supabase → Edge Functions → Secrets):
//   CASADOSDADOS_API_KEY   (Casa dos Dados → Chave da API)
//
// Requer a migration 0010_prospect_usage.sql.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API_KEY = Deno.env.get('CASADOSDADOS_API_KEY') ?? '';
const PESQUISA_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo';
const CONSULTA_BASE = 'https://api.casadosdados.com.br/v4/cnpj';
const PERIOD_CAP = 10; // 10 de manhã + 10 à tarde = 20/dia

// Regra do sistema: quando o corretor não escolhe um segmento específico
// ("Todos os segmentos"), a busca foca nesses CNAEs (os de maior retorno de
// leads com telefone). E SEMPRE priorizamos micro-empresas (porte '01').
const TARGET_CNAES = ['7319002', '8219999', '5320201', '4930201', '9602501', '4923002'];
const PORTE_MICRO = ['01'];

// Contas de teste/admin sem limite de prospecção por período.
const UNLIMITED_EMAILS = new Set(['julio.pereira@sellmyhouse.com.br']);

/** minúsculo, sem acento — a Casa dos Dados usa cidade/UF assim (ex.: "sao paulo"). */
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

/** Extrai o primeiro telefone válido, cobrindo os formatos da pesquisa e da
 * consulta detalhada (inclui bloco aninhado "estabelecimento"). */
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

/** Consulta detalhada de um CNPJ (traz telefone/e-mail). Best-effort + timeout. */
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

    const { uf, cidade, cnae } = (await req.json().catch(() => ({}))) as {
      uf?: string;
      cidade?: string;
      cnae?: string;
    };
    if (!uf || !cidade) return json({ error: 'Informe estado e cidade.' });

    // --- Limite por período (manhã/tarde) — contas de teste são ilimitadas ---
    const unlimited = UNLIMITED_EMAILS.has((user.email ?? '').toLowerCase());
    const { dia, periodo } = brasiliaPeriodo();
    let usados = 0;
    let limit = 30; // ilimitado: puxa mais por busca
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

    const cnaeDigits = (cnae ?? '').replace(/\D/g, ''); // '' = todos → usa TARGET_CNAES
    const body: Record<string, unknown> = {
      codigo_atividade_principal: cnaeDigits ? [cnaeDigits] : TARGET_CNAES,
      situacao_cadastral: ['ATIVA'],
      uf: [uf.toLowerCase()],
      municipio: [slug(cidade)],
      porte_empresa: { codigos: PORTE_MICRO },
      mais_filtros: { com_telefone: true },
      limite: limit,
      pagina: 1,
    };

    let res: Response;
    try {
      res = await fetch(PESQUISA_URL, {
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
      const dica =
        res.status === 401
          ? 'chave de API inválida'
          : res.status === 403
            ? 'sem saldo para a operação'
            : `HTTP ${res.status}`;
      return json({
        error: `A Casa dos Dados recusou a busca (${dica}).`,
        detail: errBody.slice(0, 400),
      });
    }

    const payload = await res.json().catch(() => ({}));
    const raw: Record<string, unknown>[] = payload?.cnpjs ?? payload?.data?.cnpjs ?? [];
    const candidatos = Array.isArray(raw) ? raw.slice(0, limit) : [];

    // Telefone vem da consulta detalhada; busca em paralelo com timeout.
    const enriched = await Promise.all(
      candidatos.map(async (item) => {
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
        return { item, full, phone, email };
      }),
    );

    const leads = enriched
      .filter((e) => e.phone)
      .map(({ item, full, phone, email }) => {
        const empresa = str(full.nome_fantasia) ?? str(full.razao_social) ?? 'Empresa';
        const socios = full.quadro_societario ?? full.socios ?? full.qsa;
        let dono: string | null = null;
        if (Array.isArray(socios) && socios.length > 0) {
          const s = socios[0] as Record<string, unknown>;
          dono = str(s.nome) ?? str(s.nome_socio) ?? null;
        }
        const end = (full.endereco as Record<string, unknown>) ?? {};
        return {
          cnpj: str(item.cnpj) ?? '',
          empresa,
          nome: dono ?? empresa,
          phone: phone as string,
          email,
          atividade:
            str((full.atividade_principal as Record<string, unknown>)?.descricao as string) ?? null,
          cidade: str(end.municipio) ?? str(full.municipio) ?? cidade,
          uf: (str(end.uf) ?? str(full.uf) ?? uf).toUpperCase(),
        };
      });

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
      sem_telefone: candidatos.length - leads.length,
      restante: unlimited ? null : PERIOD_CAP - usados - leads.length,
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
