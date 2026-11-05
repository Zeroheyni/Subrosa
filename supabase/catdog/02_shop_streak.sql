-- Projeto Cat & Dog — Fase 2: loja de recompensas, vales e sequência de dias (streak)
-- Tudo novo (prefixo catdog_); só amplia catdog_coin_log (novo tipo "streak" e coluna ref).
--
-- Loja: cada recompensa tem um dono (quem vai cumprir) e um comprador (for_side).
--   dono = comprador  → recompensa própria: comprar desconta as moedas e já vale (status done).
--   dono ≠ comprador  → "presente": o preço é em moedas de quem compra; vira um vale pendente
--                        até o dono marcar como cumprido (ou devolver as moedas).
-- Sequência: dias seguidos (fuso de São Paulo) em que o lado concluiu pelo menos uma tarefa.
--   Marcos pagam moedas ao próprio lado, uma vez por sequência.

-- ---------- extrato: novo tipo e referência única ----------
alter table catdog_coin_log drop constraint if exists catdog_coin_log_kind_check;
alter table catdog_coin_log add constraint catdog_coin_log_kind_check
  check (kind in ('task', 'adjust', 'reward', 'refund', 'streak'));
alter table catdog_coin_log add column if not exists ref text;
create unique index if not exists catdog_coin_log_ref_uq on catdog_coin_log (side, ref) where ref is not null;

