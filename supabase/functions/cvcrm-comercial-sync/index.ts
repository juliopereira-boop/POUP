// =====================================================================
// cvcrm-comercial-sync — Supabase Edge Function (Deno)
//
// Deploy: arquivo único, sem import relativo. **Verify JWT: DESLIGADO** —
// quem chama é o pg_cron (ou o admin, pela RPC `cvcrm_ler_comercial_agora`,
// que usa o mesmo segredo). Exige o header `x-sync-secret` antes de tudo.
//
// O QUE FAZ, para cada construtora com o CV integrado:
//
//   { "modo": "corretores", "companyId"? }
//       Os corretores do CV (CVDW, incremental). Do corretor, só o HASH do
//       CPF, os ids do CV e o nome da imobiliária vão para o banco: é o que a
//       reserva precisa para pôr o corretor certo (o usuário do POUP), e não
//       o usuário da integração.
//   { "modo": "tabelas", "companyId"? }
//       Só para quem ligou a "Tabela de preço do CV": a tabela aprovada e
//       vigente de cada empreendimento vinculado vira a tabela do POUP.
//   { "modo": "series", "companyId"? }
//       As séries de pagamento do CV (ato, mensal, financiamento…), vistas no
//       histórico de condições das reservas (CVDW) — o usuário de integração
//       não lista séries. O admin escolhe, no cadastro da construtora, qual
//       série recebe cada parte do fluxo da simulação.
//   { "modo": "tudo", "companyId"? }   as três.
//
// SÓ LEITURA, POR LISTA FECHADA (a mesma regra da disponibilidade): só GET,
// só os caminhos de `ROTAS_DE_LEITURA`, só os parâmetros de `PARAMETROS`, e
// a segunda trava recusa caminho com nome de escrita (o CVDW, o banco de
// consulta do CV, é só leitura por natureza: lá a trava não vale).
// `scripts/testar-cvcrm-somente-leitura.mjs` confere.
// =====================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Row = Record<string, unknown>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const env = (k: string) => {
  const v = (Deno.env.get(k) ?? '').trim();
  if (!v) throw new Error(`Secret ausente: ${k}`);
  return v;
};

interface Credencial {
  url: string;
  email: string;
  token: string;
}

// O token só vai para o domínio do CV: "https://<conta>.cvcrm.com.br".
function baseDoCv(url: string): string {
  const base = String(url ?? '').trim().replace(/\/+$/, '').replace(/\/api(\/.*)?$/i, '');
  if (!/^https:\/\/[a-z0-9-]+\.cvcrm\.com\.br$/i.test(base)) {
    throw new Error('URL do CV inválida: use https://<conta>.cvcrm.com.br');
  }
  return base;
}

const ROTAS_DE_LEITURA: RegExp[] = [
  /^\/api\/v1\/cvdw\/corretores$/,
  /^\/api\/v1\/cvdw\/reservas\/condicoes$/,
  /^\/api\/v1\/cadastros\/empreendimentos\/\d{1,9}\/tabelasdepreco$/,
  /^\/api\/v1\/cadastros\/empreendimentos\/\d{1,9}\/tabelasdepreco\/\d{1,9}$/,
];
const ROTA_DE_ESCRITA =
  /(bloquear|desbloquear|reserv|vend|alterar|atualizar|editar|excluir|deletar|remover|cancelar|cadastrar|incluir|inserir|salvar|criar|gerar|aprovar|distrat|webhook|auth|token|delete|update|insert|create|remove)/i;
const PARAMETROS = new Set(['registros_por_pagina', 'pagina', 'a_partir_data_referencia', 'aprovado']);

function rotaPermitida(caminho: string): boolean {
  if (!ROTAS_DE_LEITURA.some((r) => r.test(caminho))) return false;
  return /^\/api\/v1\/cvdw\/[a-z/]+$/.test(caminho) || !ROTA_DE_ESCRITA.test(caminho);
}

async function cvGet(cred: Credencial, caminho: string, consulta: Record<string, string | number>, ms: number): Promise<unknown> {
  if (!rotaPermitida(caminho)) throw new Error(`rota recusada (o POUP só LÊ o CV): ${caminho}`);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(consulta)) {
    if (!PARAMETROS.has(k)) throw new Error(`parâmetro recusado: ${k}`);
    qs.set(k, String(v));
  }
  const ctl = new AbortController();
  const prazo = setTimeout(() => ctl.abort(), Math.max(3000, ms));
  let r: Response;
  try {
    const q = qs.toString();
    r = await fetch(`${baseDoCv(cred.url)}${caminho}${q ? `?${q}` : ''}`, {
      method: 'GET',
      headers: { email: cred.email, token: cred.token, Accept: 'application/json' },
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(prazo);
  }
  const txt = await r.text();
  if (r.status === 403) {
    throw new Error(`O usuário de integração do CV não tem permissão para ${caminho.replace(/\/\d+/g, '/…')} (403).`);
  }
  if (r.status === 401) throw new Error('O CV recusou o e-mail e o token (401).');
  if (!r.ok) throw new Error(`CV ${caminho} ${r.status}: ${txt.slice(0, 300)}`);
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(`CV ${caminho}: a resposta não é JSON`);
  }
}

