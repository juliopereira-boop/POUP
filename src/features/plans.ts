import { env } from '@/lib/env';
import type { PlanTier } from '@/data/types';

const GB = 1024 * 1024 * 1024;

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  storageLimitBytes: number;
  storageLabel: string;
  stripePriceId: string;
  benefits: string[];
  highlighted?: boolean;
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  start: {
    tier: 'start',
    name: 'Start',
    priceLabel: 'R$ 59,90/mês',
    storageLimitBytes: 5 * GB,
    storageLabel: '5 GB',
    stripePriceId: env.stripePriceStart,
    benefits: [
      'Simulador de poupança',
      'Controle de comissões e vendas',
      'Material de venda',
      '5 GB de armazenamento',
      'Acesso no celular e no computador',
    ],
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    priceLabel: 'R$ 99,90/mês',
    storageLimitBytes: 25 * GB,
    storageLabel: '25 GB',
    stripePriceId: env.stripePricePro,
    highlighted: true,
    benefits: [
      'Tudo do Start',
      '25 GB de armazenamento',
      'Relatórios avançados',
      'Prioridade no suporte',
    ],
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

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 1 : 0).replace('.', ',')} GB`;
}
