/**
 * Ponte entre o texto que o corretor digitou e o CÉREBRO da LIA.
 *
 * ===========================================================================
 * ANTES: UM MODELO DE IA NO SERVIDOR. AGORA: UM ALGORITMO NO APARELHO.
 * ===========================================================================
 * Até aqui, cada "Analisar texto" ia para a Edge Function `lia-extract`, que
 * perguntava a um modelo de linguagem quais campos o texto tinha. Agora quem
 * responde é `cerebro/campos.ts`, aqui mesmo no aparelho:
 *
 *   - na hora, sem internet e sem cota mensal;
 *   - nenhum dado do cliente sai do celular para serviço de IA;
 *   - o mesmo texto dá sempre o mesmo resultado, e cada regra é testada
 *     (`npm run testar:cerebro-lia`).
 *
 * O CONTRATO FICOU O MESMO (`CampoOuvido`, `remover`, `observacao`): a tela, o
 * provider e o preenchimento do simulador não precisaram mudar.
 *
 * ===========================================================================
 * O QUE O CÉREBRO RECEBE A MAIS
 * ===========================================================================
 * O modelo recebia só NOMES do catálogo e devolvia um nome, que depois era
 * casado com o cadastro. O cérebro recebe os itens com id e devolve o id
 * direto. E recebe a carteira de clientes: nome de cliente cadastrado traz
 * CPF, telefone, e-mail e renda que já estão no lead.
 */
import { hojeLocal } from './cerebro/datas';
import { pensar, type ClienteDoCadastro } from './cerebro/campos';
import type { ItemDoCatalogo } from './cerebro/catalogo';

export interface CampoOuvido {
  chave: string;
  valor: string;
  /** O pedaço literal do texto que justifica o valor. */
  trecho: string;
  confianca: 'alta' | 'media' | 'baixa';
}

export interface ResultadoExtracao {
  /** Só os campos NOVOS ou que MUDARAM. Quem chama funde com o que já tem. */
  campos: CampoOuvido[];
  /** Campos que deixaram de valer ("esquece o segundo proponente"). */
  remover: string[];
  observacao: string | null;
}

export interface PedidoExtracao {
  texto: string;
  /** Chave → valor do que já foi capturado. */
  estado: Record<string, string>;
  empreendimentos: ItemDoCatalogo[];
  correspondentes: ItemDoCatalogo[];
  clientes: ClienteDoCadastro[];
  /** O campo que a LIA acabou de perguntar: resposta curta vai para ele. */
  pendente: string | null;
}

export async function extrair(p: PedidoExtracao): Promise<ResultadoExtracao | { erro: string }> {
  try {
    const r = pensar({
      texto: p.texto,
      hoje: hojeLocal(),
      estado: p.estado,
      empreendimentos: p.empreendimentos,
      correspondentes: p.correspondentes,
      clientes: p.clientes,
      pendente: p.pendente,
    });
    return { campos: r.campos, remover: r.remover, observacao: r.observacao };
  } catch {
    return { erro: 'Não consegui ler esse texto. Tente escrever de outro jeito.' };
  }
}
