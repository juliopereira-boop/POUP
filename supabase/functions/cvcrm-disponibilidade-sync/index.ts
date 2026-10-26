// =====================================================================
// cvcrm-disponibilidade-sync — Supabase Edge Function (Deno)
//
// Deploy: arquivo único, sem import relativo. **Verify JWT: DESLIGADO** —
// quem chama é o pg_cron, que não tem sessão; a função exige o header
// `x-sync-secret` (o segredo do Vault, `cvcrm_sync_secret`) antes de
// qualquer outra coisa.
//
// O QUE FAZ: para CADA EMPRESA com o CV integrado (cada construtora tem a
// sua conta do CV, cadastrada pelo admin no POUP), lê a situação das
// unidades e entrega ao banco, que grava só o que mudou e repinta as
// unidades vinculadas.
//
//   { "modo": "leve" }      de minuto em minuto: o histórico de situação do
//                           CVDW de cada conta desde a última leitura — uma
//                           chamada por conta (o CVDW aceita 20 por minuto)
//   { "modo": "completo" }  de 30 em 30 min: o mapa de disponibilidade de cada
//                           empreendimento vinculado, para conferir tudo e
//                           pegar unidade nova ou apagada
//   { "modo": "ping", "companyId"? }  confere cada conta (ou uma) no CV
//
// SÓ LEITURA NO CV, POR LISTA FECHADA: só GET, e só os três caminhos de
// `ROTAS_DE_LEITURA`. O CV tem rota que BLOQUEIA unidade
// (`/cadastros/empreendimentos/unidades/bloquear`): ela não está na lista, e
// a segunda trava recusa qualquer caminho com nome de escrita.
//
// A credencial de cada conta vem do banco (`cvcrm_credencial`: url e e-mail
// da tabela, token do Vault). Nenhum secret de CV nas Edge Functions.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  injetados pelo Supabase
// =====================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Row = Record<string, unknown>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// ---------------------------------------------------------------------
// CV CRM (o mesmo bloco nas duas funções: cvcrm-disponibilidade e
// cvcrm-disponibilidade-sync. Mudou numa, muda na outra — o teste confere.)
// ---------------------------------------------------------------------
const env = (k: string) => {
  const v = (Deno.env.get(k) ?? '').trim();
  if (!v) throw new Error(`Secret ausente: ${k}`);
  return v;
};

/**
 * A conta do CV de UMA empresa. Cada construtora tem a sua (o admin cadastra
 * no POUP, "Integrar CV"); o token mora no Vault e só chega aqui pela RPC
 * `cvcrm_credencial`, com service role.
 */
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

// SÓ LEITURA, EM DUAS CAMADAS (decisão do dono do POUP: o CV serve apenas
// para sinalizar disponibilidade — nenhuma edição, nunca):
//   1. só GET, e só nos caminhos desta lista FECHADA;
//   2. mesmo dentro da lista, caminho com nome de escrita é recusado — se
//      alguém acrescentar um caminho errado, a segunda camada ainda barra.
// As duas valem ANTES de abrir conexão. `scripts/testar-cvcrm-somente-leitura.mjs`
// confere a lista e a trava nas duas funções. (A reserva de unidade, quando
// vier, é outra função, com outra lista: docs/CVCRM_RESERVA.md.)
const ROTAS_DE_LEITURA: RegExp[] = [
  /^\/api\/v1\/cadastros\/empreendimentos$/,
  /^\/api\/v1\/comercial\/mapadisponibilidade\/\d{1,9}$/,
  /^\/api\/v1\/cvdw\/unidades\/situacao$/,
];
const ROTA_DE_ESCRITA =
  /(bloquear|desbloquear|reserv|vend|alterar|atualizar|editar|excluir|deletar|remover|cancelar|cadastrar|incluir|inserir|salvar|criar|gerar|aprovar|distrat|webhook|auth|token|delete|update|insert|create|remove)/i;
const PARAMETROS = new Set([
  'limitePagina', 'pag', 'idetapa', 'idbloco', 'registros_por_pagina', 'pagina', 'a_partir_data_referencia',
]);

