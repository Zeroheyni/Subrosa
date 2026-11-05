-- Projeto Cat & Dog (id catdog) — Fase 1: tarefas, moedas e inscrições de notificação
-- Tudo novo, prefixo catdog_. Nada existente é tocado (só usa master_sessions para conferir o mestre).
--
-- Lados: 'gato' = jogador (moedas felinas, sem token)  ·  'cao' = mestre (moedas caninas, exige token).
-- Valor das moedas: quem define o valor da parte do lado X é o OUTRO lado
--   (value_gato é definido pelo cão; value_cao é definido pelo gato).
-- Leitura pública (como o resto do hub); escrita só por RPC security definer.

-- ---------- tabelas ----------
create table if not exists catdog_tasks (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('gato', 'cao', 'ambos')),
  created_by text not null check (created_by in ('gato', 'cao')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 1000),
  shared_mode text check (shared_mode in ('parts', 'any', 'both')),
  due_at timestamptz,
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly')),
  repeat_days smallint[] not null default '{}',
  due_time time,
  hint text check (hint in ('facil', 'media', 'dificil')),
  value_gato int check (value_gato between 0 and 500),
  value_cao int check (value_cao between 0 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catdog_tasks_shared_ck check ((owner = 'ambos') = (shared_mode is not null)),
  constraint catdog_tasks_days_ck check (
    (repeat = 'weekly' and cardinality(repeat_days) between 1 and 7 and repeat_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or (repeat <> 'weekly' and cardinality(repeat_days) = 0))
);

create table if not exists catdog_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references catdog_tasks(id) on delete cascade,
  side text not null check (side in ('gato', 'cao')),
  period date not null,
  completed_at timestamptz not null default now(),
  unique (task_id, side, period)
);
create index if not exists catdog_completions_period_idx on catdog_completions (period);

