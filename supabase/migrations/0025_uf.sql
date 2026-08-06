-- ---------------------------------------------------------------------------
-- 0025 — UF do corretor e do empreendimento
--
-- POR QUE: o admin cadastra no catalogo empreendimentos de varias regioes. Um
-- corretor do Maranhao nao vende uma unidade de Fortaleza, entao ele so precisa
-- ver o que e do estado dele. Duas colunas resolvem: onde o corretor atua e
-- onde o empreendimento fica.
--
-- A UF fica no EMPREENDIMENTO, nao na empresa: a mesma construtora tem obra em
-- estados diferentes, e uma UF na empresa faria o corretor ver tudo ou nada.
--
-- Idempotente: pode rodar duas vezes sem erro.
-- ---------------------------------------------------------------------------

alter table public.profiles     add column if not exists uf text;
alter table public.developments add column if not exists uf text;

comment on column public.profiles.uf is
  'UF em que o corretor atua (sigla de 2 letras). Filtra os empreendimentos do catalogo.';
comment on column public.developments.uf is
  'UF do empreendimento (sigla de 2 letras). Nulo = aparece para corretor de qualquer estado.';

-- Sigla valida ou nulo. Nulo e permitido de proposito nos dois lados: conta
-- antiga sem UF continua funcionando, e empreendimento sem UF aparece para
-- todos em vez de sumir da tela de todo mundo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_uf_valida'
  ) then
    alter table public.profiles
      add constraint profiles_uf_valida check (
        uf is null or uf in (
          'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
          'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'developments_uf_valida'
  ) then
    alter table public.developments
      add constraint developments_uf_valida check (
        uf is null or uf in (
          'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
          'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
        )
      );
  end if;
end $$;

-- O filtro do catalogo pergunta "quais empreendimentos desta UF?" a cada
-- carregamento de tela; o indice parcial cobre so as linhas que interessam.
create index if not exists developments_uf_idx
  on public.developments (uf)
  where uf is not null;
