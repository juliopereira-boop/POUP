import { supabase } from '@/lib/supabase';
import type { AppointmentRepository } from '../repositories';
import { moveLeadToFlaggedStage } from './SupabaseLeadRepository';
import {
  type Appointment,
  type AppointmentInput,
  type AppointmentPriority,
  type AppointmentSource,
  type AppointmentStatusInfo,
  type AppointmentType,
  type Result,
  err,
  ok,
} from '../types';

const SELECT =
  'id, title, description, type_id, status_id, lead_id, company_id, development_id, start_at, end_at, location, priority, reminder_minutes, source, completed_at, completed_note, cancelled_at, cancel_reason, created_at, updated_at, leads(name), companies(name), developments(name)';

interface AppointmentRow {
  id: string;
  title: string;
  description: string | null;
  type_id: string;
  status_id: string;
  lead_id: string | null;
  company_id: string | null;
  development_id: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  priority: string;
  reminder_minutes: number[] | null;
  source: string;
  completed_at: string | null;
  completed_note: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  leads: { name: string } | null;
  companies: { name: string } | null;
  developments: { name: string } | null;
}

interface AppointmentPatch {
  title?: string;
  description?: string | null;
  type_id?: string;
  lead_id?: string | null;
  company_id?: string | null;
  development_id?: string | null;
  start_at?: string;
  end_at?: string | null;
  location?: string | null;
  priority?: string;
  reminder_minutes?: number[];
  updated_at?: string;
}

function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    typeId: row.type_id,
    statusId: row.status_id,
    leadId: row.lead_id,
    leadName: row.leads?.name ?? null,
    companyId: row.company_id,
    companyName: row.companies?.name ?? null,
    developmentId: row.development_id,
    developmentName: row.developments?.name ?? null,
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location,
    priority: (row.priority as AppointmentPriority) ?? 'normal',
    reminderMinutes: row.reminder_minutes ?? [],
    source: (row.source as AppointmentSource) ?? 'manual',
    completedAt: row.completed_at,
    completedNote: row.completed_note,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildPatch(data: Partial<AppointmentInput>): AppointmentPatch {
  const patch: AppointmentPatch = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.typeId !== undefined) patch.type_id = data.typeId;
  if (data.leadId !== undefined) patch.lead_id = data.leadId;
  if (data.companyId !== undefined) patch.company_id = data.companyId;
  if (data.developmentId !== undefined) patch.development_id = data.developmentId;
  if (data.startAt !== undefined) patch.start_at = data.startAt;
  if (data.endAt !== undefined) patch.end_at = data.endAt;
  if (data.location !== undefined) patch.location = data.location;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.reminderMinutes !== undefined) patch.reminder_minutes = data.reminderMinutes;
  return patch;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function logHistory(
  appointmentId: string,
  action: string,
  oldValue: string | null = null,
  newValue: string | null = null,
): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from('appointment_history').insert({
    appointment_id: appointmentId,
    user_id: userId,
    action,
    old_value: oldValue,
    new_value: newValue,
  });
}

