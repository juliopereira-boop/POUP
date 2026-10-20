// =====================================================================
// uau-disponibilidade-sync — Supabase Edge Function (Deno)
//
// Deploy: Dashboard → Edge Functions → Deploy a new function → cole este
// arquivo (arquivo único, sem import relativo). **Verify JWT: DESLIGADO** —
// quem chama é o pg_cron, que não tem sessão; a função exige o header
// `x-sync-secret` antes de qualquer outra coisa.
//
// O QUE FAZ: lê o Espelho de vendas do UAU das obras vinculadas
// (`development_uau_obras`) e entrega a leitura ao banco
// (`uau_aplicar_leitura`), que grava só o que mudou e repinta as unidades.
//
//   { "modo": "leve" }      de minuto em minuto: só as NÃO vendidas (pequeno)
//   { "modo": "completo" }  de 30 em 30 min: todas, com preço e descrição
//   { "modo": "ping" }      confere secrets e login no UAU
//
// SÓ LEITURA NO UAU, POR LISTA FECHADA. O controlador `Espelho` tem rotas que
// ALTERAM o ERP (`AlterarStatusUnidade`, `AtualizarCamposCustomizados`,
// `AlterarDataEntregaChavesUnidade`). `uauPost` recusa qualquer rota fora de
// `ROTAS_DE_LEITURA` antes de abrir conexão.
//
// Secrets (Edge Functions → Secrets), cadastrados pelo DONO do projeto:
//   UAU_INTEGRATION_TOKEN   header X-INTEGRATION-Authorization
//   UAU_USER, UAU_PASS      login da API do UAU
//   UAU_SYNC_SECRET         segredo do cron (o mesmo valor guardado no Vault)
//   UAU_BASE_URL            opcional (default: API da Canopus)
//   UAU_API_VERSION         opcional (default 1.0)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  injetados pelo Supabase
// =====================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Row = Record<string, unknown>;

const env = (k: string, d?: string) => {
  const v = Deno.env.get(k) ?? d;
  if (v === undefined || v === '') throw new Error(`Secret ausente: ${k}`);
  return v;
};

const BASE = () => env('UAU_BASE_URL', 'https://uauapi.canopusconstrucoes.com.br:4433').replace(/\/+$/, '');
const VER = () => env('UAU_API_VERSION', '1.0');

// SÓ LEITURA, EM DUAS CAMADAS (decisão do dono do POUP: o UAU serve apenas
// para sinalizar disponibilidade e mostrar valor — nenhuma edição, nunca):
//   1. lista FECHADA das únicas rotas que este código pode chamar;
//   2. mesmo dentro da lista, rota com nome de escrita é recusada — se alguém
//      acrescentar uma rota errada à lista, a segunda camada ainda barra.
// As duas valem ANTES de abrir conexão. `scripts/testar-uau-somente-leitura.mjs`
// confere a lista e a trava nas duas funções.
const ROTAS_DE_LEITURA = new Set([
  'Autenticador/AutenticarUsuario',
  'Espelho/BuscaUnidadesDeAcordoComWhere',
  'Espelho/BuscaUnidadesDeAcordoComWhereDetalhado',
]);
const ROTA_DE_ESCRITA =
  /(Alterar|Atualizar|Gravar|Incluir|Inserir|Excluir|Apagar|Remover|Cancelar|Salvar|Cadastrar|Criar|Gerar|Efetivar|Aprovar|Reservar|Vender|Distratar|Desfazer|Delete|Update|Insert|Put|Post|Set|Save|Remove|Create)/i;

