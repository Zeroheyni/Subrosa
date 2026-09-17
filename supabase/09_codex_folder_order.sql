-- ============================================================
-- CODEX — ordem arrastável das pastas (reordenar e aninhar por
-- arraste, mesmo mecanismo já usado nas lembranças).
-- ============================================================

alter table codex_folders add column if not exists sort_order numeric not null default 0;

-- Preenche a ordem das pastas já existentes com base na data de
-- criação, agrupado por pasta-pai (só roda uma vez, é seguro repetir).
do $$
declare
  r record;
  v_parent uuid;
  v_first boolean := true;
  v_seq numeric := 0;
begin
  for r in (select id, parent_folder_id from codex_folders order by parent_folder_id nulls first, created_at) loop
    if v_first or r.parent_folder_id is distinct from v_parent then
      v_parent := r.parent_folder_id;
      v_seq := 0;
      v_first := false;
    end if;
    update codex_folders set sort_order = v_seq where id = r.id;
    v_seq := v_seq + 1;
  end loop;
end $$;

-- Cria a pasta já no fim da lista da pasta-pai de destino.
create or replace function codex_create_folder(p_name text, p_parent_folder_id uuid, p_color text)
returns codex_folders
language plpgsql security definer set search_path = public
as $$
declare
  v_row codex_folders;
  v_next numeric;
begin
  select coalesce(max(sort_order), -1) + 1 into v_next
  from codex_folders where parent_folder_id is not distinct from p_parent_folder_id;
  insert into codex_folders (name, parent_folder_id, color, sort_order)
  values (p_name, p_parent_folder_id, p_color, v_next)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function codex_create_folder(text, uuid, text) to anon, authenticated;

-- Move e/ou reordena uma pasta (arrastar-e-soltar). Bloqueia mover
-- uma pasta pra dentro dela mesma ou de uma subpasta dela (evita
-- criar um ciclo na hierarquia).
create or replace function codex_set_folder_order(p_id uuid, p_parent_folder_id uuid, p_sort_order numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_walk uuid;
begin
  if p_parent_folder_id is not null then
    if p_parent_folder_id = p_id then
      raise exception 'uma pasta nao pode ser movida pra dentro dela mesma';
    end if;
    v_walk := p_parent_folder_id;
    while v_walk is not null loop
      select parent_folder_id into v_walk from codex_folders where id = v_walk;
      if v_walk = p_id then
        raise exception 'uma pasta nao pode ser movida pra dentro de uma subpasta dela';
      end if;
    end loop;
  end if;
  update codex_folders set parent_folder_id = p_parent_folder_id, sort_order = p_sort_order where id = p_id;
end;
$$;
grant execute on function codex_set_folder_order(uuid, uuid, numeric) to anon, authenticated;
