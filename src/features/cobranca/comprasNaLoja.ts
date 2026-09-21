/** Implementação web: a cobrança real está em abrirCobranca.ts (Stripe). */
import { err, ok } from '@/data/types';

import type {
  IdentifyStoreCustomer,
  LoadStorePrices,
  PurchaseStorePlan,
  RestoreStorePurchases,
  SyncStoreSubscription,
} from './comprasNaLoja.types';

export const identifyStoreCustomer: IdentifyStoreCustomer = async () => ok(undefined);
export const loadStorePrices: LoadStorePrices = async () => ok([]);
export const purchaseStorePlan: PurchaseStorePlan = async () =>
  err('Compras pela loja não estão disponíveis no navegador.');
export const restoreStorePurchases: RestoreStorePurchases = async () =>
  err('Restauração de compras não está disponível no navegador.');
export const syncStoreSubscription: SyncStoreSubscription = async () => ok(undefined);
