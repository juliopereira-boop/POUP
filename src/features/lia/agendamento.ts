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
 * QUEM ENTENDE A FRASE
 * ===========================================================================
 * O cérebro da LIA (`cerebro/agenda.ts`), no aparelho: acha o dia, o horário,
 * o TIPO do compromisso (ligação, reunião, visita, assinatura, documentos,
 * plantão), a cliente da carteira e o empreendimento do cadastro. Antes era
 * um modelo de IA no servidor, que marcava tudo como "visita".
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
import { type ItemCatalogo } from './catalogo';
import { entenderAgendamento } from './cerebro/agenda';
import { hojeLocal } from './cerebro/datas';
import { normalizar } from './materialPorVoz';

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
 * Filtro grosso de propósito — ver o cabeçalho do arquivo.
 */
export function pareceAgendamento(texto: string): boolean {
  const normal = normalizar(texto);
  if (!normal) return false;
  if (RAIZ_INEQUIVOCA.test(normal)) return true;
  return RAIZ_AMBIGUA.test(normal) && PISTA_TEMPO.test(normal);
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

export type ResultadoCriacao = { ok: true; resumo: string } | { ok: false; motivo: string };

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
  sessaoAtiva: () => boolean = () => true,
): Promise<ResultadoCriacao> {
  // O cérebro entende a frase no aparelho: dia, horário, tipo, cliente e empreendimento.
  const r = entenderAgendamento({
    texto,
    hoje: hojeLocal(),
    empreendimentos: catalogo.empreendimentos,
    clientes: catalogo.clientes,
  });
  if (!r.ok) return { ok: false, motivo: r.motivo };

  const c = r.compromisso;
  const startAt = localISO(c.dataISO, c.hora);
  if (!startAt) {
    return { ok: false, motivo: 'Entendi o pedido, mas a data ou o horário não existem. Digite novamente.' };
  }

  const developmentId = c.empreendimento?.id ?? null;
  const companyId = developmentId ? (catalogo.empresaDoEmpreendimento[developmentId] ?? null) : null;
  const descricao = [
    c.cliente ? `Cliente: ${c.cliente.nome}` : c.clienteNomeSolto ? `Cliente: ${c.clienteNomeSolto}` : null,
    c.empreendimento ? `Empreendimento: ${c.empreendimento.nome}` : null,
    'Agendado pela LIA, por texto.',
  ]
    .filter(Boolean)
    .join(' · ');

  if (!sessaoAtiva()) {
    return { ok: false, motivo: 'A LIA foi fechada antes de salvar. Nenhum compromisso foi criado.' };
  }
  const res = await db.appointments.create(userId, {
    title: c.titulo,
    description: descricao,
    typeId: c.tipo,
    leadId: c.cliente?.id ?? null,
    companyId,
    developmentId,
    startAt,
    source: 'lia',
  });

  if (!res.ok) return { ok: false, motivo: `Não consegui salvar: ${res.error}` };

  return {
    ok: true,
    resumo: `${c.titulo}, ${dataAgendamentoBR(c.dataISO)} às ${c.hora}.`,
  };
}

/** AAAA-MM-DD → DD/MM, sem passar por `Date` — mesmo motivo de sempre. */
function dataAgendamentoBR(iso: string): string {
  const [, m, d] = iso.split('-');
  return m && d ? `${d}/${m}` : iso;
}
