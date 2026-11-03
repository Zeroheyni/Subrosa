-- ============================================================
-- POKÉMON — espécies (bestiário) e criaturas
--
-- Espécie: criada pelo mestre; guarda os tipos (1 a 3) e o Potencial (1 a 10)
-- de cada um dos 9 atributos. Criatura: um indivíduo de uma espécie, com nível,
-- XP, IVs sorteados (1 a 20, um por atributo), dono e vaga.
--
-- Os atributos finais NÃO são guardados: o app calcula
--   arredondar(B(nível) × Potencial ÷ 5 × M(IV)).
-- hp_current nulo = vida cheia (assim o HP acompanha o nível sozinho).
-- Vaga 0 a 2 = equipe carregada; vaga nula = PC. Sem dono = criatura solta.
--
-- Leitura pública; escrita só por RPC. Mestre exige o token da sessão;
-- o jogador só mexe em foto e anotações de criatura (sem token), como nos treinadores.
-- Depende de 01_trainers.sql (pkm_trainers, pkm_assert_master, pkm_check_image_url).
-- ============================================================

-- ---------- helper: lista de tipos válida (1 a 3, sem repetir, só os 23 do guia) ----------
create or replace function pkm_valid_types(p_types text[])
returns boolean
language sql immutable
as $$
  select p_types is not null
     and cardinality(p_types) between 1 and 3
     and (select count(distinct t) from unnest(p_types) t) = cardinality(p_types)
     and p_types <@ array['Normal','Fogo','Água','Planta','Gelo','Inseto','Voador','Veneno','Elétrico','Físico',
                          'Fantasma','Sombrio','Mente','Magia','Dragão','Metal','Terra','Luz','Espaço','Tempo',
                          'Sangue','Cristal','Som'];
$$;

