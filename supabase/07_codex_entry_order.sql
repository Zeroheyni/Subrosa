-- ============================================================
-- CODEX — ordem arrastável das lembranças (arrastar pra dentro/
-- fora de pasta, e pra antes/depois de outra lembrança).
-- ============================================================

alter table codex_entries add column if not exists sort_order numeric not null default 0;

-- Preenche a ordem das lembranças já existentes com base na data de
-- criação, agrupado por pasta (só roda uma vez, é seguro repetir).
do $$
declare
  r record;
  v_folder uuid;
  v_first boolean := true;
  v_seq numeric := 0;
begin
  for r in (select id, folder_id from codex_entries order by folder_id nulls first, created_at) loop
    if v_first or r.folder_id is distinct from v_folder then
      v_folder := r.folder_id;
      v_seq := 0;
      v_first := false;
    end if;
    update codex_entries set sort_order = v_seq where id = r.id;
    v_seq := v_seq + 1;
  end loop;
end $$;

-- Cria a lembrança já no fim da lista da pasta de destino.
create or replace function codex_create_entry(p_folder_id uuid, p_title text, p_description text, p_image_url text)
returns codex_entries
language plpgsql security definer set search_path = public
as $$
declare
  v_row codex_entries;
  v_next numeric;
begin
  select coalesce(max(sort_order), -1) + 1 into v_next
  from codex_entries where folder_id is not distinct from p_folder_id;
  insert into codex_entries (folder_id, title, description, image_url, sort_order)
  values (p_folder_id, p_title, p_description, p_image_url, v_next)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function codex_create_entry(uuid, text, text, text) to anon, authenticated;

-- Move e/ou reordena uma lembrança: usada pelo arrastar-e-soltar
-- (dropar numa pasta = reparenta; dropar entre duas lembranças =
-- so muda sort_order via média fracionária).
create or replace function codex_set_entry_order(p_id uuid, p_folder_id uuid, p_sort_order numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update codex_entries set folder_id = p_folder_id, sort_order = p_sort_order where id = p_id;
end;
$$;
grant execute on function codex_set_entry_order(uuid, uuid, numeric) to anon, authenticated;
