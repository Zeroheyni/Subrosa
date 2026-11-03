-- ============================================================
-- POKÉMON — técnicas e combate
--
-- Técnica: criada pelo mestre (nome, tipo, categoria física ou especial,
-- Poder 1 a 150, custo 1 a 5 PA). Cada criatura sabe no máximo 4.
-- Combate: o estado inteiro (lados, ordem, PA, log) fica num jsonb que só o
-- mestre grava; todos leem (o jogador assiste ao vivo pelo Realtime).
-- O HP das criaturas continua em pkm_creatures (o app atualiza durante o combate).
--
-- Leitura pública; escrita só por RPC com o token do mestre.
-- Depende de 01 e 02 (pkm_trainers, pkm_creatures, pkm_assert_master, pkm_valid_types).
-- ============================================================

-- ---------- técnicas ----------
create table if not exists pkm_techniques (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  type text not null check (pkm_valid_types(array[type])),
  category text not null default 'fisico' check (category in ('fisico', 'especial')),
  power int not null check (power between 1 and 150),
  pa_cost int not null default 1 check (pa_cost between 1 and 5),
  description text not null default '' check (char_length(description) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pkm_techniques_name_uq on pkm_techniques (lower(btrim(name)));

-- quais técnicas cada criatura sabe (máximo 4, garantido por pkm_creature_set_techniques)
create table if not exists pkm_creature_techniques (
  creature_id uuid not null references pkm_creatures(id) on delete cascade,
  technique_id uuid not null references pkm_techniques(id) on delete restrict,
  position smallint not null default 0,
  primary key (creature_id, technique_id)
);
create index if not exists pkm_creature_techniques_tech_idx on pkm_creature_techniques (technique_id);

-- ---------- combates ----------
create table if not exists pkm_battles (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'ended')),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pkm_techniques enable row level security;
alter table pkm_creature_techniques enable row level security;
alter table pkm_battles enable row level security;
drop policy if exists "pkm_techniques_select_public" on pkm_techniques;
create policy "pkm_techniques_select_public" on pkm_techniques for select using (true);
drop policy if exists "pkm_creature_techniques_select_public" on pkm_creature_techniques;
create policy "pkm_creature_techniques_select_public" on pkm_creature_techniques for select using (true);
drop policy if exists "pkm_battles_select_public" on pkm_battles;
create policy "pkm_battles_select_public" on pkm_battles for select using (true);

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['pkm_techniques', 'pkm_creature_techniques', 'pkm_battles'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- técnica: criar / editar (mestre) ----------
create or replace function pkm_save_technique(p_token uuid, p_id uuid, p_data jsonb)
returns pkm_techniques
language plpgsql security definer set search_path = public
as $$
declare v_row pkm_techniques;
begin
  perform pkm_assert_master(p_token);

  if p_id is null then
    insert into pkm_techniques (name, type, category, power, pa_cost, description)
    values (
      btrim(p_data->>'name'),
      p_data->>'type',
      coalesce(p_data->>'category', 'fisico'),
      (p_data->>'power')::int,
      coalesce((p_data->>'pa_cost')::int, 1),
      coalesce(p_data->>'description', '')
    )
    returning * into v_row;
    return v_row;
  end if;

  update pkm_techniques set
    name = coalesce(btrim(p_data->>'name'), name),
    type = coalesce(p_data->>'type', type),
    category = coalesce(p_data->>'category', category),
    power = coalesce((p_data->>'power')::int, power),
    pa_cost = coalesce((p_data->>'pa_cost')::int, pa_cost),
    description = coalesce(p_data->>'description', description),
    updated_at = now()
  where id = p_id
  returning * into v_row;
  if not found then raise exception 'técnica não encontrada'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_save_technique(uuid, uuid, jsonb) to anon, authenticated;

create or replace function pkm_delete_technique(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_assert_master(p_token);
  if exists (select 1 from pkm_creature_techniques where technique_id = p_id) then
    raise exception 'ainda há criaturas que sabem essa técnica — tire dela antes de apagar';
  end if;
  delete from pkm_techniques where id = p_id;
end;
$$;
grant execute on function pkm_delete_technique(uuid, uuid) to anon, authenticated;

-- ---------- o que a criatura sabe: troca o conjunto inteiro (até 4, sem repetir) ----------
create or replace function pkm_creature_set_techniques(p_token uuid, p_creature_id uuid, p_technique_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare v_ids uuid[] := coalesce(p_technique_ids, '{}');
begin
  perform pkm_assert_master(p_token);
  if not exists (select 1 from pkm_creatures where id = p_creature_id) then raise exception 'criatura não encontrada'; end if;
  if cardinality(v_ids) > 4 then raise exception 'uma criatura sabe no máximo 4 técnicas'; end if;
  if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then raise exception 'técnica repetida'; end if;
  if (select count(*) from pkm_techniques where id = any(v_ids)) <> cardinality(v_ids) then raise exception 'técnica não encontrada'; end if;

  delete from pkm_creature_techniques where creature_id = p_creature_id;
  insert into pkm_creature_techniques (creature_id, technique_id, position)
  select p_creature_id, id, ord - 1 from unnest(v_ids) with ordinality as t(id, ord);
end;
$$;
grant execute on function pkm_creature_set_techniques(uuid, uuid, uuid[]) to anon, authenticated;

-- ---------- combate: criar (id nulo) ou gravar o estado (mestre) ----------
create or replace function pkm_battle_save(p_token uuid, p_id uuid, p_status text, p_state jsonb)
returns pkm_battles
language plpgsql security definer set search_path = public
as $$
declare v_row pkm_battles;
begin
  perform pkm_assert_master(p_token);
  if p_state is null or jsonb_typeof(p_state) <> 'object' then raise exception 'estado inválido'; end if;
  if pg_column_size(p_state) > 400000 then raise exception 'estado grande demais'; end if;

  if p_id is null then
    insert into pkm_battles (status, state) values (coalesce(p_status, 'active'), p_state) returning * into v_row;
    return v_row;
  end if;

  update pkm_battles set status = coalesce(p_status, status), state = p_state, updated_at = now()
   where id = p_id returning * into v_row;
  if not found then raise exception 'combate não encontrado'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_battle_save(uuid, uuid, text, jsonb) to anon, authenticated;

create or replace function pkm_delete_battle(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_assert_master(p_token);
  delete from pkm_battles where id = p_id;
end;
$$;
grant execute on function pkm_delete_battle(uuid, uuid) to anon, authenticated;
