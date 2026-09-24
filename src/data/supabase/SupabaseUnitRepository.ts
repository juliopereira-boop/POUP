/**
 * BLOCOS E UNIDADES DE UM EMPREENDIMENTO.
 *
 * A escrita passa inteira pela RPC `salvar_blocos_empreendimento`, que é uma
 * transação só e sincroniza as unidades pelo código — o que preserva o preço de
 * quem continua existindo. Ver o cabeçalho da migration
 * `20260924150000_blocos_e_unidades.sql`.
 *
 * ===========================================================================
 * A LEITURA É PAGINADA, E ISSO NÃO É DETALHE
 * ===========================================================================
 * O Supabase devolve no máximo 1.000 linhas por consulta e não avisa quando
 * corta. Um condomínio de 10 blocos com 120 unidades cada já passa disso — e
 * sem paginação as unidades dos últimos blocos simplesmente não apareceriam,
 * nem no cadastro nem no simulador.
 */
import { supabase } from '@/lib/supabase';
import type { BlocosResultado, UnitRepository } from '../repositories';
import {
  type BlocoParaSalvar,
  type DevelopmentBlock,
  type DevelopmentUnit,
  type Result,
  err,
  ok,
} from '../types';

const PAGINA = 1000;

interface ErroPostgrest {
  code?: string;
  message?: string;
}

/**
 * A tabela ou a função não existem: a migration não rodou.
 *
 * O PostgREST responde `PGRST205` para tabela e `PGRST202` para função que ele
 * não conhece; o Postgres, `42P01` e `42883`. A mensagem entra junto porque nem
 * sempre o código é repassado — o mesmo cuidado de `developmentRow.ts`.
 */
function migracaoAusente(erro: ErroPostgrest | null): boolean {
  if (!erro) return false;
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(erro.code ?? '')) return true;
  return /schema cache|does not exist|could not find/i.test(erro.message ?? '');
}

const MIGRACAO_PENDENTE =
  'O cadastro de blocos ainda não foi ativado no servidor. Rode a migration ' +
  '20260924150000_blocos_e_unidades.sql no SQL Editor do Supabase.';

/**
 * Os códigos que a RPC levanta, em frase de gente.
 *
 * A função fala por código (`codigo_repetido`) de propósito: o texto que o
 * corretor lê pertence ao aplicativo, e muda sem precisar de migration.
 */
const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Você não pode alterar os blocos deste empreendimento.',
  formato_invalido: 'Os dados dos blocos chegaram num formato inesperado. Tente de novo.',
  blocos_demais: 'Um empreendimento pode ter no máximo 50 blocos.',
  nome_de_bloco_repetido: 'Dois blocos estão com o mesmo nome. Dê um nome diferente a cada um.',
  nome_de_bloco_invalido: 'Todo bloco precisa de um nome, com até 60 letras.',
  bloco_sem_unidade: 'Todo bloco precisa de pelo menos uma unidade.',
  unidades_demais: 'Um bloco pode ter no máximo 2.000 unidades.',
  unidade_invalida: 'Uma das unidades está com código ou pavimento inválido.',
  codigo_repetido: 'Duas unidades do mesmo bloco ficaram com o mesmo código.',
};

function mensagemDoErro(erro: ErroPostgrest): string {
  const texto = erro.message ?? '';
  for (const [codigo, frase] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return frase;
  }
  if (erro.code === '42501') return MENSAGENS.sem_permissao;
  return texto || 'Não foi possível salvar os blocos.';
}

interface LinhaBloco {
  id: string;
  development_id: string;
  nome: string;
  ordem: number;
}

interface LinhaUnidade {
  id: string;
  block_id: string;
  codigo: string;
  pavimento: number;
  ordem: number;
  valor: number | string | null;
  valor_atualizado_em: string | null;
}

function paraUnidade(u: LinhaUnidade): DevelopmentUnit {
  return {
    id: u.id,
    blockId: u.block_id,
    codigo: u.codigo,
    pavimento: u.pavimento,
    ordem: u.ordem,
    // `numeric` pode chegar como texto, dependendo da configuração do PostgREST.
    valor: u.valor == null ? null : Number(u.valor),
    valorAtualizadoEm: u.valor_atualizado_em,
  };
}

async function todasAsUnidades(
  developmentId: string,
): Promise<{ data: LinhaUnidade[]; error: ErroPostgrest | null }> {
  const linhas: LinhaUnidade[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('development_units')
      .select('id, block_id, codigo, pavimento, ordem, valor, valor_atualizado_em')
      .eq('development_id', developmentId)
      // Desempate por id: sem ele, duas páginas podem repetir ou pular uma linha.
      .order('ordem', { ascending: true })
      .order('id', { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) return { data: [], error };
    const pagina = (data ?? []) as unknown as LinhaUnidade[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) return { data: linhas, error: null };
  }
}

export class SupabaseUnitRepository implements UnitRepository {
  async listarBlocos(developmentId: string): Promise<BlocosResultado> {
    const [blocos, unidades] = await Promise.all([
      supabase
        .from('development_blocks')
        .select('id, development_id, nome, ordem')
        .eq('development_id', developmentId)
        .order('ordem', { ascending: true }),
      todasAsUnidades(developmentId),
    ]);

    const erro = blocos.error ?? unidades.error;
    if (erro) {
      if (migracaoAusente(erro)) {
        return { ok: false, error: MIGRACAO_PENDENTE, migracaoPendente: true };
      }
      return { ok: false, error: 'Não foi possível carregar os blocos.', migracaoPendente: false };
    }

    const porBloco = new Map<string, DevelopmentUnit[]>();
    for (const u of unidades.data) {
      const lista = porBloco.get(u.block_id) ?? [];
      lista.push(paraUnidade(u));
      porBloco.set(u.block_id, lista);
    }

    const data: DevelopmentBlock[] = ((blocos.data ?? []) as unknown as LinhaBloco[]).map((b) => ({
      id: b.id,
      developmentId: b.development_id,
      nome: b.nome,
      ordem: b.ordem,
      unidades: porBloco.get(b.id) ?? [],
    }));
    return { ok: true, data };
  }

  async salvarBlocos(
    developmentId: string,
    blocos: BlocoParaSalvar[],
  ): Promise<Result<DevelopmentBlock[]>> {
    const { error } = await supabase.rpc('salvar_blocos_empreendimento', {
      p_development: developmentId,
      p_blocos: blocos.map((b) => ({ id: b.id, nome: b.nome.trim(), unidades: b.unidades })),
    });
    if (error) {
      if (migracaoAusente(error)) return err(MIGRACAO_PENDENTE);
      return err(mensagemDoErro(error));
    }

    // Relê em vez de montar o resultado aqui: os ids dos blocos novos só o banco
    // conhece, e a tela precisa deles para o próximo salvar preservar os preços.
    const relido = await this.listarBlocos(developmentId);
    if (!relido.ok) return err(relido.error);
    return ok(relido.data);
  }
}
