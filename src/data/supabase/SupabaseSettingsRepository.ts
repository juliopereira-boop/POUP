import { supabase } from '@/lib/supabase';
import type { SettingsRepository } from '../repositories';
import {
  TRIAL_DAYS_MAX,
  TRIAL_DAYS_MIN,
  type Result,
  type TrialCampaign,
  type TrialCampaignInput,
  err,
  isValidTrialDays,
  ok,
} from '../types';
import type { Database } from '../database.types';

type TrialCampaignRow = Database['public']['Tables']['trial_campaign']['Row'];

function mapCampaign(row: TrialCampaignRow): TrialCampaign {
  return {
    enabled: row.enabled,
    trialDays: Number(row.trial_days ?? 0),
    updatedAt: row.updated_at,
  };
}

export class SupabaseSettingsRepository implements SettingsRepository {
  async isAdmin(): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_app_admin');
    if (error || data == null) return false;
    return data === true;
  }

  async getTrialCampaign(): Promise<TrialCampaign | null> {
    const { data, error } = await supabase.from('trial_campaign').select('*').maybeSingle();
    if (error || !data) return null;
    return mapCampaign(data);
  }

  async saveTrialCampaign(input: TrialCampaignInput): Promise<Result<TrialCampaign>> {
    if (!isValidTrialDays(input.trialDays)) {
      return err(
        `Informe um número inteiro de dias entre ${TRIAL_DAYS_MIN} e ${TRIAL_DAYS_MAX}.`,
      );
    }
    const { data, error } = await supabase
      .from('trial_campaign')
      .update({ enabled: input.enabled, trial_days: input.trialDays })
      .eq('id', true)
      .select('*')
      .maybeSingle();
    if (error) return err(error.message);
    // Sem linha de volta = RLS bloqueou a escrita (usuário não é admin).
    if (!data) return err('Somente o administrador pode alterar o período de teste.');
    return ok(mapCampaign(data));
  }

  async countActiveTrials(): Promise<number | null> {
    const { data, error } = await supabase.rpc('trial_active_count');
    if (error || data == null) return null;
    return Number(data);
  }
}
