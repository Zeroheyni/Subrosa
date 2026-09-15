-- ============================================================
-- INVENTÁRIO v2 — carga do jogador + recipientes.
--
-- Modelo:
--   * Lugar (inventory_containers): espaço fixo (porta-malas, cofre)
--     associado a um local. Tem limite de carga PRÓPRIO — o que tem
--     dentro NÃO afeta a carga do jogador.
--   * Recipiente (inventory_receptacles): objeto carregado pelo
--     jogador (mochila, bolsa). Tem peso PRÓPRIO (base_weight) +
--     capacidade própria. Itens dentro dele valem METADE do peso pra
--     capacidade do recipiente. O peso efetivo do recipiente
--     (base_weight + metade dos itens) conta contra a carga do
--     jogador, porque ele carrega o recipiente inteiro.
--   * Item solto (sem container_id nem receptacle_id): conta o peso
--     cheio contra a carga do jogador.
--   * Carga máxima do jogador: campo 'playerCarryCapacity' dentro do
--     JSONB de game_state — só o mestre altera (mesmo caminho de
--     master_update_state, sem RPC nova pra esse campo isolado).
-- ============================================================

create table if not exists inventory_receptacles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  base_weight numeric not null default 0,
  capacity numeric not null,
  created_by text not null check (created_by in ('cat','dog')),
  created_at timestamptz not null default now()
);

alter table inventory_receptacles enable row level security;
drop policy if exists "inventory_receptacles_select_public" on inventory_receptacles;
create policy "inventory_receptacles_select_public" on inventory_receptacles for select using (true);

alter table inventory_items add column if not exists receptacle_id uuid references inventory_receptacles(id) on delete set null;

do $$
begin
  if not exists (select 1 from information_schema.table_constraints where constraint_name = 'inventory_items_single_place' and table_name = 'inventory_items') then
    alter table inventory_items add constraint inventory_items_single_place check (not (container_id is not null and receptacle_id is not null));
  end if;
end $$;

-- ------------------------------------------------------------
-- Helpers de carga (chamados só internamente pelas RPCs abaixo)
-- ------------------------------------------------------------

create or replace function inventory_player_max_capacity()
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_cap numeric;
begin
  select (data->>'playerCarryCapacity')::numeric into v_cap from game_state where id = 1;
  return coalesce(v_cap, 50);
end;
$$;

create or replace function inventory_receptacle_used(p_receptacle_id uuid, p_exclude_item_id uuid)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_used numeric;
begin
  select coalesce(sum(weight*quantity), 0) into v_used
  from inventory_items
  where receptacle_id = p_receptacle_id and id is distinct from p_exclude_item_id;
  return v_used / 2.0;
end;
$$;

create or replace function inventory_player_used_total(p_exclude_item_id uuid)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_loose numeric;
  v_receptacles numeric;
begin
  select coalesce(sum(weight*quantity), 0) into v_loose
  from inventory_items
  where container_id is null and receptacle_id is null and id is distinct from p_exclude_item_id;

  select coalesce(sum(r.base_weight + inventory_receptacle_used(r.id, p_exclude_item_id)), 0) into v_receptacles
  from inventory_receptacles r;

  return v_loose + v_receptacles;
end;
$$;

