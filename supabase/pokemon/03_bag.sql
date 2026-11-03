-- ============================================================
-- POKÉMON — bolsa (inventário dos treinadores)
--
-- Estilo da Bolsa dos jogos: itens separados em bolsos, sem limite de carga.
-- Cada item pertence a um treinador. Leitura pública; escrita só por RPC.
-- A bolsa é do jogador também: as funções NÃO pedem token (o PIN do jogador é a
-- porta da frente do site, como nas anotações e fotos). Apagar o treinador leva
-- os itens dele junto (on delete cascade).
-- Depende de 01_trainers.sql (pkm_trainers, pkm_check_image_url).
-- ============================================================

create table if not exists pkm_items (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references pkm_trainers(id) on delete cascade,
  pocket text not null default 'itens' check (pocket in ('itens', 'remedios', 'bolas', 'tecnicas', 'chave')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  qty int not null default 1 check (qty >= 0),
  description text not null default '' check (char_length(description) <= 600),
  image_url text,
  image_src_url text,
  image_frame jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pkm_items_trainer_idx on pkm_items (trainer_id);

alter table pkm_items enable row level security;
drop policy if exists "pkm_items_select_public" on pkm_items;
create policy "pkm_items_select_public" on pkm_items for select using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pkm_items') then
    alter publication supabase_realtime add table pkm_items;
  end if;
end $$;

-- ---------- criar / editar. Só mexe nos campos presentes em p_data ----------
create or replace function pkm_save_item(p_id uuid, p_trainer_id uuid, p_data jsonb)
returns pkm_items
language plpgsql security definer set search_path = public
as $$
declare v_row pkm_items;
begin
  if p_id is null then
    if not exists (select 1 from pkm_trainers where id = p_trainer_id) then raise exception 'treinador não encontrado'; end if;
    insert into pkm_items (trainer_id, pocket, name, qty, description)
    values (
      p_trainer_id,
      coalesce(p_data->>'pocket', 'itens'),
      btrim(p_data->>'name'),
      coalesce((p_data->>'qty')::int, 1),
      coalesce(p_data->>'description', '')
    )
    returning * into v_row;
    return v_row;
  end if;

  update pkm_items set
    pocket = coalesce(p_data->>'pocket', pocket),
    name = coalesce(btrim(p_data->>'name'), name),
    qty = coalesce((p_data->>'qty')::int, qty),
    description = coalesce(p_data->>'description', description),
    updated_at = now()
  where id = p_id
  returning * into v_row;
  if not found then raise exception 'item não encontrado'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_save_item(uuid, uuid, jsonb) to anon, authenticated;

-- ---------- somar / tirar quantidade (delta negativo tira; nunca fica abaixo de 0) ----------
create or replace function pkm_item_qty(p_id uuid, p_delta int)
returns pkm_items
language plpgsql security definer set search_path = public
as $$
declare v_row pkm_items;
begin
  update pkm_items set qty = greatest(qty + coalesce(p_delta, 0), 0), updated_at = now()
   where id = p_id returning * into v_row;
  if not found then raise exception 'item não encontrado'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_item_qty(uuid, int) to anon, authenticated;

create or replace function pkm_delete_item(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from pkm_items where id = p_id;
end;
$$;
grant execute on function pkm_delete_item(uuid) to anon, authenticated;

create or replace function pkm_item_set_photo(p_id uuid, p_image_url text, p_image_src_url text, p_image_frame jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_check_image_url(p_image_url);
  perform pkm_check_image_url(p_image_src_url);
  update pkm_items
     set image_url = p_image_url, image_src_url = p_image_src_url, image_frame = p_image_frame, updated_at = now()
   where id = p_id;
  if not found then raise exception 'item não encontrado'; end if;
end;
$$;
grant execute on function pkm_item_set_photo(uuid, text, text, jsonb) to anon, authenticated;
