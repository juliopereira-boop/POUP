/**
 * O app está rodando como aplicativo de loja (App Store / Play Store)?
 *
 * ------------------------------------------------------------------
 * POR QUE ISSO EXISTE
 * ------------------------------------------------------------------
 * A Apple não deixa um app cobrar por fora do sistema dela. E a regra não é só
 * "não processar o pagamento dentro do app": é **não apontar o caminho**. Preço
 * na tela, botão "Assinar", link para o site de cobrança, "gerencie sua
 * assinatura aqui" — qualquer um desses derruba a revisão, mesmo que a compra
 * aconteça em outro lugar.
 *
 * O POUP cobra pelo Stripe, no site. Isso continua valendo para quem usa pelo
 * navegador. O que muda é que, no app publicado nas lojas, toda a parte de
 * cobrança fica **invisível**: o corretor entra, e se a assinatura não estiver
 * ativa ele vê um aviso seco, sem preço e sem link.
 *
 * ------------------------------------------------------------------
 * COMO É DECIDIDO
 * ------------------------------------------------------------------
 * Por padrão, "app nativo = build de loja", que é a verdade hoje: a versão web
 * é a do site, a nativa é a das lojas.
 *
 * A variável `EXPO_PUBLIC_STORE_BUILD` existe para poder **conferir esse modo
 * pelo navegador**, sem precisar gerar um build nativo a cada ajuste de texto —
 * é a diferença entre testar isso em segundos e testar em meia hora.
 */
import { Platform } from 'react-native';

function flagFromEnv(): boolean | null {
  const raw = process.env.EXPO_PUBLIC_STORE_BUILD;
  if (raw == null || raw === '') return null;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/** `true` quando as regras de cobrança das lojas se aplicam. */
export const isStoreBuild: boolean = flagFromEnv() ?? Platform.OS !== 'web';

/**
 * Pode mostrar preço, botão de assinar ou link de cobrança?
 *
 * Nome separado de `isStoreBuild` de propósito: quem lê a tela quer saber
 * "posso mostrar isto?", não "onde estou rodando?".
 */
export const canShowBilling: boolean = !isStoreBuild;

/**
 * A LIA pode aparecer aqui?
 *
 * ===========================================================================
 * POR QUE ELA NÃO VAI NO APP DAS LOJAS
 * ===========================================================================
 * A LIA depende de **transcrição de fala contínua**. Na web isso é a Web
 * Speech API do navegador, que o Chrome e o Edge têm. No aplicativo nativo não
 * existe equivalente embutido: seria preciso um módulo de reconhecimento de
 * voz nativo, permissão de microfone e indicador permanente de gravação.
 *
 * Enquanto esse módulo não existe, a LIA aparecia no app das lojas e mostrava
 * *"Ainda não neste aplicativo"*. Isso é reprovação em três regras de uma vez:
 *
 *   * **2.1** — a submissão tem que ser uma versão final, sem recurso
 *     incompleto ou placeholder;
 *   * **2.3** — os metadados e a descrição precisam refletir o que o app
 *     realmente faz;
 *   * **4.2** — o app precisa entregar funcionalidade duradoura o bastante.
 *
 * E era o pior lugar possível para esse defeito: a LIA é justamente o que
 * justifica o plano Pro, então o revisor esbarraria nela procurando o
 * diferencial anunciado.
 *
 * A decisão foi **esconder a LIA inteira do build de loja**, e não escrever um
 * aviso mais bonito. Recurso que não funciona não deve existir na tela: o
 * corretor que abre pelo navegador continua com ela completa, e o que abre pelo
 * aplicativo não vê promessa nenhuma que o app não cumpra.
 *
 * ===========================================================================
 * QUANDO ISTO VOLTA
 * ===========================================================================
 * No dia em que houver transcrição nativa funcionando de ponta a ponta — com
 * permissão de microfone, indicador visível de gravação (**regra 2.5.14**) e
 * consentimento por sessão —, esta constante vira `true` e a LIA volta ao
 * aplicativo. Não antes.
 */
export const liaDisponivel: boolean = !isStoreBuild;

/**
 * Pode criar conta ou começar um teste grátis por aqui?
 *
 * ===========================================================================
 * O MODELO COMPANION, E POR QUE ELE É MAIS SEGURO
 * ===========================================================================
 * O POUP cobra pelo Stripe, no site. No app das lojas o preço, o botão de
 * assinar e o portal de cobrança já estavam escondidos (`canShowBilling`) —
 * mas ainda dava para **criar conta e começar o teste grátis** ali dentro.
 *
 * Isso deixava o app numa posição ruim de defender: o revisor cria uma conta,
 * o teste acaba, e ele fica numa tela que não oferece nenhum jeito de
 * continuar. Para a Apple, um app cujo uso depende de uma assinatura vendida
 * fora é o caso clássico da **regra 3.1.1**, e a saída — quando não se quer
 * usar In-App Purchase — é o app ser explicitamente um **companion**: quem
 * assina, assina no site; o aplicativo serve a quem já é assinante.
 *
 * É a leitura da **3.1.3(f)**, e ela só se sustenta se o app não vender NEM
 * der de graça o que é vendido fora. Por isso cadastro e teste saem juntos:
 * um teste grátis dentro do app é uma oferta comercial como qualquer outra.
 *
 * Na web nada muda — lá o corretor cria conta, testa e assina normalmente.
 */
export const podeCriarConta: boolean = !isStoreBuild;
