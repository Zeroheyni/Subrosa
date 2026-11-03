-- ============================================================
-- Mensagens: guarda largura/altura da foto.
-- Com isso o balão já nasce no tamanho certo (sem a conversa "pular"
-- quando a imagem termina de carregar). Colunas opcionais: mensagens
-- antigas e clientes antigos continuam funcionando.
-- ============================================================

alter table msg_messages add column if not exists image_w int;
alter table msg_messages add column if not exists image_h int;

-- as assinaturas ganham 2 parametros opcionais no fim: dropa as antigas
-- (CREATE OR REPLACE nao troca a lista de parametros)
drop function if exists msg_send_as_player(uuid, text, text, int, text);
drop function if exists msg_send_as_contact(uuid, uuid, uuid, text, text, int, text);

create or replace function msg_send_as_player(p_thread_id uuid, p_body text, p_image_url text, p_game_day int, p_game_clock text, p_image_w int default null, p_image_h int default null)
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

  insert into msg_messages (thread_id, sender, body, image_url, image_w, image_h, delivered, game_day, game_clock)
  values (p_thread_id, 'player', nullif(trim(coalesce(p_body,'')), ''), p_image_url, p_image_w, p_image_h, v_delivered, p_game_day, p_game_clock)
  returning * into v_row;

  update msg_threads set last_message_at = now(), player_last_read_at = now() where id = p_thread_id;
  return v_row;
end;
$$;
grant execute on function msg_send_as_player(uuid, text, text, int, text, int, int) to anon, authenticated;

create or replace function msg_send_as_contact(p_token uuid, p_thread_id uuid, p_contact_id uuid, p_body text, p_image_url text, p_game_day int, p_game_clock text, p_image_w int default null, p_image_h int default null)
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

  insert into msg_messages (thread_id, sender, contact_id, body, image_url, image_w, image_h, delivered, game_day, game_clock)
  values (p_thread_id, 'contact', p_contact_id, nullif(trim(coalesce(p_body,'')), ''), p_image_url, p_image_w, p_image_h, not coalesce(v_blocked, false), p_game_day, p_game_clock)
  returning * into v_row;

  update msg_threads set last_message_at = now(), master_last_read_at = now() where id = p_thread_id;
  return v_row;
end;
$$;
grant execute on function msg_send_as_contact(uuid, uuid, uuid, text, text, int, text, int, int) to anon, authenticated;