function rotaPermitida(rota: string): boolean {
  // "AutenticarUsuario" é a única exceção à palavra-chave ("...Usuario"): ela
  // não contém nenhum verbo de escrita, mas fica explícita aqui.
  const nome = rota.split('/').pop() ?? '';
  return ROTAS_DE_LEITURA.has(rota) && (rota === 'Autenticador/AutenticarUsuario' || !ROTA_DE_ESCRITA.test(nome));
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// ---------------------------------------------------------------------
// UAU
// ---------------------------------------------------------------------
async function fetchComPrazo(url: string, init: RequestInit, ms: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Math.max(3000, ms));
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const cabecalhos = () => ({
  'Content-Type': 'application/json',
  'X-INTEGRATION-Authorization': env('UAU_INTEGRATION_TOKEN'),
});

async function uauPost(rota: string, corpo: unknown, token: string | null, ms: number): Promise<unknown> {
  if (!rotaPermitida(rota)) throw new Error(`rota recusada (o POUP só LÊ o UAU): ${rota}`);
  const r = await fetchComPrazo(
    `${BASE()}/api/v${VER()}/${rota}`,
    {
      method: 'POST',
      headers: token ? { ...cabecalhos(), Authorization: token } : cabecalhos(),
      body: JSON.stringify(corpo ?? {}),
    },
    ms,
  );
  const txt = await r.text();
  // O UAU responde erro como { Detalhe, Mensagem, Descricao } — o motivo útil
  // costuma estar em Descricao ("Comece a condição com WHERE.").
  if (!r.ok) throw new Error(`UAU ${rota} ${r.status}: ${txt.slice(0, 400)}`);
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

async function uauLogin(): Promise<string> {
  const corpo: Row = { Login: env('UAU_USER'), Senha: env('UAU_PASS') };
  const r = await uauPost('Autenticador/AutenticarUsuario', corpo, null, 30000);
  // O token vem como texto, às vezes entre aspas, às vezes dentro de um objeto.
  let tok: unknown = r;
  if (tok && typeof tok === 'object') {
    const o = tok as Row;
    tok = o.Token ?? (o.Usuario as Row | undefined)?.Token ?? (o.Data as Row | undefined)?.Token;
  }
  if (typeof tok !== 'string' || !tok.trim()) throw new Error('Login no UAU: resposta inesperada');
  return tok.replace(/"/g, '').trim();
}

// O código da obra vai DENTRO de um WHERE do SQL do UAU. Só número e letra
// maiúscula; nada que feche aspas. O banco tem a mesma checagem.
const OBRA = /^[A-Z0-9]{1,10}$/;

function whereDaObra(empresa: number, obra: string, codigosFora: number[] | null): string {
  if (!Number.isInteger(empresa) || empresa < 1 || empresa > 9999 || !OBRA.test(obra)) {
    throw new Error(`obra inválida: ${empresa}/${obra}`);
  }
  let w = `WHERE Empresa_unid = ${empresa} AND Obra_unid = '${obra}'`;
  if (codigosFora && codigosFora.length) {
    if (!codigosFora.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) throw new Error('códigos inválidos');
    w += ` AND Vendido_unid NOT IN (${codigosFora.join(',')})`;
  }
  return w;
}

/** "MM-dd-AAAA" de hoje em Brasília — o formato que o `…Detalhado` exige. */
function dataDaTabelaHoje(): string {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('month')}-${v('day')}-${v('year')}`;
}

// O retorno é `[{ MyTable: [ <linha de tipos do .NET>, ...unidades ] }]`. A
// primeira linha diz "System.Int32, mscorlib, ..." em cada campo; e o
// `…Detalhado` já devolveu uma linha final sem chave. As duas ficam de fora.
function linhasDoEspelho(dados: unknown): Row[] {
  const raiz = Array.isArray(dados) ? (dados[0] as Row | undefined) : (dados as Row | undefined);
  const tabela = raiz?.MyTable;
  if (!Array.isArray(tabela)) throw new Error('retorno do UAU sem MyTable');
  return (tabela as Row[]).filter(
    (l) =>
      !Object.values(l).some((v) => typeof v === 'string' && v.startsWith('System.')) &&
      inteiro(l.Prod_unid) !== null &&
      inteiro(l.NumPer_unid) !== null,
  );
}

// Nulo do UAU chega como o TEXTO "null".
const texto = (v: unknown) => (v == null || v === 'null' || String(v).trim() === '' ? null : String(v).trim());
const inteiro = (v: unknown) => {
  const n = Number(texto(v));
  return Number.isInteger(n) ? n : null;
};
const numero = (v: unknown) => {
  const n = Number(texto(v));
  return Number.isFinite(n) ? n : null;
};
const data = (v: unknown) => texto(v)?.slice(0, 10) ?? null;

function paraLeitura(l: Row) {
  return {
    produto: inteiro(l.Prod_unid),
    num_per: inteiro(l.NumPer_unid),
    identificador: texto(l.Identificador_unid),
    status: inteiro(l.Vendido_unid),
    descricao: texto(l.Descr_status),
    planta: texto(l.Codigo_Unid),
    valor: numero(l.ValorTotal) ?? numero(l.ValPreco_unid),
    num_venda: inteiro(l.Num_Ven),
    entrega_chaves: data(l.DataEntregaChaves_unid),
    top: inteiro(l.ObjEspelhoTop_unid),
    left: inteiro(l.ObjEspelhoLeft_unid),
  };
}

async function lerObra(token: string, empresa: number, obra: string, modo: 'leve' | 'completo', codigosFora: number[], ms: number) {
  const t0 = Date.now();
  const dados =
    modo === 'completo'
      ? await uauPost(
          'Espelho/BuscaUnidadesDeAcordoComWhereDetalhado',
          { where: whereDaObra(empresa, obra, null), retorna_venda: true, data_tabela_preco: dataDaTabelaHoje() },
          token,
          ms,
        )
      : await uauPost(
          'Espelho/BuscaUnidadesDeAcordoComWhere',
          { where: whereDaObra(empresa, obra, codigosFora), retorna_venda: false },
          token,
          ms,
        );
  return { unidades: linhasDoEspelho(dados).map(paraLeitura), ms: Date.now() - t0 };
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

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  try {
    if (req.headers.get('x-sync-secret') !== env('UAU_SYNC_SECRET')) return json({ error: 'unauthorized' }, 401);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }

  const corpo = (await req.json().catch(() => ({}))) as Row;
  const modo = String(corpo.modo ?? 'leve');

  if (modo === 'ping') {
    try {
      const t = await uauLogin();
      return json({ ok: true, token: t.length > 0 });
    } catch (e) {
      return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
    }
  }
  if (modo !== 'leve' && modo !== 'completo') return json({ error: `modo inválido: ${modo}` }, 400);

  // Orçamento da execução: a leve tem de acabar antes do próximo minuto; a
  // completa, antes do teto da Edge Function. Obra que não couber fica para a
  // próxima rodada — a ordem abaixo põe a mais atrasada primeiro.
  const prazo = Date.now() + (modo === 'leve' ? 45000 : 110000);

  if (!(await rpc<boolean>('uau_sync_iniciar', { p_modo: modo }))) {
    return json({ ok: true, pulou: 'outra leitura em andamento' });
  }

  const { data: log } = await sb().from('uau_sync_log').insert({ modo }).select('id').single();
  const detalhe: Row[] = [];
  let lidas = 0;
  let mudaram = 0;
  let erroGeral: string | null = null;

  try {
    const coluna = modo === 'leve' ? 'ultimo_leve_em' : 'ultimo_completo_em';
    const { data: obras, error } = await sb()
      .from('development_uau_obras')
      .select('uau_empresa, uau_obra')
      .eq('ativo', true)
      .order(coluna, { ascending: true, nullsFirst: true });
    if (error) throw error;

    if (obras?.length) {
      const codigosFora = modo === 'leve' ? await rpc<number[]>('uau_codigos_vendidos', {}) : [];
      const token = await uauLogin();

      for (const o of obras) {
        if (Date.now() > prazo) {
          detalhe.push({ obra: `${o.uau_empresa}/${o.uau_obra}`, pulada: 'sem tempo nesta rodada' });
          continue;
        }
        try {
          const leitura = await lerObra(token, o.uau_empresa, o.uau_obra, modo, codigosFora, prazo - Date.now());
          const r = await rpc<Row>('uau_aplicar_leitura', {
            p_empresa: o.uau_empresa,
            p_obra: o.uau_obra,
            p_modo: modo,
            p_unidades: leitura.unidades,
            p_codigos_fora: codigosFora.length ? codigosFora : undefined,
          });
          lidas += Number(r.lidas ?? 0);
          mudaram += Number(r.mudaram ?? 0) + Number(r.sumiram ?? 0);
          detalhe.push({ obra: `${o.uau_empresa}/${o.uau_obra}`, ms: leitura.ms, ...r });
        } catch (e) {
          const msg = String((e as Error).message ?? e);
          detalhe.push({ obra: `${o.uau_empresa}/${o.uau_obra}`, erro: msg });
          await sb().rpc('uau_registrar_erro', { p_empresa: o.uau_empresa, p_obra: o.uau_obra, p_erro: msg });
        }
      }
    }
  } catch (e) {
    erroGeral = String((e as Error).message ?? e);
  } finally {
    await sb().rpc('uau_sync_terminar', { p_modo: modo });
    if (log?.id) {
      await sb()
        .from('uau_sync_log')
        .update({
          terminado_em: new Date().toISOString(),
          ok: erroGeral === null && !detalhe.some((d) => d.erro),
          obras: detalhe.length,
          lidas,
          mudaram,
          erro: erroGeral,
          detalhe,
        })
        .eq('id', log.id);
    }
  }

  return json({ ok: erroGeral === null, modo, lidas, mudaram, detalhe, erro: erroGeral }, erroGeral ? 500 : 200);
});
