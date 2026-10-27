// =====================================================================
// cvcrm-disponibilidade — Supabase Edge Function (Deno), chamada pelo APP
//
// Deploy: arquivo único, sem import relativo. **Verify JWT: LIGADO** — quem
// chama é o aplicativo, com a sessão do usuário.
//
// Cada construtora tem a SUA conta do CV. O admin do POUP integra no
// cadastro da empresa ("Integrar CV"); daí em diante tudo aqui usa a conta
// da empresa dona do empreendimento.
//
//   { "acao": "integracao_testar", "companyId"?, "url"?, "email"?, "token"? }   (admin)
//       Testa uma conta no CV (a digitada, ou a já salva da empresa). Não grava.
//   { "acao": "integracao_salvar", "companyId", "url", "email", "token"? }      (admin)
//       Testa e, só se o CV aceitar, grava (o token vai para o Vault; sem
//       token = mantém o salvo e troca só url/e-mail).
//   { "acao": "empreendimentos", "companyId" }                                   (admin)
//       Os empreendimentos que existem no CV daquela empresa.
//   { "acao": "previa", "companyId", "cvEmpreendimento" }                        (admin)
//       Lê o mapa de disponibilidade inteiro e grava no espelho. Devolve o
//       resumo (etapas, situações) e as unidades.
//   { "acao": "atualizar", "developmentId" }                                     (admin)
//       Leitura completa, agora, dos empreendimentos do CV vinculados.
//   { "acao": "conferir", "unitId" }                                 (quem lê a unidade)
//       Confere UMA unidade no CV na hora (o bloco dela) — o corretor vai
//       fechar proposta e não pode depender da leitura de um minuto atrás.
//
// A permissão é conferida com a SESSÃO DO USUÁRIO; o espelho e o Vault são
// escritos com service role. O CV só é lido: só GET, só os caminhos da lista
// (ver `cvcrm-disponibilidade-sync`). O token nunca volta para o aplicativo.
// =====================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Row = Record<string, unknown>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

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

