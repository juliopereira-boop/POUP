-- ===========================================================================
-- 0028: LIMITADOR DE USO DE IA (E CONSERTO DA COTA DE PROSPECCAO)
-- ===========================================================================
-- POR QUE ESTA MIGRATION EXISTE
-- ---------------------------------------------------------------------------
-- Todo recurso do POUP que chama a API da Anthropic gasta dinheiro por uso:
-- scanner de documento, LIA (escuta, fechamento e agendamento), pitch de
-- prospeccao e convite. A assinatura, ao contrario, e um valor fixo por mes.
-- Sem teto, um unico corretor entusiasmado -- ou um script apontado para a
-- funcao -- custa mais do que paga, e o prejuizo nao aparece em nenhuma tela
-- ate a fatura chegar.
--
-- A regra que esta migration implementa: FATURAMENTO SEMPRE MAIOR QUE O CUSTO.
--
-- ---------------------------------------------------------------------------
-- POR QUE O TETO MORA NO BANCO, E NAO NA EDGE FUNCTION
-- ---------------------------------------------------------------------------
-- Duas razoes, e a segunda e a que importa de verdade:
--
--   1. Mudar um teto passa a ser um UPDATE, nao um deploy. Se o custo real
--      surpreender no piloto, o ajuste e imediato.
--
--   2. **O cliente nao pode escolher o proprio teto.** As Edge Functions do
--      POUP criam o client Supabase com a chave de service role MAS repassam o
--      `Authorization` do usuario, o que faz as queries rodarem como o proprio
--      usuario, sujeitas a RLS. Se o teto viesse como parametro da chamada,
--      bastaria chamar a funcao SQL direto do aparelho passando um teto alto.
--      Aqui o `consumir_ia` recebe apenas o NOME do recurso: quem descobre o
--      plano e o teto e o proprio banco, com `auth.uid()`, dentro de uma
--      funcao `security definer`.
--
-- ---------------------------------------------------------------------------
-- DUAS TRAVAS, PORQUE SAO DOIS ABUSOS DIFERENTES
-- ---------------------------------------------------------------------------
--   * TETO DO MES  -> protege a margem. E o numero comercial do plano.
--   * TETO DO MINUTO -> protege contra rajada. Sem ele, um laco automatizado
--     queima o mes inteiro em segundos e ainda estoura a concorrencia da Edge
--     Function. Uma pessoa de verdade nunca escaneia 30 documentos em um
--     minuto; um script sempre faz.
--
-- ---------------------------------------------------------------------------
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. QUAL E O PLANO DE COBRANCA DESTA CONTA
-- ---------------------------------------------------------------------------
-- Cinco respostas possiveis, e cada uma merece um teto diferente:
--
--   'admin'    -> dono do app. Sem teto: e ele que testa o produto.
--   'teste'    -> periodo de teste gratuito. O teste libera o produto inteiro
--                 (inclusive a LIA, que e do Pro), entao e a maior superficie
--                 de abuso que existe: cadastrar, queimar cota e ir embora.
--                 Teto BAIXO de proposito.
--   'pro' / 'intermed' / 'start' -> assinatura paga e ativa.
--   'nenhum'   -> sem assinatura ativa. Zero de tudo; o paywall ja barra antes,
--                 isto e a segunda tranca.
--
-- Assinatura `past_due` cai em 'nenhum': se o pagamento falhou, o custo
-- variavel para imediatamente. Voltou a pagar, volta a cota.

