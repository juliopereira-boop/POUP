/**
 * ENQUADRAMENTO — o que passa, o que não passa, e o que não dá para dizer.
 *
 * ===========================================================================
 * ESTE MOTOR NUNCA APROVA NADA — §96 e §97
 * ===========================================================================
 * O fluxo real é: SIMULAÇÃO → ESCOLHA → ANÁLISE DE CRÉDITO → ANÁLISE DO IMÓVEL
 * → APROVAÇÃO → CONTRATO. Este módulo faz **a primeira caixa apenas**, e o
 * vocabulário reflete isso em toda mensagem: *enquadramento estimado*, nunca
 * "aprovado". Um simulador de corretor que escreve "aprovado" cria uma
 * expectativa que a mesa do banco quebra — e quem perde a credibilidade na
 * frente do cliente é o corretor.
 *
 * ===========================================================================
 * TODAS AS VIOLAÇÕES, NÃO A PRIMEIRA — §71
 * ===========================================================================
 * "O sistema não deve retornar apenas o primeiro erro." Se a renda é
 * insuficiente E a entrada é insuficiente E o prazo não cabe na idade, o
 * corretor precisa das três: consertar uma e descobrir a seguinte é o jeito
 * mais rápido de perder o cliente.
 *
 * ===========================================================================
 * QUATRO SITUAÇÕES, E A QUARTA É A QUE FALTA NOS OUTROS
 * ===========================================================================
 *   ok             — verificado e dentro da regra.
 *   atencao        — passa raspando, ou depende de coisa fora do nosso alcance
 *                    (o FGTS é o caso clássico).
 *   reprova        — verificado e fora da regra. Diz **quanto falta**.
 *   nao_verificado — o parâmetro não está cadastrado. Não é "passou" nem "não
 *                    passou": é "não sei", dito em voz alta.
 *
 * Itens `nao_verificado` NÃO derrubam o enquadramento — viram `pendencias`.
 * Reprovar por falta de parâmetro nosso seria culpar o cliente por uma lacuna
 * do cadastro; aprovar em silêncio seria pior.
 */
import { formatarBRL, formatarPct, formatarPrazo, type Centavos } from './dinheiro';
import { temValor, type Enquadramento, type ProdutoFinanciamento, type VersaoRegras } from './regras';

export type SituacaoItem = 'ok' | 'atencao' | 'reprova' | 'nao_verificado';

export interface ItemElegibilidade {
  chave: string;
  rotulo: string;
  situacao: SituacaoItem;
  detalhe: string;
}

export interface ResultadoElegibilidade {
  elegivel: boolean;
  itens: ItemElegibilidade[];
  reprovacoes: ItemElegibilidade[];
  atencoes: ItemElegibilidade[];
  pendencias: ItemElegibilidade[];
}

export interface EntradaElegibilidade {
  produto: ProdutoFinanciamento;
  regras: VersaoRegras;

  valorImovel: Centavos;
  valorAvaliacao: Centavos;
  valorBase: Centavos;
  valorFinanciado: Centavos;
  /**
   * Quanto seria preciso financiar para cobrir o imóvel com a entrada dada.
   *
   * É diferente de `valorFinanciado`: este já vem CAPADO pela quota (§12). A
   * diferença entre os dois é exatamente o buraco de entrada — e é por ela que
   * a reprovação sai como "faltam R$ X de entrada", que é acionável, em vez de
   * "percentual acima do limite", que não é.
   */
  necessarioAposEntrada: Centavos;
  entradaPropria: Centavos;
  entradaTotal: Centavos;
  rendaFamiliarBruta: Centavos;
  primeiraPrestacao: Centavos;
  prazoMeses: number;
  /** A MAIOR idade do quadro — é ela que aperta o limite. */
  idadeMaisAlta: number | null;
  fgtsUsado: Centavos;
  fgtsDisponivel: Centavos;
  enquadramentoSfh: Enquadramento;

  /**
   * Limites JÁ RESOLVIDOS pelo motor — nunca lidos do produto aqui dentro.
   *
   * Num produto de parâmetros manuais eles vêm do que o corretor informou, e
   * ler direto do cadastro ignoraria a condição real da negociação. Foi
   * exatamente esse o bug que os testes pegaram: com quota de 80% digitada, a
   * verificação usava os 100% do cadastro e aprovava financiamento sem entrada.
   */
  comprometimentoMaxPct: number | null;
  quotaMaxPct: number | null;
  prazoMaxMeses: number | null;
  entradaMinimaPct: number | null;
}

