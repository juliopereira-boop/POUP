/**
 * Ponte entre a conversa ouvida e a Edge Function que a interpreta.
 *
 * ===========================================================================
 * DOIS MODOS, POR CUSTO E POR PAPEL
 * ===========================================================================
 * **parcial** roda dezenas de vezes durante a reunião. Manda só o ESTADO já
 * capturado e o PEDAÇO NOVO da conversa, e o servidor a atende com um modelo
 * barato. É o que mantém a tela viva e a cobrança do que falta em dia.
 *
 * **final** roda uma vez, quando o corretor manda gerar a proposta. Manda a
 * conversa INTEIRA e é atendida pelo modelo melhor. É a palavra final sobre o
 * que vai para o PDF — as rodadas parciais nunca decidem sozinhas o que o
 * cliente assina.
 *
 * O catálogo vai junto em toda chamada porque é ele que permite o truque que
 * faz a LIA parecer que "já sabe": ouvir "no Vila Nova" e preencher
 * empreendimento **e** construtora, sem ninguém ter dito o nome da construtora.
 */
import { supabase } from '@/lib/supabase';
import { CAMPOS, campoParaPrompt } from './campos';

export type ModoExtracao = 'parcial' | 'final';

export interface CampoOuvido {
  chave: string;
  valor: string;
  /** O pedaço literal da conversa que justifica o valor. */
  trecho: string;
  confianca: 'alta' | 'media' | 'baixa';
}

export interface EmpreendimentoContexto {
  id: string;
  nome: string;
  empresaNome: string;
}

/** O que a chamada custou de verdade. Serve para medir, não para estimar. */
export interface UsoDaChamada {
  entrada: number;
  cacheEscrita: number;
  cacheLeitura: number;
  saida: number;
  modelo: string;
}

export interface ResultadoExtracao {
  /** Só os campos NOVOS ou que MUDARAM. Quem chama funde com o que já tem. */
  campos: CampoOuvido[];
  /** Campos que deixaram de valer ("esquece o segundo proponente"). */
  remover: string[];
  observacao: string | null;
  uso: UsoDaChamada | null;
}

export interface PedidoExtracao {
  modo: ModoExtracao;
  /** Trecho novo (parcial) ou conversa inteira (final). */
  conversa: string;
  /** Chave → valor do que já foi capturado. Sem os trechos: só a tela os usa. */
  estado: Record<string, string>;
  empreendimentos: EmpreendimentoContexto[];
  correspondentes: { id: string; nome: string }[];
}

export async function extrair(p: PedidoExtracao): Promise<ResultadoExtracao | { erro: string }> {
  const { data, error } = await supabase.functions.invoke('lia-extract', {
    body: {
      modo: p.modo,
      conversa: p.conversa,
      estado: p.estado,
      campos: CAMPOS.map(campoParaPrompt),
      empreendimentos: p.empreendimentos,
      correspondentes: p.correspondentes,
      hoje: hojeYmd(),
    },
  });

  if (error) return { erro: 'A LIA não conseguiu processar agora. Continue falando.' };

  const payload = data as {
    campos?: CampoOuvido[];
    remover?: string[];
    observacao?: string | null;
    uso?: UsoDaChamada;
    error?: string;
  };
  if (payload?.error) return { erro: payload.error };

  return {
    campos: Array.isArray(payload?.campos) ? payload.campos : [],
    remover: Array.isArray(payload?.remover) ? payload.remover : [],
    observacao: payload?.observacao ?? null,
    uso: payload?.uso ?? null,
  };
}

/**
 * Data de hoje pelas partes LOCAIS do aparelho.
 *
 * Nunca `toISOString()`: ele devolve UTC, e no Brasil, das 21h à meia-noite,
 * isso já é o dia seguinte. A LIA usa esta data para resolver "dia 10" na data
 * do ato — errar por um dia aqui vira um mês de diferença no vencimento da
 * entrada, num documento que o cliente assina.
 */
function hojeYmd(): string {
  const agora = new Date();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${m}-${d}`;
}
