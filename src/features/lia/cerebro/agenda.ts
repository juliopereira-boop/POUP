/**
 * O CÉREBRO DA LIA — DA FRASE AO COMPROMISSO.
 *
 * "agenda visita com a Maria sexta às 10 no estrelas" vira:
 *   título "Visita · Village das Estrelas · Maria Souza", sexta-feira, 10:00,
 *   tipo Visita, ligado à cliente e ao empreendimento do cadastro.
 *
 * Melhor que a versão com modelo em dois pontos:
 *   - o TIPO do compromisso sai da frase (ligação, reunião, assinatura,
 *     entrega de documentos, plantão...), em vez de ser sempre "visita";
 *   - o motivo da recusa é específico: "faltou o horário", "faltou o dia".
 *
 * E a regra que não muda: sem dia E horário com segurança, não marca nada.
 */
import { acharNoTexto, acharPorPrimeiroNome, type ItemDoCatalogo } from './catalogo';
import { acharDatas, acharHoras } from './datas';
import { normalizar, normalizarMesmoTamanho } from './texto';

export type TipoDeCompromisso = 'ligacao' | 'followup' | 'reuniao' | 'visita' | 'documentos' | 'assinatura' | 'plantao' | 'outro';

export interface CompromissoEntendido {
  titulo: string;
  dataISO: string;
  hora: string;
  tipo: TipoDeCompromisso;
  empreendimento: ItemDoCatalogo | null;
  cliente: ItemDoCatalogo | null;
  /** Nome de quem não está na carteira ("com o Pedro"), para a descrição. */
  clienteNomeSolto: string | null;
}

export type Entendimento = { ok: true; compromisso: CompromissoEntendido } | { ok: false; motivo: string };

const ACOES: [RegExp, TipoDeCompromisso, string][] = [
  [/\b(?:assinatura|assinar|assina|assinam|contrato)\b/, 'assinatura', 'Assinatura'],
  [/\b(?:entrega de documentos?|entregar (?:os )?documentos?|documentacao|documentos?|levar (?:os )?documentos?)\b/, 'documentos', 'Entrega de documentos'],
  [/\b(?:ligar|ligacao|telefonar|retornar a ligacao|liga pra|liga para)\b/, 'ligacao', 'Ligar'],
  [/\b(?:follow ?up|retorno|retornar|cobrar resposta|dar retorno)\b/, 'followup', 'Retorno'],
  [/\b(?:plantao)\b/, 'plantao', 'Plantão'],
  [/\b(?:reuniao|reunir|conversar|call|videochamada|chamada de video)\b/, 'reuniao', 'Reunião'],
  [/\b(?:apresentar|apresentacao|mostrar|mostra)\b/, 'visita', 'Apresentar'],
  [/\b(?:visita|visitar|conhecer|decorado|levar (?:ele|ela|o cliente|a cliente)|vistoria)\b/, 'visita', 'Visita'],
];

export interface PedidoDeAgenda {
  texto: string;
  hoje: string;
  empreendimentos: ItemDoCatalogo[];
  clientes: ItemDoCatalogo[];
}

export function entenderAgendamento(p: PedidoDeAgenda): Entendimento {
  const original = p.texto.trim();
  if (!original) return { ok: false, motivo: 'Digite o compromisso, com o dia e o horário.' };
  const normal = normalizarMesmoTamanho(original);

  const horas = acharHoras(normal);
  // A hora sai antes: "às 10" não pode virar "dia 10".
  let semHoras = normal;
  for (const h of horas) semHoras = semHoras.slice(0, h.inicio) + ' '.repeat(h.fim - h.inicio) + semHoras.slice(h.fim);
  const datas = acharDatas(semHoras, p.hoje);

  const data = datas[0] ?? null;
  const hora = horas[0] ?? null;
  if (!data && !hora) return { ok: false, motivo: 'Não encontrei o dia nem o horário. Ex.: "visita com a Maria sexta às 10".' };
  if (!data) return { ok: false, motivo: `Entendi o horário (${hora!.hhmm}), mas faltou o dia. Ex.: "amanhã", "sexta", "dia 25".` };
  if (!hora) return { ok: false, motivo: 'Entendi o dia, mas faltou o horário. Ex.: "às 10", "15h30".' };
  if (datas.length > 1 && new Set(datas.map((d) => d.iso)).size > 1) {
    return { ok: false, motivo: 'A frase tem mais de um dia. Digite um compromisso por vez.' };
  }

  const acao = ACOES.find(([re]) => re.test(normal));
  const tipo: TipoDeCompromisso = acao?.[1] ?? 'visita';
  const rotulo = acao?.[2] ?? 'Visita';

  const emp = acharNoTexto(normal, p.empreendimentos);
  const empreendimento = emp.tipo === 'achado' ? emp.item : null;

  let cliente: ItemDoCatalogo | null = null;
  let clienteNomeSolto: string | null = null;
  const cli = acharNoTexto(normal, p.clientes);
  if (cli.tipo === 'achado') cliente = cli.item;
  if (!cliente) cliente = acharPorPrimeiroNome(normal, p.clientes);
  if (!cliente) clienteNomeSolto = nomeSolto(original, normal);

  const quem = cliente?.nome ?? clienteNomeSolto;
  const titulo = [rotulo, empreendimento?.nome, quem].filter(Boolean).join(' · ');

  return {
    ok: true,
    compromisso: { titulo, dataISO: data.iso, hora: hora.hhmm, tipo, empreendimento, cliente, clienteNomeSolto },
  };
}

/** "com o Pedro", "pra Fulana Souza": o nome logo depois da preposição, com maiúscula. */
function nomeSolto(original: string, normal: string): string | null {
  const re = /\b(?:com|pra|para|pro|cliente|do|da)\s+(?:o|a|os|as|seu|sua|dona|seu|sr|sra|senhor|senhora)?\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normal))) {
    const resto = original.slice(m.index + m[0].length);
    const w = /^([A-ZÀ-Ý][a-zà-ÿ'-]+(?:\s+(?:da|de|do|das|dos)?\s*[A-ZÀ-Ý][a-zà-ÿ'-]+){0,3})/.exec(resto);
    if (w && !/^(?:Amanha|Amanhã|Hoje|Segunda|Terça|Terca|Quarta|Quinta|Sexta|Sábado|Sabado|Domingo)$/i.test(normalizar(w[1]!.split(' ')[0]!))) {
      return w[1]!.trim();
    }
  }
  return null;
}
