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
 * ===========================================================================
 * ANTES E AGORA: O CONSERTO QUE FEZ A LIA VOLTAR A CAPTURAR
 * ===========================================================================
 * Na primeira versão econômica, a rodada parcial mandava SÓ o pedaço novo —
 * três segundos e meio de fala, sozinhos no mundo. E o prompt manda, com razão,
 * não registrar número solto sem saber de que campo ele é. As duas regras juntas
 * produziam o pior resultado possível: o modelo recebia "duzentos e dez mil",
 * não tinha como saber do que se tratava e devolvia lista vazia — corretamente.
 * Na prática, a LIA não preenchia nada.
 *
 * Agora vão dois blocos: **ANTES** (uma janela curta do que já foi dito, só para
 * dar contexto) e **AGORA** (o trecho novo, de onde se extrai). Custa uns
 * poucos milhares de tokens de Haiku por simulação — menos de um centavo — e é
 * a diferença entre uma assistente que funciona e uma que não.
 *
 * ===========================================================================
 * NOMES, NUNCA IDS
 * ===========================================================================
 * O catálogo vai como lista de NOMES. O modelo devolve nome; quem casa nome com
 * cadastro é `catalogo.ts`, localmente. Pedir UUID a um modelo era caro e
 * errado — veja o cabeçalho daquele arquivo.
 *
 * O catálogo vai em toda chamada porque é ele que permite o truque que faz a
 * LIA parecer que "já sabe": ouvir "no Vila Nova" e preencher empreendimento
 * **e** construtora, sem ninguém ter dito o nome da construtora.
 */
import { mensagemDoErro } from '@/lib/edgeError';
import { supabase } from '@/lib/supabase';
import { CAMPOS, campoParaPrompt } from './campos';

export type ModoExtracao = 'parcial' | 'final';

/**
 * Versão do contrato com a Edge Function.
 *
 * Existe por uma falha que custou caro para diagnosticar: a função publicada
 * lia um campo `conversa` que o aplicativo tinha parado de mandar, recebia
 * `undefined` e respondia `{campos: []}` — sem erro, com status 200. Do lado de
 * cá isso é indistinguível de "a LIA não entendeu nada", que é exatamente a
 * reclamação que chegou.
 *
 * A resposta agora ecoa a versão. Sem eco, a função no ar é velha, e o
 * aplicativo diz isso em português em vez de fingir que ouviu.
 */
/**
 * Foi para 3 quando a LIA ganhou a capacidade de AGENDAR compromissos
 * (`agendamento.ts`) — uma chamada estruturalmente diferente da captura de
 * campos, mas atendida pela MESMA função. Bumping aqui garante que uma função
 * publicada ainda na versão 2 (sem o branch de agendamento) seja detectada
 * como desatualizada em vez de responder `{campos:[]}` silenciosamente.
 */
export const VERSAO_CONTRATO = 3;

export interface CampoOuvido {
  chave: string;
  valor: string;
  /** O pedaço literal da conversa que justifica o valor. */
  trecho: string;
  confianca: 'alta' | 'media' | 'baixa';
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
  /** Contexto do que já foi dito. Vazio no fecho, que manda tudo em `agora`. */
  antes: string;
  /** De onde se extrai: o trecho novo (parcial) ou a conversa inteira (final). */
  agora: string;
  /** Chave → valor do que já foi capturado. Sem os trechos: só a tela os usa. */
  estado: Record<string, string>;
  /** Só os nomes. O casamento com o cadastro é local — veja `catalogo.ts`. */
  empreendimentos: string[];
  correspondentes: string[];
}

export async function extrair(p: PedidoExtracao): Promise<ResultadoExtracao | { erro: string }> {
  const { data, error } = await supabase.functions.invoke('lia-extract', {
    body: {
      versao: VERSAO_CONTRATO,
      modo: p.modo,
      antes: p.antes,
      agora: p.agora,
      estado: p.estado,
      campos: CAMPOS.map(campoParaPrompt),
      empreendimentos: p.empreendimentos,
      correspondentes: p.correspondentes,
      hoje: hojeYmd(),
    },
  });

  if (error) {
    /*
     * A frase precisa vir do CORPO da resposta, não do `error.message`.
     * Limite de uso atingido chega como 429 com a explicação no corpo; sem ler
     * de lá, o corretor veria uma frase em inglês sobre status HTTP e pensaria
     * que a LIA quebrou.
     */
    return { erro: await mensagemDoErro(error, 'A LIA não conseguiu processar agora. Continue falando.') };
  }

  const payload = data as {
    versao?: number;
    campos?: CampoOuvido[];
    remover?: string[];
    observacao?: string | null;
    uso?: UsoDaChamada;
    error?: string;
  };
  if (payload?.error) return { erro: payload.error };

  /*
   * Sem o eco da versão, a função no ar é anterior a este contrato: ela procura
   * um campo `conversa` que já não mandamos e devolve lista vazia com status
   * 200. Falhar alto aqui é o que impede a LIA de passar horas "ouvindo" sem
   * capturar nada, que foi como esse erro se manifestou.
   */
  if (payload?.versao !== VERSAO_CONTRATO) {
    return {
      erro: 'A LIA no servidor está desatualizada. Publique a função lia-extract novamente.',
    };
  }

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
