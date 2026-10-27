// =====================================================================
// cvcrm-reserva — Supabase Edge Function (Deno), chamada pelo APP
//
// Deploy: arquivo único, sem import relativo. **Verify JWT: LIGADO** — quem
// chama é o corretor, com a sessão dele.
//
//   { "acao": "preparar", "simulationId" }
//       Confere tudo o que a reserva no CV precisa, a partir da simulação do
//       próprio corretor (relatório):
//         • a construtora da simulação tem a reserva ligada ("Habilitar
//           reserva", só o admin liga);
//         • a unidade, conferida no CV agora (o bloco dela no mapa);
//         • o corretor: o CPF do perfil do POUP acha o corretor e a
//           imobiliária dele no CV (pelo hash, `cvcrm_corretores`) — nunca o
//           usuário da integração;
//         • o cliente: o CPF da simulação acha o pré-cadastro no CV
//           (`/api/v1/precadastro/{cpf}`), com a aprovação de financiamento.
//       Devolve o que está pronto e o que falta, em frase de gente.
//   { "acao": "reservar", "simulationId" }
//       Confere de novo e envia. ENQUANTO `ENVIO_LIBERADO` for `false`, não
//       envia nada: o formulário de reserva do CV (os campos exatos do
//       POST /comercial/reservas) ainda não foi confirmado na documentação.
//       Ver docs/CVCRM_RESERVA.md.
//
// Hoje esta função SÓ LÊ o CV: só GET, só os caminhos de
// `ROTAS_DE_LEITURA`. `scripts/testar-cvcrm-somente-leitura.mjs` confere.
// Do cliente, só sai daqui o que o próprio corretor digitou (nome) e o que a
// reserva precisa (id e situação do pré-cadastro, valores aprovados).
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

/**
 * A trava do envio. Só vira `true` quando o corpo do POST /comercial/reservas
 * estiver conferido com a documentação do CV (postreserva-2) e testado numa
 * unidade combinada com a construtora.
 */
const ENVIO_LIBERADO = false;

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

function baseDoCv(url: string): string {
  const base = String(url ?? '').trim().replace(/\/+$/, '').replace(/\/api(\/.*)?$/i, '');
  if (!/^https:\/\/[a-z0-9-]+\.cvcrm\.com\.br$/i.test(base)) {
    throw new Error('URL do CV inválida: use https://<conta>.cvcrm.com.br');
  }
  return base;
}

const ROTAS_DE_LEITURA: RegExp[] = [
  /^\/api\/v1\/comercial\/mapadisponibilidade\/\d{1,9}$/,
  /^\/api\/v1\/precadastro\/\d{11}$/,
];
const ROTA_DE_ESCRITA =
  /(bloquear|desbloquear|reserv|vend|alterar|atualizar|editar|excluir|deletar|remover|cancelar|cadastrar|incluir|inserir|salvar|criar|gerar|aprovar|distrat|webhook|auth|token|delete|update|insert|create|remove)/i;
const PARAMETROS = new Set(['idbloco', 'limitePagina', 'pag']);

function rotaPermitida(caminho: string): boolean {
  return ROTAS_DE_LEITURA.some((r) => r.test(caminho)) && !ROTA_DE_ESCRITA.test(caminho);
}

