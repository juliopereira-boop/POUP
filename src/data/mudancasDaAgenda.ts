/**
 * "A AGENDA MUDOU" — aviso de que um agendamento foi criado, editado,
 * reagendado, concluído, cancelado ou apagado.
 *
 * Quem escuta é o lembrete do aparelho (`features/notificacoes`): ele reagenda
 * as notificações do celular a cada mudança. O aviso sai da camada de dados, e
 * não de cada tela, para nenhum caminho ficar de fora (calendário, ficha do
 * lead, LIA, tela do agendamento).
 */
import type { AppointmentRepository } from './repositories';

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

export function ouvirMudancasDaAgenda(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

export function avisarMudancaNaAgenda(): void {
  for (const fn of ouvintes) {
    try {
      fn();
    } catch {
      // Um ouvinte com problema não pode quebrar a gravação do agendamento.
    }
  }
}

const QUE_MUDAM = ['create', 'update', 'setStatus', 'reschedule', 'remove'] as const;

/** Envolve o repositório: toda gravação que deu certo avisa os ouvintes. */
export function comAvisoDeMudanca(repo: AppointmentRepository): AppointmentRepository {
  const envolto = Object.create(repo) as AppointmentRepository;
  for (const nome of QUE_MUDAM) {
    const original = repo[nome].bind(repo) as (...args: unknown[]) => Promise<{ ok: boolean }>;
    (envolto as unknown as Record<string, unknown>)[nome] = async (...args: unknown[]) => {
      const res = await original(...args);
      if (res?.ok) avisarMudancaNaAgenda();
      return res;
    };
  }
  return envolto;
}