async function credencialDe(servico: SupabaseClient, integracaoId: string): Promise<Credencial | null> {
  const { data, error } = await servico.rpc('cvcrm_credencial', { p_integracao: integracaoId });
  if (error) throw new Error(`cvcrm_credencial: ${error.message}`);
  const c = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  if (!c?.url || !c?.email || !c?.token) return null;
  return { url: String(c.url), email: String(c.email), token: String(c.token) };
}

const texto = (v: unknown) => (v == null || v === 'null' || String(v).trim() === '' ? null : String(v).trim());
const inteiro = (v: unknown) => {
  const n = Number(texto(v));
  return Number.isInteger(n) ? n : null;
};
/** "244780.00", "244.780,00" ou 244780 → 244780. */
function valor(v: unknown): number | null {
  const t = texto(v);
  if (t == null) return null;
  const limpo = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const sim = (v: unknown) => v === true || v === 1 || /^(s|sim|true|1)$/i.test(String(v ?? ''));
/** Uma lista que o CV às vezes manda como objeto { "0": {...} }. */
const lista = (v: unknown): Row[] =>
  (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Row) : []) as Row[];

// ---------------------------------------------------------------------
// O CPF do corretor vira hash ANTES de sair daqui
// ---------------------------------------------------------------------
// sha256("poup-cv:" + só os dígitos). A Edge Function da reserva calcula o
// mesmo hash com o CPF do perfil do corretor no POUP para achá-lo.
async function hashDoDocumento(documento: unknown): Promise<string | null> {
  const digitos = String(documento ?? '').replace(/\D/g, '');
  if (digitos.length !== 11 && digitos.length !== 14) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`poup-cv:${digitos}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------
let _sb: SupabaseClient | null = null;
const sb = () =>
  (_sb ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

async function rpc<T>(fn: string, args: Row): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const msg = (e: unknown) => String((e as Error)?.message ?? e);

interface Conta {
  id: string;
  company_id: string;
  corretores_cursor: string | null;
  series_cursor: string | null;
  tabela_preco_cv: boolean;
}

async function contasLigadas(companyId: string | null): Promise<Conta[]> {
  let q = sb()
    .from('cvcrm_integracoes')
    .select('id, company_id, corretores_cursor, series_cursor, tabela_preco_cv')
    .eq('ativo', true)
    .neq('situacao', 'pendente');
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Conta[];
}

// ---------------------------------------------------------------------
// Corretores (CVDW, incremental por conta)
// ---------------------------------------------------------------------
const DATA_DO_CV = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/** 5 minutos antes do cursor (a sobra relê o que já entrou, sem efeito). */
function desdeOCursor(cursor: string | null): string | null {
  const m = DATA_DO_CV.exec(cursor ?? '');
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 5 * 60_000;
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
}

async function lerCorretores(conta: Conta, cred: Credencial, ate: number) {
  const desde = desdeOCursor(conta.corretores_cursor);
  let gravados = 0;
  let lidos = 0;
  let cursor: string | null = conta.corretores_cursor;
  // O CVDW aceita 20 chamadas por minuto (a leitura leve da disponibilidade
  // usa 1): no máximo 8 páginas por rodada; o resto vem na próxima.
  for (let pagina = 1; pagina <= 8 && Date.now() < ate; pagina++) {
    const consulta: Record<string, string | number> = { registros_por_pagina: 500, pagina };
    if (desde) consulta.a_partir_data_referencia = desde;
    const d = (await cvGet(cred, '/api/v1/cvdw/corretores', consulta, ate - Date.now())) as Row;
    const dados = lista(d.dados);
    lidos += dados.length;
    const corretores: Row[] = [];
    for (const c of dados) {
      const id = inteiro(c.idcorretor);
      const hash = await hashDoDocumento(c.documento);
      const quando = texto(c.referencia_data);
      if (quando && DATA_DO_CV.test(quando) && (!cursor || quando > cursor)) cursor = quando;
      if (!id || !hash) continue;
      // Só isto sai daqui: nome, e-mail e o CPF do corretor ficam no CV.
      corretores.push({
        cv_corretor: id,
        documento_hash: hash,
        cv_imobiliaria: inteiro(c.idimobiliaria),
        imobiliaria: texto(c.imobiliaria),
        ativo: !/^(n|nao|não|false|0)$/i.test(String(c.ativo ?? 'S')),
      });
    }
    const r = await rpc<Row>('cvcrm_aplicar_corretores', {
      p_integracao: conta.id, p_corretores: corretores, p_cursor: cursor,
    });
    gravados += Number(r.gravados ?? 0);
    const paginas = inteiro(d.total_de_paginas) ?? 1;
    if (pagina >= paginas || dados.length === 0) break;
  }
  return { lidos, gravados };
}

// ---------------------------------------------------------------------
// Séries (CVDW: as condições das reservas, incremental por conta)
// ---------------------------------------------------------------------
async function lerSeries(conta: Conta, cred: Credencial, ate: number) {
  const desde = desdeOCursor(conta.series_cursor);
  const vistas = new Map<number, string>();
  let cursor: string | null = conta.series_cursor;
  let lidas = 0;
  // 4 páginas por rodada (o CVDW aceita 20 chamadas por minuto, somadas às
  // outras leituras): as séries se repetem, e o cursor segue na próxima.
  for (let pagina = 1; pagina <= 4 && Date.now() < ate; pagina++) {
    const consulta: Record<string, string | number> = { registros_por_pagina: 500, pagina };
    if (desde) consulta.a_partir_data_referencia = desde;
    const d = (await cvGet(cred, '/api/v1/cvdw/reservas/condicoes', consulta, ate - Date.now())) as Row;
    const dados = lista(d.dados);
    lidas += dados.length;
    for (const c of dados) {
      const quando = texto(c.referencia_data);
      if (quando && DATA_DO_CV.test(quando) && (!cursor || quando > cursor)) cursor = quando;
      const id = inteiro(c.idserie);
      const nome = texto(c.serie);
      // Só o id e o nome da série: valor, vencimento e a reserva ficam no CV.
      if (id && id > 0 && nome) vistas.set(id, nome);
    }
    const paginas = inteiro(d.total_de_paginas) ?? 1;
    if (pagina >= paginas || dados.length === 0) break;
  }
  const r = await rpc<Row>('cvcrm_aplicar_series', {
    p_integracao: conta.id,
    p_series: [...vistas.entries()].map(([cv_serie, nome]) => ({ cv_serie, nome })),
    p_cursor: cursor,
  });
  return { lidas, series: vistas.size, gravadas: r.gravadas };
}

// ---------------------------------------------------------------------
// Tabela de preço (só com a chave ligada)
// ---------------------------------------------------------------------
/** "01/05/2026" ou "2026-05-01" → "2026-05-01". */
function dataIso(v: unknown): string | null {
  const t = texto(v) ?? '';
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Qual tabela usar: a escolhida pelo admin; senão a aprovada, vigente hoje e
 * que não é tabela mínima — havendo mais de uma, a de vigência mais recente.
 */
function escolherTabela(tabelas: Row[], escolhida: number | null, hoje: string): Row | null {
  if (escolhida) return tabelas.find((t) => inteiro(t.idtabela) === escolhida) ?? null;
  const validas = tabelas.filter((t) => {
    if (!inteiro(t.idtabela)) return false;
    if (t.aprovado != null && !sim(t.aprovado)) return false;
    if (sim(t.tabela_minima)) return false;
    const de = dataIso(t.data_vigencia_de);
    const ate = dataIso(t.data_vigencia_ate);
    return (!de || de <= hoje) && (!ate || ate >= hoje);
  });
  validas.sort((a, b) => (dataIso(b.data_vigencia_de) ?? '').localeCompare(dataIso(a.data_vigencia_de) ?? ''));
  return validas[0] ?? null;
}

async function lerTabelas(conta: Conta, cred: Credencial, ate: number) {
  const { data: emps, error } = await sb()
    .from('development_cvcrm_empreendimentos')
    .select('development_id, cv_empreendimento, cv_tabela')
    .eq('integracao_id', conta.id)
    .eq('ativo', true);
  if (error) throw error;
  const hoje = hojeEmBrasilia();
  const detalhe: Row[] = [];
  // Um empreendimento do POUP pode ter mais de uma etapa do CV: uma leitura por empreendimento do CV.
  const vistos = new Set<string>();
  for (const e of emps ?? []) {
    const chave = `${e.development_id}/${e.cv_empreendimento}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (Date.now() > ate) {
      detalhe.push({ developmentId: e.development_id, pulado: 'sem tempo nesta rodada' });
      continue;
    }
    try {
      const todas = lista(
        await cvGet(cred, `/api/v1/cadastros/empreendimentos/${e.cv_empreendimento}/tabelasdepreco`, { aprovado: 'S' }, ate - Date.now()),
      );
      const tabela = escolherTabela(todas, e.cv_tabela, hoje);
      if (!tabela) {
        const erro = todas.length === 0
          ? 'O CV não tem tabela de preço aprovada para este empreendimento.'
          : 'Nenhuma tabela de preço do CV está aprovada e vigente hoje para este empreendimento.';
        await rpc('cvcrm_registrar_erro_tabela', { p_integracao: conta.id, p_development: e.development_id, p_erro: erro });
        detalhe.push({ developmentId: e.development_id, erro });
        continue;
      }
      const id = inteiro(tabela.idtabela)!;
      const resposta = lista(
        await cvGet(cred, `/api/v1/cadastros/empreendimentos/${e.cv_empreendimento}/tabelasdepreco/${id}`, {}, ate - Date.now()),
      );
      const daTabela = resposta.find((t) => inteiro(t.idtabela) === id) ?? resposta[0];
      const unidades = lista(daTabela?.unidades)
        .map((u) => ({
          cv_unidade: inteiro(u.idunidade),
          venda: valor(u.valor_total),
          area_m2: valor(u.area_privativa),
        }))
        .filter((u) => u.cv_unidade && u.venda);
      const r = await rpc<Row>('cvcrm_aplicar_tabela_de_preco', {
        p_development: e.development_id,
        p_cv_tabela: id,
        p_nome: texto(daTabela?.tabela) ?? texto(tabela.tabela) ?? texto(tabela.nome),
        p_unidades: unidades,
      });
      detalhe.push({ developmentId: e.development_id, tabela: id, ...r });
    } catch (err) {
      await sb().rpc('cvcrm_registrar_erro_tabela', { p_integracao: conta.id, p_development: e.development_id, p_erro: msg(err) });
      detalhe.push({ developmentId: e.development_id, erro: msg(err) });
    }
  }
  await sb().from('cvcrm_integracoes').update({ tabela_lida_em: new Date().toISOString() }).eq('id', conta.id);
  return detalhe;
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  try {
    const ok = await rpc<boolean>('cvcrm_confere_segredo_do_cron', { p_segredo: req.headers.get('x-sync-secret') ?? '' });
    if (ok !== true) return json({ error: 'unauthorized' }, 401);
  } catch (e) {
    return json({ ok: false, error: msg(e) }, 500);
  }

  const corpo = (await req.json().catch(() => ({}))) as Row;
  const modo = String(corpo.modo ?? 'tudo');
  if (!['corretores', 'series', 'tabelas', 'tudo'].includes(modo)) return json({ error: `modo inválido: ${modo}` }, 400);
  const companyId = typeof corpo.companyId === 'string' && corpo.companyId ? corpo.companyId : null;
  const ate = Date.now() + 110000;

  const resultado: Row[] = [];
  try {
    for (const conta of await contasLigadas(companyId)) {
      const cred = await credencialDe(sb(), conta.id);
      if (!cred) {
        resultado.push({ companyId: conta.company_id, erro: 'sem credencial' });
        continue;
      }
      const item: Row = { companyId: conta.company_id };
      if (modo === 'corretores' || modo === 'tudo') {
        try {
          item.corretores = await lerCorretores(conta, cred, ate);
        } catch (e) {
          await sb().rpc('cvcrm_registrar_erro_corretores', { p_integracao: conta.id, p_erro: msg(e) });
          item.corretores = { erro: msg(e) };
        }
      }
      if (modo === 'series' || modo === 'tudo') {
        try {
          item.series = await lerSeries(conta, cred, ate);
        } catch (e) {
          item.series = { erro: msg(e) };
        }
      }
      if ((modo === 'tabelas' || modo === 'tudo') && conta.tabela_preco_cv) {
        try {
          item.tabelas = await lerTabelas(conta, cred, ate);
        } catch (e) {
          await sb().rpc('cvcrm_registrar_erro_tabela', { p_integracao: conta.id, p_development: null, p_erro: msg(e) });
          item.tabelas = { erro: msg(e) };
        }
      }
      resultado.push(item);
    }
  } catch (e) {
    return json({ ok: false, error: msg(e), resultado }, 500);
  }
  return json({ ok: true, modo, resultado });
});
