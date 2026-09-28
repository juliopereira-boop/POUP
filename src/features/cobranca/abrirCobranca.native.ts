/**
 * Cobrança no app das lojas.
 *
 * Comprar acontece em `comprasNaLoja.native.ts`, exclusivamente pelo StoreKit/
 * Google Play através do RevenueCat. Este arquivo mantém o mesmo contrato da
 * implementação web: o checkout externo continua ausente do bundle nativo e
 * "gerenciar" abre somente a página oficial da loja devolvida pelo SDK.
 */
import { Linking } from 'react-native';
import Purchases from 'react-native-purchases';

import { err, ok } from '@/data/types';

import type { AbrirCheckout, AbrirPortalDeCobranca, CancelarAssinatura, MudarDePlano } from './contrato';
import { purchaseStorePlan } from './comprasNaLoja';

export const abrirCheckout: AbrirCheckout = async () =>
  err('Use os planos exibidos no aplicativo para assinar pela loja.');

export const abrirPortalDeCobranca: AbrirPortalDeCobranca = async () => {
  try {
    if (!(await Purchases.isConfigured())) {
      return err('As compras da loja ainda não foram configuradas.');
    }
    const info = await Purchases.getCustomerInfo();
    if (!info.managementURL) {
      return err('Nenhuma assinatura da loja foi encontrada para gerenciar.');
    }
    await Linking.openURL(info.managementURL);
    return ok(undefined);
  } catch (error) {
    console.error('[revenuecat] Falha ao abrir gerenciamento:', error);
    return err('Não foi possível abrir o gerenciamento da assinatura.');
  }
};

/**
 * Subir para o Pro: compra na loja (vale na hora). Descer para o Start: a
 * página oficial de assinaturas da loja — a Apple e o Google aplicam o
 * downgrade na renovação, e é lá que o corretor confirma.
 */
export const mudarDePlano: MudarDePlano = async (para) => {
  if (para === 'pro') {
    const r = await purchaseStorePlan('pro');
    if (r.ok) return ok(undefined);
    return err(r.cancelled ? 'Troca cancelada.' : r.error);
  }
  return abrirPortalDeCobranca();
};

/** A loja não deixa o app cancelar: o cancelamento é na página oficial dela. */
export const cancelarAssinatura: CancelarAssinatura = () => abrirPortalDeCobranca();