export function verificarElegibilidade(e: EntradaElegibilidade): ResultadoElegibilidade {
  const itens: ItemElegibilidade[] = [];
  const add = (chave: string, rotulo: string, situacao: SituacaoItem, detalhe: string): void =>
    void itens.push({ chave, rotulo, situacao, detalhe });

  /* ------------------------------------------------------------ estrutura */

  if (e.valorImovel <= 0) add('imovel', 'Valor do imóvel', 'reprova', 'Informe o valor do imóvel.');

  if (e.valorFinanciado <= 0) {
    add(
      'financiado',
      'Valor a financiar',
      'reprova',
      'A entrada, o FGTS e o subsídio já cobrem o imóvel inteiro — não sobra nada para financiar.',
    );
  }

  /* ---------------------------------------------------------- avaliação */

  if (e.valorAvaliacao < e.valorImovel) {
    add(
      'avaliacao',
      'Avaliação do imóvel',
      'atencao',
      `A avaliação (${formatarBRL(e.valorAvaliacao)}) é menor que o preço de venda (${formatarBRL(e.valorImovel)}). O banco financia sobre a avaliação, e a diferença de ${formatarBRL((e.valorImovel - e.valorAvaliacao) as Centavos)} sai do bolso do cliente.`,
    );
  }

  /* --------------------------------------------------------- SFH / SFI */

  if (e.enquadramentoSfh === 'indefinido') {
    add(
      'sfh',
      'Enquadramento SFH/SFI',
      'nao_verificado',
      'O limite de enquadramento não está cadastrado nas regras.',
    );
  } else {
    const limite = temValor(e.regras.sfh.limiteValorImovel)
      ? e.regras.sfh.limiteValorImovel.valor
      : 0;
    add(
      'sfh',
      'Enquadramento SFH/SFI',
      'ok',
      e.enquadramentoSfh === 'SFH'
        ? `Operação no SFH: a avaliação está dentro do limite de ${formatarBRL((limite * 100) as Centavos)}.`
        : `Operação no SFI: a avaliação passa do limite do SFH (${formatarBRL((limite * 100) as Centavos)}). Condições, quota e uso de FGTS podem ser outros.`,
    );
  }

  /* -------------------------------------------------------- faixa de renda */

  if (!e.produto.parametrosManuais) {
    if (temValor(e.produto.faixaRenda)) {
      const { min, max } = e.produto.faixaRenda.valor;
      const renda = e.rendaFamiliarBruta / 100;
      if (renda <= 0) {
        add('faixa', 'Faixa de renda', 'nao_verificado', 'Informe a renda dos proponentes.');
      } else if (renda < min) {
        add(
          'faixa',
          'Faixa de renda',
          'reprova',
          `Esta linha começa em ${formatarBRL((min * 100) as Centavos)} de renda familiar.`,
        );
      } else if (max !== null && renda > max) {
        add(
          'faixa',
          'Faixa de renda',
          'reprova',
          `Esta linha vai até ${formatarBRL((max * 100) as Centavos)} de renda familiar; a do cliente é ${formatarBRL(e.rendaFamiliarBruta)}.`,
        );
      } else {
        add('faixa', 'Faixa de renda', 'ok', 'A renda familiar se enquadra nesta linha.');
      }
    } else {
      add(
        'faixa',
        'Faixa de renda',
        'nao_verificado',
        'A faixa de renda desta linha ainda não foi cadastrada.',
      );
    }
  }

  /* ---------------------------------------------------- valor do imóvel */

  if (!e.produto.parametrosManuais) {
    if (temValor(e.produto.valorImovelMax) && e.produto.valorImovelMax.valor > 0) {
      const teto = (e.produto.valorImovelMax.valor * 100) as Centavos;
      if (e.valorBase > teto) {
        add(
          'valorImovel',
          'Valor do imóvel',
          'reprova',
          `Acima do teto desta linha, que é ${formatarBRL(teto)}. Excedente: ${formatarBRL((e.valorBase - teto) as Centavos)}.`,
        );
      } else {
        add('valorImovel', 'Valor do imóvel', 'ok', `Dentro do teto de ${formatarBRL(teto)}.`);
      }
    } else {
      add(
        'valorImovel',
        'Valor do imóvel',
        'nao_verificado',
        'O teto de valor do imóvel desta linha não está cadastrado.',
      );
    }
  }

  /* ------------------------------------------------------- entrada mínima */

  if (e.entradaMinimaPct !== null && e.entradaMinimaPct > 0 && e.valorBase > 0) {
    const exigida = Math.ceil((e.valorBase * e.entradaMinimaPct) / 100) as Centavos;
    if (e.entradaTotal < exigida) {
      add(
        'entradaMinima',
        'Entrada mínima',
        'reprova',
        `Esta linha exige ${formatarPct(e.entradaMinimaPct, 0)} de entrada (${formatarBRL(exigida)}). Faltam ${formatarBRL((exigida - e.entradaTotal) as Centavos)}.`,
      );
    } else {
      add(
        'entradaMinima',
        'Entrada mínima',
        'ok',
        `Entrada de ${formatarBRL(e.entradaTotal)}, acima do mínimo de ${formatarPct(e.entradaMinimaPct, 0)}.`,
      );
    }
  }

  /* --------------------------------------------------------- quota (LTV) */

  const quotaAplicada = e.valorBase > 0 ? (e.valorFinanciado / e.valorBase) * 100 : 0;
  const buracoDeEntrada = (e.necessarioAposEntrada - e.valorFinanciado) as Centavos;
  if (e.quotaMaxPct === null) {
    add(
      'quota',
      'Percentual financiado',
      'nao_verificado',
      'O percentual máximo financiável desta linha não está cadastrado.',
    );
  } else if (buracoDeEntrada > 0) {
    /*
     * A QUOTA NÃO "REPROVA" — ELA CAPA.
     *
     * O banco financia até o limite dela e ponto; quem tem que cobrir o resto é
     * o cliente. Então o que reprova não é o percentual: é a ENTRADA, que ficou
     * curta. Dizer "faltam R$ 18.400 de entrada" é informação com que o corretor
     * age na hora — negocia o ato, sugere mais FGTS, procura outra unidade.
     * "Percentual financiado acima do limite" não serve para nada.
     */
    add(
      'quota',
      'Entrada suficiente',
      'reprova',
      `Esta linha financia até ${formatarPct(e.quotaMaxPct, 0)} do valor base (${formatarBRL(e.valorFinanciado)}). Faltam ${formatarBRL(buracoDeEntrada)} de entrada.`,
    );
  } else {
    add(
      'quota',
      'Percentual financiado',
      'ok',
      `${formatarPct(quotaAplicada, 1)} do valor base, dentro do limite de ${formatarPct(e.quotaMaxPct, 0)}.`,
    );
  }

  /* ------------------------------------------------------ comprometimento */

  if (e.comprometimentoMaxPct === null) {
    add(
      'renda',
      'Comprometimento de renda',
      'nao_verificado',
      'O comprometimento máximo de renda não está cadastrado nesta linha.',
    );
  } else if (e.rendaFamiliarBruta <= 0) {
    add('renda', 'Comprometimento de renda', 'nao_verificado', 'Informe a renda dos proponentes.');
  } else {
    const pct = (e.primeiraPrestacao / e.rendaFamiliarBruta) * 100;
    const rendaMinima = Math.ceil((e.primeiraPrestacao * 100) / e.comprometimentoMaxPct) as Centavos;
    if (pct > e.comprometimentoMaxPct + 0.001) {
      add(
        'renda',
        'Comprometimento de renda',
        'reprova',
        `A primeira prestação compromete ${formatarPct(pct, 1)} da renda; o limite é ${formatarPct(e.comprometimentoMaxPct, 0)}. Seria necessária renda de ${formatarBRL(rendaMinima)}.`,
      );
    } else if (pct > e.comprometimentoMaxPct * 0.9) {
      add(
        'renda',
        'Comprometimento de renda',
        'atencao',
        `Passa raspando: ${formatarPct(pct, 1)} da renda, com limite de ${formatarPct(e.comprometimentoMaxPct, 0)}.`,
      );
    } else {
      add(
        'renda',
        'Comprometimento de renda',
        'ok',
        `A prestação compromete ${formatarPct(pct, 1)} da renda familiar bruta.`,
      );
    }
  }

  /* ---------------------------------------------------------------- prazo */

  if (e.prazoMaxMeses === null) {
    add('prazo', 'Prazo', 'nao_verificado', 'O prazo máximo desta linha não está cadastrado.');
  } else if (e.prazoMeses > e.prazoMaxMeses) {
    add(
      'prazo',
      'Prazo',
      'reprova',
      `Esta linha vai até ${formatarPrazo(e.prazoMaxMeses)}; você pediu ${formatarPrazo(e.prazoMeses)}.`,
    );
  } else {
    add('prazo', 'Prazo', 'ok', `${formatarPrazo(e.prazoMeses)}, dentro do limite.`);
  }

  /* ---------------------------------------------------------------- idade */

  const idadeMax = temValor(e.produto.idadeMaisPrazoMaxAnos)
    ? e.produto.idadeMaisPrazoMaxAnos.valor
    : null;
  if (e.idadeMaisAlta === null) {
    add(
      'idade',
      'Idade do proponente',
      'nao_verificado',
      'Informe a idade dos proponentes para verificar o limite de idade somada ao prazo.',
    );
  } else if (idadeMax === null) {
    add(
      'idade',
      'Idade do proponente',
      'nao_verificado',
      'O limite de idade somada ao prazo não está cadastrado nas regras.',
    );
  } else {
    /*
     * A idade que vale é a MAIOR do quadro (§15 combinado com §89).
     *
     * É o proponente mais velho que estoura o limite. Usar a média, ou só a do
     * titular, aprovaria na tela um caso que o banco recusa — e o corretor só
     * descobriria depois de o cliente já ter escolhido o apartamento.
     */
    const somado = e.idadeMaisAlta + e.prazoMeses / 12;
    if (somado > idadeMax + 0.0001) {
      const prazoPossivel = Math.floor((idadeMax - e.idadeMaisAlta) * 12);
      add(
        'idade',
        'Idade do proponente',
        'reprova',
        prazoPossivel > 0
          ? `O proponente mais velho tem ${e.idadeMaisAlta} anos: idade mais prazo dá ${somado.toFixed(1)}, e o limite é ${idadeMax}. O prazo máximo para essa idade seria ${formatarPrazo(prazoPossivel)}.`
          : `O proponente mais velho tem ${e.idadeMaisAlta} anos, e idade mais prazo dá ${somado.toFixed(1)} — acima do limite de ${idadeMax}.`,
      );
    } else {
      add(
        'idade',
        'Idade do proponente',
        'ok',
        `Idade mais prazo dá ${somado.toFixed(1)} anos, dentro do limite de ${idadeMax}.`,
      );
    }
  }

  /* ----------------------------------------------------------------- FGTS */

  if (e.fgtsUsado > 0) {
    /*
     * O FGTS é sempre `atencao`, mesmo com o parâmetro cadastrado.
     *
     * Nós somamos o valor informado; quem verifica se o cliente TEM direito
     * (três anos de carteira, não possuir imóvel na região, saldo real na conta
     * vinculada) é a Caixa, com dados que este aplicativo não tem e não deveria
     * ter. Marcar "ok" seria afirmar algo que ninguém verificou.
     */
    const permitido = temValor(e.regras.fgts.permitidoNaEntrada)
      ? e.regras.fgts.permitidoNaEntrada.valor
      : null;
    if (permitido === false) {
      add('fgts', 'FGTS', 'reprova', 'As regras cadastradas não permitem FGTS nesta operação.');
    } else if (e.fgtsDisponivel > 0 && e.fgtsUsado > e.fgtsDisponivel) {
      add(
        'fgts',
        'FGTS',
        'reprova',
        `O valor usado (${formatarBRL(e.fgtsUsado)}) passa do saldo informado (${formatarBRL(e.fgtsDisponivel)}).`,
      );
    } else {
      add(
        'fgts',
        'FGTS',
        'atencao',
        `${formatarBRL(e.fgtsUsado)} somados à entrada. O direito de uso do FGTS depende de análise da Caixa e das regras do Fundo.`,
      );
    }
  }

  const reprovacoes = itens.filter((i) => i.situacao === 'reprova');
  return {
    elegivel: reprovacoes.length === 0,
    itens,
    reprovacoes,
    atencoes: itens.filter((i) => i.situacao === 'atencao'),
    pendencias: itens.filter((i) => i.situacao === 'nao_verificado'),
  };
}
