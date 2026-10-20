// =====================================================================
// uau-disponibilidade — Supabase Edge Function (Deno), chamada pelo APP
//
// Deploy: Dashboard → Edge Functions → cole este arquivo. **Verify JWT:
// LIGADO** — quem chama é o aplicativo, com a sessão do usuário.
//
//   { "acao": "obras" }                                           (admin)
//       As obras que existem no UAU (uma linha por produto), para o admin
//       escolher qual importar. Consulta leve: a 1ª unidade de cada produto.
//   { "acao": "previa",    "empresa", "obra" }                    (admin)
//       Lê a obra inteira no UAU e grava no espelho. Devolve o resumo (e as
//       unidades, com valor) para o admin conferir ANTES de importar ou
//       vincular a obra a um empreendimento.
//   { "acao": "atualizar", "developmentId" }                      (admin)
//       Leitura completa, agora, das obras do empreendimento.
//   { "acao": "conferir",  "unitId" }                  (quem lê a unidade)
//       Confere UMA unidade no UAU na hora — o corretor vai fechar proposta e
//       não pode depender da leitura de até um minuto atrás.
//
// A permissão é conferida com a SESSÃO DO USUÁRIO (as mesmas RPCs das telas);
// a escrita no espelho usa service role, porque o espelho não tem escrita para
// ninguém mais. O UAU só é lido — as rotas que alteram o ERP não estão na
// lista (ver `uau-disponibilidade-sync`).
//
// O bloco "UAU" abaixo é cópia do de `uau-disponibilidade-sync`: o deploy
// deste projeto é arquivo único, sem import relativo. Mudou lá, muda aqui.
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

const env = (k: string, d?: string) => {
  const v = Deno.env.get(k) ?? d;
  if (v === undefined || v === '') throw new Error(`Secret ausente: ${k}`);
  return v;
};

// ---------------------------------------------------------------------
// UAU (cópia de uau-disponibilidade-sync)
// ---------------------------------------------------------------------
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
  if (!r.ok) throw new Error(`UAU ${rota} ${r.status}: ${txt.slice(0, 400)}`);
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

