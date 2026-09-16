-- ============================================================
-- CODEX — cor de pasta (paleta fixa, escolhida no formulário).
-- Assinatura muda em codex_create_folder/codex_rename_folder —
-- precisa dropar as versões antigas antes de recriar.
-- ============================================================

alter table codex_folders add column if not exists color text;

drop function if exists codex_create_folder(text, uuid);
drop function if exists codex_rename_folder(uuid, text);

create or replace function codex_create_folder(p_name text, p_parent_folder_id uuid, p_color text)
returns codex_folders
language plpgsql security definer set search_path = public
as $$
declare v_row codex_folders;
begin
  insert into codex_folders (name, parent_folder_id, color) values (p_name, p_parent_folder_id, p_color)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function codex_create_folder(text, uuid, text) to anon, authenticated;

create or replace function codex_rename_folder(p_id uuid, p_name text, p_color text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update codex_folders set name = p_name, color = p_color where id = p_id;
end;
$$;
grant execute on function codex_rename_folder(uuid, text, text) to anon, authenticated;