create or replace function public.plano_de_cobranca(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_status text;
  v_tier text;
begin
  if p_user is null then
    return 'nenhum';
  end if;

  if exists (select 1 from public.app_admins a where a.user_id = p_user) then
    return 'admin';
  end if;

  select s.status, s.plan_tier
    into v_status, v_tier
    from public.subscriptions s
   where s.user_id = p_user
   limit 1;

  if v_status is null then
    return 'nenhum';
  end if;

  if v_status = 'trialing' then
    return 'teste';
  end if;

  if v_status <> 'active' then
    return 'nenhum';
  end if;

  if v_tier in ('pro', 'intermed', 'start') then
    return v_tier;
  end if;

  -- Assinatura ativa com tier desconhecido: trata como o degrau mais baixo.
  -- Errar para menos custa um aviso ao corretor; errar para mais custa API.
  return 'start';
end;
$$;

comment on function public.plano_de_cobranca(uuid) is
  'admin | teste | pro | intermed | start | nenhum. Base dos tetos de uso de IA.';

/*
 * Sem grant para `authenticated`: a funcao aceita um uuid QUALQUER, e chamada
 * direto do aparelho ela responderia se outra conta e admin e qual o plano
 * dela. As funcoes que precisam dela sao `security definer` e rodam como o
 * dono, entao continuam podendo chama-la.
 */
revoke all on function public.plano_de_cobranca(uuid) from public;


-- ---------------------------------------------------------------------------
-- 2. TABELA DE TETOS
-- ---------------------------------------------------------------------------
-- Uma linha por (plano, recurso). `-1` significa SEM TETO -- usado so no plano
-- 'admin'. Sem linha para um par (plano, recurso), a resposta e RECUSAR: o
-- lado seguro do erro e nao gastar API.

create table if not exists public.ai_limits (
  plano text not null,
  recurso text not null,
  teto_mes integer not null,
  teto_minuto integer not null,
  observacao text,
  updated_at timestamptz not null default now(),
  primary key (plano, recurso)
);

comment on table public.ai_limits is
  'Teto de chamadas de IA por plano e recurso. -1 = sem teto. Escrita so por service role / SQL Editor.';

alter table public.ai_limits enable row level security;

-- Leitura liberada para quem esta logado: o app mostra "voce usou X de Y".
drop policy if exists "ai_limits_select_authenticated" on public.ai_limits;
create policy "ai_limits_select_authenticated"
  on public.ai_limits for select
  to authenticated
  using (true);

-- Sem policy de escrita: ninguem aumenta o proprio teto pelo aplicativo.


-- ---------------------------------------------------------------------------
-- 3. TABELA DE CONSUMO
-- ---------------------------------------------------------------------------
-- Uma linha por (usuario, recurso, ciclo). O ciclo e o mes no fuso de
-- Brasilia -- nao UTC: o corretor vira o mes as 21h do dia 31 se o corte for
-- em UTC, e ganha um dia de cota de graca (ou perde um).
--
-- `janela_inicio` / `janela_usados` sao a trava de rajada: um contador de 60
-- segundos que vive na MESMA linha do contador do mes, para que uma unica
-- leitura com lock resolva as duas travas.
--
-- ATENCAO A RLS AQUI: o usuario SO LE. Sem policy de insert/update/delete.
-- E a diferenca entre uma cota e uma sugestao. A prospeccao aprendeu isso do
-- jeito difícil -- ver o item 6.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  recurso text not null,
  ciclo text not null,
  usados integer not null default 0,
  janela_inicio timestamptz not null default now(),
  janela_usados integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, recurso, ciclo)
);

comment on table public.ai_usage is
  'Consumo de IA por usuario, recurso e mes (fuso de Brasilia). Escrita SOMENTE via consumir_ia()/estornar_ia().';

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own"
  on public.ai_usage for select
  to authenticated
  using (auth.uid() = user_id);

-- Sem insert/update/delete: zerar o proprio contador seria zerar a cota.

-- O painel do admin le o consumo de todo mundo.
drop policy if exists "ai_usage_select_admin" on public.ai_usage;
create policy "ai_usage_select_admin"
  on public.ai_usage for select
  to authenticated
  using (public.is_app_admin());

create index if not exists ai_usage_ciclo_idx on public.ai_usage (ciclo, recurso);


-- ---------------------------------------------------------------------------
-- 4. O CICLO ATUAL
-- ---------------------------------------------------------------------------

create or replace function public.ciclo_ia_atual()
returns text
language sql
stable
as $$
  select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
$$;

grant execute on function public.ciclo_ia_atual() to authenticated;


-- ---------------------------------------------------------------------------
-- 5. CONSUMIR E ESTORNAR
-- ---------------------------------------------------------------------------
-- `consumir_ia` e chamada ANTES de gastar a API, nao depois. Cobrar depois
-- deixa a porta aberta: quem cancela a conexao no meio nunca e cobrado, e
-- repetir isso em laco da uso ilimitado de graca.
--
-- `estornar_ia` desfaz a cobranca quando a culpa e nossa (a Anthropic devolveu
-- 502, a chave nao estava configurada, a funcao caiu). O corretor nao paga
-- cota por um erro do POUP.
--
-- `p_peso` existe porque nem toda chamada custa igual: o fechamento da LIA usa
-- o modelo caro com contexto grande e vale varias escutas. O peso e escolhido
-- pela Edge Function, e nao pelo aparelho -- e ele nunca reduz o custo, so
-- aumenta (o clamp abaixo garante `>= 1`).

