/**
 * Ponte entre a conversa ouvida e a Edge Function que a interpreta.
 *
 * O catálogo vai junto em cada chamada porque é ele que permite o truque que
 * faz a LIA parecer que "já sabe das coisas": ouvir "no Vila Nova" e preencher
 * empreendimento **e construtora**, sem ninguém ter dito o nome da construtora.
 */
import { supabase } from '@/lib/supabase';
import { CAMPOS, campoParaPrompt } from './campos';

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

export interface ResultadoExtracao {
  campos: CampoOuvido[];
  observacao: string | null;
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

export async function extrairDaConversa(
  transcricao: string,
  empreendimentos: EmpreendimentoContexto[],
  correspondentes: { id: string; nome: string }[],
): Promise<ResultadoExtracao | { erro: string }> {
  const { data, error } = await supabase.functions.invoke('lia-extract', {
    body: {
      transcricao,
      campos: CAMPOS.map(campoParaPrompt),
      empreendimentos,
      correspondentes,
      hoje: hojeYmd(),
    },
  });

  if (error) return { erro: 'A LIA não conseguiu processar agora. Continue falando.' };

  const payload = data as { campos?: CampoOuvido[]; observacao?: string | null; error?: string };
  if (payload?.error) return { erro: payload.error };

  return {
    campos: Array.isArray(payload?.campos) ? payload.campos : [],
    observacao: payload?.observacao ?? null,
  };
}