export class SupabaseAppointmentRepository implements AppointmentRepository {
  async get(id: string): Promise<Appointment | null> {
    const { data, error } = await supabase
      .from('appointments')
      .select(SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (error || !data) return null;
    return mapAppointment(data as unknown as AppointmentRow);
  }

  async listRange(userId: string, startISO: string, endISO: string): Promise<Appointment[]> {
    const { data, error } = await supabase
      .from('appointments')
      .select(SELECT)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('start_at', startISO)
      .lte('start_at', endISO)
      .order('start_at', { ascending: true });
    if (error || !data) return [];
    return (data as unknown as AppointmentRow[]).map(mapAppointment);
  }

  async listByLead(userId: string, leadId: string): Promise<Appointment[]> {
    const { data, error } = await supabase
      .from('appointments')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .order('start_at', { ascending: true });
    if (error || !data) return [];
    return (data as unknown as AppointmentRow[]).map(mapAppointment);
  }

  async create(userId: string, data: AppointmentInput): Promise<Result<Appointment>> {
    const { data: row, error } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        title: data.title,
        description: data.description ?? null,
        type_id: data.typeId,
        lead_id: data.leadId ?? null,
        company_id: data.companyId ?? null,
        development_id: data.developmentId ?? null,
        start_at: data.startAt,
        end_at: data.endAt ?? null,
        location: data.location ?? null,
        priority: data.priority ?? 'normal',
        reminder_minutes: data.reminderMinutes ?? [60, 30],
        source: data.source ?? 'manual',
      })
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao salvar o agendamento.');
    const appointment = mapAppointment(row as unknown as AppointmentRow);
    await logHistory(appointment.id, 'criado', null, appointment.startAt);
    // Automação: todo agendamento ligado a um lead move o lead para a etapa
    // marcada como "de agendamento". Fica aqui (e não na UI) para valer em
    // todos os caminhos de criação de agendamento do app.
    if (appointment.leadId) {
      await moveLeadToFlaggedStage(userId, appointment.leadId, 'agendamento');
    }
    return ok(appointment);
  }

  async update(id: string, data: Partial<AppointmentInput>): Promise<Result<Appointment>> {
    const { data: row, error } = await supabase
      .from('appointments')
      .update({ ...buildPatch(data), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error || !row) return err(error?.message ?? 'Falha ao atualizar o agendamento.');
    const appointment = mapAppointment(row as unknown as AppointmentRow);
    await logHistory(appointment.id, 'editado', null, appointment.startAt);
    return ok(appointment);
  }

  async setStatus(
    id: string,
    statusId: string,
    extra?: { note?: string | null; reason?: string | null },
  ): Promise<Result<void>> {
    const now = new Date().toISOString();
    const patch: {
      status_id: string;
      updated_at: string;
      completed_at?: string | null;
      completed_note?: string | null;
      cancelled_at?: string | null;
      cancel_reason?: string | null;
    } = { status_id: statusId, updated_at: now };

    if (statusId === 'concluido') {
      patch.completed_at = now;
      patch.completed_note = extra?.note ?? null;
    }
    if (statusId === 'cancelado') {
      patch.cancelled_at = now;
      patch.cancel_reason = extra?.reason ?? null;
    }
    // Voltar para um status "em aberto" limpa os registros de conclusão e de
    // cancelamento, senão a tela mostraria dados de um desfecho antigo.
    if (statusId !== 'concluido') {
      patch.completed_at = null;
      patch.completed_note = null;
    }
    if (statusId !== 'cancelado') {
      patch.cancelled_at = null;
      patch.cancel_reason = null;
    }

    const { error } = await supabase.from('appointments').update(patch).eq('id', id);
    if (error) return err(error.message);
    await logHistory(id, 'status', null, statusId);
    return ok(undefined);
  }

  async reschedule(id: string, startAt: string, endAt: string | null): Promise<Result<void>> {
    const { data: previous } = await supabase
      .from('appointments')
      .select('start_at')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('appointments')
      .update({ start_at: startAt, end_at: endAt, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return err(error.message);
    await logHistory(id, 'reagendado', previous?.start_at ?? null, startAt);
    return ok(undefined);
  }

  async remove(id: string): Promise<Result<void>> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('appointments')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);
    if (error) return err(error.message);
    await logHistory(id, 'excluido', null, now);
    return ok(undefined);
  }

  async listTypes(): Promise<AppointmentType[]> {
    const { data, error } = await supabase
      .from('appointment_types')
      .select('id, nome, cor, icone')
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({ id: row.id, nome: row.nome, cor: row.cor, icone: row.icone }));
  }

  async listStatuses(): Promise<AppointmentStatusInfo[]> {
    const { data, error } = await supabase
      .from('appointment_statuses')
      .select('id, nome, cor')
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({ id: row.id, nome: row.nome, cor: row.cor }));
  }
}
