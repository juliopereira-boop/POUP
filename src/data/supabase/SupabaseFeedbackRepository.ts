import { supabase } from '@/lib/supabase';
import type { FeedbackRepository, RecadoDoCorretor } from '../repositories';
import { type Result, err, ok } from '../types';
import { friendlyError } from '../friendlyError';

/** Teto igual ao CHECK do banco, para a recusa acontecer com frase em português. */
const MAX_MENSAGEM = 2000;
const MIN_MENSAGEM = 3;

type Situacao = 'aberto' | 'lido' | 'resolvido';

function situacaoValida(v: string): Situacao {
  return v === 'lido' || v === 'resolvido' ? v : 'aberto';
}

/**
 * "Reportar problema ou dar sugestão".
 *
 * Ao contrário da telemetria, aqui a falha PRECISA aparecer: o corretor
 * escreveu um texto e apertou enviar. Se não chegou, ele tem que saber para
 * tentar de novo — senão fica achando que reportou e ninguém respondeu nunca.
 */
export class SupabaseFeedbackRepository implements FeedbackRepository {
  async enviar(input: {
    tela: string | null;
    etapa: string | null;
    mensagem: string;
  }): Promise<Result<void>> {
    const mensagem = input.mensagem.trim();
    if (mensagem.length < MIN_MENSAGEM) {
      return err('Escreva o que aconteceu, mesmo que em poucas palavras.');
    }
    if (mensagem.length > MAX_MENSAGEM) {
      return err(`Mensagem longa demais (máximo de ${MAX_MENSAGEM} caracteres).`);
    }

    const { data: sessao } = await supabase.auth.getUser();
    const userId = sessao.user?.id;
    if (!userId) return err('Entre na sua conta para enviar.');

    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      tela: input.tela?.slice(0, 200) ?? null,
      etapa: input.etapa?.slice(0, 40) ?? null,
      mensagem,
    });
    if (error) return err(friendlyError(error.message));
    return ok(undefined);
  }

  async listar(situacao?: Situacao): Promise<RecadoDoCorretor[]> {
    let q = supabase
      .from('feedback')
      .select('id, tela, etapa, mensagem, situacao, criado_em')
      .order('criado_em', { ascending: false })
      .limit(200);
    if (situacao) q = q.eq('situacao', situacao);

    const { data, error } = await q;
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id,
      tela: r.tela,
      etapa: r.etapa,
      mensagem: r.mensagem,
      situacao: situacaoValida(r.situacao),
      criadoEm: r.criado_em,
    }));
  }

  async marcar(id: string, situacao: Situacao): Promise<Result<void>> {
    const { error } = await supabase.from('feedback').update({ situacao }).eq('id', id);
    if (error) return err(friendlyError(error.message));
    return ok(undefined);
  }
}
