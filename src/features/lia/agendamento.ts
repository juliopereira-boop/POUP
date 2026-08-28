/**
 * A LIA MARCANDO COMPROMISSO NO CALENDÁRIO.
 *
 * ===========================================================================
 * A CONVERSA
 * ===========================================================================
 *   corretor: "agenda pro dia 25 às 10 horas, apresentar o Connect pra Fulana"
 *   LIA:      [cria o compromisso e confirma]
 *
 * ===========================================================================
 * POR QUE ISTO É UM CAMINHO SEPARADO DA CAPTURA DE CAMPOS
 * ===========================================================================
 * A captura principal (`campos.ts`, `extrair.ts`) roda em CADA pausa da
 * negociação, o tempo todo, porque o valor dela é justamente acompanhar uma
 * conversa longa. Agendar é o oposto: uma frase curta, isolada, rara — a
 * imensa maioria das sessões da LIA nunca tem uma.
 *
 * Se agendamento morasse dentro da extração de campos, cada uma das dezenas
 * de chamadas por reunião pagaria pela lista de clientes e pelas instruções
 * de data/hora, mesmo quando ninguém pediu para marcar nada. Separado, o
 * custo dessa capacidade é zero em toda sessão que não a usa.
 *
 * ===========================================================================
 * O GATILHO LOCAL, ANTES DE QUALQUER CHAMADA
 * ===========================================================================
 * `pareceAgendamento` é o mesmo princípio de `gatilho.ts`: um filtro grosso,
 * de propósito, que roda no aparelho e não custa nada. "agend" sozinho já
 * chama — ninguém diz essa raiz por acaso. "marc" (marca, marque, marcar) é
 * ambíguo demais sozinho ("é a marca do carro dela"), então só passa
 * acompanhado de uma pista de data ou hora.
 *
 * ===========================================================================
 * NUNCA CHUTA DATA OU HORÁRIO
 * ===========================================================================
 * Um compromisso com a data errada é pior que nenhum compromisso: o corretor
 * confia no calendário e falta à visita certa, ou aparece no dia errado na
 * frente do cliente. Por isso a extração devolve `null` sempre que faltar
 * data OU hora com segurança — a mesma regra que rege toda esta aplicação.
 */
import { db } from '@/data';
import { localISO } from '@/features/agenda/dates';
import { mensagemDoErro } from '@/lib/edgeError';
import { supabase } from '@/lib/supabase';
import { resolverDoCatalogo, type ItemCatalogo } from './catalogo';
import { VERSAO_CONTRATO } from './extrair';
import { nomesCitados, normalizar } from './materialPorVoz';

/** "agend" cobre agenda/agendar/agendou/agendado — raiz que não tem uso ambíguo. */
const RAIZ_INEQUIVOCA = /\bagend/;

/**
 * "marc"/"marqu" cobre marca/marcar/marcado/marque — comum, então pede reforço.
 *
 * Duas raízes, não uma: o português muda "c" por "qu" antes de "e" para manter
 * o som (marcar → marque, não "marce"). Sem a segunda, exatamente a forma mais
 * usada para pedir — "marque para..." — passaria batida.
 */
const RAIZ_AMBIGUA = /\bmarc(a|ar|ou|ado|ada|amos|aram)\b|\bmarqu(e|ei|em|amos)\b/;

/** Pistas de que a frase tem uma data ou hora — o reforço que falta à raiz ambígua. */
const PISTA_TEMPO =
  /\d|hora|amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|semana|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/;

/**
 * A frase tem cara de comando de agendamento?
 *
 * Filtro grosso de propósito — ver o cabeçalho do arquivo. Um falso positivo
 * custa uma chamada de sobra ao modelo mais barato; um falso negativo perde um
 * compromisso que o corretor pediu para marcar.
 */
export function pareceAgendamento(texto: string): boolean {
  const normal = normalizar(texto);
  if (!normal) return false;
  if (RAIZ_INEQUIVOCA.test(normal)) return true;
  return RAIZ_AMBIGUA.test(normal) && PISTA_TEMPO.test(normal);
}