async function uauLogin(): Promise<string> {
  const r = await uauPost('Autenticador/AutenticarUsuario', { Login: env('UAU_USER'), Senha: env('UAU_PASS') }, null, 30000);
  let tok: unknown = r;
  if (tok && typeof tok === 'object') {
    const o = tok as Row;
    tok = o.Token ?? (o.Usuario as Row | undefined)?.Token ?? (o.Data as Row | undefined)?.Token;
  }
  if (typeof tok !== 'string' || !tok.trim()) throw new Error('Login no UAU: resposta inesperada');
  return tok.replace(/"/g, '').trim();
}

const OBRA = /^[A-Z0-9]{1,10}$/;

function dataDaTabelaHoje(): string {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('month')}-${v('day')}-${v('year')}`;
}

const texto = (v: unknown) => (v == null || v === 'null' || String(v).trim() === '' ? null : String(v).trim());
const inteiro = (v: unknown) => {
  const n = Number(texto(v));
  return Number.isInteger(n) ? n : null;
};
const numero = (v: unknown) => {
  const n = Number(texto(v));
  return Number.isFinite(n) ? n : null;
};

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
    entrega_chaves: texto(l.DataEntregaChaves_unid)?.slice(0, 10) ?? null,
    top: inteiro(l.ObjEspelhoTop_unid),
    left: inteiro(l.ObjEspelhoLeft_unid),
  };
}

async function lerDetalhado(token: string, where: string) {
  const dados = await uauPost(
    'Espelho/BuscaUnidadesDeAcordoComWhereDetalhado',
    { where, retorna_venda: true, data_tabela_preco: dataDaTabelaHoje() },
    token,
    100000,
  );
  return linhasDoEspelho(dados).map(paraLeitura);
}

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

    // -----------------------------------------------------------------
    if (acao === 'obras') {
      const { data: admin } = await usuario.rpc('is_app_admin');
      if (admin !== true) return json({ error: 'Só o administrador do POUP vincula o UAU.' }, 403);
      const token = await uauLogin();
      // A primeira unidade de cada produto: uma linha por obra, leve (sem preço).
      const dados = await uauPost(
        'Espelho/BuscaUnidadesDeAcordoComWhere',
        { where: 'WHERE NumPer_unid = 1', retorna_venda: false },
        token,
        60000,
      );
      const vistas = new Map<string, Row>();
      for (const l of linhasDoEspelho(dados).slice(0, 5000)) {
        const empresa = inteiro(l.Empresa_unid);
        const obra = texto(l.Obra_unid)?.toUpperCase() ?? null;
        if (empresa === null || !obra || !OBRA.test(obra)) continue;
        const k = `${empresa}/${obra}`;
        if (!vistas.has(k)) vistas.set(k, { empresa, obra, produto: inteiro(l.Prod_unid), exemplo: texto(l.Identificador_unid) });
      }
      return json({ ok: true, obras: [...vistas.values()] });
    }

    if (acao === 'previa' || acao === 'atualizar') {
      const developmentId = String(corpo.developmentId ?? '');
      if (acao === 'previa') {
        // A prévia vem ANTES de existir o empreendimento (importação): basta ser admin.
        const { data: admin } = await usuario.rpc('is_app_admin');
        if (admin !== true) return json({ error: 'Só o administrador do POUP vincula o UAU.' }, 403);
      } else {
        const { error: semPermissao } = await usuario.rpc('uau_exigir_admin', { p_development: developmentId });
        if (semPermissao) return json({ error: 'Só o administrador do POUP vincula o UAU.' }, 403);
      }

      let obras: { empresa: number; obra: string }[];
      if (acao === 'previa') {
        const empresa = Number(corpo.empresa);
        const obra = String(corpo.obra ?? '').trim().toUpperCase();
        if (!Number.isInteger(empresa) || empresa < 1 || empresa > 9999 || !OBRA.test(obra)) {
          return json({ error: 'Empresa ou obra do UAU inválida (ex.: empresa 1, obra 259V).' }, 400);
        }
        obras = [{ empresa, obra }];
      } else {
        const { data, error } = await servico
          .from('development_uau_obras')
          .select('uau_empresa, uau_obra')
          .eq('development_id', developmentId)
          .eq('ativo', true);
        if (error) throw error;
        obras = (data ?? []).map((o) => ({ empresa: o.uau_empresa, obra: o.uau_obra }));
      }

      const token = await uauLogin();
      const resultado: Row[] = [];
      for (const o of obras) {
        const unidades = await lerDetalhado(token, `WHERE Empresa_unid = ${o.empresa} AND Obra_unid = '${o.obra}'`);
        if (acao === 'previa' && unidades.length === 0) {
          resultado.push({ ...o, unidades: 0, aviso: 'O UAU não devolveu nenhuma unidade para esta obra.' });
          continue;
        }
        const { data: r, error } = await servico.rpc('uau_aplicar_leitura', {
          p_empresa: o.empresa,
          p_obra: o.obra,
          p_modo: 'completo',
          p_unidades: unidades,
        });
        if (error) throw error;
        const porStatus: Record<string, number> = {};
        const entregas: Record<string, number> = {};
        for (const u of unidades) {
          const k = u.descricao ?? String(u.status ?? '?');
          porStatus[k] = (porStatus[k] ?? 0) + 1;
          if (u.entrega_chaves) entregas[u.entrega_chaves] = (entregas[u.entrega_chaves] ?? 0) + 1;
        }
        const valores = unidades.map((u) => u.valor).filter((v): v is number => typeof v === 'number' && v > 0);
        resultado.push({
          ...o,
          unidades: unidades.length,
          porStatus,
          exemplos: unidades.slice(0, 5).map((u) => u.identificador),
          valorMin: valores.length ? Math.min(...valores) : null,
          valorMax: valores.length ? Math.max(...valores) : null,
          // A entrega das chaves mais comum na obra (preenche o cadastro novo).
          entregaChaves: Object.entries(entregas).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
          // A lista, na prévia, para o importador montar blocos e unidades.
          lista:
            acao === 'previa'
              ? unidades.map((u) => ({
                  produto: u.produto,
                  numPer: u.num_per,
                  identificador: u.identificador,
                  status: u.status,
                  descricao: u.descricao,
                  valor: u.valor,
                }))
              : undefined,
          leitura: r,
        });
      }
      return json({ ok: true, obras: resultado });
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
        .from('development_unit_uau')
        .select('uau_empresa, uau_produto, uau_num_per')
        .eq('unit_id', unitId)
        .maybeSingle();
      if (!v) return json({ ok: true, situacao: 'sem_vinculo' });

      // Freio: a mesma unidade conferida há menos de 15 s devolve o que já
      // está no banco. Sem isso, um toque repetido viraria uma rajada no ERP.
      const { data: atual } = await servico
        .from('uau_unidades')
        .select('uau_obra, conferido_em')
        .eq('uau_empresa', v.uau_empresa)
        .eq('uau_produto', v.uau_produto)
        .eq('uau_num_per', v.uau_num_per)
        .maybeSingle();
      if (!atual) return json({ ok: true, situacao: 'sem_vinculo' });
      const obra = atual.uau_obra as string;
      const recente = !!atual.conferido_em && Date.now() - new Date(atual.conferido_em).getTime() < 15000;

      if (!recente) {
        const token = await uauLogin();
        const unidades = await lerDetalhado(
          token,
          `WHERE Empresa_unid = ${Number(v.uau_empresa)} AND Prod_unid = ${Number(v.uau_produto)} AND NumPer_unid = ${Number(v.uau_num_per)}`,
        );
        if (unidades.length === 1) {
          const { error } = await servico.rpc('uau_aplicar_leitura', {
            p_empresa: v.uau_empresa,
            p_obra: obra,
            p_modo: 'pontual',
            p_unidades: unidades,
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
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
