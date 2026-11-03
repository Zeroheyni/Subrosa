-- ============================================================
-- INVENTÁRIO — mestre e jogador podem criar/remover livremente.
-- "Lugares" (containers) têm limite de carga opcional; itens
-- soltos (sem lugar) não têm limite.
-- ============================================================
create table if not exists inventory_containers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity numeric,
  created_by text not null check (created_by in ('cat','dog')),
  created_at timestamptz not null default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  container_id uuid references inventory_containers(id) on delete set null,
  name text not null,
  description text,
  image_url text,
  weight numeric not null default 0,
  quantity int not null default 1,
  created_by text not null check (created_by in ('cat','dog')),
  created_at timestamptz not null default now()
);

alter table inventory_containers enable row level security;
alter table inventory_items enable row level security;

drop policy if exists "inventory_containers_select_public" on inventory_containers;
create policy "inventory_containers_select_public" on inventory_containers for select using (true);
drop policy if exists "inventory_items_select_public" on inventory_items;
create policy "inventory_items_select_public" on inventory_items for select using (true);

create or replace function inventory_create_container(p_name text, p_capacity numeric, p_created_by text)
returns inventory_containers
language plpgsql security definer set search_path = public
as $$
declare v_row inventory_containers;
begin
  if p_created_by not in ('cat','dog') then raise exception 'created_by invalido'; end if;
  insert into inventory_containers (name, capacity, created_by)
  values (p_name, p_capacity, p_created_by)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_create_container(text, numeric, text) to anon, authenticated;

create or replace function inventory_update_container(p_id uuid, p_name text, p_capacity numeric)
returns inventory_containers
language plpgsql security definer set search_path = public
as $$
declare v_row inventory_containers;
begin
  update inventory_containers set name = p_name, capacity = p_capacity where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_update_container(uuid, text, numeric) to anon, authenticated;

create or replace function inventory_delete_container(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update inventory_items set container_id = null where container_id = p_id;
  delete from inventory_containers where id = p_id;
end;
$$;
grant execute on function inventory_delete_container(uuid) to anon, authenticated;

create or replace function inventory_check_capacity(p_container_id uuid, p_weight numeric, p_quantity int, p_exclude_item_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_capacity numeric;
  v_used numeric;
begin
  if p_container_id is null then return; end if;
  select capacity into v_capacity from inventory_containers where id = p_container_id;
  if v_capacity is null then return; end if;
  select coalesce(sum(weight*quantity), 0) into v_used
  from inventory_items
  where container_id = p_container_id and id is distinct from p_exclude_item_id;
  if v_used + (coalesce(p_weight,0) * coalesce(p_quantity,1)) > v_capacity then
    raise exception 'capacidade excedida: esse lugar aguenta % de carga e ja tem % usado', v_capacity, v_used;
  end if;
end;
$$;

create or replace function inventory_create_item(p_name text, p_description text, p_image_url text, p_weight numeric, p_quantity int, p_container_id uuid, p_created_by text)
returns inventory_items
language plpgsql security definer set search_path = public
as $$
declare v_row inventory_items;
begin
  if p_created_by not in ('cat','dog') then raise exception 'created_by invalido'; end if;
  perform inventory_check_capacity(p_container_id, p_weight, p_quantity, null);
  insert into inventory_items (name, description, image_url, weight, quantity, container_id, created_by)
  values (p_name, p_description, p_image_url, coalesce(p_weight,0), coalesce(p_quantity,1), p_container_id, p_created_by)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_create_item(text, text, text, numeric, int, uuid, text) to anon, authenticated;

create or replace function inventory_update_item(p_id uuid, p_name text, p_description text, p_image_url text, p_weight numeric, p_quantity int, p_container_id uuid)
returns inventory_items
language plpgsql security definer set search_path = public
as $$
declare v_row inventory_items;
begin
  perform inventory_check_capacity(p_container_id, p_weight, p_quantity, p_id);
  update inventory_items set
    name = p_name, description = p_description, image_url = p_image_url,
    weight = coalesce(p_weight,0), quantity = coalesce(p_quantity,1), container_id = p_container_id
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function inventory_update_item(uuid, text, text, text, numeric, int, uuid) to anon, authenticated;

create or replace function inventory_delete_item(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from inventory_items where id = p_id;
end;
$$;
grant execute on function inventory_delete_item(uuid) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_containers') then
    alter publication supabase_realtime add table inventory_containers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_items') then
    alter publication supabase_realtime add table inventory_items;
  end if;
end $$;

-- ============================================================
-- CODEX — espaco do jogador pra organizar memorias/personagens/
-- anotacoes em pastas. Mestre so le (a UI nao da controles de
-- edicao pra ele, mesmo padrao ja usado no diario).
-- ============================================================
create table if not exists codex_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_folder_id uuid references codex_folders(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists codex_entries (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references codex_folders(id) on delete set null,
  title text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table codex_folders enable row level security;
alter table codex_entries enable row level security;

drop policy if exists "codex_folders_select_public" on codex_folders;
create policy "codex_folders_select_public" on codex_folders for select using (true);
drop policy if exists "codex_entries_select_public" on codex_entries;
create policy "codex_entries_select_public" on codex_entries for select using (true);

create or replace function codex_create_folder(p_name text, p_parent_folder_id uuid)
returns codex_folders
language plpgsql security definer set search_path = public
as $$
declare v_row codex_folders;
begin
  insert into codex_folders (name, parent_folder_id) values (p_name, p_parent_folder_id)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function codex_create_folder(text, uuid) to anon, authenticated;

create or replace function codex_rename_folder(p_id uuid, p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update codex_folders set name = p_name where id = p_id;
end;
$$;
grant execute on function codex_rename_folder(uuid, text) to anon, authenticated;

create or replace function codex_delete_folder(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from codex_folders where id = p_id;
end;
$$;
grant execute on function codex_delete_folder(uuid) to anon, authenticated;

create or replace function codex_create_entry(p_folder_id uuid, p_title text, p_description text, p_image_url text)
returns codex_entries
language plpgsql security definer set search_path = public
as $$
declare v_row codex_entries;
begin
  insert into codex_entries (folder_id, title, description, image_url)
  values (p_folder_id, p_title, p_description, p_image_url)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function codex_create_entry(uuid, text, text, text) to anon, authenticated;

create or replace function codex_update_entry(p_id uuid, p_folder_id uuid, p_title text, p_description text, p_image_url text)
returns codex_entries
language plpgsql security definer set search_path = public
as $$
declare v_row codex_entries;
begin
  update codex_entries set
    folder_id = p_folder_id, title = p_title, description = p_description, image_url = p_image_url, updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function codex_update_entry(uuid, uuid, text, text, text) to anon, authenticated;

create or replace function codex_delete_entry(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from codex_entries where id = p_id;
end;
$$;
grant execute on function codex_delete_entry(uuid) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='codex_folders') then
    alter publication supabase_realtime add table codex_folders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='codex_entries') then
    alter publication supabase_realtime add table codex_entries;
  end if;
end $$;
