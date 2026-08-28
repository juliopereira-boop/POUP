/**
 * O CAMINHO DE COMPRA NÃO EXISTE NO APLICATIVO DAS LOJAS.
 *
 * ===========================================================================
 * ESCONDER A TELA NÃO ERA SUFICIENTE
 * ===========================================================================
 * `canShowBilling` (em `features/store.ts`) já tirava preço, botão de assinar
 * e link de gerenciar assinatura de todas as telas do app publicado. A
 * auditoria da App Store apontou o que faltava: *"remover código nativo de
 * checkout, não apenas esconder a interface"*.
 *
 * E ela está certa. O revisor da Apple não olha só a tela: o binário submetido
 * é inspecionado, e as strings dele são legíveis. Um caminho de pagamento
 * externo **compilado** dentro do app — mesmo atrás de um `if` que nunca é
 * verdadeiro — é o achado clássico da **regra 3.1.1**, e a leitura dele é a
 * pior possível: o app *tem* uma compra fora da loja e a **escondeu do
 * revisor**. Isso é pior do que exibi-la.
 *
 * ===========================================================================
 * POR QUE ARQUIVO POR PLATAFORMA, E NÃO `Platform.OS`
 * ===========================================================================
 * `if (Platform.OS === 'web')` é decisão de **tempo de execução**: os dois
 * ramos vão para o bundle, e o ramo do Stripe viaja dentro do IPA junto com os
 * endereços, os nomes das Edge Functions de cobrança e as mensagens de erro do
 * pagamento. Esconde da tela, não do binário — exatamente o que a auditoria
 * recusou.
 *
 * O Metro resolve arquivos por extensão de plataforma **na hora de empacotar**:
 * para `ios` e `android` ele procura `.ios.ts`, depois `.native.ts`, depois
 * `.ts`; para `web`, só `.web.ts` e `.ts`. Então `abrirCobranca.ts` — o arquivo
 * que fala com o Stripe — simplesmente não é lido quando o bundle é nativo.
 * Não é código morto: é código ausente.
 *
 * A prova está no `npm run testar:loja`, que confere que este arquivo continua
 * sem nenhum vestígio de compra, e num export do bundle iOS onde as strings de
 * cobrança não aparecem.
 *
 * ===========================================================================
 * O QUE CONTINUA FUNCIONANDO NO iOS
 * ===========================================================================
 * Só o caminho de COMPRA saiu. A **leitura** do estado da assinatura
 * (`getSubscription`, em `SupabaseBillingRepository`) continua igual nas duas
 * plataformas, e tem que continuar: o app é um *companion* de uma assinatura
 * vendida no site (**regra 3.1.3(f)**), e um companion precisa saber se a conta
 * de quem abriu está ativa. Saber não é vender.
 *
 * ===========================================================================
 * POR QUE AINDA EXISTEM ESTAS DUAS FUNÇÕES
 * ===========================================================================
 * Elas não são chamadas: as telas que as usariam ficam atrás de
 * `canShowBilling`, que é `false` aqui. Existem porque o `import` das telas é
 * estático e precisa resolver para alguma coisa — e porque uma resposta
 * neutra é melhor do que um `throw`, caso algum caminho futuro esqueça a
 * guarda e chegue até aqui.
 *
 * A mensagem é deliberadamente seca. Dizer "assine pelo site" seria um *call
 * to action* para compra externa dentro do binário, que é o mesmo problema por
 * outro caminho.
 */
import { err, type Result } from '@/data/types';

import type { AbrirCheckout, AbrirPortalDeCobranca } from './contrato';

function indisponivel(): Promise<Result<void>> {
  return Promise.resolve(err<void>('Esta ação não está disponível neste aplicativo.'));
}

export const abrirCheckout: AbrirCheckout = indisponivel;

export const abrirPortalDeCobranca: AbrirPortalDeCobranca = indisponivel;
