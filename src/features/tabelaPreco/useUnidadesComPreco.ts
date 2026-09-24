/**
 * Os blocos de um empreendimento com o preço de cada unidade já calculado.
 *
 * Junta as duas leituras (cadastro de blocos e tabela de preço) e passa pelo
 * `precificarBlocos`. Sem a migration de alguma das duas, devolve o que dá: o
 * simulador segue com a unidade digitada, como sempre funcionou.
 *
 * O que já foi lido fica em memória (`cache.ts`): voltar ao mesmo
 * empreendimento mostra as unidades na hora e atualiza por trás. E a espera
 * tem prazo — rede caída vira `erro`, não um carregando sem fim.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { db, type DevelopmentBlock, type TabelaDePreco } from '@/data';
import type { DetalheDaUnidade } from '@/features/simulador/estado';
import { MENSAGEM_SEM_CONEXAO, comPrazo, guardarUnidades, unidadesEmCache } from './cache';
import { precificarBlocos, type BlocoPrecificado } from './preco';

export type BlocoComPreco = BlocoPrecificado<DevelopmentBlock>;
export type UnidadeComPreco = BlocoComPreco['unidades'][number];

interface Estado {
  carregando: boolean;
  erro: string | null;
  blocos: DevelopmentBlock[];
  tabela: TabelaDePreco | null;
}

const VAZIO: Estado = { carregando: false, erro: null, blocos: [], tabela: null };

function estadoInicial(developmentId: string | null): Estado {
  if (!developmentId) return VAZIO;
  const c = unidadesEmCache(developmentId);
  return c ? { ...VAZIO, ...c } : { ...VAZIO, carregando: true };
}

export function useUnidadesComPreco(developmentId: string | null) {
  const [estado, setEstado] = useState<Estado>(() => estadoInicial(developmentId));
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    if (!developmentId) {
      setEstado(VAZIO);
      return;
    }
    // Já lido antes: mostra agora, sem carregando, e confere por trás.
    const guardado = unidadesEmCache(developmentId);
    setEstado(guardado ? { ...VAZIO, ...guardado } : { ...VAZIO, carregando: true });

    comPrazo(Promise.all([db.unidades.listarBlocos(developmentId), db.tabelaPreco.carregar(developmentId)]))
      .then(([b, t]) => {
        const dados = { blocos: b.ok ? b.data : [], tabela: t.ok ? t.data : null };
        // Só guarda leitura que deu certo: um erro de rede não pode apagar o
        // que estava bom na memória.
        if (b.ok && t.ok) guardarUnidades(developmentId, dados);
        if (!vivo) return;
        if (!b.ok && !t.ok && guardado) return; // fica com o que já havia
        setEstado({ ...VAZIO, ...dados });
      })
      .catch(() => {
        if (!vivo) return;
        setEstado((e) => ({ ...e, carregando: false, erro: guardado ? null : MENSAGEM_SEM_CONEXAO }));
      });
    return () => {
      vivo = false;
    };
  }, [developmentId, versao]);

  const blocos = useMemo(() => precificarBlocos(estado.blocos, estado.tabela), [estado.blocos, estado.tabela]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  return { carregando: estado.carregando, erro: estado.erro, blocos, tabela: estado.tabela, recarregar };
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