/** GET no CV. Devolve o status junto: 404 no pré-cadastro é resposta, não erro. */
async function cvGet(cred: Credencial, caminho: string, consulta: Record<string, string | number>) {
  if (!rotaPermitida(caminho)) throw new Error(`rota recusada (o POUP só LÊ o CV aqui): ${caminho.replace(/\d{11}/, '<cpf>')}`);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(consulta)) {
    if (!PARAMETROS.has(k)) throw new Error(`parâmetro recusado: ${k}`);
    qs.set(k, String(v));
  }
  const ctl = new AbortController();
  const prazo = setTimeout(() => ctl.abort(), 25000);
  try {
    const q = qs.toString();
    const r = await fetch(`${baseDoCv(cred.url)}${caminho}${q ? `?${q}` : ''}`, {
      method: 'GET',
      headers: { email: cred.email, token: cred.token, Accept: 'application/json' },
      signal: ctl.signal,
    });
    const txt = await r.text();
    let dados: unknown = null;
    try {
      dados = JSON.parse(txt);
    } catch {
      dados = null;
    }
    return { status: r.status, dados };
  } finally {
    clearTimeout(prazo);
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
const numero = (v: unknown) => {
  const t = texto(v);
  if (t == null) return null;
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};
const lista = (v: unknown): Row[] =>
  (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Row) : []) as Row[];
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** O mesmo hash de `cvcrm-comercial-sync`: sha256("poup-cv:" + dígitos). */
async function hashDoDocumento(documento: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`poup-cv:${documento}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** O pré-cadastro, onde quer que o CV o ponha na resposta (objeto, lista ou `dados`). */
function oPrecadastro(d: unknown): Row | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Row;
  if (inteiro(o.idprecadastro)) return o;
  for (const x of [...lista(o.dados), ...lista(o.precadastros), ...(Array.isArray(d) ? (d as Row[]) : [])]) {
    if (x && inteiro(x.idprecadastro)) return x;
  }
  return null;
}

const SITUACAO_LIVRE = /^dispon/i;

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);
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
    if (acao !== 'preparar' && acao !== 'reservar') return json({ error: `ação inválida: ${acao}` }, 400);

    // A simulação, lida com a sessão do corretor: só a dele.
    const { data: sim } = await usuario
      .from('simulations')
      .select('id, user_id, company_id, development_id, state')
      .eq('id', String(corpo.simulationId ?? ''))
      .maybeSingle();
    if (!sim || sim.user_id !== user.id) return json({ error: 'Simulação não encontrada.' }, 404);
    const estado = (sim.state ?? {}) as Row;
    const unitId = texto(estado.unitId);

    const pendencias: string[] = [];

    // 1. A construtora e a reserva ligada ---------------------------------
    const { data: dev } = await servico
      .from('developments')
      .select('id, company_id, name')
      .eq('id', String(sim.development_id ?? ''))
      .maybeSingle();
    const { data: integ } = dev
      ? await servico
          .from('cvcrm_integracoes')
          .select('id, ativo, situacao, reserva_habilitada')
          .eq('company_id', dev.company_id)
          .maybeSingle()
      : { data: null };
    if (!integ || !integ.ativo || integ.situacao === 'pendente' || !integ.reserva_habilitada) {
      return json({ error: 'A reserva pelo POUP não está ligada para esta construtora.' }, 400);
    }
    const cred = await credencialDe(servico, integ.id);
    if (!cred) return json({ error: 'O CV desta construtora está desligado no POUP.' }, 400);

    // 2. A unidade, conferida no CV agora ---------------------------------
    let unidade: Row | null = null;
    const { data: vinc } = unitId
      ? await servico.from('development_unit_cvcrm').select('cv_unidade').eq('unit_id', unitId).maybeSingle()
      : { data: null };
    const { data: espelho } = vinc?.cv_unidade
      ? await servico
          .from('cvcrm_unidades')
          .select('cv_empreendimento, cv_bloco, identificador')
          .eq('integracao_id', integ.id)
          .eq('cv_unidade', vinc.cv_unidade)
          .maybeSingle()
      : { data: null };
    if (!espelho) {
      pendencias.push('A unidade da simulação não está vinculada a uma unidade do CV.');
    } else {
      const r = await cvGet(
        cred,
        `/api/v1/comercial/mapadisponibilidade/${espelho.cv_empreendimento}`,
        espelho.cv_bloco ? { idbloco: Number(espelho.cv_bloco), limitePagina: 500, pag: 1 } : { limitePagina: 500, pag: 1 },
      );
      const linha = lista((r.dados as Row | null)?.dados).find((x) => inteiro(x.idunidade) === vinc!.cv_unidade);
      const situacao = texto(linha?.situacao);
      unidade = { cvUnidade: vinc!.cv_unidade, identificador: espelho.identificador, situacao, livre: SITUACAO_LIVRE.test(situacao ?? '') };
      if (r.status !== 200) pendencias.push(`Não deu para conferir a unidade no CV agora (${r.status}).`);
      else if (!situacao) pendencias.push('A unidade não apareceu no mapa de disponibilidade do CV.');
      else if (!unidade.livre) pendencias.push(`A unidade está "${situacao}" no CV: só unidade disponível pode ser reservada.`);
    }

    // 3. O corretor: o CPF do perfil acha o corretor e a imobiliária no CV ---
    let corretor: Row | null = null;
    const { data: perfil } = await usuario.from('profiles').select('cpf').eq('id', user.id).maybeSingle();
    const cpfCorretor = digitos(perfil?.cpf);
    if (cpfCorretor.length !== 11) {
      pendencias.push('Cadastre o seu CPF no perfil do POUP: é por ele que o CV reconhece você como corretor.');
    } else {
      const { data: c } = await servico
        .from('cvcrm_corretores')
        .select('cv_corretor, cv_imobiliaria, imobiliaria, ativo')
        .eq('integracao_id', integ.id)
        .eq('documento_hash', await hashDoDocumento(cpfCorretor))
        .order('ativo', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!c) {
        pendencias.push('O seu CPF não está no cadastro de corretores do CV desta construtora. Peça à construtora para cadastrar você.');
      } else {
        corretor = { cvCorretor: c.cv_corretor, cvImobiliaria: c.cv_imobiliaria, imobiliaria: c.imobiliaria, ativo: c.ativo };
        if (!c.ativo) pendencias.push('O seu cadastro de corretor no CV desta construtora está inativo.');
      }
    }

    // 4. O cliente: o CPF da simulação acha o pré-cadastro no CV --------------
    let cliente: Row | null = null;
    const proponente = (estado.proponent1 ?? {}) as Row;
    const cpfCliente = digitos(proponente.cpf);
    if (cpfCliente.length !== 11) {
      pendencias.push('Informe o CPF do cliente na simulação: é por ele que o POUP acha o cliente no CV.');
    } else {
      const r = await cvGet(cred, `/api/v1/precadastro/${cpfCliente}`, {});
      const p = r.status === 200 ? oPrecadastro(r.dados) : null;
      if (r.status === 403) {
        pendencias.push('O usuário de integração do CV não tem a permissão "Listar Pré-cadastros".');
      } else if (!p) {
        pendencias.push('Este CPF não tem pré-cadastro no CV desta construtora.');
      } else {
        // Do pré-cadastro, só o que a reserva usa. Nada de documento, renda ou contato.
        cliente = {
          nome: texto(proponente.name),
          cvPrecadastro: inteiro(p.idprecadastro),
          situacao: texto(p.situacao),
          valorAprovado: numero(p.valor_aprovado),
          valorSubsidio: numero(p.valor_subsidio),
          valorFgts: numero(p.valor_fgts),
          vencimentoAprovacao: texto(p.vencimento_aprovacao),
        };
      }
    }

    const preparo = { envioLiberado: ENVIO_LIBERADO, empreendimento: dev?.name ?? null, unidade, corretor, cliente, pendencias };
    if (acao === 'preparar') return json({ ok: true, ...preparo });

    // 'reservar' -----------------------------------------------------------
    if (pendencias.length > 0) return json({ error: pendencias[0], ...preparo }, 400);
    if (!ENVIO_LIBERADO) {
      return json(
        {
          error:
            'Tudo conferido, mas o envio da reserva ao CV ainda não foi liberado: falta confirmar o formulário de reserva do CV.',
          ...preparo,
        },
        409,
      );
    }
    return json({ error: 'Envio indisponível.' }, 409);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