-- ---------- espécies ----------
create table if not exists pkm_species (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  types text[] not null check (pkm_valid_types(types)),
  pot_vit smallint not null default 5 check (pot_vit between 1 and 10),
  pot_forca smallint not null default 5 check (pot_forca between 1 and 10),
  pot_destreza smallint not null default 5 check (pot_destreza between 1 and 10),
  pot_deffis smallint not null default 5 check (pot_deffis between 1 and 10),
  pot_defesp smallint not null default 5 check (pot_defesp between 1 and 10),
  pot_velocidade smallint not null default 5 check (pot_velocidade between 1 and 10),
  pot_evasao smallint not null default 5 check (pot_evasao between 1 and 10),
  pot_percepcao smallint not null default 5 check (pot_percepcao between 1 and 10),
  pot_precisao smallint not null default 5 check (pot_precisao between 1 and 10),
  description text not null default '',
  image_url text,
  image_src_url text,
  image_frame jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pkm_species_name_uq on pkm_species (lower(btrim(name)));

-- ---------- criaturas ----------
create table if not exists pkm_creatures (
  id uuid primary key default gen_random_uuid(),
  species_id uuid not null references pkm_species(id) on delete restrict,
  nickname text not null default '' check (char_length(nickname) <= 80),
  level int not null default 1 check (level between 1 and 100),
  xp int not null default 0 check (xp >= 0),                -- XP dentro do nível atual
  iv_vit smallint not null check (iv_vit between 1 and 20),
  iv_forca smallint not null check (iv_forca between 1 and 20),
  iv_destreza smallint not null check (iv_destreza between 1 and 20),
  iv_deffis smallint not null check (iv_deffis between 1 and 20),
  iv_defesp smallint not null check (iv_defesp between 1 and 20),
  iv_velocidade smallint not null check (iv_velocidade between 1 and 20),
  iv_evasao smallint not null check (iv_evasao between 1 and 20),
  iv_percepcao smallint not null check (iv_percepcao between 1 and 20),
  iv_precisao smallint not null check (iv_precisao between 1 and 20),
  hp_current int check (hp_current is null or hp_current >= 0),   -- nulo = vida cheia
  trainer_id uuid references pkm_trainers(id) on delete set null,  -- apagar o treinador solta as criaturas
  slot smallint check (slot is null or slot between 0 and 2),      -- 0 a 2 = equipe; nulo = PC
  notes text not null default '',
  image_url text,
  image_src_url text,
  image_frame jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pkm_creatures_slot_uq on pkm_creatures (trainer_id, slot) where slot is not null;
create index if not exists pkm_creatures_trainer_idx on pkm_creatures (trainer_id);
create index if not exists pkm_creatures_species_idx on pkm_creatures (species_id);

alter table pkm_species enable row level security;
drop policy if exists "pkm_species_select_public" on pkm_species;
create policy "pkm_species_select_public" on pkm_species for select using (true);

alter table pkm_creatures enable row level security;
drop policy if exists "pkm_creatures_select_public" on pkm_creatures;
create policy "pkm_creatures_select_public" on pkm_creatures for select using (true);

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['pkm_species', 'pkm_creatures'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- espécie: criar / editar (mestre). Só mexe nos campos presentes em p_data ----------
create or replace function pkm_save_species(p_token uuid, p_id uuid, p_data jsonb)
returns pkm_species
language plpgsql security definer set search_path = public
as $$
declare
  v_row pkm_species;
  v_types text[];
begin
  perform pkm_assert_master(p_token);

  if p_data ? 'types' then
    v_types := array(select jsonb_array_elements_text(p_data->'types'));
    if not pkm_valid_types(v_types) then raise exception 'tipos inválidos (de 1 a 3 tipos diferentes)'; end if;
  end if;

  if p_id is null then
    if v_types is null then raise exception 'escolha pelo menos um tipo'; end if;
    insert into pkm_species (name, types, description,
                             pot_vit, pot_forca, pot_destreza, pot_deffis, pot_defesp,
                             pot_velocidade, pot_evasao, pot_percepcao, pot_precisao)
    values (
      btrim(p_data->>'name'), v_types, coalesce(p_data->>'description', ''),
      coalesce((p_data->>'pot_vit')::int, 5),
      coalesce((p_data->>'pot_forca')::int, 5),
      coalesce((p_data->>'pot_destreza')::int, 5),
      coalesce((p_data->>'pot_deffis')::int, 5),
      coalesce((p_data->>'pot_defesp')::int, 5),
      coalesce((p_data->>'pot_velocidade')::int, 5),
      coalesce((p_data->>'pot_evasao')::int, 5),
      coalesce((p_data->>'pot_percepcao')::int, 5),
      coalesce((p_data->>'pot_precisao')::int, 5)
    )
    returning * into v_row;
    return v_row;
  end if;

  update pkm_species set
    name = coalesce(btrim(p_data->>'name'), name),
    types = coalesce(v_types, types),
    description = coalesce(p_data->>'description', description),
    pot_vit = coalesce((p_data->>'pot_vit')::int, pot_vit),
    pot_forca = coalesce((p_data->>'pot_forca')::int, pot_forca),
    pot_destreza = coalesce((p_data->>'pot_destreza')::int, pot_destreza),
    pot_deffis = coalesce((p_data->>'pot_deffis')::int, pot_deffis),
    pot_defesp = coalesce((p_data->>'pot_defesp')::int, pot_defesp),
    pot_velocidade = coalesce((p_data->>'pot_velocidade')::int, pot_velocidade),
    pot_evasao = coalesce((p_data->>'pot_evasao')::int, pot_evasao),
    pot_percepcao = coalesce((p_data->>'pot_percepcao')::int, pot_percepcao),
    pot_precisao = coalesce((p_data->>'pot_precisao')::int, pot_precisao),
    updated_at = now()
  where id = p_id
  returning * into v_row;
  if not found then raise exception 'espécie não encontrada'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_save_species(uuid, uuid, jsonb) to anon, authenticated;

create or replace function pkm_delete_species(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_assert_master(p_token);
  if exists (select 1 from pkm_creatures where species_id = p_id) then
    raise exception 'ainda existem criaturas dessa espécie — apague ou troque a espécie delas antes';
  end if;
  delete from pkm_species where id = p_id;
end;
$$;
grant execute on function pkm_delete_species(uuid, uuid) to anon, authenticated;

create or replace function pkm_species_set_photo(p_token uuid, p_id uuid, p_image_url text, p_image_src_url text, p_image_frame jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_assert_master(p_token);
  perform pkm_check_image_url(p_image_url);
  perform pkm_check_image_url(p_image_src_url);
  update pkm_species
     set image_url = p_image_url, image_src_url = p_image_src_url, image_frame = p_image_frame, updated_at = now()
   where id = p_id;
  if not found then raise exception 'espécie não encontrada'; end if;
end;
$$;
grant execute on function pkm_species_set_photo(uuid, uuid, text, text, jsonb) to anon, authenticated;

-- ---------- criatura: criar / editar (mestre). Dono e vaga mudam por pkm_creature_move ----------
-- Na criação, IV ausente é sorteado aqui (1 a 20). Com dono, ocupa a primeira vaga livre da
-- equipe (0 a 2) ou vai pro PC se a equipe estiver cheia.
create or replace function pkm_save_creature(p_token uuid, p_id uuid, p_data jsonb)
returns pkm_creatures
language plpgsql security definer set search_path = public
as $$
declare
  v_row pkm_creatures;
  v_trainer uuid;
  v_slot smallint;
  v_species uuid;
begin
  perform pkm_assert_master(p_token);

  if p_data ? 'species_id' then
    v_species := (p_data->>'species_id')::uuid;
    if not exists (select 1 from pkm_species where id = v_species) then raise exception 'espécie não encontrada'; end if;
  end if;

  if p_id is null then
    if v_species is null then raise exception 'escolha a espécie'; end if;
    v_trainer := nullif(p_data->>'trainer_id', '')::uuid;
    if v_trainer is not null then
      if not exists (select 1 from pkm_trainers where id = v_trainer) then raise exception 'treinador não encontrado'; end if;
      select min(s) into v_slot
        from generate_series(0, 2) s
       where not exists (select 1 from pkm_creatures c where c.trainer_id = v_trainer and c.slot = s);
    end if;

    insert into pkm_creatures (species_id, nickname, level, xp, hp_current, trainer_id, slot,
                               iv_vit, iv_forca, iv_destreza, iv_deffis, iv_defesp,
                               iv_velocidade, iv_evasao, iv_percepcao, iv_precisao)
    values (
      v_species,
      btrim(coalesce(p_data->>'nickname', '')),
      coalesce((p_data->>'level')::int, 1),
      coalesce((p_data->>'xp')::int, 0),
      (p_data->>'hp_current')::int,
      v_trainer, v_slot,
      coalesce((p_data->>'iv_vit')::int, 1 + floor(random() * 20)::int),
      coalesce((p_data->>'iv_forca')::int, 1 + floor(random() * 20)::int),
      coalesce((p_data->>'iv_destreza')::int, 1 + floor(random() * 20)::int),
      coalesce((p_data->>'iv_deffis')::int, 1 + floor(random() * 20)::int),
      coalesce((p_data->>'iv_defesp')::int, 1 + floor(random() * 20)::int),
      coalesce((p_data->>'iv_velocidade')::int, 1 + floor(random() * 20)::int),
      coalesce((p_data->>'iv_evasao')::int, 1 + floor(random() * 20)::int),
      coalesce((p_data->>'iv_percepcao')::int, 1 + floor(random() * 20)::int),
      coalesce((p_data->>'iv_precisao')::int, 1 + floor(random() * 20)::int)
    )
    returning * into v_row;
    return v_row;
  end if;

  update pkm_creatures set
    species_id = coalesce(v_species, species_id),
    nickname = case when p_data ? 'nickname' then btrim(coalesce(p_data->>'nickname', '')) else nickname end,
    level = coalesce((p_data->>'level')::int, level),
    xp = coalesce((p_data->>'xp')::int, xp),
    hp_current = case when p_data ? 'hp_current' then (p_data->>'hp_current')::int else hp_current end,
    iv_vit = coalesce((p_data->>'iv_vit')::int, iv_vit),
    iv_forca = coalesce((p_data->>'iv_forca')::int, iv_forca),
    iv_destreza = coalesce((p_data->>'iv_destreza')::int, iv_destreza),
    iv_deffis = coalesce((p_data->>'iv_deffis')::int, iv_deffis),
    iv_defesp = coalesce((p_data->>'iv_defesp')::int, iv_defesp),
    iv_velocidade = coalesce((p_data->>'iv_velocidade')::int, iv_velocidade),
    iv_evasao = coalesce((p_data->>'iv_evasao')::int, iv_evasao),
    iv_percepcao = coalesce((p_data->>'iv_percepcao')::int, iv_percepcao),
    iv_precisao = coalesce((p_data->>'iv_precisao')::int, iv_precisao),
    updated_at = now()
  where id = p_id
  returning * into v_row;
  if not found then raise exception 'criatura não encontrada'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_save_creature(uuid, uuid, jsonb) to anon, authenticated;

-- ---------- mover: dar a um treinador / tirar do dono, equipe (vaga 0 a 2) ou PC (vaga nula) ----------
-- Vaga ocupada: o ocupante troca de lugar com quem está sendo movido (ou vai pro PC).
create or replace function pkm_creature_move(p_token uuid, p_id uuid, p_trainer_id uuid, p_slot int)
returns pkm_creatures
language plpgsql security definer set search_path = public
as $$
declare
  v_me pkm_creatures;
  v_occ pkm_creatures;
  v_old_trainer uuid;
  v_old_slot smallint;
begin
  perform pkm_assert_master(p_token);
  select * into v_me from pkm_creatures where id = p_id for update;
  if not found then raise exception 'criatura não encontrada'; end if;

  if p_trainer_id is null then
    update pkm_creatures set trainer_id = null, slot = null, updated_at = now()
     where id = p_id returning * into v_me;
    return v_me;
  end if;

  if not exists (select 1 from pkm_trainers where id = p_trainer_id) then raise exception 'treinador não encontrado'; end if;
  if p_slot is not null and p_slot not between 0 and 2 then raise exception 'vaga inválida'; end if;

  if p_slot is null then
    update pkm_creatures set trainer_id = p_trainer_id, slot = null, updated_at = now()
     where id = p_id returning * into v_me;
    return v_me;
  end if;

  v_old_trainer := v_me.trainer_id;
  v_old_slot := v_me.slot;

  select * into v_occ from pkm_creatures
   where trainer_id = p_trainer_id and slot = p_slot and id <> p_id for update;
  if found then
    update pkm_creatures set slot = null, updated_at = now() where id = v_occ.id;   -- libera a vaga
  end if;

  update pkm_creatures set trainer_id = p_trainer_id, slot = p_slot, updated_at = now()
   where id = p_id returning * into v_me;

  -- o ocupante assume a vaga que ficou livre (se era da mesma equipe); senão fica no PC do mesmo treinador
  if v_occ.id is not null and v_old_trainer is not distinct from p_trainer_id and v_old_slot is not null then
    update pkm_creatures set slot = v_old_slot, updated_at = now() where id = v_occ.id;
  end if;
  return v_me;
end;
$$;
grant execute on function pkm_creature_move(uuid, uuid, uuid, int) to anon, authenticated;

-- ---------- HP (mestre): valor absoluto; nulo = vida cheia ----------
create or replace function pkm_creature_set_hp(p_token uuid, p_id uuid, p_hp int)
returns pkm_creatures
language plpgsql security definer set search_path = public
as $$
declare v_row pkm_creatures;
begin
  perform pkm_assert_master(p_token);
  update pkm_creatures set hp_current = case when p_hp is null then null else greatest(p_hp, 0) end, updated_at = now()
   where id = p_id returning * into v_row;
  if not found then raise exception 'criatura não encontrada'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_creature_set_hp(uuid, uuid, int) to anon, authenticated;

-- ---------- XP (mestre): sobe de nível até o 100; o treinador ganha metade ----------
create or replace function pkm_creature_add_xp(p_token uuid, p_id uuid, p_amount int)
returns pkm_creatures
language plpgsql security definer set search_path = public
as $$
declare
  v_row pkm_creatures;
  v_level int;
  v_xp int;
begin
  perform pkm_assert_master(p_token);
  if p_amount is null or p_amount <= 0 then raise exception 'quantidade de XP inválida'; end if;

  select * into v_row from pkm_creatures where id = p_id for update;
  if not found then raise exception 'criatura não encontrada'; end if;

  v_level := v_row.level;
  v_xp := v_row.xp + p_amount;
  while v_level < 100 and v_xp >= v_level * 10 loop
    v_xp := v_xp - v_level * 10;
    v_level := v_level + 1;
  end loop;

  update pkm_creatures set level = v_level, xp = v_xp, updated_at = now()
   where id = p_id returning * into v_row;

  if v_row.trainer_id is not null then
    update pkm_trainers set creature_xp_total = creature_xp_total + p_amount, updated_at = now()
     where id = v_row.trainer_id;
    perform pkm_trainer_add_xp(p_token, v_row.trainer_id, p_amount / 2.0);
  end if;
  return v_row;
end;
$$;
grant execute on function pkm_creature_add_xp(uuid, uuid, int) to anon, authenticated;

create or replace function pkm_delete_creature(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_assert_master(p_token);
  delete from pkm_creatures where id = p_id;
end;
$$;
grant execute on function pkm_delete_creature(uuid, uuid) to anon, authenticated;

-- ---------- o que o jogador pode mexer na criatura: anotações e foto ----------
create or replace function pkm_creature_set_notes(p_id uuid, p_notes text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if char_length(coalesce(p_notes, '')) > 20000 then raise exception 'anotação grande demais'; end if;
  update pkm_creatures set notes = coalesce(p_notes, ''), updated_at = now() where id = p_id;
  if not found then raise exception 'criatura não encontrada'; end if;
end;
$$;
grant execute on function pkm_creature_set_notes(uuid, text) to anon, authenticated;

create or replace function pkm_creature_set_photo(p_id uuid, p_image_url text, p_image_src_url text, p_image_frame jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pkm_check_image_url(p_image_url);
  perform pkm_check_image_url(p_image_src_url);
  update pkm_creatures
     set image_url = p_image_url, image_src_url = p_image_src_url, image_frame = p_image_frame, updated_at = now()
   where id = p_id;
  if not found then raise exception 'criatura não encontrada'; end if;
end;
$$;
grant execute on function pkm_creature_set_photo(uuid, text, text, jsonb) to anon, authenticated;
