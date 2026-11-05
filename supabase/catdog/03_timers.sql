-- Projeto Cat & Dog — Fase 3: timers (foco, pausa, contagem regressiva, cronômetro) e moedas de foco
-- Lados: 'gato' = jogador (é o CÃO, moedas felinas, sem token) · 'cao' = mestre (é o GATO, moedas caninas, exige token).
--
-- Cada linha de catdog_timers é UMA fase (um foco, uma pausa, uma contagem ou um cronômetro).
-- O estado vive no banco, então fechar o app não perde o timer e a Fase 4 poderá avisar quando acabar.
-- Cada lado tem no máximo UM timer ativo (rodando ou pausado).
--
-- Moedas de foco: uma sessão de foco concluída vale `focus_value` moedas (padrão 2) do PRÓPRIO lado,
-- se durar pelo menos 15 minutos, até 8 sessões pagas por dia. O valor de cada lado é definido pelo OUTRO
-- lado (a mesma regra das tarefas). Uma sessão de foco concluída também conta para a sequência de dias.

-- ---------- extrato: novo tipo ----------
alter table catdog_coin_log drop constraint if exists catdog_coin_log_kind_check;
alter table catdog_coin_log add constraint catdog_coin_log_kind_check
  check (kind in ('task', 'adjust', 'reward', 'refund', 'streak', 'focus'));

-- ---------- ajustes por lado ----------
create table if not exists catdog_settings (
  side text primary key check (side in ('gato', 'cao')),
  focus_value int not null default 2 check (focus_value between 0 and 50),
  updated_at timestamptz not null default now()
);
insert into catdog_settings (side) values ('gato'), ('cao') on conflict do nothing;
alter table catdog_settings enable row level security;
drop policy if exists "catdog_settings_select_public" on catdog_settings;
create policy "catdog_settings_select_public" on catdog_settings for select using (true);

-- ---------- timers ----------
create table if not exists catdog_timers (
  id uuid primary key default gen_random_uuid(),
  side text not null check (side in ('gato', 'cao')),
  kind text not null check (kind in ('focus', 'break', 'countdown', 'stopwatch')),
  label text not null default '' check (char_length(label) <= 60),
  task_id uuid references catdog_tasks(id) on delete set null,
  duration_s int check (duration_s between 1 and 86400),
  status text not null default 'running' check (status in ('running', 'paused', 'done', 'cancelled')),
  elapsed_before_s int not null default 0 check (elapsed_before_s >= 0),
  resumed_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  elapsed_s int,
  coins int not null default 0,
  constraint catdog_timers_dur_ck check ((kind = 'stopwatch') = (duration_s is null))
);
create unique index if not exists catdog_timers_one_active_uq on catdog_timers (side) where status in ('running', 'paused');
create index if not exists catdog_timers_side_idx on catdog_timers (side, created_at desc);

