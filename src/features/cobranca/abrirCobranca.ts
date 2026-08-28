/**
 * O CAMINHO DE COMPRA — esta é a versão que só entra no bundle da WEB.
 *
 * ===========================================================================
 * ESTE ARQUIVO NÃO EXISTE NO APLICATIVO DAS LOJAS
 * ===========================================================================
 * Ao seu lado mora `abrirCobranca.native.ts`. O Metro resolve arquivos por
 * plataforma antes de empacotar: no iOS e no Android ele encontra o `.native`
 * primeiro e **este arquivo nunca é lido**; na web não existe `.web`, então o
 * escolhido é este. Não há `if` em tempo de execução, e é esse o ponto — um
 * `if` deixaria o código do Stripe compilado dentro do binário, escondido mas
 * presente.
 *
 * Por isso aqui é seguro falar `window` direto, sem checar plataforma: quando
 * este módulo roda, o navegador é o único lugar possível.
 *
 * ===========================================================================
 * POR QUE ISSO IMPORTA
 * ===========================================================================
 * Ver o cabeçalho de `abrirCobranca.native.ts`, que é onde a decisão está
 * registrada por inteiro.
 */
import { getAppUrl } from '@/lib/appUrl';
import { supabase } from '@/lib/supabase';
import { err, ok } from '@/data/types';

import type { AbrirCheckout, AbrirPortalDeCobranca } from './contrato';

/** A URL do Stripe é aberta AQUI, e não devolvida para a tela. Ver `contrato.ts`. */
function irPara(url: string): void {
  window.location.assign(url);
}

export const abrirCheckout: AbrirCheckout = async (priceId) => {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: {
      priceId,
      successUrl: `${getAppUrl()}/?checkout=success`,
      cancelUrl: `${getAppUrl()}/paywall?checkout=cancel`,
    },
  });
  if (error) return err(error.message);
  const url = (data as { url?: string })?.url;
  if (!url) return err('Não foi possível iniciar o pagamento.');
  irPara(url);
  return ok(undefined);
};

export const abrirPortalDeCobranca: AbrirPortalDeCobranca = async () => {
  const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
    body: { returnUrl: `${getAppUrl()}/configuracoes` },
  });
  if (error) return err(error.message);
  const url = (data as { url?: string })?.url;
  if (!url) return err('Não foi possível abrir o portal de assinatura.');
  irPara(url);
  return ok(undefined);
};