-- ---------- loja ----------
create table if not exists catdog_rewards (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('gato', 'cao')),
  for_side text not null check (for_side in ('gato', 'cao')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 400),
  price int not null check (price between 1 and 5000),
  once boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catdog_purchases (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid references catdog_rewards(id) on delete set null,
  title text not null,
  buyer text not null check (buyer in ('gato', 'cao')),
  provider text not null check (provider in ('gato', 'cao')),
  price int not null check (price > 0),
  status text not null check (status in ('pending', 'done', 'refunded')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists catdog_purchases_buyer_idx on catdog_purchases (buyer, created_at desc);
create index if not exists catdog_purchases_provider_idx on catdog_purchases (provider, status);

-- dias de atividade: sobrevive a apagar a tarefa (a sequência não pode sumir por limpeza de lista)
create table if not exists catdog_activity (
  side text not null check (side in ('gato', 'cao')),
  day date not null,
  primary key (side, day)
);

alter table catdog_rewards enable row level security;
alter table catdog_purchases enable row level security;
alter table catdog_activity enable row level security;
drop policy if exists "catdog_rewards_select_public" on catdog_rewards;
create policy "catdog_rewards_select_public" on catdog_rewards for select using (true);
drop policy if exists "catdog_purchases_select_public" on catdog_purchases;
create policy "catdog_purchases_select_public" on catdog_purchases for select using (true);
drop policy if exists "catdog_activity_select_public" on catdog_activity;
create policy "catdog_activity_select_public" on catdog_activity for select using (true);

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['catdog_rewards', 'catdog_purchases'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- recompensas ----------
create or replace function catdog_save_reward(p_side text, p_token uuid, p_id uuid, p_data jsonb)
returns catdog_rewards
language plpgsql security definer set search_path = public
as $$
declare
  v_row catdog_rewards;
  v_title text;
  v_for text;
  v_price int;
begin
  perform catdog_assert_side(p_side, p_token);
  v_title := btrim(coalesce(p_data->>'title', ''));
  if char_length(v_title) < 1 then raise exception 'dê um nome à recompensa'; end if;
  v_price := (p_data->>'price')::int;
  if v_price is null or v_price < 1 or v_price > 5000 then raise exception 'o preço vai de 1 a 5000 moedas'; end if;

  if p_id is null then
    v_for := coalesce(nullif(p_data->>'for_side', ''), p_side);
    if v_for not in ('gato', 'cao') then raise exception 'lado inválido'; end if;
    insert into catdog_rewards (owner, for_side, title, description, price, once)
    values (p_side, v_for, v_title, coalesce(p_data->>'description', ''), v_price, coalesce((p_data->>'once')::boolean, false))
    returning * into v_row;
    return v_row;
  end if;

  select * into v_row from catdog_rewards where id = p_id for update;
  if not found then raise exception 'recompensa não encontrada'; end if;
  if v_row.owner <> p_side then raise exception 'essa recompensa não é sua'; end if;
  update catdog_rewards set
    title = v_title,
    description = coalesce(p_data->>'description', description),
    price = v_price,
    once = coalesce((p_data->>'once')::boolean, once),
    active = coalesce((p_data->>'active')::boolean, active),
    updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function catdog_save_reward(text, uuid, uuid, jsonb) to anon, authenticated;

create or replace function catdog_delete_reward(p_side text, p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_owner text;
begin
  perform catdog_assert_side(p_side, p_token);
  select owner into v_owner from catdog_rewards where id = p_id;
  if not found then raise exception 'recompensa não encontrada'; end if;
  if v_owner <> p_side then raise exception 'essa recompensa não é sua'; end if;
  delete from catdog_rewards where id = p_id;   -- as compras já feitas ficam (reward_id vira nulo)
end;
$$;
grant execute on function catdog_delete_reward(text, uuid, uuid) to anon, authenticated;

-- ---------- comprar ----------
create or replace function catdog_buy_reward(p_side text, p_token uuid, p_id uuid)
returns catdog_purchases
language plpgsql security definer set search_path = public
as $$
declare
  r catdog_rewards;
  v_bal int;
  v_row catdog_purchases;
begin
  perform catdog_assert_side(p_side, p_token);
  -- uma compra por vez por carteira: evita gastar o mesmo saldo duas vezes
  perform pg_advisory_xact_lock(hashtext('catdog_wallet_' || p_side));

  select * into r from catdog_rewards where id = p_id for update;
  if not found then raise exception 'recompensa não encontrada'; end if;
  if r.for_side <> p_side then raise exception 'essa recompensa não é para você'; end if;
  if not r.active then raise exception 'essa recompensa não está mais disponível'; end if;

  select coalesce(sum(amount), 0) into v_bal from catdog_coin_log where side = p_side;
  if v_bal < r.price then raise exception 'moedas insuficientes: faltam %', r.price - v_bal; end if;

  insert into catdog_purchases (reward_id, title, buyer, provider, price, status, settled_at)
  values (r.id, r.title, p_side, r.owner, r.price,
          case when r.owner = p_side then 'done' else 'pending' end,
          case when r.owner = p_side then now() else null end)
  returning * into v_row;
  insert into catdog_coin_log (side, amount, kind, note) values (p_side, -r.price, 'reward', left(r.title, 200));
  if r.once then update catdog_rewards set active = false, updated_at = now() where id = r.id; end if;
  return v_row;
end;
$$;
grant execute on function catdog_buy_reward(text, uuid, uuid) to anon, authenticated;

-- quem oferece marca como cumprido
create or replace function catdog_fulfill_purchase(p_side text, p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare p catdog_purchases;
begin
  perform catdog_assert_side(p_side, p_token);
  select * into p from catdog_purchases where id = p_id for update;
  if not found then raise exception 'vale não encontrado'; end if;
  if p.provider <> p_side then raise exception 'só quem oferece pode marcar como cumprido'; end if;
  if p.status <> 'pending' then raise exception 'esse vale já foi resolvido'; end if;
  update catdog_purchases set status = 'done', settled_at = now() where id = p_id;
end;
$$;
grant execute on function catdog_fulfill_purchase(text, uuid, uuid) to anon, authenticated;

-- quem oferece pode devolver as moedas de um vale pendente
create or replace function catdog_refund_purchase(p_side text, p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare p catdog_purchases;
begin
  perform catdog_assert_side(p_side, p_token);
  select * into p from catdog_purchases where id = p_id for update;
  if not found then raise exception 'vale não encontrado'; end if;
  if p.provider <> p_side then raise exception 'só quem oferece pode devolver as moedas'; end if;
  if p.status <> 'pending' then raise exception 'esse vale já foi resolvido'; end if;
  update catdog_purchases set status = 'refunded', settled_at = now() where id = p_id;
  insert into catdog_coin_log (side, amount, kind, note) values (p.buyer, p.price, 'refund', left(p.title, 200));
  update catdog_rewards set active = true, updated_at = now() where id = p.reward_id and once;   -- recompensa de uma vez volta à loja
end;
$$;
grant execute on function catdog_refund_purchase(text, uuid, uuid) to anon, authenticated;

-- ---------- sequência ----------
-- marcos: dias → moedas de bônus (uma vez por sequência)
create or replace function catdog_milestone_bonus(p_days int)
returns int
language sql immutable
as $$
  select case p_days when 3 then 3 when 7 then 10 when 14 then 20 when 30 then 50 when 60 then 100 when 100 then 200 else null end;
$$;
revoke execute on function catdog_milestone_bonus(int) from public, anon, authenticated;

-- sequência atual e melhor de um lado (a atual continua viva se o último dia foi hoje ou ontem)
create or replace function catdog_streak_of(p_side text)
returns table (cur int, best int, start_day date, last_day date, today_done boolean)
language sql stable security definer set search_path = public
as $$
  with d as (select day from catdog_activity where side = p_side),
       g as (select day, day - (row_number() over (order by day))::int as grp from d),
       isl as (select min(day) as s, max(day) as e, count(*)::int as n from g group by grp),
       cur as (select s, e, n from isl where e >= catdog_today() - 1 order by e desc limit 1)
  select coalesce((select n from cur), 0),
         coalesce((select max(n) from isl), 0),
         (select s from cur),
         (select e from cur),
         exists (select 1 from d where day = catdog_today());
$$;
revoke execute on function catdog_streak_of(text) from public, anon, authenticated;

-- público: as duas sequências de uma vez
create or replace function catdog_streaks()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'gato', (select to_jsonb(s) from catdog_streak_of('gato') s),
    'cao',  (select to_jsonb(s) from catdog_streak_of('cao') s)
  );
$$;
grant execute on function catdog_streaks() to anon, authenticated;

-- registra o dia e paga marcos (chamada por catdog_complete)
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
  insert into catdog_activity (side, day) values (p_side, catdog_today()) on conflict do nothing;
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

-- desfazer a última conclusão do dia tira o dia da sequência (o bônus já pago fica)
create or replace function catdog_streak_untouch(p_side text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from catdog_completions
     where side = p_side and (completed_at at time zone 'America/Sao_Paulo')::date = catdog_today()
  ) then
    delete from catdog_activity where side = p_side and day = catdog_today();
  end if;
end;
$$;
revoke execute on function catdog_streak_untouch(text) from public, anon, authenticated;

-- catdog_complete passa a registrar a atividade do dia
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
  if p_done then perform catdog_streak_touch(p_side); else perform catdog_streak_untouch(p_side); end if;
end;
$$;
grant execute on function catdog_complete(text, uuid, uuid, boolean) to anon, authenticated;