export interface AgendamentoOuvido {
  titulo: string;
  /** AAAA-MM-DD, já resolvido contra "hoje". */
  dataISO: string;
  /** HH:MM, 24 horas. */
  hora: string;
  /** Nome como está na lista de empreendimentos — o casamento é local. */
  empreendimentoNome: string | null;
  /** Nome do cliente, como foi dito ou como está na lista de leads. */
  clienteNome: string | null;
}

export type ResultadoAgendamento =
  | { ok: true; agendamento: AgendamentoOuvido }
  | { ok: false; motivo: string }
  | { erro: string };

interface PedidoAgendamento {
  /** A frase que disparou o gatilho local. */
  texto: string;
  hoje: string;
  empreendimentos: string[];
  clientes: string[];
}

export async function extrairAgendamento(p: PedidoAgendamento): Promise<ResultadoAgendamento> {
  const { data, error } = await supabase.functions.invoke('lia-extract', {
    body: {
      versao: VERSAO_CONTRATO,
      modo: 'agendamento',
      texto: p.texto,
      hoje: p.hoje,
      empreendimentos: p.empreendimentos,
      clientes: p.clientes,
    },
  });

  if (error) {
    // Ver a nota em `extrair.ts`: a explicação (limite de uso, por exemplo)
    // vem no corpo da resposta, não em `error.message`.
    return { erro: await mensagemDoErro(error, 'A LIA não conseguiu processar o agendamento agora.') };
  }

  const payload = data as {
    versao?: number;
    agendamento?: {
      titulo?: string | null;
      data?: string | null;
      hora?: string | null;
      empreendimento?: string | null;
      cliente?: string | null;
    } | null;
    motivo?: string | null;
    error?: string;
  };
  if (payload?.error) return { erro: payload.error };
  if (payload?.versao !== VERSAO_CONTRATO) {
    return { erro: 'A LIA no servidor está desatualizada. Publique a função lia-extract novamente.' };
  }

  const a = payload.agendamento;
  if (!a || !a.titulo?.trim() || !a.data?.trim() || !a.hora?.trim()) {
    return {
      ok: false,
      motivo:
        payload.motivo?.trim() ||
        'Não consegui identificar data e horário com segurança. Diga de novo com o dia e a hora.',
    };
  }

  return {
    ok: true,
    agendamento: {
      titulo: a.titulo.trim(),
      dataISO: a.data.trim(),
      hora: a.hora.trim(),
      empreendimentoNome: a.empreendimento?.trim() || null,
      clienteNome: a.cliente?.trim() || null,
    },
  };
}

/* ===========================================================================
 * DA FRASE AO COMPROMISSO NO BANCO
 * ===========================================================================
 * Entender a frase é metade do trabalho; a outra metade é resolver os nomes
 * contra o cadastro e gravar. Isto mora aqui, e não em cada tela, porque são
 * DOIS caminhos que fazem exatamente a mesma coisa:
 *
 *   1. a **escuta ambiente** — o corretor diz "agenda pro dia 25" no meio da
 *      negociação e a LIA marca sem interromper nada;
 *   2. o **item Agenda do leque** — ele abre a LIA só para isso, fala uma
 *      frase e pronto.
 *
 * Duplicar resolveria hoje e divergiria no primeiro ajuste que só um dos dois
 * recebesse.
 */

/** O catálogo que o agendamento precisa para resolver nomes falados. */
export interface CatalogoAgendamento {
  empreendimentos: ItemCatalogo[];
  clientes: ItemCatalogo[];
  /** empreendimentoId → empresaId, para o compromisso já nascer ligado à empresa. */
  empresaDoEmpreendimento: Record<string, string>;
}

export type ResultadoCriacao =
  | { ok: true; resumo: string }
  | { ok: false; motivo: string };

/**
 * Ouve a frase, resolve os nomes e cria o compromisso. O caminho inteiro.
 *
 * Devolve sempre uma frase pronta para a tela — de sucesso ou de recusa. Quem
 * chama não precisa saber em qual das quatro etapas parou.
 */