alter table catdog_timers enable row level security;
drop policy if exists "catdog_timers_select_public" on catdog_timers;
create policy "catdog_timers_select_public" on catdog_timers for select using (true);

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['catdog_timers', 'catdog_settings'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;

-- hora do servidor (o app corrige o relógio do aparelho com isto)
create or replace function catdog_now()
returns timestamptz
language sql stable
as $$ select now(); $$;
grant execute on function catdog_now() to anon, authenticated;

-- segundos já decorridos de um timer
create or replace function catdog_timer_elapsed(t catdog_timers)
returns int
language sql stable
as $$
  select t.elapsed_before_s + case when t.resumed_at is not null then floor(extract(epoch from (now() - t.resumed_at)))::int else 0 end;
$$;
revoke execute on function catdog_timer_elapsed(catdog_timers) from public, anon, authenticated;

-- ---------- iniciar ----------
create or replace function catdog_timer_start(p_side text, p_token uuid, p_kind text, p_label text, p_duration_s int, p_task uuid)
returns catdog_timers
language plpgsql security definer set search_path = public
as $$
declare
  v_row catdog_timers;
  v_label text := left(btrim(coalesce(p_label, '')), 60);
begin
  perform catdog_assert_side(p_side, p_token);
  if p_kind is null or p_kind not in ('focus', 'break', 'countdown', 'stopwatch') then raise exception 'tipo de timer inválido'; end if;
  if exists (select 1 from catdog_timers where side = p_side and status in ('running', 'paused')) then
    raise exception 'já existe um timer ativo — termine ou cancele antes de começar outro';
  end if;
  if p_kind = 'stopwatch' then
    p_duration_s := null;
  else
    if p_duration_s is null then raise exception 'escolha a duração'; end if;
    if p_kind = 'focus' and (p_duration_s < 300 or p_duration_s > 10800) then raise exception 'o foco vai de 5 a 180 minutos'; end if;
    if p_kind = 'break' and (p_duration_s < 60 or p_duration_s > 3600) then raise exception 'a pausa vai de 1 a 60 minutos'; end if;
    if p_kind = 'countdown' and (p_duration_s < 1 or p_duration_s > 86400) then raise exception 'a contagem vai de 1 segundo a 24 horas'; end if;
  end if;
  if p_task is not null and not exists (select 1 from catdog_tasks where id = p_task) then raise exception 'tarefa não encontrada'; end if;

  insert into catdog_timers (side, kind, label, task_id, duration_s, status, resumed_at, ends_at)
  values (p_side, p_kind, v_label, p_task, p_duration_s, 'running', now(),
          case when p_duration_s is null then null else now() + make_interval(secs => p_duration_s) end)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function catdog_timer_start(text, uuid, text, text, int, uuid) to anon, authenticated;

-- ---------- pausar / retomar ----------
create or replace function catdog_timer_pause(p_side text, p_token uuid, p_id uuid)
returns catdog_timers
language plpgsql security definer set search_path = public
as $$
declare t catdog_timers;
begin
  perform catdog_assert_side(p_side, p_token);
  select * into t from catdog_timers where id = p_id for update;
  if not found or t.side <> p_side then raise exception 'timer não encontrado'; end if;
  if t.status <> 'running' then raise exception 'esse timer não está rodando'; end if;
  update catdog_timers set elapsed_before_s = catdog_timer_elapsed(t), resumed_at = null, ends_at = null, status = 'paused'
   where id = p_id returning * into t;
  return t;
end;
$$;
grant execute on function catdog_timer_pause(text, uuid, uuid) to anon, authenticated;

create or replace function catdog_timer_resume(p_side text, p_token uuid, p_id uuid)
returns catdog_timers
language plpgsql security definer set search_path = public
as $$
declare t catdog_timers;
begin
  perform catdog_assert_side(p_side, p_token);
  select * into t from catdog_timers where id = p_id for update;
  if not found or t.side <> p_side then raise exception 'timer não encontrado'; end if;
  if t.status <> 'paused' then raise exception 'esse timer não está pausado'; end if;
  update catdog_timers set resumed_at = now(), status = 'running',
         ends_at = case when t.duration_s is null then null else now() + make_interval(secs => greatest(t.duration_s - t.elapsed_before_s, 0)) end
   where id = p_id returning * into t;
  return t;
end;
$$;
grant execute on function catdog_timer_resume(text, uuid, uuid) to anon, authenticated;

-- ---------- cancelar ----------
create or replace function catdog_timer_cancel(p_side text, p_token uuid, p_id uuid)
returns catdog_timers
language plpgsql security definer set search_path = public
as $$
declare t catdog_timers;
begin
  perform catdog_assert_side(p_side, p_token);
  select * into t from catdog_timers where id = p_id for update;
  if not found or t.side <> p_side then raise exception 'timer não encontrado'; end if;
  if t.status not in ('running', 'paused') then raise exception 'esse timer já terminou'; end if;
  update catdog_timers set status = 'cancelled', finished_at = now(), elapsed_s = catdog_timer_elapsed(t), resumed_at = null, ends_at = null
   where id = p_id returning * into t;
  return t;
end;
$$;
grant execute on function catdog_timer_cancel(text, uuid, uuid) to anon, authenticated;

-- ---------- concluir (quem confere se acabou é o servidor) ----------
create or replace function catdog_timer_finish(p_side text, p_token uuid, p_id uuid)
returns catdog_timers
language plpgsql security definer set search_path = public
as $$
declare
  t catdog_timers;
  v_el int;
  v_value int;
  v_paid int;
  v_coins int := 0;
begin
  perform catdog_assert_side(p_side, p_token);
  perform pg_advisory_xact_lock(hashtext('catdog_wallet_' || p_side));
  select * into t from catdog_timers where id = p_id for update;
  if not found or t.side <> p_side then raise exception 'timer não encontrado'; end if;
  if t.status not in ('running', 'paused') then raise exception 'esse timer já terminou'; end if;

  v_el := catdog_timer_elapsed(t);
  if t.kind <> 'stopwatch' and v_el < t.duration_s - 2 then raise exception 'ainda não acabou'; end if;
  if t.kind <> 'stopwatch' then v_el := least(v_el, t.duration_s); end if;

  if t.kind = 'focus' and t.duration_s >= 900 then
    select focus_value into v_value from catdog_settings where side = p_side;
    select count(*) into v_paid from catdog_timers
     where side = p_side and kind = 'focus' and coins > 0 and status = 'done'
       and (finished_at at time zone 'America/Sao_Paulo')::date = catdog_today();
    if v_paid < 8 then v_coins := coalesce(v_value, 2); end if;
    perform catdog_streak_touch(p_side);       -- foco concluído também conta para a sequência
  end if;

  update catdog_timers set status = 'done', finished_at = now(), elapsed_s = v_el, resumed_at = null, ends_at = null, coins = v_coins
   where id = p_id returning * into t;
  if v_coins > 0 then
    insert into catdog_coin_log (side, amount, kind, note)
    values (p_side, v_coins, 'focus', left(coalesce(nullif(t.label, ''), 'Sessão de foco'), 200));
  end if;
  return t;
end;
$$;
grant execute on function catdog_timer_finish(text, uuid, uuid) to anon, authenticated;

-- ---------- valor do foco (definido pelo OUTRO lado) ----------
create or replace function catdog_set_focus_value(p_side text, p_token uuid, p_target text, p_value int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform catdog_assert_side(p_side, p_token);
  if p_target is null or p_target not in ('gato', 'cao') then raise exception 'lado inválido'; end if;
  if p_target = p_side then raise exception 'quem define o valor do seu foco é o outro lado'; end if;
  if p_value is null or p_value < 0 or p_value > 50 then raise exception 'o valor vai de 0 a 50 moedas por sessão'; end if;
  update catdog_settings set focus_value = p_value, updated_at = now() where side = p_target;
end;
$$;
grant execute on function catdog_set_focus_value(text, uuid, text, int) to anon, authenticated;
