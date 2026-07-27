import type { SimuladorState } from '@/features/simulador/SimuladorProvider';

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface UserProfile {
  id: string;
  fullName: string | null;
  agency: string | null;
  agencyManager: string | null;
  cnpj: string | null;
  phone: string | null;
  avatarUrl: string | null;
  creci: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isProfileComplete(p: UserProfile | null): boolean {
  if (!p) return false;
  return Boolean(p.fullName?.trim() && p.agency?.trim() && p.cnpj?.trim() && p.phone?.trim());
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'none';

export type PlanTier = 'start' | 'pro';

export interface Subscription {
  status: SubscriptionStatus;
  tier: PlanTier | null;
  plan: string | null;
  storageLimitBytes: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
}

export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  return sub.status === 'active' || sub.status === 'trialing';
}

export interface Company {
  id: string;
  name: string;
  risk: number | null;
  maxInstallments: number | null;
  maxSemiannual: number | null;
  maxAnnual: number | null;
  coincideInstallments: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Correspondent {
  id: string;
  companyId: string;
  name: string;
}

export interface Development {
  id: string;
  companyId: string;
  name: string;
  companyName?: string | null;
  description: string | null;
  deliveryDate: string | null;
  managerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyInput {
  name: string;
  risk: number | null;
  maxInstallments: number | null;
  maxSemiannual: number | null;
  maxAnnual: number | null;
  coincideInstallments: boolean;
}

export interface DevelopmentInput {
  companyId: string;
  name: string;
  description: string | null;
  deliveryDate: string | null;
  managerName: string | null;
}

export interface CompanyMaterial {
  companyId: string;
  driveUrl: string | null;
}

export interface Simulation {
  id: string;
  clientName: string | null;
  companyId: string | null;
  companyName: string | null;
  developmentId: string | null;
  developmentName: string | null;
  monthlyValue: number | null;
  riskPct: number | null;
  withinRisk: boolean | null;
  unitValue: number | null;
  deliveryDate: string | null;
  managerName: string | null;
  proposalDate: string | null;
  state: SimuladorState;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type SimulationInput = Omit<
  Simulation,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

export type LeadSource = 'landing' | 'whatsapp' | 'prospeccao' | 'meta' | 'manual';
export type LeadStatus = 'novo' | 'em_contato' | 'convertido' | 'perdido';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  source: LeadSource;
  companyId: string | null;
  companyName?: string | null;
  developmentId: string | null;
  developmentName?: string | null;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LeadCampaign {
  titulo: string;
  subtitulo: string;
  descricao: string;
  beneficios: string[];
  convite: string;
}

export interface StorageEntry {
  name: string;
  path: string;
  isFolder: boolean;
  size: number | null;
  updatedAt: string | null;
  mimeType: string | null;
}

export interface AppointmentType {
  id: string;
  nome: string;
  cor: string;
  icone: string | null;
}

export interface AppointmentStatusInfo {
  id: string;
  nome: string;
  cor: string;
}

export type AppointmentPriority = 'baixa' | 'normal' | 'alta' | 'urgente';
export type AppointmentSource =
  | 'manual'
  | 'sistema'
  | 'automacao'
  | 'api'
  | 'lead'
  | 'venda'
  | 'comissao'
  | 'financeiro';

export interface Appointment {
  id: string;
  title: string;
  description: string | null;
  typeId: string;
  statusId: string;
  leadId: string | null;
  leadName?: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
  priority: AppointmentPriority;
  reminderMinutes: number[];
  source: AppointmentSource;
  completedAt: string | null;
  completedNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentInput {
  title: string;
  description?: string | null;
  typeId: string;
  leadId?: string | null;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  priority?: AppointmentPriority;
  reminderMinutes?: number[];
  source?: AppointmentSource;
}

export function isAppointmentLate(a: Appointment): boolean {
  if (a.statusId === 'concluido' || a.statusId === 'cancelado') return false;
  return new Date(a.startAt).getTime() < Date.now();
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(error: string): Result<T> {
  return { ok: false, error };
}