export async function agendarPorVoz(
  userId: string,
  texto: string,
  catalogo: CatalogoAgendamento,
): Promise<ResultadoCriacao> {
  /*
   * SÓ OS NOMES QUE A FRASE PODE ESTAR CITANDO.
   *
   * Antes ia a carteira inteira — todos os clientes e empreendimentos
   * cadastrados — para o modelo conseguir identificar quem foi mencionado.
   * Funcionava, e era dado demais: para entender "agenda com a Maria na
   * sexta", o necessário é "Maria", não os outros duzentos e noventa e nove
   * clientes, que são terceiros sem relação nenhuma com aquele agendamento.
   *
   * É minimização (LGPD, art. 6º, III), e a triagem é local: nada sai do
   * aparelho antes de passar por ela. Ver `nomesCitados`.
   */
  const r = await extrairAgendamento({
    texto,
    hoje: hojeYmdLocal(),
    empreendimentos: nomesCitados(texto, catalogo.empreendimentos.map((e) => e.nome)),
    clientes: nomesCitados(texto, catalogo.clientes.map((c) => c.nome)),
  });

  if ('erro' in r) return { ok: false, motivo: r.erro };
  if (!r.ok) return { ok: false, motivo: r.motivo };

  const { agendamento } = r;
  const startAt = localISO(agendamento.dataISO, agendamento.hora);
  if (!startAt) {
    return {
      ok: false,
      motivo: 'Entendi o pedido, mas a data ou o horário saíram num formato inválido. Diga de novo.',
    };
  }

  /*
   * Nome → id, pelo mesmo casamento local que resolve empreendimento e
   * correspondente na captura de campos. Não casar não impede o agendamento:
   * o compromisso é criado mesmo assim, só sem o vínculo — perder a visita
   * inteira porque o nome do cliente não bate seria desproporcional.
   */
  const leadId = agendamento.clienteNome
    ? resolverDoCatalogo(agendamento.clienteNome, catalogo.clientes).id
    : null;
  const developmentId = agendamento.empreendimentoNome
    ? resolverDoCatalogo(agendamento.empreendimentoNome, catalogo.empreendimentos).id
    : null;
  const companyId = developmentId
    ? (catalogo.empresaDoEmpreendimento[developmentId] ?? null)
    : null;

  const descricao = [
    agendamento.clienteNome ? `Cliente: ${agendamento.clienteNome}` : null,
    agendamento.empreendimentoNome ? `Empreendimento: ${agendamento.empreendimentoNome}` : null,
    'Agendado pela LIA, por voz.',
  ]
    .filter(Boolean)
    .join(' · ');

  const res = await db.appointments.create(userId, {
    title: agendamento.titulo,
    description: descricao,
    // "Visita" é o tipo mais próximo de "apresentar um empreendimento", que é o
    // comando que motivou este recurso.
    typeId: 'visita',
    leadId,
    companyId,
    developmentId,
    startAt,
    source: 'lia',
  });

  if (!res.ok) return { ok: false, motivo: `Não consegui salvar: ${res.error}` };

  return {
    ok: true,
    resumo: `${agendamento.titulo} — ${dataAgendamentoBR(agendamento.dataISO)} às ${agendamento.hora}.`,
  };
}

/**
 * "Hoje", pelas partes LOCAIS do aparelho — nunca `toISOString()`.
 *
 * `toISOString()` devolve UTC, e à noite no Brasil isso já é o dia seguinte.
 * Errar aqui faria "amanhã" virar "depois de amanhã" perto da meia-noite.
 */
function hojeYmdLocal(): string {
  const agora = new Date();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${m}-${d}`;
}

/** AAAA-MM-DD → DD/MM, sem passar por `Date` — mesmo motivo de sempre. */
function dataAgendamentoBR(iso: string): string {
  const [, m, d] = iso.split('-');
  return m && d ? `${d}/${m}` : iso;
}
