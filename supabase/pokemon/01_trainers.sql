-- ============================================================
-- POKÉMON — treinadores
--
-- Leitura pública; escrita só por RPC security definer.
-- Mestre: exige o token da sessão (master_sessions).
-- Jogador: só anotações de RP e fotos (sem token — o PIN do jogador
-- é a porta da frente do site, não uma credencial no banco).
--
-- "Pontos para distribuir" não é guardado: sai de 10 + 2 por nível
-- menos a soma dos atributos (calculado no app).
-- ============================================================

-- ---------- bucket das fotos (público; a chave anônima envia mas não apaga) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pokemon-images', 'pokemon-images', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "pokemon_images_insert_open" on storage.objects;
create policy "pokemon_images_insert_open" on storage.objects
  for insert
  with check (bucket_id = 'pokemon-images');

-- ---------- tabela ----------
create table if not exists pkm_trainers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  concept text not null default '',                      -- aparência e conceito
  kind text not null default 'player' check (kind in ('player','npc')),
  level int not null default 1 check (level >= 1),
  xp numeric(12,1) not null default 0 check (xp >= 0),   -- XP dentro do nível atual (meios pontos)
  hp_current int not null default 30 check (hp_current >= 0),
  carisma int not null default 0 check (carisma >= 0),
  aparencia int not null default 0 check (aparencia >= 0),
  resistencia int not null default 0 check (resistencia >= 0),
  mental int not null default 0 check (mental >= 0),
  fisico int not null default 0 check (fisico >= 0),
  creature_xp_total numeric(12,1) not null default 0 check (creature_xp_total >= 0),
  notes text not null default '',
  image_url text,
  image_src_url text,
  image_frame jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pkm_trainers enable row level security;
drop policy if exists "pkm_trainers_select_public" on pkm_trainers;
create policy "pkm_trainers_select_public" on pkm_trainers for select using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pkm_trainers') then
    alter publication supabase_realtime add table pkm_trainers;
  end if;
end $$;

-- ---------- helper: só o mestre passa ----------
create or replace function pkm_assert_master(p_token uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from master_sessions where token = p_token and expires_at > now()) then
    raise exception 'sessão de mestre inválida ou expirada';
  end if;
end;
$$;

-- ---------- helper: só aceita imagens do bucket do projeto ----------
create or replace function pkm_check_image_url(p_url text)
returns void
language plpgsql immutable
as $$
begin
  if p_url is not null and p_url not like 'https://tvhdlqapeofyxfxppjov.supabase.co/storage/v1/object/public/pokemon-images/%' then
    raise exception 'imagem inválida';
  end if;
end;
$$;

-- ---------- criar / editar (mestre). Só mexe nos campos presentes em p_data ----------
create or replace function pkm_save_trainer(p_token uuid, p_id uuid, p_data jsonb)
returns pkm_trainers
language plpgsql security definer set search_path = public
as $$
declare
  v_row pkm_trainers;
  v_fisico int;
  v_hp int;
begin
  perform pkm_assert_master(p_token);

  if p_id is null then
    v_fisico := coalesce((p_data->>'fisico')::int, 0);
    insert into pkm_trainers (name, concept, kind, level, xp, hp_current,
                              carisma, aparencia, resistencia, mental, fisico, creature_xp_total)
    values (
      btrim(p_data->>'name'),
      coalesce(p_data->>'concept', ''),
      coalesce(p_data->>'kind', 'player'),
      coalesce((p_data->>'level')::int, 1),
      coalesce((p_data->>'xp')::numeric, 0),
      least(greatest(coalesce((p_data->>'hp_current')::int, 30 + v_fisico), 0), 30 + v_fisico),
      coalesce((p_data->>'carisma')::int, 0),
      coalesce((p_data->>'aparencia')::int, 0),
      coalesce((p_data->>'resistencia')::int, 0),
      coalesce((p_data->>'mental')::int, 0),
      v_fisico,
      coalesce((p_data->>'creature_xp_total')::numeric, 0)
    )
    returning * into v_row;
    return v_row;
  end if;

  select * into v_row from pkm_trainers where id = p_id for update;
  if not found then raise exception 'treinador não encontrado'; end if;

  v_fisico := coalesce((p_data->>'fisico')::int, v_row.fisico);
  v_hp := least(greatest(coalesce((p_data->>'hp_current')::int, v_row.hp_current), 0), 30 + v_fisico);

  update pkm_trainers set
    name = coalesce(btrim(p_data->>'name'), name),
    concept = coalesce(p_data->>'concept', concept),
    kind = coalesce(p_data->>'kind', kind),
    level = coalesce((p_data->>'level')::int, level),
    xp = coalesce((p_data->>'xp')::numeric, xp),
    hp_current = v_hp,
    carisma = coalesce((p_data->>'carisma')::int, carisma),
    aparencia = coalesce((p_data->>'aparencia')::int, aparencia),
    resistencia = coalesce((p_data->>'resistencia')::int, resistencia),
    mental = coalesce((p_data->>'mental')::int, mental),
    fisico = v_fisico,
    creature_xp_total = coalesce((p_data->>'creature_xp_total')::numeric, creature_xp_total),
    updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function pkm_save_trainer(uuid, uuid, jsonb) to anon, authenticated;

