-- Projeto Cat & Dog (id catdog) — Fuso horário por lado
-- Só troca funções (create or replace) e acrescenta uma coluna. Nenhuma tabela ou dado é apagado.
--
-- Antes: tudo usava a hora de Brasília. Agora cada lado usa o seu fuso:
--   'gato' = jogador (o Cão)  → Portugal  (Europe/Lisbon)
--   'cao'  = mestre (o Gato)  → Brasília  (America/Sao_Paulo)
-- O horário de verão é automático (o banco conhece as regras dos dois fusos).
--
-- Dia de cada um: começa à meia-noite do fuso do lado + "virada do dia" (catdog_settings.day_start_min,
-- escolhida em Ajustes; ex.: 360 = o dia só vira às 06:00). Vale para tarefas só do lado e para a sequência.
-- Dia comum: tarefas COMPARTILHADAS repetidas viram à meia-noite de Brasília (catdog_today(), que não muda).
-- Alarmes: o horário é o relógio do fuso de quem criou o alarme.
-- Prazos: tarefa repetida com hora vale no relógio de cada lado; tarefa com data é um instante único.

alter table catdog_settings add column if not exists day_start_min int not null default 0
  check (day_start_min between 0 and 720);

-- ---------- fuso e dia de cada lado ----------
create or replace function catdog_tz(p_side text)
returns text
language sql immutable
as $$ select case p_side when 'gato' then 'Europe/Lisbon' else 'America/Sao_Paulo' end; $$;
revoke execute on function catdog_tz(text) from public, anon, authenticated;

-- dia (com a virada do lado) em que um instante cai
create or replace function catdog_day_at(p_side text, p_ts timestamptz)
returns date
language sql stable
as $$
  select ((p_ts at time zone catdog_tz(p_side))
          - make_interval(mins => coalesce((select s.day_start_min from catdog_settings s where s.side = p_side), 0)))::date;
$$;
revoke execute on function catdog_day_at(text, timestamptz) from public, anon, authenticated;

create or replace function catdog_day(p_side text)
returns date
language sql stable
as $$ select catdog_day_at(p_side, now()); $$;
revoke execute on function catdog_day(text) from public, anon, authenticated;

-- "período" de uma tarefa hoje: sem repetição = data fixa; compartilhada = dia de Brasília; só do lado = dia do lado
create or replace function catdog_task_day(p_owner text, p_repeat text)
returns date
language sql stable
as $$
  select case when p_repeat = 'none' then date '2000-01-01'
              when p_owner = 'ambos' then catdog_today()
              else catdog_day(p_owner) end;
$$;
revoke execute on function catdog_task_day(text, text) from public, anon, authenticated;