// "01/01/2024" → "2024-01-01".
function dataDoCv(v: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto(v) ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * O que o admin digitou vira "https://<conta>.cvcrm.com.br": aceita só o
 * domínio, com /api/v1 no fim ou com http. Qualquer outro domínio, `null`.
 */
function normalizarUrl(v: unknown): string | null {
  let t = String(v ?? '').trim().toLowerCase();
  if (!t) return null;
  if (!/^https?:\/\//.test(t)) t = `https://${t}`;
  try {
    t = `https://${new URL(t).hostname}`;
  } catch {
    return null;
  }
  return /^https:\/\/[a-z0-9-]+\.cvcrm\.com\.br$/.test(t) ? t : null;
}

const SO_ADMIN = 'Só o administrador do POUP integra o CV.';
const SEM_INTEGRACAO = 'Esta construtora ainda não tem o CV integrado (Catálogo do sistema › construtora › Integrar CV).';

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    // O cliente DO USUÁRIO: as RPCs de permissão rodam como ele.
    const usuario = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
    } = await usuario.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const servico: SupabaseClient = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const corpo = (await req.json().catch(() => ({}))) as Row;
    const acao = String(corpo.acao ?? '');
    const ate = Date.now() + 100000;

    const ehAdmin = async () => (await usuario.rpc('is_app_admin')).data === true;
    /** A integração da empresa (o id), ou null. */
    const integracaoDaEmpresa = async (companyId: string) => {
      const { data } = await servico
        .from('cvcrm_integracoes')
        .select('id, ativo, situacao')
        .eq('company_id', companyId)
        .maybeSingle();
      return (data as { id: string; ativo: boolean; situacao: string } | null) ?? null;
    };
    const credencialDaEmpresa = async (companyId: string) => {
      const i = await integracaoDaEmpresa(companyId);
      return i ? { integracao: i.id, cred: await credencialDe(servico, i.id) } : { integracao: null, cred: null };
    };

    // -----------------------------------------------------------------
    if (acao === 'integracao_testar' || acao === 'integracao_salvar') {
      if (!(await ehAdmin())) return json({ error: SO_ADMIN }, 403);
      const companyId = String(corpo.companyId ?? '');
      const digitouToken = typeof corpo.token === 'string' && corpo.token.trim() !== '';
      let cred: Credencial | null;
      if (digitouToken || corpo.url != null || corpo.email != null) {
        const url = normalizarUrl(corpo.url);
        if (!url) return json({ error: 'Endereço do CV inválido. Use o da conta da construtora, como https://suaconta.cvcrm.com.br.' }, 400);
        const email = String(corpo.email ?? '').trim();
        if (!email) return json({ error: 'Informe o e-mail do usuário de integração do CV.' }, 400);
        let token = digitouToken ? String(corpo.token).trim() : '';
        if (!token && companyId) {
          // O token salvo só vale para a conta em que foi salvo: trocou o
          // endereço, digita o token de novo.
          const salva = (await credencialDaEmpresa(companyId)).cred;
          if (salva && baseDoCv(salva.url).toLowerCase() !== url) {
            return json({ error: 'Trocou o endereço do CV: informe também o token dessa conta.' }, 400);
          }
          token = salva?.token ?? '';
        }
        if (!token) return json({ error: 'Informe o token do usuário de integração do CV.' }, 400);
        cred = { url, email, token };
      } else {
        cred = companyId ? (await credencialDaEmpresa(companyId)).cred : null;
        if (!cred) return json({ error: SEM_INTEGRACAO }, 400);
      }

      // O teste: a lista de empreendimentos da conta (só leitura).
      let empreendimentos: number | null = null;
      try {
        const d = await cvGet(cred, '/api/v1/cadastros/empreendimentos', {}, 30000);
        empreendimentos = Array.isArray(d) ? d.length : Array.isArray(d.dados) ? (d.dados as unknown[]).length : null;
      } catch (e) {
        const erro = String((e as Error)?.message ?? e);
        if (acao === 'integracao_testar' && companyId && !digitouToken) {
          const i = await integracaoDaEmpresa(companyId);
          if (i) await servico.rpc('cvcrm_registrar_teste', { p_integracao: i.id, p_ok: false, p_erro: erro });
        }
        return json({ error: `O CV não aceitou: ${erro}` }, 400);
      }

      if (acao === 'integracao_testar') {
        if (companyId && !digitouToken) {
          const i = await integracaoDaEmpresa(companyId);
          if (i) await servico.rpc('cvcrm_registrar_teste', { p_integracao: i.id, p_ok: true, p_erro: null });
        }
        return json({ ok: true, empreendimentos });
      }

      if (!companyId) return json({ error: 'Empresa não informada.' }, 400);
      const { error } = await servico.rpc('cvcrm_salvar_integracao', {
        p_company: companyId,
        p_url: cred.url,
        p_email: cred.email,
        p_token: digitouToken ? cred.token : null,
        p_por: user.id,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, empreendimentos });
    }

    // -----------------------------------------------------------------
    if (acao === 'empreendimentos') {
      if (!(await ehAdmin())) return json({ error: SO_ADMIN }, 403);
      const { cred } = await credencialDaEmpresa(String(corpo.companyId ?? ''));
      if (!cred) return json({ error: SEM_INTEGRACAO }, 400);
      const d = await cvGet(cred, '/api/v1/cadastros/empreendimentos', {}, 30000);
      const lista = (Array.isArray(d) ? d : Array.isArray(d.dados) ? d.dados : []) as Row[];
      return json({
        ok: true,
        empreendimentos: lista
          .map((e) => ({
            id: inteiro(e.idempreendimento),
            nome: texto(e.nome),
            cidade: texto(e.cidade),
            estado: texto(e.estado),
            dataEntrega: dataDoCv(e.data_entrega),
            unidadesDisponiveis: inteiro(e.unidades_disponiveis),
          }))
          .filter((e) => e.id !== null && e.id > 0),
      });
    }

    // -----------------------------------------------------------------
    if (acao === 'previa') {
      // A prévia vem ANTES de existir o vínculo (importação): basta ser admin.
      if (!(await ehAdmin())) return json({ error: SO_ADMIN }, 403);
      const { integracao, cred } = await credencialDaEmpresa(String(corpo.companyId ?? ''));
      if (!integracao || !cred) return json({ error: SEM_INTEGRACAO }, 400);
      const cv = Number(corpo.cvEmpreendimento);
      if (!Number.isInteger(cv) || cv <= 0 || cv > 999999999) {
        return json({ error: 'Empreendimento do CV inválido.' }, 400);
      }
      const mapa = await lerMapa(cred, cv, {}, ate);
      if (mapa.unidades.length === 0) {
        return json({ ok: true, cvEmpreendimento: cv, nome: mapa.nome, unidades: 0, etapas: [], porSituacao: {}, lista: [],
          aviso: 'O CV não devolveu nenhuma unidade para este empreendimento.' });
      }
      const { data: leitura, error } = await servico.rpc('cvcrm_aplicar_leitura', {
        p_integracao: integracao, p_cv_empreendimento: cv, p_cv_etapa: null, p_modo: 'completo', p_unidades: mapa.unidades,
      });
      if (error) throw error;

      const etapas = new Map<number, { id: number; nome: string; unidades: number }>();
      for (const u of mapa.unidades) {
        if (u.etapa === null) continue;
        const e = etapas.get(u.etapa) ?? { id: u.etapa, nome: u.etapa_nome ?? `Etapa ${u.etapa}`, unidades: 0 };
        e.unidades++;
        etapas.set(u.etapa, e);
      }
      // A lista sai do espelho: o identificador é montado num lugar só (o banco).
      const { data: espelho, error: e2 } = await servico
        .from('cvcrm_unidades')
        .select('cv_unidade, cv_etapa, bloco, unidade, identificador, situacao_descricao')
        .eq('integracao_id', integracao)
        .eq('cv_empreendimento', cv)
        .is('ausente_desde', null)
        .order('cv_unidade')
        .limit(5000);
      if (e2) throw e2;
      const porSituacao: Record<string, number> = {};
      for (const u of espelho ?? []) {
        const k = (u.situacao_descricao as string | null) ?? '?';
        porSituacao[k] = (porSituacao[k] ?? 0) + 1;
      }
      return json({
        ok: true,
        cvEmpreendimento: cv,
        nome: mapa.nome,
        unidades: espelho?.length ?? 0,
        etapas: [...etapas.values()],
        porSituacao,
        lista: (espelho ?? []).map((u) => ({
          cvUnidade: u.cv_unidade,
          etapa: u.cv_etapa,
          bloco: u.bloco,
          nome: u.unidade,
          identificador: u.identificador,
          situacao: u.situacao_descricao,
        })),
        leitura,
      });
    }

    // -----------------------------------------------------------------
    if (acao === 'atualizar') {
      const developmentId = String(corpo.developmentId ?? '');
      const { error: semPermissao } = await usuario.rpc('disponibilidade_exigir_admin', { p_development: developmentId });
      if (semPermissao) return json({ error: SO_ADMIN }, 403);
      const { data: vinculos, error } = await servico
        .from('development_cvcrm_empreendimentos')
        .select('integracao_id, cv_empreendimento, cv_etapa')
        .eq('development_id', developmentId)
        .eq('ativo', true);
      if (error) throw error;
      const resultado: Row[] = [];
      for (const v of vinculos ?? []) {
        const cred = await credencialDe(servico, v.integracao_id);
        if (!cred) return json({ error: SEM_INTEGRACAO }, 400);
        const mapa = await lerMapa(cred, v.cv_empreendimento, v.cv_etapa == null ? {} : { idetapa: v.cv_etapa }, ate);
        const { data: r, error: e } = await servico.rpc('cvcrm_aplicar_leitura', {
          p_integracao: v.integracao_id, p_cv_empreendimento: v.cv_empreendimento, p_cv_etapa: v.cv_etapa,
          p_modo: 'completo', p_unidades: mapa.unidades,
        });
        if (e) throw e;
        resultado.push({ cvEmpreendimento: v.cv_empreendimento, cvEtapa: v.cv_etapa, leitura: r });
      }
      return json({ ok: true, leituras: resultado });
    }

    // -----------------------------------------------------------------
    if (acao === 'conferir') {
      const unitId = String(corpo.unitId ?? '');
      // Quem não lê a unidade não fica sabendo nem se ela tem vínculo.
      const { data: unidade } = await usuario
        .from('development_units')
        .select('id, development_id')
        .eq('id', unitId)
        .maybeSingle();
      if (!unidade) return json({ error: 'Unidade não encontrada.' }, 404);

      const { data: v } = await servico
        .from('development_unit_cvcrm')
        .select('integracao_id, cv_unidade')
        .eq('unit_id', unitId)
        .maybeSingle();
      if (!v?.cv_unidade) return json({ ok: true, situacao: 'sem_vinculo' });

      // Freio: a mesma unidade conferida há menos de 15 s devolve o que já
      // está no banco. Sem isso, um toque repetido viraria uma rajada no CV.
      const { data: atual } = await servico
        .from('cvcrm_unidades')
        .select('cv_empreendimento, cv_bloco, conferido_em')
        .eq('integracao_id', v.integracao_id)
        .eq('cv_unidade', v.cv_unidade)
        .maybeSingle();
      if (!atual) return json({ ok: true, situacao: 'sem_vinculo' });
      const recente = !!atual.conferido_em && Date.now() - new Date(atual.conferido_em).getTime() < 15000;

      if (!recente) {
        const cred = await credencialDe(servico, v.integracao_id);
        if (!cred) return json({ error: 'O CV desta construtora está desligado no POUP.' }, 400);
        // Só o bloco da unidade (16 unidades, uma página).
        const mapa = await lerMapa(
          cred,
          Number(atual.cv_empreendimento),
          atual.cv_bloco ? { idbloco: Number(atual.cv_bloco) } : {},
          ate,
        );
        // O bloco inteiro fica fresco junto; sem a unidade na resposta, nada muda.
        if (mapa.unidades.some((u) => u.unidade === v.cv_unidade)) {
          const { error } = await servico.rpc('cvcrm_aplicar_leitura', {
            p_integracao: v.integracao_id, p_cv_empreendimento: atual.cv_empreendimento, p_cv_etapa: null,
            p_modo: 'pontual', p_unidades: mapa.unidades,
          });
          if (error) throw error;
        }
      }

      const { data: d } = await usuario
        .from('development_unit_disponibilidade')
        .select('situacao, status_descricao, mudou_em')
        .eq('unit_id', unitId)
        .maybeSingle();
      return json({ ok: true, conferidoAgora: !recente, ...(d ?? { situacao: 'sem_vinculo' }) });
    }

    return json({ error: `ação inválida: ${acao}` }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
