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
  | 'vendas'
  | 'comissao'
  | 'lia';

export interface PlanFeature {
  key: PlanFeatureKey;
  /** Rótulo exibido no paywall. */
  label: string;
  /** Planos que incluem a funcionalidade. */
  includedIn: readonly PlanTier[];
}

const TODOS: readonly PlanTier[] = ['start', 'intermed', 'pro'];
/** Do Intermed para cima: gestão do que já foi vendido. */
const DO_INTERMED: readonly PlanTier[] = ['intermed', 'pro'];
/** Só no Pro. Hoje é a LIA, e é ela que justifica o topo da escada. */
const SO_PRO: readonly PlanTier[] = ['pro'];

export const PLAN_FEATURES: readonly PlanFeature[] = [
  { key: 'prospeccao', label: 'Prospecção de leads', includedIn: TODOS },
  {
    key: 'leads',
    label: 'Gestão de leads: funil configurável, ficha completa e filtros',
    includedIn: TODOS,
  },
  { key: 'simulador', label: 'Simulador de financiamento', includedIn: TODOS },
  { key: 'proposta', label: 'Proposta de compra e venda em PDF', includedIn: TODOS },
  { key: 'materialVenda', label: 'Material de venda', includedIn: TODOS },
  { key: 'calendario', label: 'Calendário e agendamentos', includedIn: TODOS },
  { key: 'cadastros', label: 'Cadastros de empresas e empreendimentos', includedIn: TODOS },
  { key: 'captacao', label: 'Página de captação com QR Code do corretor', includedIn: TODOS },
  { key: 'multiDispositivo', label: 'Acesso no celular e no computador', includedIn: TODOS },
  { key: 'vendas', label: 'Vendas realizadas', includedIn: DO_INTERMED },
  { key: 'comissao', label: 'Controle de comissão', includedIn: DO_INTERMED },
  {
    key: 'lia',
    label: 'LIA: a assistente que ouve a negociação e preenche a simulação',
    includedIn: SO_PRO,
  },
];

/*
 * O ARMAZENAMENTO SAIU DA LISTA DE PROPAGANDA — mas continua existindo.
 *
 * `storageLimitBytes` segue em cada plano, porque é ele que o trigger
 * `enforce_storage_quota` usa no banco para recusar upload acima do limite.
 * O que saiu foi a LINHA no paywall e na landing: gigabyte não vende CRM de
 * corretor, e listar "5 GB" ao lado de "controle de comissão" faz o plano
 * parecer pacote de hospedagem. Quem quiser saber o consumo vê em Ajustes.
 */

export interface PlanFeatureLine {
  key: PlanFeatureKey;
  label: string;
  included: boolean;
}

/** Lista completa de funcionalidades já resolvida para um plano. */
export function planFeatureLines(tier: PlanTier): PlanFeatureLine[] {
  return PLAN_FEATURES.map((feature) => ({
    key: feature.key,
    label: feature.label,
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
    priceLabel: 'R$ 29,90/mês',
    tagline: 'Para começar a organizar a operação',
    storageLimitBytes: 5 * GB,
    storageLabel: '5 GB',
    stripePriceId: env.stripePriceStart,
    features: planFeatureLines('start'),
  },
  intermed: {
    tier: 'intermed',
    name: 'Intermed',
    priceLabel: 'R$ 49,90/mês',
    tagline: 'Para acompanhar a venda até a comissão cair',
    storageLimitBytes: 15 * GB,
    storageLabel: '15 GB',
    stripePriceId: env.stripePriceIntermed,
    features: planFeatureLines('intermed'),
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    priceLabel: 'R$ 89,90/mês',
    tagline: 'Tudo do POUP, com a LIA ouvindo por você',
    storageLimitBytes: 25 * GB,
    storageLabel: '25 GB',
    stripePriceId: env.stripePricePro,
    highlighted: true,
    features: planFeatureLines('pro'),
  },
};

/** Ordem comercial: do mais barato ao mais completo. */
export const PLAN_ORDER: PlanTier[] = ['start', 'intermed', 'pro'];

/**
 * O plano MAIS BARATO que inclui a funcionalidade.
 *
 * Existe porque, com três degraus, "assine o Pro" virou resposta errada na
 * maioria das vezes: quem está no Start e esbarrou em Vendas precisa ouvir
 * *Intermed*, não Pro — mandar para um plano mais caro do que ele precisa é o
 * jeito mais rápido de perder a venda do upgrade. `PLAN_ORDER` está em ordem de
 * preço justamente para esta busca.
 */
export function planoMinimoPara(feature: PlanFeatureKey): PlanConfig | null {
  const tier = PLAN_ORDER.find((t) => canUse(feature, t));
  return tier ? PLANS[tier] : null;
}

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
 * comercialmente o teste libera o produto INTEIRO — inclusive a LIA, que só
 * existe no Pro. É de propósito: o corretor conhece o topo da escada e decide
 * assinar por ele. O bloqueio só vale para assinatura paga.
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
