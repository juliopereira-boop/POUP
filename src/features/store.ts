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
