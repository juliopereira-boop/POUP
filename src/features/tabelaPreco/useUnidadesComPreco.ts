/**
 * Os blocos de um empreendimento com o preço de cada unidade já calculado.
 *
 * Junta as duas leituras (cadastro de blocos e tabela de preço) e passa pelo
 * `precificarBlocos`. Sem a migration de alguma das duas, devolve o que dá: o
 * simulador segue com a unidade digitada, como sempre funcionou.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { db, type DevelopmentBlock, type TabelaDePreco } from '@/data';
import type { DetalheDaUnidade } from '@/features/simulador/estado';
import { precificarBlocos, type BlocoPrecificado } from './preco';

export type BlocoComPreco = BlocoPrecificado<DevelopmentBlock>;
export type UnidadeComPreco = BlocoComPreco['unidades'][number];

interface Estado {
  carregando: boolean;
  blocos: DevelopmentBlock[];
  tabela: TabelaDePreco | null;
}

const VAZIO: Estado = { carregando: false, blocos: [], tabela: null };

export function useUnidadesComPreco(developmentId: string | null) {
  const [estado, setEstado] = useState<Estado>(developmentId ? { ...VAZIO, carregando: true } : VAZIO);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    if (!developmentId) {
      setEstado(VAZIO);
      return;
    }
    setEstado((e) => ({ ...e, carregando: true }));
    void Promise.all([db.unidades.listarBlocos(developmentId), db.tabelaPreco.carregar(developmentId)]).then(
      ([b, t]) => {
        if (!vivo) return;
        setEstado({ carregando: false, blocos: b.ok ? b.data : [], tabela: t.ok ? t.data : null });
      },
    );
    return () => {
      vivo = false;
    };
  }, [developmentId, versao]);

  const blocos = useMemo(() => precificarBlocos(estado.blocos, estado.tabela), [estado.blocos, estado.tabela]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  return { carregando: estado.carregando, blocos, tabela: estado.tabela, recarregar };
}

/** O que o simulador guarda da unidade escolhida. `null` se ela não tem preço. */
export function detalheDe(
  u: UnidadeComPreco,
  empreendimento: string,
  tabela: TabelaDePreco | null,
): DetalheDaUnidade | null {
  if (!u.preco.ok) return null;
  return {
    empreendimento,
    referencia: tabela?.referencia ?? '',
    pavimento: u.pavimento,
    vendaTabela: u.preco.venda,
    avaliacao: u.preco.avaliacao,
    areaM2: u.preco.areaM2,
    vaga: u.vaga,
    ventilacao: u.ventilacao,
  };
}