function rotaPermitida(caminho: string): boolean {
  return ROTAS_DE_LEITURA.some((r) => r.test(caminho)) && !ROTA_DE_ESCRITA.test(caminho);
}

async function cvGet(cred: Credencial, caminho: string, consulta: Record<string, string | number>, ms: number): Promise<Row> {
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
  if (r.status === 401 || r.status === 403) {
    throw new Error(`O CV recusou o e-mail e o token (${r.status}). Confira o usuário de integração no CV.`);
  }
  if (!r.ok) throw new Error(`CV ${caminho} ${r.status}: ${txt.slice(0, 300)}`);
  try {
    return JSON.parse(txt) as Row;
  } catch {
    throw new Error(`CV ${caminho}: a resposta não é JSON`);
  }
}

/** A credencial de uma integração (só service role). `null` = desligada ou sem token. */
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

// Só o que identifica a unidade e a situação dela. O mapa também traz
// documento e motivo do bloqueio (e o cadastro, o nome de quem reservou):
// nada disso sai daqui.
function paraLeitura(x: Row) {
  return {
    unidade: inteiro(x.idunidade),
    etapa: inteiro(x.idetapa),
    etapa_nome: texto(x.etapa),
    bloco_id: inteiro(x.idbloco),
    bloco: texto(x.bloco),
    nome: texto(x.unidade),
    situacao: texto(x.situacao),
  };
}

type UnidadeLida = ReturnType<typeof paraLeitura>;

/** O mapa de disponibilidade inteiro (todas as páginas) de um empreendimento do CV. */
async function lerMapa(
  cred: Credencial,
  empreendimento: number,
  filtro: { idetapa?: number; idbloco?: number },
  ate: number,
): Promise<{ nome: string | null; unidades: UnidadeLida[] }> {
  if (!Number.isInteger(empreendimento) || empreendimento <= 0) throw new Error('empreendimento do CV inválido');
  const unidades: UnidadeLida[] = [];
  let nome: string | null = null;
  for (let pag = 1; pag <= 20; pag++) {
    const d = await cvGet(
      cred,
      `/api/v1/comercial/mapadisponibilidade/${empreendimento}`,
      { limitePagina: 500, pag, ...filtro },
      ate - Date.now(),
    );
    const dados = (Array.isArray(d.dados) ? d.dados : []) as Row[];
    nome ??= texto(dados[0]?.nome_empreendimento);
    for (const x of dados) {
      const u = paraLeitura(x);
      if (u.unidade !== null && u.unidade > 0) unidades.push(u);
    }
    const paginas = inteiro((d.paginacao as Row | undefined)?.total_de_paginas) ?? 1;
    if (pag >= paginas || dados.length === 0) break;
  }
  return { nome, unidades };
}

// ---------------------------------------------------------------------
// O histórico do CVDW
// ---------------------------------------------------------------------
// `referencia_data` vem no relógio do próprio CV ("2026-10-26 15:16:06"). O
// cursor (um por conta) guarda esse texto e a conta é feita nele mesmo —
// sem supor fuso.
const DATA_DO_CV = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/** O começo de hoje em Brasília, no formato do CV (a primeira leitura de uma conta). */
function inicioDeHoje(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return `${p} 00:00:00`;
}

/**
 * De onde a próxima leitura começa: 5 minutos antes do cursor. A sobra
 * relê o que já entrou (aplicar de novo não muda nada) e pega o registro
 * que o CVDW gravou com hora um pouco anterior à última vista.
 */
function desdeOCursor(cursor: string | null): string {
  const m = DATA_DO_CV.exec(cursor ?? '');
  if (!m) return inicioDeHoje();
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 5 * 60_000;
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
}

/** A sequência do registro ("351135_6535" → 351135), para desempatar a mesma hora. */
const sequencia = (referencia: unknown) => Number(String(referencia ?? '').split('_')[0]) || 0;

