import { supabase } from '@/lib/supabase';
import type { Json } from '@/data/database.types';
import {
  INITIAL_SIMULADOR_STATE,
  type SimuladorState,
} from '@/features/simulador/SimuladorProvider';
import type { SimulationRepository } from '../repositories';
import { type Result, type Simulation, type SimulationInput, err, ok } from '../types';

const SELECT =
  'id, client_name, company_id, company_name, development_id, development_name, monthly_value, risk_pct, within_risk, unit_value, delivery_date, manager_name, proposal_date, state, status, created_at, updated_at';

interface SimulationRow {
  id: string;
  client_name: string | null;
  company_id: string | null;
  company_name: string | null;
  development_id: string | null;
  development_name: string | null;
  monthly_value: number | null;
  risk_pct: number | null;
  within_risk: boolean | null;
  unit_value: number | null;
  delivery_date: string | null;
  manager_name: string | null;
  proposal_date: string | null;
  state: SimuladorState;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapSimulation(row: SimulationRow): Simulation {
  return {
    id: row.id,
    clientName: row.client_name,
    companyId: row.company_id,
    companyName: row.company_name,
    developmentId: row.development_id,
    developmentName: row.development_name,
    monthlyValue: row.monthly_value,
    riskPct: row.risk_pct,
    withinRisk: row.within_risk,
    unitValue: row.unit_value,
    deliveryDate: row.delivery_date,
    managerName: row.manager_name,
    proposalDate: row.proposal_date,
    // Backfill contra o estado inicial: se um campo novo for adicionado ao
    // SimuladorState, simulações antigas (sem esse campo) não quebram.
    state: { ...INITIAL_SIMULADOR_STATE, ...row.state },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function payload(data: SimulationInput) {
  return {
    client_name: data.clientName,
    company_id: data.companyId,
    company_name: data.companyName,
    development_id: data.developmentId,
    development_name: data.developmentName,
    monthly_value: data.monthlyValue,
    risk_pct: data.riskPct,
    within_risk: data.withinRisk,
    unit_value: data.unitValue,
    delivery_date: data.deliveryDate,
    manager_name: data.managerName,
    proposal_date: data.proposalDate,
    // jsonb: o estado é um objeto serializável (SimuladorState).
    state: data.state as unknown as Json,
  };
}

export class SupabaseSimulationRepository implements SimulationRepository {
  async list(userId: string): Promise<Simulation[]> {
    const { data, error } = await supabase
      .from('simulations')
      .select(SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as unknown as SimulationRow[]).map(mapSimulation);
  }

  async get(id: string): Promise<Simulation | null> {
    const { data, error } = await supabase
      .from('simulations')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapSimulation(data as unknown as SimulationRow);
  }

  async create(userId: string, data: SimulationInput): Promise<Result<Simulation>> {
    const { data: row, error } = await supabase
      .from('simulations')
      .insert({ user_id: userId, ...payload(data) })
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar a simulação.');
    return ok(mapSimulation(row as unknown as SimulationRow));
  }

  async update(id: string, data: SimulationInput): Promise<Result<Simulation>> {
    const { data: row, error } = await supabase
      .from('simulations')
      .update({ ...payload(data), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao atualizar a simulação.');
    return ok(mapSimulation(row as unknown as SimulationRow));
  }

  async remove(id: string): Promise<Result<void>> {
    const { error } = await supabase.from('simulations').delete().eq('id', id);
    if (error) return err(error.message);
    return ok(undefined);
  }
}
