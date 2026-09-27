/**
 * QUAIS LEMBRETES O CELULAR PRECISA TOCAR — a conta, sem aparelho.
 *
 * Recebe os agendamentos que vêm pela frente e as preferências do corretor
 * (Configurações → Notificações) e devolve a lista de lembretes, já com hora,
 * título e texto. Quem entrega ao sistema do celular é `lembretes.ts`.
 *
 * Regras:
 *   - só agendamento em aberto (concluído, cancelado e "não compareceu" não
 *     tocam);
 *   - um lembrete por antecedência escolhida (ex.: 1 hora antes, 15 minutos
 *     antes, na hora); o que já passou não é marcado;
 *   - o iPhone guarda no máximo 64 notificações agendadas por app: ficam as
 *     mais próximas (`LIMITE_DE_LEMBRETES`), e o resto entra quando a agenda
 *     for sincronizada de novo (a cada vez que o app abre).
 */
import type { Appointment } from '@/data/types';

export interface PreferenciasDeNotificacao {
  /** Liga/desliga todos os lembretes da agenda neste aparelho. */
  ativadas: boolean;
  /** Toca o som do celular junto com o aviso. */
  som: boolean;
  /** Minutos antes do início. 0 = na hora. */
  antecedencias: number[];
}

export const PREFERENCIAS_PADRAO: PreferenciasDeNotificacao = {
  ativadas: true,
  som: true,
  antecedencias: [60, 15, 0],
};

/** As opções que aparecem em Configurações. */
export const OPCOES_DE_ANTECEDENCIA: { minutos: number; rotulo: string }[] = [
  { minutos: 0, rotulo: 'Na hora' },
  { minutos: 15, rotulo: '15 min antes' },
  { minutos: 30, rotulo: '30 min antes' },
  { minutos: 60, rotulo: '1 hora antes' },
  { minutos: 120, rotulo: '2 horas antes' },
  { minutos: 1440, rotulo: '1 dia antes' },
];

export const LIMITE_DE_LEMBRETES = 60;
/** Até quantos dias à frente a agenda é lida para marcar lembretes. */
export const DIAS_A_FRENTE = 30;

const ENCERRADOS = new Set(['concluido', 'cancelado', 'nao_compareceu']);

export interface Lembrete {
  /** Única por agendamento + antecedência. */
  chave: string;
  appointmentId: string;
  /** Quando tocar (ms desde 1970). */
  quando: number;
  titulo: string;
  corpo: string;
}

/** Lê o que foi guardado, aceitando versões antigas ou estragadas. */
export function lerPreferencias(texto: string | null): PreferenciasDeNotificacao {
  if (!texto) return { ...PREFERENCIAS_PADRAO };
  try {
    const p = JSON.parse(texto) as Partial<PreferenciasDeNotificacao>;
    const validas = new Set(OPCOES_DE_ANTECEDENCIA.map((o) => o.minutos));
    const antecedencias = Array.isArray(p.antecedencias)
      ? [...new Set(p.antecedencias.filter((m) => typeof m === 'number' && validas.has(m)))]
      : PREFERENCIAS_PADRAO.antecedencias;
    return {
      ativadas: typeof p.ativadas === 'boolean' ? p.ativadas : PREFERENCIAS_PADRAO.ativadas,
      som: typeof p.som === 'boolean' ? p.som : PREFERENCIAS_PADRAO.som,
      antecedencias: antecedencias.sort((a, b) => b - a),
    };
  } catch {
    return { ...PREFERENCIAS_PADRAO };
  }
}

function quandoFalta(minutos: number): string {
  if (minutos === 0) return 'Agora';
  if (minutos < 60) return `Em ${minutos} min`;
  if (minutos === 1440) return 'Amanhã';
  const h = minutos / 60;
  return `Em ${h} ${h === 1 ? 'hora' : 'horas'}`;
}

function hora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function textoDoLembrete(ag: Appointment, minutos: number): { titulo: string; corpo: string } {
  const inicio = new Date(ag.startAt);
  const titulo = `${quandoFalta(minutos)}: ${ag.title.trim() || 'Agendamento'}`;
  const partes = [minutos === 1440 ? `Amanhã às ${hora(inicio)}` : `Às ${hora(inicio)}`];
  if (ag.leadName) partes.push(ag.leadName);
  if (ag.developmentName) partes.push(ag.developmentName);
  if (ag.location?.trim()) partes.push(ag.location.trim());
  return { titulo, corpo: partes.join(' · ') };
}

export function planejarLembretes(
  agendamentos: Appointment[],
  prefs: PreferenciasDeNotificacao,
  agora: number,
  limite: number = LIMITE_DE_LEMBRETES,
): Lembrete[] {
  if (!prefs.ativadas || prefs.antecedencias.length === 0) return [];
  const lista: Lembrete[] = [];
  for (const ag of agendamentos) {
    if (ENCERRADOS.has(ag.statusId)) continue;
    const inicio = new Date(ag.startAt).getTime();
    if (!Number.isFinite(inicio) || inicio <= agora) continue;
    for (const minutos of prefs.antecedencias) {
      const quando = inicio - minutos * 60_000;
      if (quando <= agora) continue;
      lista.push({ chave: `${ag.id}:${minutos}`, appointmentId: ag.id, quando, ...textoDoLembrete(ag, minutos) });
    }
  }
  return lista.sort((a, b) => a.quando - b.quando).slice(0, limite);
}
