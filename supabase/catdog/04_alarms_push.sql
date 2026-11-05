-- Projeto Cat & Dog (id catdog) — Fase 4: alarmes e avisos automáticos (push)
-- Tudo novo, prefixo catdog_. Nada existente é alterado.
--
-- Lados: 'gato' = jogador (o Cão)  ·  'cao' = mestre (o Gato, exige token).  Veja docs/catdog.md.
--
-- Como os avisos funcionam:
--   1) catdog_due_items()  lista o que está na hora de avisar (alarmes, fim de timer, prazos de tarefa, vales);
--   2) catdog_claim_due()  (só a Edge Function, com service_role) "reserva" cada item na catdog_notified
--      e devolve só os que ainda não tinham sido avisados — avisar duas vezes é impossível;
--   3) catdog_ping()       (chamada pelo pg_cron, ver 05_cron.sql) só acorda a Edge Function quando há algo novo.
-- Cada item só vale numa janela de 10 min depois da hora (não manda aviso velho se algo ficou parado).

-- ---------- alarmes ----------
create table if not exists catdog_alarms (
  id uuid primary key default gen_random_uuid(),
  side text not null check (side in ('gato', 'cao')),
  label text not null default '' check (char_length(label) <= 60),
  at_time time not null,
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly')),
  repeat_days smallint[] not null default '{}',
  on_date date,                      -- só alarme de uma vez: o dia em que toca
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catdog_alarms_days_ck check (
    (repeat = 'weekly' and cardinality(repeat_days) between 1 and 7 and repeat_days <@ array[0,1,2,3,4,5,6]::smallint[])
    or (repeat <> 'weekly' and cardinality(repeat_days) = 0)),
  constraint catdog_alarms_date_ck check ((repeat = 'none') = (on_date is not null))
);
create index if not exists catdog_alarms_side_idx on catdog_alarms (side, at_time);

alter table catdog_alarms enable row level security;
drop policy if exists "catdog_alarms_select_public" on catdog_alarms;
create policy "catdog_alarms_select_public" on catdog_alarms for select using (true);

-- o que já foi avisado (ninguém lê pela API; só funções do banco e a Edge Function)
create table if not exists catdog_notified (
  key text primary key,
  created_at timestamptz not null default now()
);
alter table catdog_notified enable row level security;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'catdog_alarms') then
    alter publication supabase_realtime add table catdog_alarms;
  end if;
end $$;

-- próximo dia em que um alarme de uma vez toca: hoje se a hora ainda não passou, senão amanhã
create or replace function catdog_next_date(p_time time)
returns date
language sql stable
as $$
  select case when p_time > (now() at time zone 'America/Sao_Paulo')::time
              then (now() at time zone 'America/Sao_Paulo')::date
              else (now() at time zone 'America/Sao_Paulo')::date + 1 end;
$$;
revoke execute on function catdog_next_date(time) from public, anon, authenticated;

-- ---------- RPCs dos alarmes (só mexe nos do próprio lado) ----------
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
    if v_date is null then v_date := catdog_next_date(v_time); end if;
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
grant execute on function catdog_save_alarm(text, uuid, uuid, jsonb) to anon, authenticated;

create or replace function catdog_toggle_alarm(p_side text, p_token uuid, p_id uuid, p_active boolean)
returns catdog_alarms
language plpgsql security definer set search_path = public
as $$
declare a catdog_alarms;
begin
  perform catdog_assert_side(p_side, p_token);
  update catdog_alarms
     set active = coalesce(p_active, not active),
         on_date = case when repeat = 'none' then catdog_next_date(at_time) else on_date end,
         updated_at = now()
   where id = p_id and side = p_side
   returning * into a;
  if not found then raise exception 'alarme não encontrado'; end if;
  return a;
end;
$$;
grant execute on function catdog_toggle_alarm(text, uuid, uuid, boolean) to anon, authenticated;

