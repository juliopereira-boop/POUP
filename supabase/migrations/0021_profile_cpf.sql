-- ===========================================================================
-- 0021: CPF DO CORRETOR (CADASTRO UNICO)
-- ===========================================================================
-- O CPF passa a ser o identificador unico do corretor: uma pessoa, uma conta.
-- O CNPJ continua livre (varios corretores podem atuar na mesma imobiliaria) e
-- serve para a simulacao/proposta.
--
-- A unicidade e por DIGITOS, nao pelo texto formatado: "123.456.789-09" e
-- "12345678909" sao o mesmo CPF e nao podem coexistir.
--
-- Migration idempotente: pode ser executada mais de uma vez.
-- ===========================================================================

alter table public.profiles
  add column if not exists cpf text;

comment on column public.profiles.cpf is
  'CPF do corretor. Identificador unico da conta (unicidade por digitos).';

-- ---------------------------------------------------------------------------
-- 1. NORMALIZACAO
-- ---------------------------------------------------------------------------
-- Guardamos o CPF como o usuario digitou, mas comparamos sempre pelos digitos.
-- A funcao e IMMUTABLE para poder ser usada em indice.

create or replace function public.cpf_digits(value text)
returns text
language sql
immutable
strict
as $$
  select nullif(regexp_replace(value, '[^0-9]', '', 'g'), '');
$$;

comment on function public.cpf_digits(text) is
  'So os digitos do CPF. Usada no indice unico de profiles.cpf.';

-- ---------------------------------------------------------------------------
-- 2. SANEAMENTO ANTES DO INDICE
-- ---------------------------------------------------------------------------
-- Se por acaso ja existirem CPFs repetidos (a coluna nao tinha trava), o
-- indice unico falharia. Mantemos o CPF na conta mais antiga e limpamos as
-- outras, que serao pedidas de novo no proximo acesso.

with dupes as (
  select
    id,
    row_number() over (
      partition by public.cpf_digits(cpf)
      order by created_at, id
    ) as pos
  from public.profiles
  where public.cpf_digits(cpf) is not null
)
update public.profiles p
set cpf = null
from dupes d
where p.id = d.id
  and d.pos > 1;

-- ---------------------------------------------------------------------------
-- 3. INDICE UNICO
-- ---------------------------------------------------------------------------
-- Parcial: contas sem CPF preenchido nao conflitam entre si.

create unique index if not exists profiles_cpf_digits_unique
  on public.profiles (public.cpf_digits(cpf))
  where public.cpf_digits(cpf) is not null;

-- ---------------------------------------------------------------------------
-- 4. VALIDACAO DE FORMATO
-- ---------------------------------------------------------------------------
-- Garante 11 digitos no banco. O digito verificador e conferido no app; aqui
-- barramos o obvio (campo com 3 numeros, por exemplo).

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_cpf_11_digits'
  ) then
    alter table public.profiles
      add constraint profiles_cpf_11_digits
      check (cpf is null or length(public.cpf_digits(cpf)) = 11);
  end if;
end
$$;
