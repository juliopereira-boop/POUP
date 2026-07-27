-- 0017: flags de automacao nas etapas do funil de leads
-- Marca qual etapa recebe o lead automaticamente quando um agendamento e criado
-- (is_agendamento) e quando uma simulacao e iniciada (is_simulacao).
-- Migration idempotente: pode ser executada mais de uma vez sem efeito colateral.

alter table public.lead_stages
  add column if not exists is_agendamento boolean not null default false,
  add column if not exists is_simulacao boolean not null default false;

-- ---------------------------------------------------------------------------
-- Backfill para quem ja tem etapas criadas.
-- Escolhe UMA etapa por usuario (a de menor ordem que casa com o nome) e apenas
-- quando o usuario ainda nao tem nenhuma etapa com a flag ligada.
-- ---------------------------------------------------------------------------

with alvo as (
  select distinct on (s.user_id) s.id, s.user_id
  from public.lead_stages s
  where s.ativo
    and lower(s.nome) like '%agenda%'
    and not exists (
      select 1
      from public.lead_stages x
      where x.user_id = s.user_id
        and x.is_agendamento
    )
  order by s.user_id, s.ordem, s.created_at
)
update public.lead_stages s
set is_agendamento = true
from alvo
where s.id = alvo.id;

with alvo as (
  select distinct on (s.user_id) s.id, s.user_id
  from public.lead_stages s
  where s.ativo
    and lower(s.nome) like '%simula%'
    and not exists (
      select 1
      from public.lead_stages x
      where x.user_id = s.user_id
        and x.is_simulacao
    )
  order by s.user_id, s.ordem, s.created_at
)
update public.lead_stages s
set is_simulacao = true
from alvo
where s.id = alvo.id;

-- Seguranca extra: se por algum motivo sobrou mais de uma etapa marcada para o
-- mesmo usuario, mantem so a de menor ordem (necessario antes dos indices unicos).
update public.lead_stages s
set is_agendamento = false
where s.is_agendamento
  and s.id <> (
    select k.id
    from public.lead_stages k
    where k.user_id = s.user_id
      and k.is_agendamento
    order by k.ordem, k.created_at
    limit 1
  );

update public.lead_stages s
set is_simulacao = false
where s.is_simulacao
  and s.id <> (
    select k.id
    from public.lead_stages k
    where k.user_id = s.user_id
      and k.is_simulacao
    order by k.ordem, k.created_at
    limit 1
  );

-- ---------------------------------------------------------------------------
-- Invariante: no maximo uma etapa por usuario para cada flag.
-- ---------------------------------------------------------------------------

create unique index if not exists lead_stages_agendamento_unique
  on public.lead_stages (user_id)
  where is_agendamento;

create unique index if not exists lead_stages_simulacao_unique
  on public.lead_stages (user_id)
  where is_simulacao;

-- Ao ligar a flag numa etapa, desliga nas outras do mesmo usuario. Assim a
-- exclusividade vale mesmo se alguem escrever direto no banco.
create or replace function public.lead_stages_enforce_unique_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_agendamento then
    update public.lead_stages
    set is_agendamento = false
    where user_id = new.user_id
      and id <> new.id
      and is_agendamento;
  end if;

  if new.is_simulacao then
    update public.lead_stages
    set is_simulacao = false
    where user_id = new.user_id
      and id <> new.id
      and is_simulacao;
  end if;

  return new;
end;
$$;

drop trigger if exists lead_stages_unique_flags on public.lead_stages;
create trigger lead_stages_unique_flags
  before insert or update of is_agendamento, is_simulacao on public.lead_stages
  for each row execute function public.lead_stages_enforce_unique_flags();
