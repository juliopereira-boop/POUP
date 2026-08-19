/**
 * ENQUADRAMENTO — o que passa, o que não passa, e o que não dá para dizer.
 *
 * ===========================================================================
 * ESTE MOTOR NUNCA APROVA NADA
 * ===========================================================================
 * Ele responde "pelas regras cadastradas, este caso se enquadra?". Isso é
 * diferente de aprovação de crédito, que depende de score, restrição, análise
 * documental e política interna do banco — coisas que não passam nem perto
 * daqui. Por isso o vocabulário desta tela inteira é **enquadramento
 * estimado**, e o resultado carrega o aviso de que a condição final depende da
 * instituição financeira.
 *
 * Um simulador de corretor que escreve "aprovado" cria uma expectativa que a
 * mesa do banco vai quebrar — e quem perde a credibilidade é o corretor, na
 * frente do cliente.
 *
 * ===========================================================================
 * QUATRO SITUAÇÕES, E A QUARTA É A QUE FALTA NA MAIORIA DOS SIMULADORES
 * ===========================================================================
 *   ok             — verificado e dentro da regra.
 *   atencao        — passa, mas raspando, ou depende de coisa fora do nosso
 *                    alcance (o FGTS é o caso clássico).
 *   reprova        — verificado e fora da regra. Diz o quanto falta.
 *   nao_verificado — **o parâmetro não está cadastrado**. Não é "passou" nem
 *                    "não passou": é "não sei", e dizer isso em voz alta é a
 *                    diferença entre uma ferramenta honesta e uma que finge.
 */
import { formatarBRL, formatarPct, formatarPrazo, type Centavos } from './dinheiro';
import { temValor, type ProdutoFinanciamento, type VersaoRegras } from './regras';

export type SituacaoItem = 'ok' | 'atencao' | 'reprova' | 'nao_verificado';

export interface ItemElegibilidade {
  chave: string;
  rotulo: string;
  situacao: SituacaoItem;
  detalhe: string;
}

export interface ResultadoElegibilidade {
  /**
   * `true` quando nada reprovou.
   *
   * Repare que itens `nao_verificado` NÃO derrubam o enquadramento — eles
   * viram `pendencias`. Reprovar por falta de parâmetro nosso seria culpar o
   * cliente por uma lacuna do cadastro; aprovar em silêncio seria pior ainda.
   * O meio-termo honesto é: passa no que deu para verificar, e a tela mostra
   * o que ficou sem verificar.
   */
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
  valorFinanciado: Centavos;
  entradaTotal: Centavos;
  rendaFamiliarMensal: Centavos;
  /** Primeira prestação COM os encargos que deu para calcular. */
  primeiraPrestacao: Centavos;
  prazoMeses: number;
  idadeAnos: number | null;
  usaFgts: boolean;
  /**
   * Os limites JÁ RESOLVIDOS pelo motor — não lidos do produto aqui dentro.
   *
   * Num produto de parâmetros manuais eles vêm do que o corretor informou, e
   * ler direto do cadastro seria ignorar a condição real da negociação. Foi
   * exatamente esse o bug que os testes pegaram: com "Condições informadas" e
   * quota de 80% digitada, a verificação usava os 100% do cadastro e aprovava
   * um financiamento sem entrada nenhuma.
   */
  comprometimentoMaxPct: number | null;
  quotaMaxPct: number | null;
  prazoMaxMeses: number | null;
}

