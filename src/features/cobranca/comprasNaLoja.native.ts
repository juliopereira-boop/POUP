import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';

import { err, ok, type PlanTier, type Result } from '@/data/types';
import { env } from '@/lib/env';
import { mensagemDoErro } from '@/lib/edgeError';
import { supabase } from '@/lib/supabase';

import type {
  IdentifyStoreCustomer,
  LoadStorePrices,
  PurchaseStorePlan,
  RestoreStorePurchases,
  StorePurchaseResult,
  SyncStoreSubscription,
} from './comprasNaLoja.types';

const PACKAGE_BY_TIER: Record<PlanTier, string> = {
  start: 'start_monthly',
  pro: 'pro_monthly',
};

const PRODUCT_BY_TIER: Record<PlanTier, string> = {
  start: 'br.com.poup.app.start.monthly',
  pro: 'br.com.poup.app.pro.monthly',
};

const ENTITLEMENT_BY_TIER: Record<PlanTier, string> = {
  start: 'poup_start',
  pro: 'poup_pro',
};

let configuredFor: string | null = null;

function publicApiKey(): string {
  return Platform.OS === 'ios' ? env.revenueCatIosApiKey : env.revenueCatAndroidApiKey;
}

function messageFromPurchaseError(error: unknown): string {
  const purchaseError = error as Partial<PurchasesError> | undefined;
  if (purchaseError?.code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
    return 'Não foi possível falar com a loja. Verifique sua conexão e tente novamente.';
  }
  if (purchaseError?.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
    return 'A compra está aguardando aprovação. O acesso será liberado quando a loja confirmar.';
  }
  if (purchaseError?.code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR) {
    return 'Este plano ainda não está disponível nesta loja.';
  }
  return 'Não foi possível concluir a compra. Tente novamente.';
}

function entitlementIsActive(info: CustomerInfo, tier: PlanTier): boolean {
  return info.entitlements.active[ENTITLEMENT_BY_TIER[tier]] !== undefined;
}

async function currentPackages(): Promise<Record<PlanTier, PurchasesPackage>> {
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current;
  if (!offering) throw new Error('O offering principal do RevenueCat não foi encontrado.');

  const find = (tier: PlanTier) => {
    const expectedPackage = PACKAGE_BY_TIER[tier];
    const expectedProduct = PRODUCT_BY_TIER[tier];
    return offering.availablePackages.find(
      (item) =>
        item.identifier === expectedPackage || item.product.identifier === expectedProduct,
    );
  };

  const start = find('start');
  const pro = find('pro');
  if (!start || !pro) throw new Error('Os pacotes Start e Pro não estão completos no offering atual.');
  return { start, pro };
}

export const identifyStoreCustomer: IdentifyStoreCustomer = async (userId, email) => {
  const apiKey = publicApiKey();
  if (!apiKey) {
    return err(
      Platform.OS === 'ios'
        ? 'RevenueCat não está configurado para iOS.'
        : 'RevenueCat não está configurado para Android.',
    );
  }

  try {
    const configured = await Purchases.isConfigured();
    if (!configured) {
      Purchases.configure({ apiKey, appUserID: userId });
      if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    } else {
      const current = await Purchases.getAppUserID();
      if (current !== userId) await Purchases.logIn(userId);
    }
    if (email) await Purchases.setEmail(email);
    configuredFor = userId;
    return ok(undefined);
  } catch (error) {
    console.error('[revenuecat] Falha ao identificar usuário:', error);
    return err('Não foi possível preparar as compras desta conta.');
  }
};

async function ensureConfigured(): Promise<Result<void>> {
  if (!configuredFor) return err('Entre na sua conta novamente para acessar as compras.');
  return ok(undefined);
}

export const loadStorePrices: LoadStorePrices = async () => {
  const ready = await ensureConfigured();
  if (!ready.ok) return ready;
  try {
    const packages = await currentPackages();
    return ok([
      { tier: 'start', priceLabel: packages.start.product.priceString },
      { tier: 'pro', priceLabel: packages.pro.product.priceString },
    ]);
  } catch (error) {
    console.error('[revenuecat] Falha ao carregar produtos:', error);
    return err('Não foi possível carregar os preços da App Store. Tente novamente.');
  }
};

export const syncStoreSubscription: SyncStoreSubscription = async () => {
  const { error } = await supabase.functions.invoke('sync-revenuecat-subscription', {
    body: {},
  });
  if (error) {
    return err(await mensagemDoErro(error, 'A loja confirmou, mas o acesso ainda está sincronizando.'));
  }
  return ok(undefined);
};

export const purchaseStorePlan: PurchaseStorePlan = async (
  tier,
): Promise<StorePurchaseResult> => {
  const ready = await ensureConfigured();
  if (!ready.ok) return ready;
  try {
    const packages = await currentPackages();
    const { customerInfo } = await Purchases.purchasePackage(packages[tier]);
    if (!entitlementIsActive(customerInfo, tier)) {
      return err('A compra foi recebida, mas o plano ainda está sendo ativado.');
    }
    const synced = await syncStoreSubscription();
    return synced.ok ? ok(undefined) : synced;
  } catch (error) {
    const purchaseError = error as Partial<PurchasesError> | undefined;
    if (
      purchaseError?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
      purchaseError?.userCancelled
    ) {
      return { ok: false, error: '', cancelled: true };
    }
    console.error('[revenuecat] Falha na compra:', error);
    return err(messageFromPurchaseError(error));
  }
};

export const restoreStorePurchases: RestoreStorePurchases = async () => {
  const ready = await ensureConfigured();
  if (!ready.ok) return ready;
  try {
    const customerInfo = await Purchases.restorePurchases();
    const active =
      entitlementIsActive(customerInfo, 'start') || entitlementIsActive(customerInfo, 'pro');
    // Sincroniza também quando não há entitlement ativo: isso remove do banco
    // um acesso antigo que já expirou ou foi reembolsado na loja.
    const synced = await syncStoreSubscription();
    if (!synced.ok) return synced;
    return ok(active);
  } catch (error) {
    console.error('[revenuecat] Falha na restauração:', error);
    return err('Não foi possível restaurar as compras desta Conta Apple.');
  }
};
