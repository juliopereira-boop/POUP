import { supabase } from '@/lib/supabase';
import type {
  AnalyticsRepository,
  DegrauFunil,
  EventoParaGravar,
  LinhaConsumoIA,
  LinhaEvento,
} from '../repositories';

/**
 * TELEMETRIA — a única camada do app onde falhar em silêncio é o comportamento
 * CORRETO.
 *
 * Todo o resto do POUP devolve `Result` e explica o erro ao corretor. Aqui, não:
 * um evento perdido não muda nada para ele, e uma mensagem de erro de
 * telemetria em cima de uma proposta seria ruído puro. Por isso `registrar`
 * engole tudo — inclusive a tabela não existir, que é o estado real de qualquer
 * instalação onde a migration 0029 ainda não rodou.
 */
export class SupabaseAnalyticsRepository implements AnalyticsRepository {
  async registrar(evento: EventoParaGravar): Promise<void> {
    try {
      const { data: sessao } = await supabase.auth.getUser();
      const userId = sessao.user?.id;
      // Sem usuário não há o que medir: todo evento é de alguém, e o RLS
      // exigiria `auth.uid() = user_id` de qualquer forma.
      if (!userId) return;

      await supabase.from('analytics_events').insert({
        user_id: userId,
        evento: evento.evento,
        etapa: evento.etapa,
        resultado: evento.resultado,
        duracao_ms: evento.duracaoMs,
        ref_id: evento.refId,
      });
    } catch {
      /* Ver o cabeçalho: telemetria não interrompe nada. */
    }
  }

  /*
   * Os três painéis abaixo devolvem lista VAZIA quando não é admin, e não um
   * erro. Quem barra é o RLS dentro da própria função SQL, não a tela — se um
   * dia a tela do painel aparecer para quem não devia, ela mostra zero, não os
   * dados de todo mundo.
   */

  async painelEventos(dias: number): Promise<LinhaEvento[]> {
    const { data, error } = await supabase.rpc('painel_eventos', { p_dias: dias });
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      evento: String(r.evento),
      total: Number(r.total ?? 0),
      pessoas: Number(r.pessoas ?? 0),
      erros: Number(r.erros ?? 0),
      duracaoMediana: r.duracao_mediana == null ? null : Number(r.duracao_mediana),
    }));
  }

  async painelFunil(dias: number): Promise<DegrauFunil[]> {
    const { data, error } = await supabase.rpc('painel_funil', { p_dias: dias });
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      marco: String(r.marco),
      pessoas: Number(r.pessoas ?? 0),
      ordem: Number(r.ordem ?? 0),
    }));
  }

  async painelConsumoIA(): Promise<LinhaConsumoIA[]> {
    const { data, error } = await supabase.rpc('painel_consumo_ia');
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      recurso: String(r.recurso),
      total: Number(r.total ?? 0),
      pessoas: Number(r.pessoas ?? 0),
      maior: Number(r.maior ?? 0),
    }));
  }
}
