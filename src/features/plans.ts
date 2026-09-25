import { liaDisponivel } from './store';
import type { PlanTier } from '@/data/types';

const GB = 1024 * 1024 * 1024;

/**
 * Cada funcionalidade comercializável do POUP.
 * É a fonte única da verdade: o paywall lista TODAS elas em cada plano
 * (marcando incluída / não incluída) e o bloqueio em tela usa a mesma lista,
 * então nunca dá para o texto e a regra divergirem.
 */
export type PlanFeatureKey =
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

const TODOS: readonly PlanTier[] = ['start', 'pro'];
/** Gestão de vendas/comissões e assistência adicional do Pro. */
const SO_PRO: readonly PlanTier[] = ['pro'];

export const PLAN_FEATURES: readonly PlanFeature[] = [
  {
    key: 'leads',
    label: 'Gestão de leads: funil configurável, ficha completa e filtros',
    includedIn: TODOS,
  },
  {
    key: 'simulador',
    label: 'Simulador de financiamento habitacional e de vendas',
    includedIn: TODOS,
  },
  { key: 'proposta', label: 'Proposta de compra e venda em PDF', includedIn: TODOS },
  { key: 'materialVenda', label: 'Material de venda', includedIn: TODOS },
  { key: 'calendario', label: 'Calendário e agendamentos', includedIn: TODOS },
  { key: 'cadastros', label: 'Cadastros de empresas e empreendimentos', includedIn: TODOS },
  { key: 'captacao', label: 'Página de captação com QR Code, para o cliente se cadastrar', includedIn: TODOS },
  { key: 'multiDispositivo', label: 'Acesso no celular e no computador', includedIn: TODOS },
  { key: 'vendas', label: 'Vendas realizadas', includedIn: SO_PRO },
  { key: 'comissao', label: 'Controle de comissão', includedIn: SO_PRO },
  { key: 'lia', label: 'LIA: sua assistente pessoal de corretagem', includedIn: SO_PRO },
];

/*
 * O ARMAZENAMENTO NÃO APARECE EM LUGAR NENHUM — mas continua existindo.
 *
 * `storageLimitBytes` segue em cada plano porque é ele que o trigger
 * `enforce_storage_quota` usa no banco para recusar upload acima do limite. É
 * uma trava de custo, e trava de custo é assunto interno.
 *
 * O que NÃO existe mais é o informativo: nem linha no paywall, nem coluna na
 * landing, nem barra de consumo em Ajustes, nem "x de y GB" no material de
 * venda. Gigabyte não vende CRM de corretor — anunciar espaço convida o
 * corretor a usar o POUP como nuvem de arquivos, que é exatamente o uso que
 * dá prejuízo. O que ele precisa saber na hora de enviar é o teto POR
 * ARQUIVO, e esse continua à vista na tela de material.
 *
 * Se um upload for recusado por cota, a mensagem vem do banco no momento do
 * erro — informar no ponto do bloqueio, não como propaganda.
 */

/**
 * A lista que a TELA mostra — que não é a mesma que decide o acesso.
 *
 * `PLAN_FEATURES` é a fonte da verdade do que cada plano libera. A filtragem
 * continua aqui para que uma indisponibilidade futura por plataforma também
 * seja refletida imediatamente na oferta exibida ao cliente.
 */
export const PLAN_FEATURES_VISIVEIS: readonly PlanFeature[] = PLAN_FEATURES.filter(
  (f) => f.key !== 'lia' || liaDisponivel,
);

export interface PlanFeatureLine {
  key: PlanFeatureKey;
  label: string;
  included: boolean;
}

/** Lista de funcionalidades EXIBÍVEIS já resolvida para um plano. */
export function planFeatureLines(tier: PlanTier): PlanFeatureLine[] {
  return PLAN_FEATURES_VISIVEIS.map((feature) => ({
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
    features: planFeatureLines('start'),
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    priceLabel: 'R$ 59,90/mês',
    tagline: 'Da negociação até o recebimento da comissão',
    storageLimitBytes: 25 * GB,
    highlighted: true,
    features: planFeatureLines('pro'),
  },
};

/** Ordem comercial: do mais barato ao mais completo. */
export const PLAN_ORDER: PlanTier[] = ['start', 'pro'];

/**
 * O plano MAIS BARATO que inclui a funcionalidade.
 *
 * A mesma ordem comercial é usada na oferta e nos bloqueios de acesso.
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
 * o teste libera os demais recursos, mas não a LIA: ela exige o plano Pro.
 */
export function canUse(
  feature: PlanFeatureKey,
  tier: PlanTier | null | undefined,
  isTrial = false,
): boolean {
  if (feature === 'lia') return tier === 'pro' && !isTrial;
  if (isTrial) return true;
  if (!tier) return false;
  const config = PLAN_FEATURES.find((f) => f.key === feature);
  if (!config) return true;
  return config.includedIn.includes(tier);
}
