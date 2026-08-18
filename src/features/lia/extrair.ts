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
