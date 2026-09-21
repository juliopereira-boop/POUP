import type { PlanTier, Result } from '@/data/types';

export interface StorePlanPrice {
  tier: PlanTier;
  priceLabel: string;
}

export type StorePurchaseResult =
  | { ok: true; data: void }
  | { ok: false; error: string; cancelled?: boolean };

export type IdentifyStoreCustomer = (
  userId: string,
  email?: string | null,
) => Promise<Result<void>>;

export type LoadStorePrices = () => Promise<Result<StorePlanPrice[]>>;
export type PurchaseStorePlan = (tier: PlanTier) => Promise<StorePurchaseResult>;
export type RestoreStorePurchases = () => Promise<Result<boolean>>;
export type SyncStoreSubscription = () => Promise<Result<void>>;