-- ---------- virada do dia (cada lado ajusta a sua) ----------
create or replace function catdog_set_day_start(p_side text, p_token uuid, p_minutes int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform catdog_assert_side(p_side, p_token);
  if p_minutes is null or p_minutes < 0 or p_minutes > 720 then raise exception 'a virada do dia vai de 00:00 a 12:00'; end if;
  update catdog_settings set day_start_min = p_minutes, updated_at = now() where side = p_side;
end;
$$;
grant execute on function catdog_set_day_start(text, uuid, int) to anon, authenticated;

-- ---------- concluir tarefa (período no dia certo) ----------
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
  v_period := catdog_task_day(t.owner, t.repeat);
  if t.repeat = 'weekly' and not (extract(dow from v_period)::smallint = any (t.repeat_days)) then
    raise exception 'hoje não é dia dessa tarefa';
  end if;

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
  if p_done then perform catdog_streak_touch(p_side); else perform catdog_streak_untouch(p_side); end if;
end;
$$;

-- ---------- sequência (dia do próprio lado) ----------
create or replace function catdog_streak_of(p_side text)
returns table (cur int, best int, start_day date, last_day date, today_done boolean)
language sql stable security definer set search_path = public
as $$
  with d as (select day from catdog_activity where side = p_side),
       g as (select day, day - (row_number() over (order by day))::int as grp from d),
       isl as (select min(day) as s, max(day) as e, count(*)::int as n from g group by grp),
       cur as (select s, e, n from isl where e >= catdog_day(p_side) - 1 order by e desc limit 1)
  select coalesce((select n from cur), 0),
         coalesce((select max(n) from isl), 0),
         (select s from cur),
         (select e from cur),
         exists (select 1 from d where day = catdog_day(p_side));
$$;
revoke execute on function catdog_streak_of(text) from public, anon, authenticated;

create or replace function catdog_streak_touch(p_side text)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  s record;
  v_m int;
  v_bonus int;
  v_paid int := 0;
begin
  insert into catdog_activity (side, day) values (p_side, catdog_day(p_side)) on conflict do nothing;
  select * into s from catdog_streak_of(p_side);
  foreach v_m in array array[3, 7, 14, 30, 60, 100] loop
    if s.cur >= v_m and s.start_day is not null then
      v_bonus := catdog_milestone_bonus(v_m);
      insert into catdog_coin_log (side, amount, kind, note, ref)
      values (p_side, v_bonus, 'streak', format('Sequência de %s dias', v_m), format('streak:%s:%s', s.start_day, v_m))
      on conflict (side, ref) where ref is not null do nothing;
      if found then v_paid := v_paid + v_bonus; end if;
    end if;
  end loop;
  return v_paid;
end;
$$;
revoke execute on function catdog_streak_touch(text) from public, anon, authenticated;

create or replace function catdog_streak_untouch(p_side text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from catdog_completions
     where side = p_side and catdog_day_at(p_side, completed_at) = catdog_day(p_side)
  ) then
    delete from catdog_activity where side = p_side and day = catdog_day(p_side);
  end if;
end;
$$;
revoke execute on function catdog_streak_untouch(text) from public, anon, authenticated;

-- ---------- foco: limite de 8 pagas por dia (dia do próprio lado) ----------
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
       and catdog_day_at(p_side, finished_at) = catdog_day(p_side);
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

-- ---------- alarmes: o horário é o relógio do fuso de quem criou ----------
-- próximo dia (no fuso do lado) em que um alarme de uma vez toca: hoje se a hora ainda não passou, senão amanhã
create or replace function catdog_next_date(p_side text, p_time time)
returns date
language sql stable
as $$
  select case when p_time > (now() at time zone catdog_tz(p_side))::time
              then (now() at time zone catdog_tz(p_side))::date
              else (now() at time zone catdog_tz(p_side))::date + 1 end;
$$;
revoke execute on function catdog_next_date(text, time) from public, anon, authenticated;

create or replace function catdog_save_alarm(p_side text, p_token uuid, p_id uuid, p_data jsonb)
returns catdog_alarms
language plpgsql security definer set search_path = public
as $$
declare
  a catdog_alarms;
  v_time time;
  v_repeat text := coalesce(p_data->>'repeat', 'none');
  v_days smallint[] := '{}';
  v_date date;
  v_label text := left(btrim(coalesce(p_data->>'label', '')), 60);
  v_active boolean := coalesce((p_data->>'active')::boolean, true);
begin
  perform catdog_assert_side(p_side, p_token);
  begin v_time := (p_data->>'at_time')::time; exception when others then raise exception 'horário inválido'; end;
  if v_time is null then raise exception 'informe o horário do alarme'; end if;
  v_time := date_trunc('minute', v_time::interval)::time;
  if v_repeat not in ('none', 'daily', 'weekly') then raise exception 'repetição inválida'; end if;
  if v_repeat = 'weekly' then
    select coalesce(array_agg(distinct d::smallint order by d::smallint), '{}') into v_days
      from jsonb_array_elements_text(coalesce(p_data->'repeat_days', '[]'::jsonb)) d;
    if cardinality(v_days) = 0 then raise exception 'escolha pelo menos um dia da semana'; end if;
  end if;
  if v_repeat = 'none' then
    begin v_date := nullif(p_data->>'on_date', '')::date; exception when others then raise exception 'data inválida'; end;
    if v_date is null then v_date := catdog_next_date(p_side, v_time); end if;
  end if;

  if p_id is null then
    if (select count(*) from catdog_alarms where side = p_side) >= 30 then raise exception 'limite de 30 alarmes por lado'; end if;
    insert into catdog_alarms (side, label, at_time, repeat, repeat_days, on_date, active)
    values (p_side, v_label, v_time, v_repeat, v_days, v_date, v_active)
    returning * into a;
  else
    update catdog_alarms
       set label = v_label, at_time = v_time, repeat = v_repeat, repeat_days = v_days, on_date = v_date,
           active = v_active, updated_at = now()
     where id = p_id and side = p_side
     returning * into a;
    if not found then raise exception 'alarme não encontrado'; end if;
  end if;
  return a;
end;
$$;

create or replace function catdog_toggle_alarm(p_side text, p_token uuid, p_id uuid, p_active boolean)
returns catdog_alarms
language plpgsql security definer set search_path = public
as $$
declare a catdog_alarms;
begin
  perform catdog_assert_side(p_side, p_token);
  update catdog_alarms
     set active = coalesce(p_active, not active),
         on_date = case when repeat = 'none' then catdog_next_date(p_side, at_time) else on_date end,
         updated_at = now()
   where id = p_id and side = p_side
   returning * into a;
  if not found then raise exception 'alarme não encontrado'; end if;
  return a;
end;
$$;

-- ---------- o que está na hora de avisar (cada lado no seu relógio) ----------
create or replace function catdog_due_items()
returns table (key text, side text, title text, body text, tag text, url text, alarm_id uuid)
language sql stable security definer set search_path = public
as $$
  -- 1) alarmes (data e hora no fuso de quem criou)
  select 'alarm:' || a.id || ':' || f.fire_on,
         a.side,
         '⏰ ' || coalesce(nullif(a.label, ''), 'Alarme'),
         'São ' || to_char(a.at_time, 'HH24:MI') || '.',
         'catdog-alarm-' || a.id,
         'catdog/#tempo/alarmes',
         a.id
    from catdog_alarms a
   cross join lateral (select case when a.repeat = 'none' then a.on_date
                                   else (now() at time zone catdog_tz(a.side))::date end as fire_on) f
   cross join lateral (select (f.fire_on + a.at_time) at time zone catdog_tz(a.side) as fire_at) w
   where a.active
     and (a.repeat in ('none', 'daily') or extract(dow from f.fire_on)::smallint = any (a.repeat_days))
     and w.fire_at <= now()
     and w.fire_at > greatest(now() - interval '10 minutes', a.updated_at)

  union all
  -- 2) fim de timer (foco, pausa, contagem)
  select 'timer:' || t.id,
         t.side,
         case t.kind when 'focus' then '🎯 Foco concluído' when 'break' then '☕ Pausa terminou' else '⏳ Contagem terminou' end,
         case when t.kind = 'focus' then 'Abra o app para confirmar a sessão e receber as moedas.'
              when t.label <> '' then t.label
              else 'O tempo acabou.' end,
         'catdog-timer',
         'catdog/#tempo',
         null::uuid
    from catdog_timers t
   where t.status = 'running' and t.ends_at is not null
     and t.ends_at <= now() and t.ends_at > now() - interval '30 minutes'

  union all
  -- 3) prazos de tarefa: 15 min antes e na hora (só tarefas com horário, ainda não feitas).
  --    Tarefa repetida: a hora vale no relógio de cada lado; hora antes da virada do dia pertence ao fim do dia anterior.
  select 'due:' || e.id || ':' || e.side || ':' || e.phase || ':' || extract(epoch from e.due)::bigint,
         e.side,
         case e.phase when 'pre' then '⏰ Em 15 minutos' else '⌛ Prazo agora' end,
         e.title,
         'catdog-due-' || e.id,
         'catdog/#hoje',
         null::uuid
    from (
      select o.*, p.phase, case p.phase when 'pre' then o.due - interval '15 minutes' else o.due end as fire_at
        from (
          select t.id, t.title, t.shared_mode, t.updated_at, s.side,
                 catdog_task_day(t.owner, t.repeat) as period,
                 case when t.repeat = 'none' then t.due_at
                      else ((catdog_task_day(t.owner, t.repeat)
                             + case when t.owner <> 'ambos' and t.due_time < (st.day_start_min * interval '1 minute')::time then 1 else 0 end)
                            + t.due_time) at time zone catdog_tz(s.side) end as due
            from catdog_tasks t
           cross join (values ('gato'), ('cao')) as s(side)
           join catdog_settings st on st.side = s.side
           where (t.owner = 'ambos' or t.owner = s.side)
             and ((t.repeat = 'none' and t.due_at is not null
                   and to_char(t.due_at at time zone 'America/Sao_Paulo', 'HH24:MI') <> '23:59'
                   and to_char(t.due_at at time zone 'Europe/Lisbon', 'HH24:MI') <> '23:59')
               or (t.repeat = 'daily' and t.due_time is not null)
               or (t.repeat = 'weekly' and t.due_time is not null
                   and extract(dow from catdog_task_day(t.owner, t.repeat))::smallint = any (t.repeat_days)))
        ) o
       cross join (values ('pre'), ('now')) as p(phase)
       where not exists (
         select 1 from catdog_completions c
          where c.task_id = o.id and c.period = o.period and (c.side = o.side or o.shared_mode = 'any'))
    ) e
   where e.fire_at <= now() and e.fire_at > now() - interval '10 minutes' and e.fire_at > e.updated_at

  union all
  -- 4) vale comprado no presente de quem vai cumprir
  select 'purchase:' || p.id,
         p.provider,
         '🎁 Vale pedido',
         case p.buyer when 'gato' then 'O Cão' else 'O Gato' end || ' comprou: ' || p.title,
         'catdog-vale',
         'catdog/#loja/vales',
         null::uuid
    from catdog_purchases p
   where p.status = 'pending' and p.buyer <> p.provider and p.created_at > now() - interval '1 day';
$$;
revoke execute on function catdog_due_items() from public, anon, authenticated;
