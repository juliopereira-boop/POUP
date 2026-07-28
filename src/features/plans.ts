import { env } from '@/lib/env';
import type { PlanTier } from '@/data/types';

const GB = 1024 * 1024 * 1024;

/**
 * Cada funcionalidade comercializável do POUP.
 * É a fonte única da verdade: o paywall lista TODAS elas em cada plano
 * (marcando incluída / não incluída) e o bloqueio em tela usa a mesma lista,
 * então nunca dá para o texto e a regra divergirem.
 */
export type PlanFeatureKey =
  | 'prospeccao'
  | 'leads'
  | 'simulador'
  | 'proposta'
  | 'materialVenda'
  | 'calendario'
  | 'cadastros'
  | 'captacao'
  | 'multiDispositivo'
  | 'armazenamento'
  | 'vendas'
  | 'comissao'
  | 'agenteIa';

export interface PlanFeature {
  key: PlanFeatureKey;
  /** Rótulo exibido no paywall. */
  label: string;
  /** Rótulo alternativo quando o texto muda por plano (ex.: armazenamento). */
  labelByTier?: Partial<Record<PlanTier, string>>;
  /** Planos que incluem a funcionalidade. */
  includedIn: readonly PlanTier[];
}

const ALL_TIERS: readonly PlanTier[] = ['start', 'pro'];
const PRO_ONLY: readonly PlanTier[] = ['pro'];

export const PLAN_FEATURES: readonly PlanFeature[] = [
  { key: 'prospeccao', label: 'Prospecção de leads', includedIn: ALL_TIERS },
  {
    key: 'leads',
    label: 'Gestão de leads: funil configurável, ficha completa e filtros',
    includedIn: ALL_TIERS,
  },
  { key: 'simulador', label: 'Simulador de financiamento', includedIn: ALL_TIERS },
  { key: 'proposta', label: 'Proposta de compra e venda em PDF', includedIn: ALL_TIERS },
  { key: 'materialVenda', label: 'Material de venda', includedIn: ALL_TIERS },
  { key: 'calendario', label: 'Calendário e agendamentos', includedIn: ALL_TIERS },
  { key: 'cadastros', label: 'Cadastros de empresas e empreendimentos', includedIn: ALL_TIERS },
  { key: 'captacao', label: 'Página de captação com QR Code do corretor', includedIn: ALL_TIERS },
  { key: 'multiDispositivo', label: 'Acesso no celular e no computador', includedIn: ALL_TIERS },
  {
    key: 'armazenamento',
    label: 'Armazenamento de arquivos',
    labelByTier: { start: '5 GB de armazenamento', pro: '25 GB de armazenamento' },
    includedIn: ALL_TIERS,
  },
  { key: 'vendas', label: 'Vendas realizadas', includedIn: PRO_ONLY },
  { key: 'comissao', label: 'Controle de comissão', includedIn: PRO_ONLY },
  { key: 'agenteIa', label: 'Agente de IA de atendimento', includedIn: PRO_ONLY },
];

export interface PlanFeatureLine {
  key: PlanFeatureKey;
  label: string;
  included: boolean;
}

/** Lista completa de funcionalidades já resolvida para um plano. */
export function planFeatureLines(tier: PlanTier): PlanFeatureLine[] {
  return PLAN_FEATURES.map((feature) => ({
    key: feature.key,
    label: feature.labelByTier?.[tier] ?? feature.label,
    included: feature.includedIn.includes(tier),
  }));
}

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  tagline: string;
  storageLimitBytes: number;
  storageLabel: string;
  stripePriceId: string;
  /** Todas as funcionalidades do produto, marcadas como incluídas ou não. */
  features: PlanFeatureLine[];
  highlighted?: boolean;
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  start: {
    tier: 'start',
    name: 'Start',
    priceLabel: 'R$ 59,90/mês',
    tagline: 'Para começar a organizar a operação',
    storageLimitBytes: 5 * GB,
    storageLabel: '5 GB',
    stripePriceId: env.stripePriceStart,
    features: planFeatureLines('start'),
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    priceLabel: 'R$ 89,90/mês',
    tagline: 'Tudo do POUP, sem limite de recursos',
    storageLimitBytes: 25 * GB,
    storageLabel: '25 GB',
    stripePriceId: env.stripePricePro,
    highlighted: true,
    features: planFeatureLines('pro'),
  },
};

export const PLAN_ORDER: PlanTier[] = ['start', 'pro'];

export function getPlan(tier: PlanTier | null | undefined): PlanConfig | null {
  if (!tier) return null;
  return PLANS[tier] ?? null;
}

export function storageLimitFor(tier: PlanTier | null | undefined): number {
  return getPlan(tier)?.storageLimitBytes ?? 0;
}

/**
 * Regra ÚNICA de liberação de funcionalidade por plano.
 *
 * `isTrial`: durante o período de teste gratuito o `plan_tier` gravado é
 * `'start'` (ver `supabase/migrations/0018_trial_campaign.sql`), mas
 * comercialmente o teste libera o produto inteiro — é assim que o corretor
 * conhece os recursos do Pro e decide assinar. Por isso o teste libera tudo e
 * o bloqueio só vale para assinatura paga no Start.
 */
export function canUse(
  feature: PlanFeatureKey,
  tier: PlanTier | null | undefined,
  isTrial = false,
): boolean {
  if (isTrial) return true;
  if (!tier) return false;
  const config = PLAN_FEATURES.find((f) => f.key === feature);
  if (!config) return true;
  return config.includedIn.includes(tier);
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 1 : 0).replace('.', ',')} GB`;
}
