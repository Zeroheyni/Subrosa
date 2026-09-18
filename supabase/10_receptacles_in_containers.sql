-- ============================================================
-- INVENTÁRIO v3 — recipientes podem ser guardados dentro de Depósitos.
--
-- Novo modelo:
--   * Recipiente com container_id NULL  = carregado pelo jogador (como antes):
--     base_weight + metade dos itens conta contra a carga do jogador.
--   * Recipiente com container_id       = guardado num Depósito:
--     NÃO conta contra a carga do jogador; o peso efetivo dele
--     (base_weight + metade dos itens) conta contra a carga do Depósito.
--   * O peso dos itens soltos direto no Depósito continua sendo o peso cheio.
--   * Itens dentro de um recipiente guardado passam a pesar (metade) no Depósito
--     e não na carga do jogador.
-- ============================================================

alter table inventory_receptacles
  add column if not exists container_id uuid references inventory_containers(id) on delete set null;

-- peso efetivo de um recipiente = peso vazio + metade dos itens dentro
create or replace function inventory_receptacle_effective(p_receptacle_id uuid, p_exclude_item_id uuid)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_base numeric;
begin
  select base_weight into v_base from inventory_receptacles where id = p_receptacle_id;
  return coalesce(v_base, 0) + inventory_receptacle_used(p_receptacle_id, p_exclude_item_id);
end;
$$;

-- carga usada de um Depósito: itens (peso cheio) + recipientes guardados (peso efetivo)
create or replace function inventory_container_used(p_container_id uuid, p_exclude_item_id uuid, p_exclude_receptacle_id uuid)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_items numeric;
  v_receptacles numeric;
begin
  select coalesce(sum(weight*quantity), 0) into v_items
  from inventory_items
  where container_id = p_container_id and id is distinct from p_exclude_item_id;

  select coalesce(sum(inventory_receptacle_effective(r.id, p_exclude_item_id)), 0) into v_receptacles
  from inventory_receptacles r
  where r.container_id = p_container_id and r.id is distinct from p_exclude_receptacle_id;

  return v_items + v_receptacles;
end;
$$;

-- carga total do jogador: só recipientes que ele está carregando (container_id nulo)
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
  from inventory_receptacles r
  where r.container_id is null;

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
  v_rec_container uuid;
  v_player_max numeric;
  v_player_used numeric;
begin
  if p_container_id is not null and p_receptacle_id is not null then
    raise exception 'item nao pode estar num lugar e num recipiente ao mesmo tempo';
  end if;

  if p_container_id is not null then
    select capacity into v_capacity from inventory_containers where id = p_container_id;
    if v_capacity is not null then
      v_used := inventory_container_used(p_container_id, p_exclude_item_id, null);
      if v_used + v_full > v_capacity then
        raise exception 'capacidade excedida: esse lugar aguenta % de carga e ja tem % usado', v_capacity, v_used;
      end if;
    end if;
    return;
  end if;

  if p_receptacle_id is not null then
    v_half := v_full / 2.0;
    select capacity, container_id into v_capacity, v_rec_container from inventory_receptacles where id = p_receptacle_id;
    v_used := inventory_receptacle_used(p_receptacle_id, p_exclude_item_id);
    if v_used + v_half > v_capacity then
      raise exception 'capacidade excedida: esse recipiente aguenta % de carga e ja tem % usado', v_capacity, v_used;
    end if;

    -- recipiente guardado num depósito: o peso entra na carga do depósito, não na do jogador
    if v_rec_container is not null then
      select capacity into v_capacity from inventory_containers where id = v_rec_container;
      if v_capacity is not null then
        v_used := inventory_container_used(v_rec_container, p_exclude_item_id, null);
        if v_used + v_half > v_capacity then
          raise exception 'capacidade excedida: o lugar onde esse recipiente esta guardado aguenta % de carga e ja tem % usado', v_capacity, v_used;
        end if;
      end if;
      return;
    end if;
  end if;

  v_player_max := inventory_player_max_capacity();
  v_player_used := inventory_player_used_total(p_exclude_item_id);
  if v_player_used + (case when p_receptacle_id is not null then v_full/2.0 else v_full end) > v_player_max then
    raise exception 'capacidade excedida: voce aguenta % de carga e ja esta com % usado', v_player_max, v_player_used;
  end if;
end;
$$;

-- usada ao criar/editar um recipiente (mudança de peso vazio muda o peso efetivo)
create or replace function inventory_check_receptacle_capacity(p_receptacle_id uuid, p_base_weight numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_container uuid;
  v_cap numeric;
  v_player_max numeric;
  v_others_used numeric;
  v_own_used numeric := 0;
  v_new_effective numeric;
begin
  if p_receptacle_id is not null then
    select container_id into v_container from inventory_receptacles where id = p_receptacle_id;
    v_own_used := inventory_receptacle_used(p_receptacle_id, null);
  end if;
  v_new_effective := coalesce(p_base_weight, 0) + v_own_used;

  -- guardado num depósito: quem sente o peso é o depósito
  if v_container is not null then
    select capacity into v_cap from inventory_containers where id = v_container;
    if v_cap is not null and inventory_container_used(v_container, null, p_receptacle_id) + v_new_effective > v_cap then
      raise exception 'capacidade excedida: esse recipiente deixaria o lugar onde esta guardado com mais de % de carga', v_cap;
    end if;
    return;
  end if;

  v_player_max := inventory_player_max_capacity();

  select coalesce(sum(weight*quantity), 0) into v_others_used
  from inventory_items where container_id is null and receptacle_id is null;

  v_others_used := v_others_used + coalesce((
    select sum(r.base_weight + inventory_receptacle_used(r.id, null))
    from inventory_receptacles r
    where r.container_id is null and r.id is distinct from p_receptacle_id
  ), 0);

  if v_others_used + v_new_effective > v_player_max then
    raise exception 'capacidade excedida: esse recipiente deixaria voce com mais de % de carga', v_player_max;
  end if;
end;
$$;

-- mover um recipiente: p_container_id = depósito onde guardar, NULL = voltar pra você
create or replace function inventory_move_receptacle(p_id uuid, p_container_id uuid)
returns inventory_receptacles
language plpgsql security definer set search_path = public
as $$
declare
  v_row inventory_receptacles;
  v_effective numeric;
  v_cap numeric;
  v_used numeric;
  v_player_max numeric;
  v_player_used numeric;
begin
  select * into v_row from inventory_receptacles where id = p_id;
  if not found then raise exception 'recipiente nao encontrado'; end if;
  if p_container_id is not distinct from v_row.container_id then return v_row; end if;

  v_effective := inventory_receptacle_effective(p_id, null);

  if p_container_id is not null then
    if not exists (select 1 from inventory_containers where id = p_container_id) then
      raise exception 'lugar nao encontrado';
    end if;
    select capacity into v_cap from inventory_containers where id = p_container_id;
    if v_cap is not null then
      v_used := inventory_container_used(p_container_id, null, p_id);
      if v_used + v_effective > v_cap then
        raise exception 'capacidade excedida: esse lugar aguenta % de carga e ja tem % usado', v_cap, v_used;
      end if;
    end if;
  else
    -- volta a ser carregado: entra na carga do jogador (guardado, ele não contava)
    v_player_max := inventory_player_max_capacity();
    v_player_used := inventory_player_used_total(null);
    if v_player_used + v_effective > v_player_max then
      raise exception 'capacidade excedida: voce aguenta % de carga e ja esta com % usado', v_player_max, v_player_used;
    end if;
  end if;

  update inventory_receptacles set container_id = p_container_id where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_move_receptacle(uuid, uuid) to anon, authenticated;
