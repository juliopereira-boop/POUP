/**
 * O QUE O SIMULADOR JÁ CARREGOU DA TABELA DE PREÇO, GUARDADO EM MEMÓRIA.
 *
 * ===========================================================================
 * POR QUE EXISTE
 * ===========================================================================
 * Abrir "Usar tabela de preço" busca empreendimentos, construtoras, tabelas,
 * blocos e unidades — umas dez consultas. Refazer tudo a cada abertura deixava
 * o corretor olhando o carregando de novo depois de já ter escolhido uma
 * unidade (ao tocar em "Trocar"), e, com a rede do celular oscilando, uma
 * consulta pendurada prendia o seletor no carregando para sempre.
 *
 * Agora: o que já veio aparece NA HORA, e a atualização acontece por trás. E
 * nenhuma espera é infinita (`comPrazo`): passou do prazo, a tela diz que não
 * conseguiu e oferece tentar de novo.
 *
 * Quem grava tabela ou blocos chama `esquecer...` — o simulador não pode
 * mostrar o preço antigo depois que a tabela nova foi salva.
 */
import type { Company, Development, DevelopmentBlock, TabelaDePreco } from '@/data';

/** Tempo máximo de espera por uma leitura. Depois disso, erro com "Tentar de novo". */
export const PRAZO_DE_LEITURA_MS = 15_000;

export class PrazoEsgotado extends Error {
  constructor() {
    super('prazo_esgotado');
  }
}

/** A promessa, ou erro depois de `ms`. A promessa original não é cancelada, só deixa de ser esperada. */
export function comPrazo<T>(promessa: Promise<T>, ms = PRAZO_DE_LEITURA_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PrazoEsgotado()), ms);
    promessa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export const MENSAGEM_SEM_CONEXAO =
  'Não foi possível carregar a tabela agora. Confira a internet e tente de novo.';

// ---------------------------------------------------------------- por empreendimento

export interface UnidadesEmCache {
  blocos: DevelopmentBlock[];
  tabela: TabelaDePreco | null;
}

const porEmpreendimento = new Map<string, UnidadesEmCache>();

export function unidadesEmCache(developmentId: string): UnidadesEmCache | null {
  return porEmpreendimento.get(developmentId) ?? null;
}

export function guardarUnidades(developmentId: string, dados: UnidadesEmCache): void {
  porEmpreendimento.set(developmentId, dados);
}

// ---------------------------------------------------------------- a lista do seletor

export interface ListaDeTabelas {
  userId: string;
  empreendimentos: (Development & { referencia: string })[];
  construtoras: Company[];
}

let lista: ListaDeTabelas | null = null;

export function listaEmCache(userId: string): ListaDeTabelas | null {
  return lista && lista.userId === userId ? lista : null;
}

export function guardarLista(l: ListaDeTabelas): void {
  lista = l;
}

// ---------------------------------------------------------------- esquecer

/** A tabela ou os blocos deste empreendimento mudaram: a próxima leitura vai ao banco. */
export function esquecerEmpreendimento(developmentId: string): void {
  porEmpreendimento.delete(developmentId);
  lista = null;
}