export function verificarElegibilidade(e: EntradaElegibilidade): ResultadoElegibilidade {
  const itens: ItemElegibilidade[] = [];
  const add = (
    chave: string,
    rotulo: string,
    situacao: SituacaoItem,
    detalhe: string,
  ): void => void itens.push({ chave, rotulo, situacao, detalhe });

  /* ------------------------------------------------------------ estrutura */

  if (e.valorImovel <= 0) {
    add('imovel', 'Valor do imóvel', 'reprova', 'Informe o valor do imóvel.');
  }
  if (e.valorFinanciado <= 0) {
    add(
      'financiado',
      'Valor a financiar',
      'reprova',
      'A entrada mais o FGTS e o subsídio já cobrem o imóvel inteiro — não sobra nada para financiar.',
    );
  }

  /* -------------------------------------------------------- faixa de renda */

  if (temValor(e.produto.faixaRenda) && !e.produto.parametrosManuais) {
    const { min, max } = e.produto.faixaRenda.valor;
    const renda = e.rendaFamiliarMensal / 100;
    if (renda < min) {
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
        `Esta linha vai até ${formatarBRL((max * 100) as Centavos)} de renda familiar.`,
      );
    } else {
      add('faixa', 'Faixa de renda', 'ok', 'A renda familiar se enquadra nesta linha.');
    }
  } else if (!e.produto.parametrosManuais) {
    add(
      'faixa',
      'Faixa de renda',
      'nao_verificado',
      'A faixa de renda desta linha ainda não foi cadastrada nas regras.',
    );
  }

  /* ---------------------------------------------------- valor máximo imóvel */

  if (!e.produto.parametrosManuais) {
    if (temValor(e.produto.valorImovelMax) && e.produto.valorImovelMax.valor > 0) {
      const teto = (e.produto.valorImovelMax.valor * 100) as Centavos;
      if (e.valorImovel > teto) {
        add(
          'valorImovel',
          'Valor do imóvel',
          'reprova',
          `Acima do teto desta linha, que é ${formatarBRL(teto)}.`,
        );
      } else {
        add('valorImovel', 'Valor do imóvel', 'ok', `Dentro do teto de ${formatarBRL(teto)}.`);
      }
    } else {
      add(
        'valorImovel',
        'Valor do imóvel',
        'nao_verificado',
        'O teto de valor do imóvel desta linha ainda não foi cadastrado.',
      );
    }
  }

  /* --------------------------------------------------------- quota (LTV) */

  const quotaAplicada = e.valorImovel > 0 ? (e.valorFinanciado / e.valorImovel) * 100 : 0;
  const quotaMax = e.quotaMaxPct;
  if (quotaMax === null) {
    add(
      'quota',
      'Percentual financiado',
      'nao_verificado',
      'O percentual máximo financiável desta linha ainda não foi cadastrado.',
    );
  } else if (quotaAplicada > quotaMax + 0.001) {
    /*
     * Aqui a mensagem diz QUANTO FALTA DE ENTRADA, e não só que reprovou.
     *
     * "Você precisa de mais R$ 18.400 de entrada" é uma informação com que o
     * corretor consegue trabalhar na hora — ele negocia o ato, sugere usar mais
     * FGTS, procura outra unidade. "Percentual financiado acima do limite" não
     * serve para nada.
     */
    const financiavel = Math.floor((e.valorImovel * quotaMax) / 100) as Centavos;
    const falta = (e.valorFinanciado - financiavel) as Centavos;
    add(
      'quota',
      'Percentual financiado',
      'reprova',
      `Esta linha financia até ${formatarPct(quotaMax, 0)} do imóvel. Faltam ${formatarBRL(falta)} de entrada.`,
    );
  } else {
    add(
      'quota',
      'Percentual financiado',
      'ok',
      `${formatarPct(quotaAplicada, 1)} do imóvel, dentro do limite de ${formatarPct(quotaMax, 0)}.`,
    );
  }

  /* ------------------------------------------------------ comprometimento */

  if (e.comprometimentoMaxPct === null) {
    add(
      'renda',
      'Comprometimento de renda',
      'nao_verificado',
      'O comprometimento máximo de renda ainda não foi cadastrado nas regras.',
    );
  } else if (e.rendaFamiliarMensal <= 0) {
    add('renda', 'Comprometimento de renda', 'nao_verificado', 'Informe a renda familiar.');
  } else {
    const pct = (e.primeiraPrestacao / e.rendaFamiliarMensal) * 100;
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
        `A prestação compromete ${formatarPct(pct, 1)} da renda familiar.`,
      );
    }
  }

  /* ---------------------------------------------------------------- prazo */

  const prazoMax = e.prazoMaxMeses;
  if (prazoMax === null) {
    add('prazo', 'Prazo', 'nao_verificado', 'O prazo máximo desta linha ainda não foi cadastrado.');
  } else if (e.prazoMeses > prazoMax) {
    add(
      'prazo',
      'Prazo',
      'reprova',
      `Esta linha vai até ${formatarPrazo(prazoMax)}; você pediu ${formatarPrazo(e.prazoMeses)}.`,
    );
  } else {
    add('prazo', 'Prazo', 'ok', `${formatarPrazo(e.prazoMeses)}, dentro do limite.`);
  }

  /* ---------------------------------------------------------------- idade */

  const idadeMax = temValor(e.produto.idadeMaisPrazoMaxAnos)
    ? e.produto.idadeMaisPrazoMaxAnos.valor
    : null;
  if (e.idadeAnos === null) {
    add(
      'idade',
      'Idade do proponente',
      'nao_verificado',
      'Informe a idade (ou a data de nascimento) para verificar o limite de idade somada ao prazo.',
    );
  } else if (idadeMax === null) {
    add(
      'idade',
      'Idade do proponente',
      'nao_verificado',
      'O limite de idade somada ao prazo ainda não foi cadastrado nas regras.',
    );
  } else {
    const somado = e.idadeAnos + e.prazoMeses / 12;
    if (somado > idadeMax + 0.0001) {
      const prazoPossivel = Math.floor((idadeMax - e.idadeAnos) * 12);
      add(
        'idade',
        'Idade do proponente',
        'reprova',
        prazoPossivel > 0
          ? `Idade mais prazo dá ${somado.toFixed(1)} anos, e o limite é ${idadeMax}. O prazo máximo para esta idade seria ${formatarPrazo(prazoPossivel)}.`
          : `Idade mais prazo dá ${somado.toFixed(1)} anos, acima do limite de ${idadeMax}.`,
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

  if (e.usaFgts) {
    /*
     * O FGTS é sempre `atencao`, mesmo com o parâmetro cadastrado.
     *
     * Nós somamos o valor que o corretor informou; quem verifica se o cliente
     * TEM direito de usar (três anos de carteira, não possuir imóvel na
     * região, saldo real na conta vinculada) é a Caixa, com dados que este
     * aplicativo não tem e não deveria ter. Marcar "ok" aqui seria afirmar
     * uma coisa que ninguém verificou.
     */
    const permitido = temValor(e.regras.fgts.permitidoNaEntrada)
      ? e.regras.fgts.permitidoNaEntrada.valor
      : null;
    if (permitido === false) {
      add('fgts', 'FGTS', 'reprova', 'As regras cadastradas não permitem FGTS nesta operação.');
    } else {
      add(
        'fgts',
        'FGTS',
        'atencao',
        'O valor informado foi somado à entrada. O direito de uso do FGTS depende de análise da Caixa.',
      );
    }
  }

  const reprovacoes = itens.filter((i) => i.situacao === 'reprova');
  const atencoes = itens.filter((i) => i.situacao === 'atencao');
  const pendencias = itens.filter((i) => i.situacao === 'nao_verificado');

  return {
    elegivel: reprovacoes.length === 0,
    itens,
    reprovacoes,
    atencoes,
    pendencias,
  };
}
