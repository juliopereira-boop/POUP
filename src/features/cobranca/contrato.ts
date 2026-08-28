/**
 * O CONTRATO DO CAMINHO DE COMPRA — o que existe nas DUAS plataformas.
 *
 * ===========================================================================
 * POR QUE UM ARQUIVO SÓ PARA DOIS TIPOS
 * ===========================================================================
 * `abrirCobranca.ts` e `abrirCobranca.native.ts` são dois arquivos que nunca
 * se encontram: o Metro escolhe um deles na hora de montar o bundle e o outro
 * simplesmente não existe naquele binário (ver o cabeçalho do arquivo nativo).
 *
 * O efeito colateral disso é que **nada** compara os dois. O `tsc` confere
 * cada um por dentro, mas ninguém garante que continuem com a mesma forma — e
 * o dia em que divergirem, a web compila e o aplicativo quebra em tempo de
 * execução, ou o contrário. Um erro que só aparece depois de gerar o build.
 *
 * Estes dois tipos são a costura: cada implementação **anota** suas funções
 * com eles, então mudar a assinatura de um lado sem mudar o outro para o
 * `tsc` no lado esquecido. É a única checagem cruzada possível quando a
 * escolha do arquivo acontece fora do compilador.
 *
 * ===========================================================================
 * POR QUE `Result<void>` E NÃO A URL
 * ===========================================================================
 * A versão antiga devolvia `{ url }` e deixava a tela abrir o endereço — o que
 * obrigava CADA tela a carregar um `Linking.openURL`/`window.location.assign`
 * apontando para o Stripe. Ou seja, o caminho de compra ficava espalhado pelas
 * telas, que são compartilhadas entre web e aplicativo.
 *
 * Devolvendo só sucesso ou erro, quem navega é a implementação da plataforma —
 * e a navegação para fora sai junto com ela do bundle nativo. A tela fica sem
 * saber que existe um endereço do Stripe do outro lado.
 */
import type { Result } from '@/data/types';

/** Leva o corretor ao pagamento do plano. Só existe de verdade na web. */
export type AbrirCheckout = (priceId: string) => Promise<Result<void>>;

/** Leva o corretor ao portal onde ele mexe na assinatura já existente. */
export type AbrirPortalDeCobranca = () => Promise<Result<void>>;
