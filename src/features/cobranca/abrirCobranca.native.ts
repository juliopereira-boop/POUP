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

import type { AbrirCheckout, AbrirPortalDeCobranca } from './contrato';

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