async function lerMudancas(cred: Credencial, desde: string, ate: number) {
  const linhas: Row[] = [];
  for (let pagina = 1; pagina <= 5 && Date.now() < ate; pagina++) {
    const d = await cvGet(
      cred,
      '/api/v1/cvdw/unidades/situacao',
      { registros_por_pagina: 500, pagina, a_partir_data_referencia: desde },
      ate - Date.now(),
    );
    const dados = (Array.isArray(d.dados) ? d.dados : []) as Row[];
    linhas.push(...dados);
    const paginas = inteiro(d.total_de_paginas) ?? 1;
    if (pagina >= paginas || dados.length === 0) break;
  }
  linhas.sort((a, b) => {
    const da = String(a.referencia_data ?? '');
    const db = String(b.referencia_data ?? '');
    return da < db ? -1 : da > db ? 1 : sequencia(a.referencia) - sequencia(b.referencia);
  });
  // A última mudança de cada unidade. Só id e situação: o resto (quem
  // modificou, nome do empreendimento) não sai daqui.
  const ultima = new Map<number, string>();
  let cursor: string | null = null;
  for (const l of linhas) {
    const unidade = inteiro(l.idunidade);
    const para = texto(l.para_situacao);
    const quando = texto(l.referencia_data);
    if (quando && DATA_DO_CV.test(quando) && (!cursor || quando > cursor)) cursor = quando;
    if (unidade !== null && unidade > 0 && para) ultima.set(unidade, para);
  }
  return {
    lidas: linhas.length,
    cursor,
    mudancas: [...ultima.entries()].map(([unidade, situacao]) => ({ unidade, situacao })),
  };
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
  situacao: string;
  cvdw_cursor: string | null;
}

