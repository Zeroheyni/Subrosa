-- ============================================================
-- MENSAGENS + CONTATOS
--
-- O celular do jogo é do JOGADOR; o mestre interpreta os contatos (NPCs).
--   * Contato (msg_contacts): pessoa/número do jogo. `revealed` = o jogador
--     já sabe quem é (senão ele só vê o número). Bloqueio nos dois sentidos:
--     blocked_by_player (jogador bloqueou o contato) e blocked_player
--     (o contato bloqueou o jogador — quem liga isso é o mestre).
--   * Conversa (msg_threads): 'direct' (jogador x 1 contato) ou 'group'
--     (jogador + vários contatos). Membros em msg_thread_members.
--   * Mensagem (msg_messages): sender 'player' ou 'contact'. `delivered`
--     fica false quando o bloqueio impede a entrega (o mestre ainda vê).
--     game_day/game_clock = data e hora do RPG no momento do envio.
--   * Leitura: player_last_read_at / master_last_read_at por conversa
--     (dão os "não lidas" e os dois tiques).
--
-- Escrita só por funções (security definer): as do jogador são abertas,
-- as do mestre exigem token válido de master_sessions.
-- ============================================================

create table if not exists msg_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  image_url text,
  bio text,
  master_notes text,
  revealed boolean not null default true,
  blocked_by_player boolean not null default false,
  blocked_player boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists msg_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct','group')),
  name text,
  image_url text,
  player_muted boolean not null default false,
  player_last_read_at timestamptz not null default now(),
  master_last_read_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists msg_thread_members (
  thread_id uuid not null references msg_threads(id) on delete cascade,
  contact_id uuid not null references msg_contacts(id) on delete cascade,
  primary key (thread_id, contact_id)
);

create table if not exists msg_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references msg_threads(id) on delete cascade,
  sender text not null check (sender in ('player','contact')),
  contact_id uuid references msg_contacts(id) on delete set null,
  body text,
  image_url text,
  delivered boolean not null default true,
  game_day int,
  game_clock text,
  created_at timestamptz not null default now(),
  check (coalesce(body,'') <> '' or image_url is not null)
);
create index if not exists msg_messages_thread_idx on msg_messages(thread_id, created_at);

alter table msg_contacts enable row level security;
alter table msg_threads enable row level security;
alter table msg_thread_members enable row level security;
alter table msg_messages enable row level security;
drop policy if exists "msg_contacts_select_public" on msg_contacts;
drop policy if exists "msg_threads_select_public" on msg_threads;
drop policy if exists "msg_thread_members_select_public" on msg_thread_members;
drop policy if exists "msg_messages_select_public" on msg_messages;
create policy "msg_contacts_select_public" on msg_contacts for select using (true);
create policy "msg_threads_select_public" on msg_threads for select using (true);
create policy "msg_thread_members_select_public" on msg_thread_members for select using (true);
create policy "msg_messages_select_public" on msg_messages for select using (true);

