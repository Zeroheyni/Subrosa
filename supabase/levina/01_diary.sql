-- ============================================================
-- DIÁRIO (CAT = mestre, DOG = jogador)
-- Uma entrada por dia real (data da vida real, não a fictícia
-- do jogo) por autor. Cada um só escreve a própria; leitura é
-- livre pros dois lados. Sincroniza via Realtime, igual ao
-- resto do app.
-- ============================================================

create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  author text not null check (author in ('cat','dog')),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (entry_date, author)
);

alter table diary_entries enable row level security;

drop policy if exists "diary_entries_select_public" on diary_entries;
create policy "diary_entries_select_public" on diary_entries
  for select
  using (true);

-- Sem policy de insert/update/delete: só as funções abaixo
-- (security definer) escrevem na tabela.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'diary_entries'
  ) then
    alter publication supabase_realtime add table diary_entries;
  end if;
end $$;

-- ---------- Jogador escreve o DOG (aberto, sem token) ----------
create or replace function player_upsert_diary_entry(p_entry_date date, p_content jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into diary_entries (entry_date, author, content, updated_at)
  values (p_entry_date, 'dog', p_content, now())
  on conflict (entry_date, author)
  do update set content = excluded.content, updated_at = now();
end;
$$;

grant execute on function player_upsert_diary_entry(date, jsonb) to anon, authenticated;

-- ---------- Mestre escreve o CAT (exige token válido) ----------
-- token é uuid na tabela master_sessions (não text!) — usar tipo
-- diferente aqui quebra a comparação (uuid = text não tem operador).
drop function if exists master_upsert_diary_entry(text, date, jsonb);

create or replace function master_upsert_diary_entry(p_token uuid, p_entry_date date, p_content jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from master_sessions
    where token = p_token and expires_at > now()
  ) then
    raise exception 'sessão de mestre inválida ou expirada';
  end if;

  insert into diary_entries (entry_date, author, content, updated_at)
  values (p_entry_date, 'cat', p_content, now())
  on conflict (entry_date, author)
  do update set content = excluded.content, updated_at = now();
end;
$$;

grant execute on function master_upsert_diary_entry(uuid, date, jsonb) to anon, authenticated;

-- ============================================================
-- STORAGE — bucket público pras imagens coladas no editor
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diary-images', 'diary-images', true, 5242880, array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do nothing;

drop policy if exists "diary_images_insert_open" on storage.objects;
create policy "diary_images_insert_open" on storage.objects
  for insert
  with check (bucket_id = 'diary-images');
