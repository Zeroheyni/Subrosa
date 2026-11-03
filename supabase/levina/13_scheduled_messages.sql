-- ============================================================
-- MENSAGENS AGENDADAS (mestre)
--
-- O mestre agenda "no dia X às HH:MM do RPG, o contato Y manda a mensagem Z".
-- Como o relógio do RPG é definido pelo próprio mestre (dia via "Avançar dia",
-- hora via app Relógio), a entrega acontece NO BANCO: um gatilho em game_state
-- roda toda vez que o dia ou a hora mudam e entrega tudo que já venceu.
-- Assim funciona mesmo com o app do mestre fechado, e o jogador recebe a
-- notificação normal (o INSERT em msg_messages dispara o Realtime).
--
--   * "Venceu" = dia agendado < dia atual, ou mesmo dia e hora agendada <= hora atual.
--   * A mensagem entregue carrega o dia/hora AGENDADOS (o balão mostra a hora
--     que o mestre escolheu, não a hora em que o relógio passou por ela).
--   * Contato bloqueado pelo jogador: entrega com delivered=false (como sempre).
--   * Tabela privada: sem policy de select. O mestre lê por msg_list_scheduled(token),
--     então o jogador não consegue espiar o que vem por aí.
--   * Voltar o dia NÃO desfaz mensagens já entregues.
-- ============================================================

create table if not exists msg_scheduled (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references msg_threads(id) on delete cascade,
  contact_id uuid not null references msg_contacts(id) on delete cascade,
  body text,
  image_url text,
  image_w int,
  image_h int,
  send_day int not null check (send_day >= 1),
  send_clock text not null check (send_clock ~ '^[0-2][0-9]:[0-5][0-9]$'),
  created_at timestamptz not null default now(),
  check (coalesce(body,'') <> '' or image_url is not null)
);
create index if not exists msg_scheduled_due_idx on msg_scheduled(send_day, send_clock);

alter table msg_scheduled enable row level security;
-- (de propósito sem nenhuma policy: só as funções security definer abaixo acessam)

-- entrega tudo que já venceu no relógio atual do jogo
create or replace function msg_deliver_due()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_day int;
  v_clock text;
  r msg_scheduled;
  v_blocked boolean;
  v_n int := 0;
begin
  select (data->>'day')::int, coalesce(data->>'clock', '00:00') into v_day, v_clock from game_state where id = 1;
  if v_day is null then return 0; end if;

  for r in
    select * from msg_scheduled
    where send_day < v_day or (send_day = v_day and send_clock <= v_clock)
    order by send_day, send_clock, created_at
  loop
    select blocked_by_player into v_blocked from msg_contacts where id = r.contact_id;
    insert into msg_messages (thread_id, sender, contact_id, body, image_url, image_w, image_h, delivered, game_day, game_clock, created_at)
    values (r.thread_id, 'contact', r.contact_id, r.body, r.image_url, r.image_w, r.image_h, not coalesce(v_blocked, false), r.send_day, r.send_clock, clock_timestamp());
    update msg_threads set last_message_at = clock_timestamp() where id = r.thread_id;
    delete from msg_scheduled where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- gatilho: só roda quando o dia ou a hora do jogo mudaram. Nunca pode atrapalhar
-- o salvamento do mestre, então qualquer erro aqui é engolido.
create or replace function msg_game_state_trigger()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (old.data->>'day') is distinct from (new.data->>'day')
     or (old.data->>'clock') is distinct from (new.data->>'clock') then
    begin
      perform msg_deliver_due();
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists msg_game_state_deliver on game_state;
create trigger msg_game_state_deliver
  after update on game_state
  for each row execute function msg_game_state_trigger();

-- ---------- RPCs do mestre ----------
create or replace function msg_schedule_message(p_token uuid, p_thread_id uuid, p_contact_id uuid, p_body text, p_image_url text, p_send_day int, p_send_clock text, p_image_w int default null, p_image_h int default null)
returns msg_scheduled
language plpgsql security definer set search_path = public
as $$
declare v_row msg_scheduled;
begin
  perform msg_assert_master(p_token);
  if not exists (select 1 from msg_thread_members where thread_id = p_thread_id and contact_id = p_contact_id) then
    raise exception 'esse contato nao faz parte dessa conversa';
  end if;
  if coalesce(trim(p_body),'') = '' and p_image_url is null then raise exception 'mensagem vazia'; end if;
  if p_send_clock is null or p_send_clock !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'hora invalida'; end if;
  insert into msg_scheduled (thread_id, contact_id, body, image_url, image_w, image_h, send_day, send_clock)
  values (p_thread_id, p_contact_id, nullif(trim(coalesce(p_body,'')), ''), p_image_url, p_image_w, p_image_h, p_send_day, p_send_clock)
  returning * into v_row;
  perform msg_deliver_due();      -- se já venceu no relógio atual, sai agora
  return v_row;
end;
$$;
grant execute on function msg_schedule_message(uuid, uuid, uuid, text, text, int, text, int, int) to anon, authenticated;

create or replace function msg_update_scheduled(p_token uuid, p_id uuid, p_contact_id uuid, p_body text, p_image_url text, p_send_day int, p_send_clock text, p_image_w int default null, p_image_h int default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_thread uuid;
begin
  perform msg_assert_master(p_token);
  select thread_id into v_thread from msg_scheduled where id = p_id;
  if v_thread is null then raise exception 'agendamento nao encontrado (talvez ja tenha sido enviado)'; end if;
  if not exists (select 1 from msg_thread_members where thread_id = v_thread and contact_id = p_contact_id) then
    raise exception 'esse contato nao faz parte dessa conversa';
  end if;
  if coalesce(trim(p_body),'') = '' and p_image_url is null then raise exception 'mensagem vazia'; end if;
  if p_send_clock is null or p_send_clock !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'hora invalida'; end if;
  update msg_scheduled set
    contact_id = p_contact_id, body = nullif(trim(coalesce(p_body,'')), ''), image_url = p_image_url,
    image_w = p_image_w, image_h = p_image_h, send_day = p_send_day, send_clock = p_send_clock
  where id = p_id;
  perform msg_deliver_due();
end;
$$;
grant execute on function msg_update_scheduled(uuid, uuid, uuid, text, text, int, text, int, int) to anon, authenticated;

create or replace function msg_delete_scheduled(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform msg_assert_master(p_token);
  delete from msg_scheduled where id = p_id;
end;
$$;
grant execute on function msg_delete_scheduled(uuid, uuid) to anon, authenticated;

create or replace function msg_list_scheduled(p_token uuid)
returns setof msg_scheduled
language plpgsql security definer set search_path = public
as $$
begin
  perform msg_assert_master(p_token);
  return query select * from msg_scheduled order by send_day, send_clock, created_at;
end;
$$;
grant execute on function msg_list_scheduled(uuid) to anon, authenticated;