-- ---------- dar XP (mestre): XP para o próximo nível = nível × 10, o excedente fica ----------
create or replace function pkm_trainer_add_xp(p_token uuid, p_id uuid, p_amount numeric)
returns pkm_trainers
language plpgsql security definer set search_path = public
as $$
declare
  v_row pkm_trainers;
  v_level int;
  v_xp numeric;
begin
  perform pkm_assert_master(p_token);
  if p_amount is null or p_amount <= 0 then raise exception 'quantidade de XP inválida'; end if;

  select * into v_row from pkm_trainers where id = p_id for update;
  if not found then raise exception 'treinador não encontrado'; end if;

  v_level := v_row.level;
  v_xp := v_row.xp + p_amount;
  while v_xp >= v_level * 10 loop
    v_xp := v_xp - v_level * 10;
    v_level := v_level + 1;
  end loop;

  update pkm_trainers set level = v_level, xp = v_xp, updated_at = now()
  where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function pkm_trainer_add_xp(uuid, uuid, numeric) to anon, authenticated;

-- ---------- dano / cura (mestre): delta negativo = dano ----------
create or replace function pkm_trainer_hp(p_token uuid, p_id uuid, p_delta int)
returns pkm_trainers
language plpgsql security definer set search_path = public
as $$
declare v_row pkm_trainers;
begin
  perform pkm_assert_master(p_token);
  update pkm_trainers
     set hp_current = least(greatest(hp_current + coalesce(p_delta, 0), 0), 30 + fisico),
         updated_at = now()
   where id = p_id
  returning * into v_row;
  if not found then raise exception 'treinador não encontrado'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_trainer_hp(uuid, uuid, int) to anon, authenticated;

-- ---------- apagar (mestre) ----------
create or replace function pkm_delete_trainer(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_assert_master(p_token);
  delete from pkm_trainers where id = p_id;
end;
$$;
grant execute on function pkm_delete_trainer(uuid, uuid) to anon, authenticated;

-- ---------- o que o jogador pode mexer: anotações e foto ----------
create or replace function pkm_trainer_set_notes(p_id uuid, p_notes text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if char_length(coalesce(p_notes, '')) > 20000 then raise exception 'anotação grande demais'; end if;
  update pkm_trainers set notes = coalesce(p_notes, ''), updated_at = now() where id = p_id;
  if not found then raise exception 'treinador não encontrado'; end if;
end;
$$;
grant execute on function pkm_trainer_set_notes(uuid, text) to anon, authenticated;

create or replace function pkm_trainer_set_photo(p_id uuid, p_image_url text, p_image_src_url text, p_image_frame jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_check_image_url(p_image_url);
  perform pkm_check_image_url(p_image_src_url);
  update pkm_trainers
     set image_url = p_image_url, image_src_url = p_image_src_url, image_frame = p_image_frame, updated_at = now()
   where id = p_id;
  if not found then raise exception 'treinador não encontrado'; end if;
end;
$$;
grant execute on function pkm_trainer_set_photo(uuid, text, text, jsonb) to anon, authenticated;
