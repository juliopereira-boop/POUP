// =====================================================================
// cvcrm-reserva — Supabase Edge Function (Deno), chamada pelo APP
//
// Deploy: arquivo único, sem import relativo. **Verify JWT: LIGADO** — quem
// chama é o corretor, com a sessão dele.
//
//   { "acao": "preparar", "simulationId", "condicoes" }
//       Confere tudo o que a reserva no CV precisa, a partir da simulação do
//       próprio corretor (relatório):
//         • a construtora da simulação tem a reserva ligada ("Habilitar
//           reserva", só o admin liga);
//         • a unidade, conferida no CV agora (o bloco dela no mapa);
//         • o corretor: o CPF do perfil do POUP acha o corretor (e a
//           imobiliária dele) no CV, pelo hash (`cvcrm_corretores`) — nunca o
//           usuário da integração;
//         • o cliente: o CPF da simulação acha o pré-cadastro no CV
//           (`/api/v1/precadastro/{cpf}`) e, nele, a pessoa (`idpessoa`);
//         • as condições: cada parte do fluxo da simulação (ato, mensais,
//           semestrais, anuais, financiamento, FGTS, subsídio) na série do CV
//           que o admin escolheu.
//       Devolve o que está pronto e o que falta, em frase de gente.
//   { "acao": "reservar", "simulationId", "condicoes" }
//       Confere de novo e cria a reserva no CV
//       (`POST /api/v1/comercial/reservas`). O recibo (`cvcrm_reservas`) não
//       deixa o mesmo pedido entrar duas vezes. A reserva é do CV: o POUP
//       guarda só quem pediu, quando e o número que o CV deu.
//
// O QUE ESTA FUNÇÃO FAZ NO CV, POR LISTA FECHADA:
//   • GET só em `ROTAS_DE_LEITURA` (mapa da unidade, pré-cadastro pelo CPF,
//     reservas do CVDW para achar o número da reserva criada);
//   • POST só em `ROTA_DE_ENVIO`: criar a reserva, e nada mais (cancelar,
//     alterar situação, informar venda, distrato… não estão aqui).
// `scripts/testar-cvcrm-somente-leitura.mjs` confere.
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
  /^\/api\/v1\/cvdw\/reservas$/,
];
/** A única escrita no CV: criar a reserva. */
const ROTA_DE_ENVIO = /^\/api\/v1\/comercial\/reservas$/;
const ROTA_DE_ESCRITA =
  /(bloquear|desbloquear|reserv|vend|alterar|atualizar|editar|excluir|deletar|remover|cancelar|cadastrar|incluir|inserir|salvar|criar|gerar|aprovar|distrat|webhook|auth|token|delete|update|insert|create|remove)/i;
const PARAMETROS = new Set(['idbloco', 'limitePagina', 'pag', 'registros_por_pagina', 'pagina', 'a_partir_data_referencia']);

/** GET: só a lista de leitura (e a segunda trava, fora do CVDW, que é só consulta). */
function rotaPermitida(caminho: string): boolean {
  if (!ROTAS_DE_LEITURA.some((r) => r.test(caminho))) return false;
  return /^\/api\/v1\/cvdw\/[a-z/]+$/.test(caminho) || !ROTA_DE_ESCRITA.test(caminho);
}

/** POST: só criar a reserva. */
function envioPermitido(caminho: string): boolean {
  return ROTA_DE_ENVIO.test(caminho);
}

