/**
 * A DISPONIBILIDADE DE UM EMPREENDIMENTO, AO VIVO.
 *
 * Uma foto ao abrir (`db.disponibilidade.carregar`) e, depois, o Realtime traz
 * só o que muda (uma venda, uma reserva). "Ao vivo" com honestidade: o CV não
 * avisa quando muda; a leitura automática passa de minuto em minuto (o
 * histórico de situação do CV), e o Realtime entrega na hora o que ela
 * encontrar.
 *
 * A foto é recarregada:
 *   - a cada conexão do canal (inclusive depois de uma queda);
 *   - quando o app volta para a frente (o que mudou com ele dormindo não
 *     chegou pelo canal);
 *   - a cada 2 minutos, para o "atualizado há…" não envelhecer.
 *
 * Sem empreendimento do CV vinculado, devolve `ativa: false` e nada muda na
 * grade.
 */
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { db, type Disponibilidade } from '@/data';
import { estaDesatualizada } from './aplicar';

const RECARGA_MS = 2 * 60 * 1000;

export function useDisponibilidade(developmentId: string | null) {
  const [estado, setEstado] = useState<Disponibilidade | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!developmentId) {
      setEstado(null);
      return;
    }
    let vivo = true;
    setEstado(null);
    const recarregar = () => {
      void db.disponibilidade.carregar(developmentId).then((r) => {
        if (vivo && r.ok) setEstado(r.data);
      });
    };
    recarregar();
    const parar = db.disponibilidade.assinar(
      developmentId,
      (u) =>
        setEstado((e) => {
          if (!e) return e;
          const unidades = new Map(e.unidades);
          if (u.situacao === 'sem_vinculo') unidades.delete(u.unitId);
          else unidades.set(u.unitId, u);
          return { ...e, unidades };
        }),
      recarregar,
    );
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') recarregar();
    });
    const recarga = setInterval(recarregar, RECARGA_MS);
    const relogio = setInterval(() => setAgora(Date.now()), 15000);
    return () => {
      vivo = false;
      parar();
      sub.remove();
      clearInterval(recarga);
      clearInterval(relogio);
    };
  }, [developmentId]);

  const desatualizada = useMemo(() => estaDesatualizada(estado, agora), [estado, agora]);
  return { disponibilidade: estado, desatualizada, agora };
}