create table if not exists catdog_coin_log (
  id uuid primary key default gen_random_uuid(),
  side text not null check (side in ('gato', 'cao')),
  amount int not null check (amount <> 0),
  kind text not null check (kind in ('task', 'adjust', 'reward', 'refund')),
  task_id uuid references catdog_tasks(id) on delete set null,
  period date,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists catdog_coin_log_side_idx on catdog_coin_log (side, created_at desc);
create index if not exists catdog_coin_log_task_idx on catdog_coin_log (task_id, period, side);

-- aparelhos que aceitaram notificação (guarda chaves: ninguém lê pela API, só a Edge Function)
create table if not exists catdog_push_subs (
  id uuid primary key default gen_random_uuid(),
  side text not null check (side in ('gato', 'cao')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

-- saldo de cada lado (soma do extrato)
create or replace view catdog_wallets as
  select s.side, coalesce(sum(l.amount), 0)::int as coins
    from (values ('gato'), ('cao')) as s(side)
    left join catdog_coin_log l on l.side = s.side
   group by s.side;

-- ---------- leitura pública / realtime ----------
alter table catdog_tasks enable row level security;
alter table catdog_completions enable row level security;
alter table catdog_coin_log enable row level security;
alter table catdog_push_subs enable row level security;
drop policy if exists "catdog_tasks_select_public" on catdog_tasks;
create policy "catdog_tasks_select_public" on catdog_tasks for select using (true);
drop policy if exists "catdog_completions_select_public" on catdog_completions;
create policy "catdog_completions_select_public" on catdog_completions for select using (true);
drop policy if exists "catdog_coin_log_select_public" on catdog_coin_log;
create policy "catdog_coin_log_select_public" on catdog_coin_log for select using (true);
grant select on catdog_wallets to anon, authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['catdog_tasks', 'catdog_completions', 'catdog_coin_log'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- ajudantes ----------
-- "hoje" é sempre no fuso de São Paulo, calculado no banco
create or replace function catdog_today()
returns date
language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date; $$;
grant execute on function catdog_today() to anon, authenticated;

-- confere o lado: o cão (mestre) precisa do token; o gato (jogador) não
create or replace function catdog_assert_side(p_side text, p_token uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_side is null or p_side not in ('gato', 'cao') then raise exception 'lado inválido'; end if;
  if p_side = 'cao' and not exists (select 1 from master_sessions where token = p_token and expires_at > now()) then
    raise exception 'sessão de mestre inválida ou expirada';
  end if;
end;
$$;
revoke execute on function catdog_assert_side(text, uuid) from public, anon, authenticated;

-- período de uma tarefa: avulsa = um período fixo; repetida = o dia de hoje
create or replace function catdog_period(p_repeat text)
returns date
language sql stable
as $$ select case when p_repeat = 'none' then date '2000-01-01' else catdog_today() end; $$;
revoke execute on function catdog_period(text) from public, anon, authenticated;

-- Acerta o extrato de uma tarefa num período: calcula quanto cada lado DEVERIA ter ganho e lança só a diferença.
-- Regras:
--   individual            → o dono ganha o próprio valor ao concluir
--   compartilhada "parts" → cada um ganha o seu valor ao concluir a sua parte; se os dois concluíram, bônus de 50% (arredondado para cima)
--   compartilhada "any"   → quem concluiu ganha o seu valor
--   compartilhada "both"  → só quando os dois concluíram, cada um ganha o seu valor
-- Sem valor definido ainda = 0 (as moedas entram quando o outro lado definir o valor).
create or replace function catdog_reconcile(p_task uuid, p_period date)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t catdog_tasks;
  v_gato boolean;
  v_cao boolean;
  v_side text;
  v_done boolean;
  v_value int;
  v_exp int;
  v_have int;
begin
  select * into t from catdog_tasks where id = p_task;
  if not found then return; end if;
  select exists (select 1 from catdog_completions where task_id = p_task and period = p_period and side = 'gato') into v_gato;
  select exists (select 1 from catdog_completions where task_id = p_task and period = p_period and side = 'cao') into v_cao;

  foreach v_side in array array['gato', 'cao'] loop
    v_value := case v_side when 'gato' then t.value_gato else t.value_cao end;
    v_done := case v_side when 'gato' then v_gato else v_cao end;
    v_exp := 0;
    if v_value is not null then
      if t.owner = v_side then
        if v_done then v_exp := v_value; end if;
      elsif t.owner = 'ambos' then
        if t.shared_mode = 'parts' then
          if v_done then
            v_exp := v_value;
            if v_gato and v_cao then v_exp := v_exp + ceil(v_value * 0.5)::int; end if;
          end if;
        elsif t.shared_mode = 'any' then
          if v_done then v_exp := v_value; end if;
        elsif t.shared_mode = 'both' then
          if v_gato and v_cao then v_exp := v_value; end if;
        end if;
      end if;
    end if;

    select coalesce(sum(amount), 0) into v_have
      from catdog_coin_log
     where task_id = p_task and period = p_period and side = v_side and kind = 'task';
    if v_exp <> v_have then
      insert into catdog_coin_log (side, amount, kind, task_id, period, note)
      values (v_side, v_exp - v_have, 'task', p_task, p_period, left(t.title, 200));
    end if;
  end loop;
end;
$$;
revoke execute on function catdog_reconcile(uuid, date) from public, anon, authenticated;

-- ---------- tarefas ----------
create or replace function catdog_save_task(p_side text, p_token uuid, p_id uuid, p_data jsonb)
returns catdog_tasks
language plpgsql security definer set search_path = public
as $$
declare
  v_row catdog_tasks;
  v_owner text;
  v_mode text;
  v_repeat text;
  v_days smallint[];
  v_due timestamptz;
  v_time time;
  v_hint text;
  v_title text;
begin
  perform catdog_assert_side(p_side, p_token);

  v_title := btrim(coalesce(p_data->>'title', ''));
  if char_length(v_title) < 1 then raise exception 'dê um título à tarefa'; end if;
  v_repeat := coalesce(nullif(p_data->>'repeat', ''), 'none');
  if v_repeat not in ('none', 'daily', 'weekly') then raise exception 'repetição inválida'; end if;
  v_days := '{}';
  if v_repeat = 'weekly' then
    v_days := array(select distinct (x)::smallint from jsonb_array_elements_text(coalesce(p_data->'repeat_days', '[]'::jsonb)) x order by 1);
    if cardinality(v_days) = 0 then raise exception 'escolha pelo menos um dia da semana'; end if;
  end if;
  v_due := case when v_repeat = 'none' then nullif(p_data->>'due_at', '')::timestamptz else null end;
  v_time := case when v_repeat <> 'none' then nullif(p_data->>'due_time', '')::time else null end;
  v_hint := nullif(p_data->>'hint', '');

  if p_id is null then
    v_owner := p_data->>'owner';
    if v_owner is null or v_owner not in (p_side, 'ambos') then raise exception 'você só cria tarefas suas ou compartilhadas'; end if;
    v_mode := case when v_owner = 'ambos' then coalesce(nullif(p_data->>'shared_mode', ''), 'parts') else null end;
    if v_mode is not null and v_mode not in ('parts', 'any', 'both') then raise exception 'modo de tarefa compartilhada inválido'; end if;
    insert into catdog_tasks (owner, created_by, title, notes, shared_mode, due_at, repeat, repeat_days, due_time, hint)
    values (v_owner, p_side, v_title, coalesce(p_data->>'notes', ''), v_mode, v_due, v_repeat, v_days, v_time, v_hint)
    returning * into v_row;
    return v_row;
  end if;

  select * into v_row from catdog_tasks where id = p_id for update;
  if not found then raise exception 'tarefa não encontrada'; end if;
  if v_row.owner not in (p_side, 'ambos') then raise exception 'essa tarefa não é sua'; end if;
  update catdog_tasks set
    title = v_title,
    notes = coalesce(p_data->>'notes', notes),
    due_at = v_due, repeat = v_repeat, repeat_days = v_days, due_time = v_time, hint = v_hint,
    updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function catdog_save_task(text, uuid, uuid, jsonb) to anon, authenticated;

create or replace function catdog_delete_task(p_side text, p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner text;
begin
  perform catdog_assert_side(p_side, p_token);
  select owner into v_owner from catdog_tasks where id = p_id;
  if not found then raise exception 'tarefa não encontrada'; end if;
  if v_owner not in (p_side, 'ambos') then raise exception 'essa tarefa não é sua'; end if;
  delete from catdog_tasks where id = p_id;   -- as moedas já ganhas ficam no extrato
end;
$$;
grant execute on function catdog_delete_task(text, uuid, uuid) to anon, authenticated;

-- o OUTRO lado define o valor (em moedas) da parte de p_target
create or replace function catdog_set_value(p_side text, p_token uuid, p_id uuid, p_target text, p_value int)
returns catdog_tasks
language plpgsql security definer set search_path = public
as $$
declare
  v_row catdog_tasks;
  v_period date;
begin
  perform catdog_assert_side(p_side, p_token);
  if p_target is null or p_target not in ('gato', 'cao') then raise exception 'lado inválido'; end if;
  if p_target = p_side then raise exception 'quem define o valor da sua parte é o outro lado'; end if;
  if p_value is null or p_value < 0 or p_value > 500 then raise exception 'o valor vai de 0 a 500 moedas'; end if;

  select * into v_row from catdog_tasks where id = p_id for update;
  if not found then raise exception 'tarefa não encontrada'; end if;
  if v_row.owner not in (p_target, 'ambos') then raise exception 'essa tarefa não tem parte para esse lado'; end if;

  if p_target = 'gato' then
    update catdog_tasks set value_gato = p_value, updated_at = now() where id = p_id returning * into v_row;
  else
    update catdog_tasks set value_cao = p_value, updated_at = now() where id = p_id returning * into v_row;
  end if;

  for v_period in select distinct period from catdog_completions where task_id = p_id loop
    perform catdog_reconcile(p_id, v_period);
  end loop;
  return v_row;
end;
$$;
grant execute on function catdog_set_value(text, uuid, uuid, text, int) to anon, authenticated;

-- concluir / desfazer a minha parte (hoje, se repete)
create or replace function catdog_complete(p_side text, p_token uuid, p_id uuid, p_done boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t catdog_tasks;
  v_period date;
begin
  perform catdog_assert_side(p_side, p_token);
  select * into t from catdog_tasks where id = p_id for update;
  if not found then raise exception 'tarefa não encontrada'; end if;
  if t.owner not in (p_side, 'ambos') then raise exception 'essa tarefa não é sua'; end if;
  if t.repeat = 'weekly' and not (extract(dow from catdog_today())::smallint = any (t.repeat_days)) then
    raise exception 'hoje não é dia dessa tarefa';
  end if;
  v_period := catdog_period(t.repeat);

  if p_done then
    if t.shared_mode = 'any' and exists (select 1 from catdog_completions where task_id = p_id and period = v_period) then
      raise exception 'essa tarefa já foi concluída';
    end if;
    insert into catdog_completions (task_id, side, period) values (p_id, p_side, v_period)
    on conflict (task_id, side, period) do nothing;
  else
    if t.shared_mode = 'any' and not exists (
         select 1 from catdog_completions where task_id = p_id and period = v_period and side = p_side) then
      if exists (select 1 from catdog_completions where task_id = p_id and period = v_period) then
        raise exception 'só quem concluiu pode desfazer';
      end if;
    end if;
    delete from catdog_completions where task_id = p_id and period = v_period and side = p_side;
  end if;
  perform catdog_reconcile(p_id, v_period);
end;
$$;
grant execute on function catdog_complete(text, uuid, uuid, boolean) to anon, authenticated;

-- ---------- moedas ----------
-- só o mestre corrige o saldo de qualquer lado; fica no extrato como "ajuste"
create or replace function catdog_adjust(p_token uuid, p_side text, p_amount int, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform catdog_assert_side('cao', p_token);
  if p_side is null or p_side not in ('gato', 'cao') then raise exception 'lado inválido'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 10000 then raise exception 'quantidade inválida'; end if;
  insert into catdog_coin_log (side, amount, kind, note) values (p_side, p_amount, 'adjust', left(coalesce(btrim(p_note), ''), 200));
end;
$$;
grant execute on function catdog_adjust(uuid, text, int, text) to anon, authenticated;

-- ---------- notificações: inscrição do aparelho ----------
create or replace function catdog_push_subscribe(p_side text, p_token uuid, p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform catdog_assert_side(p_side, p_token);
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 2000 then raise exception 'endereço de notificação inválido'; end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'chaves de notificação ausentes'; end if;
  insert into catdog_push_subs (side, endpoint, p256dh, auth, user_agent)
  values (p_side, p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua, ''), 300))
  on conflict (endpoint) do update set side = excluded.side, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;
grant execute on function catdog_push_subscribe(text, uuid, text, text, text, text) to anon, authenticated;

create or replace function catdog_push_unsubscribe(p_endpoint text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from catdog_push_subs where endpoint = p_endpoint;
end;
$$;
grant execute on function catdog_push_unsubscribe(text) to anon, authenticated;