/** O CV, com status junto: 404 no pré-cadastro e 400 na reserva são respostas, não erros. */
async function cvPedir(
  cred: Credencial,
  metodo: 'GET' | 'POST',
  caminho: string,
  consulta: Record<string, string | number>,
  corpo?: Row,
) {
  if (metodo === 'GET' && !rotaPermitida(caminho)) {
    throw new Error(`rota recusada: ${caminho.replace(/\d{11}/, '<cpf>')}`);
  }
  if (metodo === 'POST' && !envioPermitido(caminho)) throw new Error(`envio recusado: ${caminho}`);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(consulta)) {
    if (!PARAMETROS.has(k)) throw new Error(`parâmetro recusado: ${k}`);
    qs.set(k, String(v));
  }
  const ctl = new AbortController();
  const prazo = setTimeout(() => ctl.abort(), 30000);
  try {
    const q = qs.toString();
    const r = await fetch(`${baseDoCv(cred.url)}${caminho}${q ? `?${q}` : ''}`, {
      method: metodo,
      headers: {
        email: cred.email,
        token: cred.token,
        Accept: 'application/json',
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctl.signal,
    });
    const txt = await r.text();
    let dados: unknown = null;
    try {
      dados = JSON.parse(txt);
    } catch {
      dados = null;
    }
    return { status: r.status, dados, txt: txt.slice(0, 400) };
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
/** "R$ 250.000,00" (como o simulador guarda) → 250000. */
const reais = (v: unknown) => Number(digitos(v) || '0') / 100;

/** O mesmo hash de `cvcrm-comercial-sync`: sha256("poup-cv:" + dígitos). */
async function hashDoTexto(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const hashDoDocumento = (documento: string) => hashDoTexto(`poup-cv:${documento}`);

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

/** A pessoa (o cliente) do pré-cadastro: `idpessoa`, `idpessoa_cv` ou dentro de `pessoa`/`titular`. */
function aPessoa(p: Row): number | null {
  for (const v of [p.idpessoa, p.idpessoa_cv, (p.pessoa as Row | undefined)?.idpessoa, (p.titular as Row | undefined)?.idpessoa_cv]) {
    const n = inteiro(v);
    if (n && n > 0) return n;
  }
  return null;
}

const SITUACAO_LIVRE = /^dispon/i;

// ---------------------------------------------------------------------
// As condições: o fluxo da simulação nas séries do CV
// ---------------------------------------------------------------------
const PARTES = ['ato', 'mensal', 'semestral', 'anual', 'financiamento', 'fgts', 'subsidio'] as const;
type Parte = (typeof PARTES)[number];
const ROTULO: Record<Parte, string> = {
  ato: 'Ato',
  mensal: 'Mensais',
  semestral: 'Semestrais',
  anual: 'Anuais',
  financiamento: 'Financiamento',
  fgts: 'FGTS',
  subsidio: 'Subsídio',
};

interface Condicao {
  parte: Parte;
  quantidade: number;
  valorParcela: number;
  primeiroVencimento: string | null;
}

/** O que o app mandou, conferido: parte conhecida, números positivos, data ISO. */
function lerCondicoes(v: unknown): Condicao[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > PARTES.length) return null;
  const vistas = new Set<string>();
  const out: Condicao[] = [];
  for (const x of v as Row[]) {
    const parte = String(x?.parte ?? '') as Parte;
    const quantidade = Number(x?.quantidade);
    const valorParcela = Math.round(Number(x?.valorParcela) * 100) / 100;
    const venc = texto(x?.primeiroVencimento);
    if (!PARTES.includes(parte) || vistas.has(parte)) return null;
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 600) return null;
    if (!(valorParcela > 0) || valorParcela > 100_000_000) return null;
    if (venc != null && !/^\d{4}-\d{2}-\d{2}$/.test(venc)) return null;
    vistas.add(parte);
    out.push({ parte, quantidade, valorParcela, primeiroVencimento: venc });
  }
  return out;
}

/** "2026-11-10" → "10/11/2026" (o formato do CV). */
const dataDoCv = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Agora menos alguns minutos, no relógio do CV (Brasília): "2026-10-27 09:50:00". */
function minutosAtrasNoCv(minutos: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date(Date.now() - minutos * 60_000))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
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
          .select('id, ativo, situacao, reserva_habilitada, series_reserva, tabela_preco_cv')
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
      const r = await cvPedir(
        cred,
        'GET',
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

    // 4. O cliente: o CPF da simulação acha o pré-cadastro (e a pessoa) no CV --
    let cliente: Row | null = null;
    let idPessoa: number | null = null;
    const proponente = (estado.proponent1 ?? {}) as Row;
    const cpfCliente = digitos(proponente.cpf);
    if (cpfCliente.length !== 11) {
      pendencias.push('Informe o CPF do cliente na simulação: é por ele que o POUP acha o cliente no CV.');
    } else {
      const r = await cvPedir(cred, 'GET', `/api/v1/precadastro/${cpfCliente}`, {});
      const p = r.status === 200 ? oPrecadastro(r.dados) : null;
      if (r.status === 403) {
        pendencias.push('O usuário de integração do CV não tem a permissão "Listar Pré-cadastros".');
      } else if (!p) {
        pendencias.push('Este CPF não tem pré-cadastro no CV desta construtora.');
      } else {
        idPessoa = aPessoa(p);
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
        if (!idPessoa) pendencias.push('O pré-cadastro deste CPF no CV não trouxe a pessoa (cliente) para a reserva.');
      }
    }

    // 5. As condições, nas séries do CV ------------------------------------
    const mapa = (integ.series_reserva ?? {}) as Record<string, number>;
    const condicoes = lerCondicoes(corpo.condicoes);
    const condicoesNoCv: Row[] = [];
    if (!condicoes) {
      pendencias.push('O fluxo de pagamento da simulação está incompleto: confira ato, parcelas e vencimentos.');
    } else {
      const ids = condicoes.map((c) => mapa[c.parte]).filter((n): n is number => Number.isInteger(n));
      const { data: series } = ids.length
        ? await servico.from('cvcrm_series').select('cv_serie, nome').eq('integracao_id', integ.id).in('cv_serie', ids)
        : { data: [] as { cv_serie: number; nome: string }[] };
      const nomeDa = new Map((series ?? []).map((s) => [s.cv_serie, s.nome]));
      for (const c of condicoes) {
        const idserie = mapa[c.parte];
        if (!Number.isInteger(idserie)) {
          pendencias.push(`A construtora ainda não escolheu a série do CV para "${ROTULO[c.parte]}" (cadastro da construtora › Integrar CV).`);
          continue;
        }
        if (c.parte !== 'financiamento' && c.parte !== 'fgts' && c.parte !== 'subsidio' && !c.primeiroVencimento) {
          pendencias.push(`Informe o vencimento de "${ROTULO[c.parte]}" na simulação.`);
        }
        condicoesNoCv.push({
          parte: c.parte,
          rotulo: ROTULO[c.parte],
          serie: nomeDa.get(idserie) ?? `série ${idserie}`,
          idserie_cv: idserie,
          quantidade_parcelas: c.quantidade,
          valor_parcela: c.valorParcela,
          ...(c.primeiroVencimento ? { primeiro_vencimento: dataDoCv(c.primeiroVencimento) } : {}),
        });
      }
      // Nunca acima do valor da unidade (o cupom só desconta).
      const total = condicoes.reduce((s, c) => s + c.quantidade * c.valorParcela, 0);
      const valorDaUnidade = reais(estado.unitValue);
      if (valorDaUnidade > 0 && total > valorDaUnidade * 1.001 + 1) {
        pendencias.push('As condições somam mais do que o valor da unidade. Refaça a simulação.');
      }
    }

    const preparo = {
      empreendimento: dev?.name ?? null,
      unidade,
      corretor,
      cliente,
      condicoes: condicoesNoCv.map(({ rotulo, serie, quantidade_parcelas, valor_parcela, primeiro_vencimento }) => ({
        rotulo, serie, quantidade: quantidade_parcelas, valorParcela: valor_parcela, primeiroVencimento: primeiro_vencimento ?? null,
      })),
      pendencias,
    };
    if (acao === 'preparar') return json({ ok: true, ...preparo });

    // 'reservar' -----------------------------------------------------------
    if (pendencias.length > 0) return json({ error: pendencias[0], ...preparo }, 400);

    // A tabela de preço do CV, quando é ela que vale (a reserva herda as regras).
    let idTabela: number | null = null;
    if (integ.tabela_preco_cv) {
      const { data: e } = await servico
        .from('development_price_tables')
        .select('cv_tabela, fonte')
        .eq('development_id', String(sim.development_id))
        .maybeSingle();
      if (e?.fonte === 'cv' && e.cv_tabela) idTabela = e.cv_tabela;
    }

    const envio: Row = {
      idpessoa_cv: idPessoa,
      idempreendimento_cv: espelho!.cv_empreendimento,
      idunidade_cv: vinc!.cv_unidade,
      idcorretor_cv: corretor!.cvCorretor,
      ...(idTabela ? { idtabela: idTabela } : {}),
      condicoes: condicoesNoCv.map(({ idserie_cv, quantidade_parcelas, valor_parcela, primeiro_vencimento }) => ({
        idserie_cv, quantidade_parcelas, valor_parcela, ...(primeiro_vencimento ? { primeiro_vencimento } : {}),
      })),
    };

    // O recibo: o mesmo pedido não entra duas vezes.
    const chave = `${sim.id}:${vinc!.cv_unidade}`;
    const { data: recibo, error: errRecibo } = await servico.rpc('cvcrm_reserva_abrir', {
      p_integracao: integ.id,
      p_simulation: sim.id,
      p_unit: unitId,
      p_cv_unidade: vinc!.cv_unidade,
      p_por: user.id,
      p_chave: chave,
      p_corpo_hash: await hashDoTexto(JSON.stringify(envio)),
      p_precadastro: (cliente?.cvPrecadastro as number | null) ?? null,
      p_corretor: corretor!.cvCorretor,
      p_imobiliaria: (corretor!.cvImobiliaria as number | null) ?? null,
    });
    if (errRecibo) {
      return json(
        { error: /reserva_em_andamento/.test(errRecibo.message) ? 'Já há uma reserva desta unidade sendo enviada. Aguarde um instante.' : errRecibo.message, ...preparo },
        409,
      );
    }
    const rec = recibo as Row;
    if (rec.novo === false) {
      return json({ ok: true, jaReservada: true, cvReserva: rec.cvReserva ?? null, ...preparo });
    }
    envio.idreserva_int = `POUP-${rec.id}`;

    const r = await cvPedir(cred, 'POST', '/api/v1/comercial/reservas', {}, envio);
    const resposta = (r.dados ?? {}) as Row;
    const mensagem = texto(resposta.mensagem) ?? texto(resposta.error) ?? texto(resposta.message);

    if (r.status === 200 || r.status === 201) {
      // O número da reserva: na resposta, ou no CVDW (a reserva mais nova da unidade com este corretor).
      let cvReserva = inteiro(resposta.idreserva) ?? inteiro((resposta.reserva as Row | undefined)?.idreserva) ?? inteiro(resposta.id);
      if (!cvReserva) {
        const d = await cvPedir(cred, 'GET', '/api/v1/cvdw/reservas', {
          registros_por_pagina: 50, pagina: 1, a_partir_data_referencia: minutosAtrasNoCv(10),
        });
        const achadas = lista((d.dados as Row | null)?.dados)
          .filter((x) => inteiro(x.idunidade) === vinc!.cv_unidade && inteiro(x.idcorretor) === corretor!.cvCorretor)
          .map((x) => inteiro(x.idreserva) ?? 0);
        cvReserva = achadas.length ? Math.max(...achadas) : null;
      }
      await servico.rpc('cvcrm_reserva_concluir', { p_id: rec.id, p_situacao: 'criada', p_cv_reserva: cvReserva, p_erro: null });
      return json({ ok: true, cvReserva, mensagem, ...preparo });
    }

    const motivo =
      r.status === 403
        ? 'O usuário de integração do CV não tem a permissão "Criar nova reserva".'
        : r.status === 401
          ? 'O CV recusou o e-mail e o token da integração.'
          : mensagem ?? `O CV não aceitou a reserva (${r.status}).`;
    await servico.rpc('cvcrm_reserva_concluir', {
      p_id: rec.id,
      p_situacao: r.status === 400 ? 'recusada' : 'erro',
      p_cv_reserva: null,
      p_erro: motivo,
    });
    return json({ error: motivo, ...preparo }, r.status === 400 ? 400 : 502);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