create or replace function inventory_check_item_capacity(p_container_id uuid, p_receptacle_id uuid, p_weight numeric, p_quantity int, p_exclude_item_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_full numeric := coalesce(p_weight,0) * coalesce(p_quantity,1);
  v_half numeric;
  v_capacity numeric;
  v_used numeric;
  v_player_max numeric;
  v_player_used numeric;
begin
  if p_container_id is not null and p_receptacle_id is not null then
    raise exception 'item nao pode estar num lugar e num recipiente ao mesmo tempo';
  end if;

  if p_container_id is not null then
    select capacity into v_capacity from inventory_containers where id = p_container_id;
    if v_capacity is not null then
      select coalesce(sum(weight*quantity), 0) into v_used
      from inventory_items where container_id = p_container_id and id is distinct from p_exclude_item_id;
      if v_used + v_full > v_capacity then
        raise exception 'capacidade excedida: esse lugar aguenta % de carga e ja tem % usado', v_capacity, v_used;
      end if;
    end if;
    return;
  end if;

  if p_receptacle_id is not null then
    v_half := v_full / 2.0;
    select capacity into v_capacity from inventory_receptacles where id = p_receptacle_id;
    v_used := inventory_receptacle_used(p_receptacle_id, p_exclude_item_id);
    if v_used + v_half > v_capacity then
      raise exception 'capacidade excedida: esse recipiente aguenta % de carga e ja tem % usado', v_capacity, v_used;
    end if;
  end if;

  v_player_max := inventory_player_max_capacity();
  v_player_used := inventory_player_used_total(p_exclude_item_id);
  if v_player_used + (case when p_receptacle_id is not null then v_full/2.0 else v_full end) > v_player_max then
    raise exception 'capacidade excedida: voce aguenta % de carga e ja esta com % usado', v_player_max, v_player_used;
  end if;
end;
$$;

create or replace function inventory_check_receptacle_capacity(p_receptacle_id uuid, p_base_weight numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_player_max numeric;
  v_others_used numeric;
  v_own_used numeric;
  v_new_effective numeric;
begin
  v_player_max := inventory_player_max_capacity();

  select coalesce(sum(weight*quantity), 0) into v_own_used
  from inventory_items where receptacle_id = p_receptacle_id;
  v_own_used := v_own_used / 2.0;

  select coalesce(sum(weight*quantity), 0) into v_others_used
  from inventory_items where container_id is null and receptacle_id is null;

  select v_others_used + coalesce(sum(r.base_weight + inventory_receptacle_used(r.id, null)), 0) into v_others_used
  from inventory_receptacles r
  where r.id is distinct from p_receptacle_id;

  v_new_effective := coalesce(p_base_weight,0) + v_own_used;

  if v_others_used + v_new_effective > v_player_max then
    raise exception 'capacidade excedida: esse recipiente deixaria voce com mais de % de carga', v_player_max;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RPCs de recipientes
-- ------------------------------------------------------------

create or replace function inventory_create_receptacle(p_name text, p_description text, p_image_url text, p_base_weight numeric, p_capacity numeric, p_created_by text)
returns inventory_receptacles
language plpgsql security definer set search_path = public
as $$
declare v_row inventory_receptacles;
begin
  if p_created_by not in ('cat','dog') then raise exception 'created_by invalido'; end if;
  if p_capacity is null or p_capacity <= 0 then raise exception 'recipiente precisa de uma capacidade valida'; end if;
  perform inventory_check_receptacle_capacity(null, p_base_weight);
  insert into inventory_receptacles (name, description, image_url, base_weight, capacity, created_by)
  values (p_name, p_description, p_image_url, coalesce(p_base_weight,0), p_capacity, p_created_by)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_create_receptacle(text, text, text, numeric, numeric, text) to anon, authenticated;

create or replace function inventory_update_receptacle(p_id uuid, p_name text, p_description text, p_image_url text, p_base_weight numeric, p_capacity numeric)
returns inventory_receptacles
language plpgsql security definer set search_path = public
as $$
declare v_row inventory_receptacles;
begin
  if p_capacity is null or p_capacity <= 0 then raise exception 'recipiente precisa de uma capacidade valida'; end if;
  perform inventory_check_receptacle_capacity(p_id, p_base_weight);
  update inventory_receptacles set
    name = p_name, description = p_description, image_url = p_image_url,
    base_weight = coalesce(p_base_weight,0), capacity = p_capacity
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_update_receptacle(uuid, text, text, text, numeric, numeric) to anon, authenticated;

create or replace function inventory_delete_receptacle(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update inventory_items set receptacle_id = null where receptacle_id = p_id;
  delete from inventory_receptacles where id = p_id;
end;
$$;
grant execute on function inventory_delete_receptacle(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Itens: assinatura muda (novo p_receptacle_id) — precisa dropar
-- a versao antiga explicitamente, CREATE OR REPLACE nao troca
-- lista de parametros.
-- ------------------------------------------------------------

drop function if exists inventory_create_item(text, text, text, numeric, int, uuid, text);
drop function if exists inventory_update_item(uuid, text, text, text, numeric, int, uuid);
drop function if exists inventory_check_capacity(uuid, numeric, int, uuid);

create or replace function inventory_create_item(p_name text, p_description text, p_image_url text, p_weight numeric, p_quantity int, p_container_id uuid, p_receptacle_id uuid, p_created_by text)
returns inventory_items
language plpgsql security definer set search_path = public
as $$
declare v_row inventory_items;
begin
  if p_created_by not in ('cat','dog') then raise exception 'created_by invalido'; end if;
  perform inventory_check_item_capacity(p_container_id, p_receptacle_id, p_weight, p_quantity, null);
  insert into inventory_items (name, description, image_url, weight, quantity, container_id, receptacle_id, created_by)
  values (p_name, p_description, p_image_url, coalesce(p_weight,0), coalesce(p_quantity,1), p_container_id, p_receptacle_id, p_created_by)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_create_item(text, text, text, numeric, int, uuid, uuid, text) to anon, authenticated;

create or replace function inventory_update_item(p_id uuid, p_name text, p_description text, p_image_url text, p_weight numeric, p_quantity int, p_container_id uuid, p_receptacle_id uuid)
returns inventory_items
language plpgsql security definer set search_path = public
as $$
declare v_row inventory_items;
begin
  perform inventory_check_item_capacity(p_container_id, p_receptacle_id, p_weight, p_quantity, p_id);
  update inventory_items set
    name = p_name, description = p_description, image_url = p_image_url,
    weight = coalesce(p_weight,0), quantity = coalesce(p_quantity,1),
    container_id = p_container_id, receptacle_id = p_receptacle_id
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_update_item(uuid, text, text, text, numeric, int, uuid, uuid) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_receptacles') then
    alter publication supabase_realtime add table inventory_receptacles;
  end if;
end $$;
