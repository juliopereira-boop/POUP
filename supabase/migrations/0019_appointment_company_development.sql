-- 0019: empresa e empreendimento no agendamento
-- Permite administrar o atendimento direto na tela do agendamento, associando
-- a construtora (companies) e o empreendimento (developments) do compromisso.
-- Migration idempotente: pode ser executada mais de uma vez sem efeito colateral.

alter table public.appointments
  add column if not exists company_id uuid references public.companies (id) on delete set null,
  add column if not exists development_id uuid references public.developments (id) on delete set null;

create index if not exists appointments_company_idx
  on public.appointments (company_id);

create index if not exists appointments_development_idx
  on public.appointments (development_id);

-- Backfill: agendamentos ligados a um lead herdam a empresa/empreendimento do
-- lead quando ainda nao tiverem nada preenchido.
update public.appointments a
set company_id = l.company_id,
    development_id = l.development_id
from public.leads l
where a.lead_id = l.id
  and a.company_id is null
  and a.development_id is null
  and (l.company_id is not null or l.development_id is not null);
