-- Projeto Pokémon — Pokédex do jogador + raridade das espécies
-- * pkm_species.registered: o jogador só vê no Bestiário as espécies registradas.
-- * pkm_species.rarity: comum 40, raro 50, mítico 60, lendário 70 pontos de Potencial (soma dos 9 atributos, máximo).
-- Só adiciona coluna e recria pkm_save_species (aceita rarity e registered; confere o limite de pontos
-- sempre que a raridade ou algum Potencial é enviado). Nada é apagado.

alter table pkm_species add column if not exists registered boolean not null default false;
alter table pkm_species add column if not exists rarity text not null default 'comum';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pkm_species_rarity_check') then
    alter table pkm_species add constraint pkm_species_rarity_check
      check (rarity in ('comum', 'raro', 'mitico', 'lendario'));
  end if;
end $$;

create or replace function pkm_rarity_points(p_rarity text)
returns int
language sql immutable
as $$
  select case p_rarity when 'comum' then 40 when 'raro' then 50 when 'mitico' then 60 when 'lendario' then 70 end;
$$;
grant execute on function pkm_rarity_points(text) to anon, authenticated;

create or replace function pkm_save_species(p_token uuid, p_id uuid, p_data jsonb)
returns pkm_species
language plpgsql security definer set search_path = public
as $$
declare
  v_row pkm_species;
  v_types text[];
  v_rarity text;
  v_limit int;
  v_sum int;
begin
  perform pkm_assert_master(p_token);

  if p_data ? 'types' then
    v_types := array(select jsonb_array_elements_text(p_data->'types'));
    if not pkm_valid_types(v_types) then raise exception 'tipos inválidos (de 1 a 3 tipos diferentes)'; end if;
  end if;
  if p_data ? 'rarity' and pkm_rarity_points(p_data->>'rarity') is null then
    raise exception 'raridade inválida';
  end if;

  if p_id is null then
    if v_types is null then raise exception 'escolha pelo menos um tipo'; end if;
    insert into pkm_species (name, types, description, rarity, registered,
                             pot_vit, pot_forca, pot_destreza, pot_deffis, pot_defesp,
                             pot_velocidade, pot_evasao, pot_percepcao, pot_precisao)
    values (
      btrim(p_data->>'name'), v_types, coalesce(p_data->>'description', ''),
      coalesce(p_data->>'rarity', 'comum'),
      coalesce((p_data->>'registered')::boolean, false),
      coalesce((p_data->>'pot_vit')::int, 4),
      coalesce((p_data->>'pot_forca')::int, 4),
      coalesce((p_data->>'pot_destreza')::int, 4),
      coalesce((p_data->>'pot_deffis')::int, 4),
      coalesce((p_data->>'pot_defesp')::int, 4),
      coalesce((p_data->>'pot_velocidade')::int, 4),
      coalesce((p_data->>'pot_evasao')::int, 4),
      coalesce((p_data->>'pot_percepcao')::int, 4),
      coalesce((p_data->>'pot_precisao')::int, 4)
    )
    returning * into v_row;
  else
    update pkm_species set
      name = coalesce(btrim(p_data->>'name'), name),
      types = coalesce(v_types, types),
      description = coalesce(p_data->>'description', description),
      rarity = coalesce(p_data->>'rarity', rarity),
      registered = coalesce((p_data->>'registered')::boolean, registered),
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
  end if;

  -- limite de pontos: só confere quando a raridade ou algum Potencial veio na chamada
  if p_id is null or p_data ? 'rarity' or p_data::text ~ '"pot_' then
    v_limit := pkm_rarity_points(v_row.rarity);
    v_sum := v_row.pot_vit + v_row.pot_forca + v_row.pot_destreza + v_row.pot_deffis + v_row.pot_defesp
           + v_row.pot_velocidade + v_row.pot_evasao + v_row.pot_percepcao + v_row.pot_precisao;
    if v_sum > v_limit then
      raise exception 'Potencial somando % pontos; o limite de % é %', v_sum, v_row.rarity, v_limit;
    end if;
  end if;
  return v_row;
end;
$$;
grant execute on function pkm_save_species(uuid, uuid, jsonb) to anon, authenticated;
