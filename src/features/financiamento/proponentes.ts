/**
 * OS PROPONENTES E A PACTUAÇÃO DE RENDA.
 *
 * ===========================================================================
 * POR QUE UM SIMULADOR PRECISA DISSO
 * ===========================================================================
 * §5 e §89 pedem `applicants[]` com percentual de participação, e §34 explica
 * para quê: **o MIP é calculado por proponente**, sobre a parte do saldo que
 * cabe a cada um, com a taxa da faixa etária dele.
 *
 * Um casal em que ele tem 30 e ela tem 58 paga um MIP muito diferente do de um
 * casal de 30. Tratar "o cliente" como uma pessoa só, com uma idade só, erra o
 * seguro — que é justamente o encargo que faz a prestação real ficar acima da
 * prestação simulada.
 *
 * ===========================================================================
 * A PACTUAÇÃO SAI DA RENDA, MAS PODE SER INFORMADA
 * ===========================================================================
 * Por padrão, cada um participa na proporção da própria renda — é como a
 * composição costuma ser pactuada. Mas o contrato pode pactuar diferente
 * (50/50 mesmo com rendas desiguais), então o percentual é um campo, e não uma
 * derivação obrigatória.
 *
 * A soma é normalizada para 100% no fim. Não por elegância: se o corretor
 * digitar 60 e 30, o MIP sairia sobre 90% do saldo e o seguro apareceria menor
 * do que é. Normalizar é o comportamento seguro — e a normalização é registrada
 * no trace de auditoria.
 */
import { ZERO, somar, type Centavos } from './dinheiro';

export interface Proponente {
  id: string;
  nome: string;
  /** Idade em anos completos na assinatura. `null` = não informada. */
  idadeAnos: number | null;
  rendaBruta: Centavos;
  /**
   * Percentual de pactuação de renda, 0 a 100. `null` = derivar da renda.
   *
   * É o que multiplica o MIP de cada proponente (§34).
   */
  participacaoPct: number | null;
}

export interface ProponenteResolvido extends Proponente {
  /** Já normalizado: a soma de todos dá exatamente 100. */
  participacaoEfetivaPct: number;
}

export interface QuadroDeProponentes {
  proponentes: ProponenteResolvido[];
  rendaFamiliarBruta: Centavos;
  /** A maior idade do quadro. É a que aperta o limite de idade + prazo. */
  idadeMaisAlta: number | null;
  /** Verdadeiro quando a soma informada não fechava 100 e foi normalizada. */
  participacaoNormalizada: boolean;
}

export function novoProponente(id: string): Proponente {
  return { id, nome: '', idadeAnos: null, rendaBruta: ZERO, participacaoPct: null };
}

/**
 * Monta o quadro: renda familiar, pactuação normalizada e a idade que manda.
 *
 * A **maior** idade é a que vale para o limite de idade + prazo, e não a média
 * nem a do titular. É o proponente mais velho que estoura o limite, e usar a
 * média aprovaria na tela um caso que o banco recusa na mesa.
 */
export function montarQuadro(lista: Proponente[]): QuadroDeProponentes {
  const validos = lista.filter((p) => p.rendaBruta > 0 || p.nome.trim() || p.idadeAnos !== null);
  if (validos.length === 0) {
    return {
      proponentes: [],
      rendaFamiliarBruta: ZERO,
      idadeMaisAlta: null,
      participacaoNormalizada: false,
    };
  }

  const rendaFamiliarBruta = somar(...validos.map((p) => p.rendaBruta));

  const informados = validos.filter((p) => typeof p.participacaoPct === 'number');
  const somaInformada = informados.reduce((s, p) => s + (p.participacaoPct ?? 0), 0);

  let participacoes: number[];
  let normalizada = false;

  if (informados.length === validos.length && somaInformada > 0) {
    // Todos informaram: respeita a proporção digitada, normalizando a soma.
    participacoes = validos.map((p) => ((p.participacaoPct ?? 0) / somaInformada) * 100);
    normalizada = Math.abs(somaInformada - 100) > 0.001;
  } else if (rendaFamiliarBruta > 0) {
    // O padrão: cada um participa na proporção da própria renda.
    participacoes = validos.map((p) => (p.rendaBruta / rendaFamiliarBruta) * 100);
  } else {
    // Sem renda e sem percentual: divide igualmente, para o MIP não sumir.
    participacoes = validos.map(() => 100 / validos.length);
  }

  const idades = validos.map((p) => p.idadeAnos).filter((i): i is number => typeof i === 'number');

  return {
    proponentes: validos.map((p, i) => ({ ...p, participacaoEfetivaPct: participacoes[i]! })),
    rendaFamiliarBruta,
    idadeMaisAlta: idades.length ? Math.max(...idades) : null,
    participacaoNormalizada: normalizada,
  };
}