/** As contas ligadas (com credencial) — e que tenham empreendimento vinculado, se pedido. */
async function contasLigadas(companyId: string | null): Promise<Conta[]> {
  let q = sb().from('cvcrm_integracoes').select('id, company_id, situacao, cvdw_cursor').eq('ativo', true).neq('situacao', 'pendente');
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Conta[];
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
  const modo = String(corpo.modo ?? 'leve');

  if (modo === 'ping') {
    const contas = await contasLigadas(typeof corpo.companyId === 'string' ? corpo.companyId : null);
    const resultado: Row[] = [];
    for (const c of contas) {
      try {
        const cred = await credencialDe(sb(), c.id);
        if (!cred) {
          resultado.push({ companyId: c.company_id, ok: false, erro: 'sem credencial' });
          continue;
        }
        const d = await cvGet(cred, '/api/v1/cadastros/empreendimentos', {}, 30000);
        await rpc('cvcrm_registrar_teste', { p_integracao: c.id, p_ok: true, p_erro: null });
        resultado.push({ companyId: c.company_id, ok: true, empreendimentos: Array.isArray(d) ? d.length : null });
      } catch (e) {
        await sb().rpc('cvcrm_registrar_teste', { p_integracao: c.id, p_ok: false, p_erro: msg(e) });
        resultado.push({ companyId: c.company_id, ok: false, erro: msg(e) });
      }
    }
    return json({ ok: resultado.every((r) => r.ok), contas: resultado });
  }
  if (modo !== 'leve' && modo !== 'completo') return json({ error: `modo inválido: ${modo}` }, 400);

  // Orçamento: a leve acaba antes do próximo minuto; a completa, antes do
  // teto da Edge Function. O que não couber fica para a próxima rodada — a
  // ordem põe o mais atrasado primeiro.
  const ate = Date.now() + (modo === 'leve' ? 40000 : 110000);

  if (!(await rpc<boolean>('cvcrm_sync_iniciar', { p_modo: modo }))) {
    return json({ ok: true, pulou: 'outra leitura em andamento' });
  }

  const detalhe: Row[] = [];
  let lidas = 0;
  let mudaram = 0;
  let erro: string | null = null;

  try {
    const contas = new Map((await contasLigadas(null)).map((c) => [c.id, c]));
    const { data: vinculos, error } = await sb()
      .from('development_cvcrm_empreendimentos')
      .select('integracao_id, cv_empreendimento, cv_etapa, ultimo_completo_em')
      .eq('ativo', true)
      .order('ultimo_completo_em', { ascending: true, nullsFirst: true });
    if (error) throw error;
    const daConta = new Map<string, { cv_empreendimento: number; cv_etapa: number | null }[]>();
    for (const v of vinculos ?? []) {
      if (!contas.has(v.integracao_id)) continue;
      daConta.set(v.integracao_id, [...(daConta.get(v.integracao_id) ?? []), v]);
    }

    for (const [contaId, emps] of daConta) {
      const conta = contas.get(contaId)!;
      if (Date.now() > ate) {
        detalhe.push({ companyId: conta.company_id, pulado: 'sem tempo nesta rodada' });
        continue;
      }
      let cred: Credencial | null;
      try {
        cred = await credencialDe(sb(), contaId);
        if (!cred) throw new Error('integração sem credencial');
      } catch (e) {
        detalhe.push({ companyId: conta.company_id, erro: msg(e) });
        await sb().rpc('cvcrm_registrar_erro', { p_integracao: contaId, p_cv_empreendimento: null, p_cv_etapa: null, p_erro: msg(e) });
        continue;
      }

      if (modo === 'leve') {
        try {
          const desde = desdeOCursor(conta.cvdw_cursor);
          const r = await lerMudancas(cred, desde, ate);
          const aplicado = await rpc<Row>('cvcrm_aplicar_mudancas', {
            p_integracao: contaId, p_mudancas: r.mudancas, p_cursor: r.cursor,
          });
          lidas += r.lidas;
          mudaram += Number(aplicado.mudaram ?? 0);
          // A conta voltou: tira o erro de antes.
          if (conta.situacao === 'erro') await rpc('cvcrm_registrar_teste', { p_integracao: contaId, p_ok: true, p_erro: null });
          detalhe.push({ companyId: conta.company_id, desde, unidades: r.mudancas.length, mudaram: aplicado.mudaram });
        } catch (e) {
          detalhe.push({ companyId: conta.company_id, erro: msg(e) });
          await sb().rpc('cvcrm_registrar_erro', { p_integracao: contaId, p_cv_empreendimento: null, p_cv_etapa: null, p_erro: msg(e) });
        }
        continue;
      }

      // Completa: empreendimento inteiro do CV lido uma vez só, mesmo com etapas.
      const inteiros = new Set(emps.filter((v) => v.cv_etapa == null).map((v) => v.cv_empreendimento));
      for (const v of emps) {
        if (v.cv_etapa != null && inteiros.has(v.cv_empreendimento)) continue;
        const nome = v.cv_etapa == null ? `${v.cv_empreendimento}` : `${v.cv_empreendimento}/${v.cv_etapa}`;
        if (Date.now() > ate) {
          detalhe.push({ companyId: conta.company_id, cv: nome, pulado: 'sem tempo nesta rodada' });
          continue;
        }
        try {
          const mapa = await lerMapa(cred, v.cv_empreendimento, v.cv_etapa == null ? {} : { idetapa: v.cv_etapa }, ate);
          const r = await rpc<Row>('cvcrm_aplicar_leitura', {
            p_integracao: contaId,
            p_cv_empreendimento: v.cv_empreendimento,
            p_cv_etapa: v.cv_etapa,
            p_modo: 'completo',
            p_unidades: mapa.unidades,
          });
          lidas += Number(r.lidas ?? 0);
          mudaram += Number(r.mudaram ?? 0) + Number(r.sumiram ?? 0);
          detalhe.push({ companyId: conta.company_id, cv: nome, ...r });
        } catch (e) {
          detalhe.push({ companyId: conta.company_id, cv: nome, erro: msg(e) });
          await sb().rpc('cvcrm_registrar_erro', {
            p_integracao: contaId, p_cv_empreendimento: v.cv_empreendimento, p_cv_etapa: v.cv_etapa, p_erro: msg(e),
          });
        }
      }
    }
    if (detalhe.some((d) => d.erro)) erro = 'erro em alguma conta ou empreendimento (ver detalhe)';
  } catch (e) {
    erro = msg(e);
  } finally {
    await sb().rpc('cvcrm_sync_terminar', {
      p_modo: modo, p_ok: erro === null, p_lidas: lidas, p_mudaram: mudaram,
      p_erro: erro, p_detalhe: detalhe, p_cursor: null,
    });
  }

  return json({ ok: erro === null, modo, lidas, mudaram, detalhe, erro }, erro ? 500 : 200);
});