create or replace function public.consumir_ia(p_recurso text, p_peso integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plano text;
  v_teto integer;
  v_teto_min integer;
  v_ciclo text;
  v_agora timestamptz := now();
  v_peso integer;
  v_usados integer;
  v_janela integer;
begin
  if v_user is null then
    return jsonb_build_object('permitido', false, 'motivo', 'nao_autenticado');
  end if;
  if p_recurso is null or length(p_recurso) > 40 then
    return jsonb_build_object('permitido', false, 'motivo', 'recurso_invalido');
  end if;

  v_peso := greatest(1, least(coalesce(p_peso, 1), 100));
  v_plano := public.plano_de_cobranca(v_user);

  select l.teto_mes, l.teto_minuto
    into v_teto, v_teto_min
    from public.ai_limits l
   where l.plano = v_plano and l.recurso = p_recurso;

  if v_teto is null then
    -- Recurso sem teto cadastrado para este plano. Recusa: nao gastar API e
    -- sempre a resposta segura para uma configuracao incompleta.
    return jsonb_build_object(
      'permitido', false, 'motivo', 'sem_limite_cadastrado', 'plano', v_plano
    );
  end if;

  if v_teto = 0 then
    return jsonb_build_object(
      'permitido', false, 'motivo', 'plano_nao_inclui', 'plano', v_plano, 'teto', 0
    );
  end if;

  v_ciclo := public.ciclo_ia_atual();

  insert into public.ai_usage (user_id, recurso, ciclo, usados, janela_inicio, janela_usados)
  values (v_user, p_recurso, v_ciclo, 0, v_agora, 0)
  on conflict (user_id, recurso, ciclo) do nothing;

  /*
   * `for update` serializa duas chamadas simultaneas do MESMO corretor.
   * Sem ele, ler-somar-gravar deixa duas requisicoes concorrentes verem o
   * mesmo `usados` e gravarem o mesmo valor+1: o teto vaza exatamente no caso
   * que ele existe para conter, que e o disparo automatizado em paralelo.
   */
  select u.usados,
         case
           when u.janela_inicio > v_agora - interval '1 minute' then u.janela_usados
           else 0
         end
    into v_usados, v_janela
    from public.ai_usage u
   where u.user_id = v_user and u.recurso = p_recurso and u.ciclo = v_ciclo
     for update;

  if v_teto >= 0 and v_usados + v_peso > v_teto then
    return jsonb_build_object(
      'permitido', false, 'motivo', 'teto_mes',
      'usados', v_usados, 'teto', v_teto, 'plano', v_plano
    );
  end if;

  if v_teto_min >= 0 and v_janela + v_peso > v_teto_min then
    return jsonb_build_object(
      'permitido', false, 'motivo', 'rajada',
      'usados', v_usados, 'teto', v_teto, 'teto_minuto', v_teto_min, 'plano', v_plano
    );
  end if;

  update public.ai_usage u
     set usados = u.usados + v_peso,
         janela_inicio = case
           when u.janela_inicio > v_agora - interval '1 minute' then u.janela_inicio
           else v_agora
         end,
         janela_usados = v_janela + v_peso,
         updated_at = v_agora
   where u.user_id = v_user and u.recurso = p_recurso and u.ciclo = v_ciclo;

  return jsonb_build_object(
    'permitido', true, 'usados', v_usados + v_peso, 'teto', v_teto, 'plano', v_plano
  );
end;
$$;

comment on function public.consumir_ia(text, integer) is
  'Cobra 1 (ou p_peso) uso de IA do usuario autenticado e diz se pode prosseguir. Chamar ANTES de gastar a API.';

revoke all on function public.consumir_ia(text, integer) from public;
grant execute on function public.consumir_ia(text, integer) to authenticated;


create or replace function public.estornar_ia(p_recurso text, p_peso integer default 1)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_peso integer := greatest(1, least(coalesce(p_peso, 1), 100));
begin
  if v_user is null or p_recurso is null then
    return;
  end if;

  /*
   * `greatest(0, ...)` porque estorno sem cobranca correspondente nao pode
   * gerar saldo negativo -- que seria cota extra de graca. O estorno so
   * devolve o que foi cobrado.
   */
  update public.ai_usage u
     set usados = greatest(0, u.usados - v_peso),
         janela_usados = greatest(0, u.janela_usados - v_peso),
         updated_at = now()
   where u.user_id = v_user
     and u.recurso = p_recurso
     and u.ciclo = public.ciclo_ia_atual();
end;
$$;

comment on function public.estornar_ia(text, integer) is
  'Devolve a cota cobrada quando a chamada de IA falhou por culpa do POUP (502, chave ausente, excecao).';

revoke all on function public.estornar_ia(text, integer) from public;
grant execute on function public.estornar_ia(text, integer) to authenticated;


-- O app precisa mostrar "voce usou X de Y" sem fazer tres consultas e sem
-- descobrir o plano por conta propria.
create or replace function public.meu_uso_ia()
returns table (recurso text, usados integer, teto integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select l.recurso,
         coalesce(u.usados, 0) as usados,
         l.teto_mes as teto
    from public.ai_limits l
    left join public.ai_usage u
      on u.user_id = auth.uid()
     and u.recurso = l.recurso
     and u.ciclo = public.ciclo_ia_atual()
   where l.plano = public.plano_de_cobranca(auth.uid())
   order by l.recurso;
$$;

comment on function public.meu_uso_ia() is
  'Consumo do mes corrente e teto do plano, por recurso, para o usuario autenticado.';

grant execute on function public.meu_uso_ia() to authenticated;


-- ---------------------------------------------------------------------------
-- 6. CONSERTO: A COTA DA PROSPECCAO ERA CONTADA COM UMA CORRIDA
-- ---------------------------------------------------------------------------
-- A 0013 ja fechou o buraco maior desta tabela: a policy original era
-- `for all using (auth.uid() = user_id)`, que dava DELETE ao dono da linha e
-- portanto ao aparelho (a Edge Function roda com o token do usuario). Ela
-- trocou por select/insert/update sem delete, e ainda pos um trigger que
-- impede `usados` de regredir. Isso continua valendo.
--
-- O que sobrou foi mais silencioso: a funcao lia `usados`, somava
-- `leads.length` em JavaScript e gravava o TOTAL. Duas prospeccoes ao mesmo
-- tempo leem o mesmo `usados` e gravam o mesmo total — a segunda nao soma, ela
-- sobrescreve. Nada trava, nada aparece no log, e a cota simplesmente vaza no
-- caso em que ela mais importa, que e o disparo repetido.
--
-- Agora o incremento e um `usados = usados + N` dentro do banco, numa funcao
-- `security definer`. E de quebra as policies de insert/update ficam
-- dispensaveis: com a escrita passando por funcao, o usuario so precisa LER.
-- Mantidas de fora aqui, sem drop, porque o trigger monotonico da 0013 ja as
-- torna inofensivas e derrubar policy em migration idempotente e o tipo de
-- mexida que quebra o que estava funcionando.

-- Reafirmado por seguranca: em ambiente novo, onde a 0013 tenha sido rodada
-- fora de ordem, a policy de leitura tem que existir.
drop policy if exists "prospect_usage_select_own" on public.prospect_usage;
create policy "prospect_usage_select_own"
  on public.prospect_usage for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.registrar_prospeccao(
  p_dia date,
  p_periodo text,
  p_quantidade integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_qtd integer := greatest(0, least(coalesce(p_quantidade, 0), 100));
  v_total integer;
begin
  if v_user is null or p_dia is null or p_periodo not in ('manha', 'tarde') then
    return 0;
  end if;

  insert into public.prospect_usage (user_id, dia, periodo, usados, updated_at)
  values (v_user, p_dia, p_periodo, v_qtd, now())
  on conflict (user_id, dia, periodo) do update
    set usados = prospect_usage.usados + v_qtd,
        updated_at = now()
  returning prospect_usage.usados into v_total;

  return v_total;
end;
$$;

comment on function public.registrar_prospeccao(date, text, integer) is
  'Soma leads prospectados na cota do periodo. Soma, nunca grava um total escolhido por quem chama.';

revoke all on function public.registrar_prospeccao(date, text, integer) from public;
grant execute on function public.registrar_prospeccao(date, text, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- 7. OS TETOS
-- ---------------------------------------------------------------------------
-- RECURSOS
--   scan             scanner de documento (Haiku + imagem)
--   lia_escuta       cada pausa da negociacao processada (Haiku)
--   lia_fechamento   releitura da conversa inteira no fim (modelo caro)
--   lia_agenda       agendamento por voz (Haiku, frase curta)
--   pitch            texto de abordagem da prospeccao (Haiku)
--   convite          convite de captacao (Haiku)
--
-- COMO OS NUMEROS FORAM ESCOLHIDOS
--   O piso e o uso plausivel de um corretor ativo; o teto e o ponto em que o
--   custo variavel ainda cabe folgado na mensalidade. Do Start (R$ 29,90) ao
--   Pro (R$ 89,90), o custo de API no CONSUMO MAXIMO fica na casa de um digito
--   percentual a baixa dezena da mensalidade -- e o consumo tipico e uma
--   fracao disso.
--
--   `lia_fechamento` tem teto proprio, e nao um peso dentro de `lia_escuta`,
--   porque e a unica chamada que usa o modelo caro com a conversa inteira no
--   contexto. Misturada com a escuta, ela desapareceria na media.
--
--   O plano 'teste' recebe pouco de proposito. E a unica porta aberta sem
--   cartao, portanto a unica que um abuso em escala usaria.
--
-- Mudou de ideia? E um UPDATE nesta tabela, sem deploy. As telas leem daqui.

insert into public.ai_limits (plano, recurso, teto_mes, teto_minuto, observacao) values
  -- Dono do app: sem teto, e ele que testa o produto.
  ('admin', 'scan',           -1, -1, 'sem teto'),
  ('admin', 'lia_escuta',     -1, -1, 'sem teto'),
  ('admin', 'lia_fechamento', -1, -1, 'sem teto'),
  ('admin', 'lia_agenda',     -1, -1, 'sem teto'),
  ('admin', 'pitch',          -1, -1, 'sem teto'),
  ('admin', 'convite',        -1, -1, 'sem teto'),

  -- Sem assinatura ativa: nada. Segunda tranca atras do paywall.
  ('nenhum', 'scan',            0, 0, 'sem assinatura ativa'),
  ('nenhum', 'lia_escuta',      0, 0, 'sem assinatura ativa'),
  ('nenhum', 'lia_fechamento',  0, 0, 'sem assinatura ativa'),
  ('nenhum', 'lia_agenda',      0, 0, 'sem assinatura ativa'),
  ('nenhum', 'pitch',           0, 0, 'sem assinatura ativa'),
  ('nenhum', 'convite',         0, 0, 'sem assinatura ativa'),

  -- Teste gratuito: da para conhecer tudo, nao da para operar de graca.
  ('teste', 'scan',            10,  4, 'teste gratuito'),
  ('teste', 'lia_escuta',     150,  8, 'teste gratuito: ~4 reunioes'),
  ('teste', 'lia_fechamento',   8,  2, 'teste gratuito'),
  ('teste', 'lia_agenda',      20,  4, 'teste gratuito'),
  ('teste', 'pitch',           15,  4, 'teste gratuito'),
  ('teste', 'convite',         15,  4, 'teste gratuito'),

  -- Start (R$ 29,90): sem LIA (recurso do Pro).
  ('start', 'scan',            40,  6, NULL),
  ('start', 'lia_escuta',       0,  0, 'LIA e do plano Pro'),
  ('start', 'lia_fechamento',   0,  0, 'LIA e do plano Pro'),
  ('start', 'lia_agenda',       0,  0, 'LIA e do plano Pro'),
  ('start', 'pitch',           40,  6, NULL),
  ('start', 'convite',         40,  6, NULL),

  -- Intermed (R$ 49,90): sem LIA.
  ('intermed', 'scan',         80,  8, NULL),
  ('intermed', 'lia_escuta',    0,  0, 'LIA e do plano Pro'),
  ('intermed', 'lia_fechamento',0,  0, 'LIA e do plano Pro'),
  ('intermed', 'lia_agenda',    0,  0, 'LIA e do plano Pro'),
  ('intermed', 'pitch',        80,  8, NULL),
  ('intermed', 'convite',      80,  8, NULL),

  -- Pro (R$ 89,90): a LIA e o que justifica o topo da escada.
  ('pro', 'scan',             200, 10, NULL),
  ('pro', 'lia_escuta',      1200, 12, '~30 reunioes longas por mes'),
  ('pro', 'lia_fechamento',    60,  3, '~2 fechamentos por dia'),
  ('pro', 'lia_agenda',       150,  6, NULL),
  ('pro', 'pitch',            200, 10, NULL),
  ('pro', 'convite',          200, 10, NULL)
on conflict (plano, recurso) do nothing;


-- ===========================================================================
-- CONFERENCIA
-- ===========================================================================
-- Ver os tetos de um plano:
--   select * from public.ai_limits where plano = 'pro' order by recurso;
--
-- Ver o consumo do mes de todo mundo:
--   select u.user_id, u.recurso, u.usados
--     from public.ai_usage u
--    where u.ciclo = public.ciclo_ia_atual()
--    order by u.usados desc;
--
-- Mudar um teto (sem deploy):
--   update public.ai_limits set teto_mes = 300
--    where plano = 'pro' and recurso = 'scan';
--
-- Zerar a cota de um corretor especifico (cortesia, suporte):
--   delete from public.ai_usage
--    where user_id = '<uuid>' and ciclo = public.ciclo_ia_atual();
-- ===========================================================================