do $$
declare t text;
begin
  foreach t in array array['msg_contacts','msg_threads','msg_thread_members','msg_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ---------- helper: só o mestre passa ----------
create or replace function msg_assert_master(p_token uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from master_sessions where token = p_token and expires_at > now()) then
    raise exception 'sessão de mestre inválida ou expirada';
  end if;
end;
$$;

-- ============================================================
-- CONTATOS
-- ============================================================
create or replace function msg_create_contact(p_token uuid, p_name text, p_phone text, p_image_url text, p_bio text, p_master_notes text, p_revealed boolean)
returns msg_contacts
language plpgsql security definer set search_path = public
as $$
declare v_row msg_contacts;
begin
  perform msg_assert_master(p_token);
  if coalesce(trim(p_name),'') = '' then raise exception 'contato precisa de um nome'; end if;
  if coalesce(trim(p_phone),'') = '' then raise exception 'contato precisa de um numero'; end if;
  insert into msg_contacts (name, phone, image_url, bio, master_notes, revealed)
  values (trim(p_name), trim(p_phone), p_image_url, p_bio, p_master_notes, coalesce(p_revealed, true))
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function msg_create_contact(uuid, text, text, text, text, text, boolean) to anon, authenticated;

create or replace function msg_update_contact(p_token uuid, p_id uuid, p_name text, p_phone text, p_image_url text, p_bio text, p_master_notes text, p_revealed boolean, p_blocked_player boolean)
returns msg_contacts
language plpgsql security definer set search_path = public
as $$
declare v_row msg_contacts;
begin
  perform msg_assert_master(p_token);
  if coalesce(trim(p_name),'') = '' then raise exception 'contato precisa de um nome'; end if;
  if coalesce(trim(p_phone),'') = '' then raise exception 'contato precisa de um numero'; end if;
  update msg_contacts set
    name = trim(p_name), phone = trim(p_phone), image_url = p_image_url, bio = p_bio,
    master_notes = p_master_notes, revealed = coalesce(p_revealed, revealed),
    blocked_player = coalesce(p_blocked_player, blocked_player)
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function msg_update_contact(uuid, uuid, text, text, text, text, text, boolean, boolean) to anon, authenticated;

create or replace function msg_delete_contact(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform msg_assert_master(p_token);
  -- conversas diretas com esse contato somem junto; grupos ficam (mensagens dele ficam sem autor)
  delete from msg_threads where kind = 'direct'
    and id in (select thread_id from msg_thread_members where contact_id = p_id);
  delete from msg_contacts where id = p_id;
end;
$$;
grant execute on function msg_delete_contact(uuid, uuid) to anon, authenticated;

-- o jogador bloqueia/desbloqueia um contato (aberto)
create or replace function msg_set_blocked_by_player(p_contact_id uuid, p_blocked boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update msg_contacts set blocked_by_player = coalesce(p_blocked, false) where id = p_contact_id;
end;
$$;
grant execute on function msg_set_blocked_by_player(uuid, boolean) to anon, authenticated;

-- ============================================================
-- CONVERSAS
-- ============================================================
create or replace function msg_get_or_create_direct(p_contact_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not exists (select 1 from msg_contacts where id = p_contact_id) then raise exception 'contato nao encontrado'; end if;
  select t.id into v_id
  from msg_threads t join msg_thread_members m on m.thread_id = t.id
  where t.kind = 'direct' and m.contact_id = p_contact_id
  limit 1;
  if v_id is null then
    insert into msg_threads (kind) values ('direct') returning id into v_id;
    insert into msg_thread_members (thread_id, contact_id) values (v_id, p_contact_id);
  end if;
  return v_id;
end;
$$;
grant execute on function msg_get_or_create_direct(uuid) to anon, authenticated;

create or replace function msg_create_group(p_name text, p_image_url text, p_contact_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(trim(p_name),'') = '' then raise exception 'o grupo precisa de um nome'; end if;
  if p_contact_ids is null or array_length(p_contact_ids, 1) is null then raise exception 'escolha pelo menos um contato'; end if;
  insert into msg_threads (kind, name, image_url) values ('group', trim(p_name), p_image_url) returning id into v_id;
  insert into msg_thread_members (thread_id, contact_id)
  select v_id, c.id from msg_contacts c where c.id = any(p_contact_ids);
  return v_id;
end;
$$;
grant execute on function msg_create_group(text, text, uuid[]) to anon, authenticated;

create or replace function msg_update_group(p_token uuid, p_thread_id uuid, p_name text, p_image_url text, p_contact_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform msg_assert_master(p_token);
  if not exists (select 1 from msg_threads where id = p_thread_id and kind = 'group') then raise exception 'grupo nao encontrado'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'o grupo precisa de um nome'; end if;
  if p_contact_ids is null or array_length(p_contact_ids, 1) is null then raise exception 'escolha pelo menos um contato'; end if;
  update msg_threads set name = trim(p_name), image_url = p_image_url where id = p_thread_id;
  delete from msg_thread_members where thread_id = p_thread_id and not (contact_id = any(p_contact_ids));
  insert into msg_thread_members (thread_id, contact_id)
  select p_thread_id, c.id from msg_contacts c where c.id = any(p_contact_ids)
  on conflict do nothing;
end;
$$;
grant execute on function msg_update_group(uuid, uuid, text, text, uuid[]) to anon, authenticated;

create or replace function msg_delete_thread(p_token uuid, p_thread_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform msg_assert_master(p_token);
  delete from msg_threads where id = p_thread_id;
end;
$$;
grant execute on function msg_delete_thread(uuid, uuid) to anon, authenticated;

create or replace function msg_set_muted(p_thread_id uuid, p_muted boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update msg_threads set player_muted = coalesce(p_muted, false) where id = p_thread_id;
end;
$$;
grant execute on function msg_set_muted(uuid, boolean) to anon, authenticated;

create or replace function msg_mark_read_player(p_thread_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update msg_threads set player_last_read_at = now() where id = p_thread_id;
end;
$$;
grant execute on function msg_mark_read_player(uuid) to anon, authenticated;

create or replace function msg_mark_read_master(p_token uuid, p_thread_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform msg_assert_master(p_token);
  update msg_threads set master_last_read_at = now() where id = p_thread_id;
end;
$$;
grant execute on function msg_mark_read_master(uuid, uuid) to anon, authenticated;

-- ============================================================
-- MENSAGENS
-- ============================================================
create or replace function msg_send_as_player(p_thread_id uuid, p_body text, p_image_url text, p_game_day int, p_game_clock text)
returns msg_messages
language plpgsql security definer set search_path = public
as $$
declare
  v_thread msg_threads;
  v_delivered boolean := true;
  v_row msg_messages;
begin
  select * into v_thread from msg_threads where id = p_thread_id;
  if not found then raise exception 'conversa nao encontrada'; end if;
  if coalesce(trim(p_body),'') = '' and p_image_url is null then raise exception 'mensagem vazia'; end if;

  -- o contato bloqueou o jogador: a mensagem sai mas não chega
  if v_thread.kind = 'direct' then
    select not c.blocked_player into v_delivered
    from msg_thread_members m join msg_contacts c on c.id = m.contact_id
    where m.thread_id = p_thread_id
    limit 1;
    v_delivered := coalesce(v_delivered, true);
  end if;

  insert into msg_messages (thread_id, sender, body, image_url, delivered, game_day, game_clock)
  values (p_thread_id, 'player', nullif(trim(coalesce(p_body,'')), ''), p_image_url, v_delivered, p_game_day, p_game_clock)
  returning * into v_row;

  update msg_threads set last_message_at = now(), player_last_read_at = now() where id = p_thread_id;
  return v_row;
end;
$$;
grant execute on function msg_send_as_player(uuid, text, text, int, text) to anon, authenticated;

create or replace function msg_send_as_contact(p_token uuid, p_thread_id uuid, p_contact_id uuid, p_body text, p_image_url text, p_game_day int, p_game_clock text)
returns msg_messages
language plpgsql security definer set search_path = public
as $$
declare
  v_blocked boolean;
  v_row msg_messages;
begin
  perform msg_assert_master(p_token);
  if not exists (select 1 from msg_thread_members where thread_id = p_thread_id and contact_id = p_contact_id) then
    raise exception 'esse contato nao faz parte dessa conversa';
  end if;
  if coalesce(trim(p_body),'') = '' and p_image_url is null then raise exception 'mensagem vazia'; end if;

  select blocked_by_player into v_blocked from msg_contacts where id = p_contact_id;

  insert into msg_messages (thread_id, sender, contact_id, body, image_url, delivered, game_day, game_clock)
  values (p_thread_id, 'contact', p_contact_id, nullif(trim(coalesce(p_body,'')), ''), p_image_url, not coalesce(v_blocked, false), p_game_day, p_game_clock)
  returning * into v_row;

  update msg_threads set last_message_at = now(), master_last_read_at = now() where id = p_thread_id;
  return v_row;
end;
$$;
grant execute on function msg_send_as_contact(uuid, uuid, uuid, text, text, int, text) to anon, authenticated;

create or replace function msg_delete_message(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform msg_assert_master(p_token);
  delete from msg_messages where id = p_id;
end;
$$;
grant execute on function msg_delete_message(uuid, uuid) to anon, authenticated;