create or replace function catdog_delete_alarm(p_side text, p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform catdog_assert_side(p_side, p_token);
  delete from catdog_alarms where id = p_id and side = p_side;
  if not found then raise exception 'alarme não encontrado'; end if;
end;
$$;
grant execute on function catdog_delete_alarm(text, uuid, uuid) to anon, authenticated;

-- ---------- o que está na hora de avisar ----------
create or replace function catdog_due_items()
returns table (key text, side text, title text, body text, tag text, url text, alarm_id uuid)
language sql stable security definer set search_path = public
as $$
  -- 1) alarmes
  select 'alarm:' || a.id || ':' || f.fire_on,
         a.side,
         '⏰ ' || coalesce(nullif(a.label, ''), 'Alarme'),
         'São ' || to_char(a.at_time, 'HH24:MI') || '.',
         'catdog-alarm-' || a.id,
         'catdog/#tempo/alarmes',
         a.id
    from catdog_alarms a
   cross join lateral (select case when a.repeat = 'none' then a.on_date else catdog_today() end as fire_on) f
   cross join lateral (select (f.fire_on + a.at_time) at time zone 'America/Sao_Paulo' as fire_at) w
   where a.active
     and (a.repeat in ('none', 'daily') or extract(dow from catdog_today())::smallint = any (a.repeat_days))
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
  -- 3) prazos de tarefa: 15 min antes e na hora (só tarefas com horário, ainda não feitas)
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
                 case when t.repeat = 'none' then date '2000-01-01' else catdog_today() end as period,
                 case when t.repeat = 'none' then t.due_at
                      else (catdog_today() + t.due_time) at time zone 'America/Sao_Paulo' end as due
            from catdog_tasks t
           cross join (values ('gato'), ('cao')) as s(side)
           where (t.owner = 'ambos' or t.owner = s.side)
             and ((t.repeat = 'none' and t.due_at is not null
                   and to_char(t.due_at at time zone 'America/Sao_Paulo', 'HH24:MI') <> '23:59')
               or (t.repeat = 'daily' and t.due_time is not null)
               or (t.repeat = 'weekly' and t.due_time is not null
                   and extract(dow from catdog_today())::smallint = any (t.repeat_days)))
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

-- reserva os itens novos (nunca avisa duas vezes) e desliga os alarmes de uma vez que acabaram de tocar
create or replace function catdog_claim_due()
returns table (key text, side text, title text, body text, tag text, url text)
language plpgsql security definer set search_path = public
as $$
begin
  delete from catdog_notified where created_at < now() - interval '7 days';

  create temporary table if not exists catdog_claimed_tmp (key text, side text, title text, body text, tag text, url text, alarm_id uuid) on commit drop;
  delete from catdog_claimed_tmp where true;   -- a API do Supabase recusa DELETE sem WHERE

  with due as (select * from catdog_due_items()),
       ins as (insert into catdog_notified (key) select d.key from due d on conflict do nothing returning catdog_notified.key)
  insert into catdog_claimed_tmp
  select d.key, d.side, d.title, d.body, d.tag, d.url, d.alarm_id from due d join ins on ins.key = d.key;

  update catdog_alarms a set active = false
   where a.repeat = 'none' and a.id in (select c.alarm_id from catdog_claimed_tmp c where c.alarm_id is not null);

  return query select c.key, c.side, c.title, c.body, c.tag, c.url from catdog_claimed_tmp c;
end;
$$;
revoke execute on function catdog_claim_due() from public, anon, authenticated;
grant execute on function catdog_claim_due() to service_role;

-- chamada pelo agendador: só acorda a Edge Function quando há algo novo para avisar
create or replace function catdog_ping()
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if exists (select 1 from catdog_due_items() i where not exists (select 1 from catdog_notified n where n.key = i.key)) then
    perform net.http_post(
      url := 'https://tvhdlqapeofyxfxppjov.supabase.co/functions/v1/catdog-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('action', 'scan')
    );
  end if;
end;
$$;
revoke execute on function catdog_ping() from public, anon, authenticated;
