/**
 * PLANOS DO POUP — fonte única de verdade.
 *
 * O principal diferencial entre os planos é o LIMITE DE ARMAZENAMENTO, porque
 * os uploads dos corretores (fotos, PDFs, materiais) são o maior custo de
 * infraestrutura. Uploads vão para o Supabase Storage (barato), não para o
 * Postgres (caro) — ver supabase/migrations/0002_plans_and_storage.sql.
 *
 * ⚠️ Ao mudar um limite aqui, mude também no webhook do Stripe
 *    (supabase/functions/stripe-webhook/index.ts → PLAN_LIMITS) para o valor
 *    gravado no banco bater com o exibido no app.
 */
import { env } from '@/lib/env';
import type { PlanTier } from '@/data/types';

const GB = 1024 * 1024 * 1024;

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  /** Texto do preço exibido no paywall. Ajuste para bater com o Stripe. */
  priceLabel: string;
  /** Limite de armazenamento em bytes. */
  storageLimitBytes: number;
  /** Rótulo amigável do limite (ex.: "1 GB"). */
  storageLabel: string;
  /** Price ID do Stripe (vem do .env). */
  stripePriceId: string;
  /** Benefícios exibidos no paywall. */
  benefits: string[];
  /** Destaque visual (plano recomendado). */
  highlighted?: boolean;
}

/**
 * Limites:
 * - Start 5 GB  → custo de storage ~US$0,10/usuário/mês.
 * - Pro  25 GB  → power users; ~US$0,52/usuário/mês.
 * (Storage no Supabase Pro: 100 GB inclusos, depois ~US$0,021/GB.)
 */
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

/** Ordem de exibição no paywall. */
export const PLAN_ORDER: PlanTier[] = ['start', 'pro'];

export function getPlan(tier: PlanTier | null | undefined): PlanConfig | null {
  if (!tier) return null;
  return PLANS[tier] ?? null;
}

/** Limite de armazenamento (bytes) para um tier; 0 se sem plano. */
export function storageLimitFor(tier: PlanTier | null | undefined): number {
  return getPlan(tier)?.storageLimitBytes ?? 0;
}

/** Formata bytes em unidade legível (ex.: "512 MB", "1,2 GB"). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 1 : 0).replace('.', ',')} GB`;
}
