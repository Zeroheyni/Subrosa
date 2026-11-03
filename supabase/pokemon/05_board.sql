-- ============================================================
-- POKÉMON — pontos gastos pelo jogador, alcance das técnicas e tabuleiro
--
-- 1) pkm_trainer_spend_points: o jogador soma pontos nos atributos (só o que
--    sobra de 10 + 2 por nível; nunca tira). Sem token, como anotações e fotos.
-- 2) pkm_techniques.reach: alcance da técnica em blocos (1 a 30).
-- 3) pkm_battle_move: o jogador move a peça da criatura que está agindo (1 PA).
--    O tabuleiro vive dentro de pkm_battles.state (board: cols, rows, bg, pos).
--
-- Só acrescenta; pkm_save_technique é recriada aceitando o campo novo.
-- Depende de 01 e 04.
-- ============================================================

-- ---------- 1) jogador gasta pontos de atributo ----------
create or replace function pkm_trainer_spend_points(p_id uuid, p_add jsonb)
returns pkm_trainers
language plpgsql security definer set search_path = public
as $$
declare
  v_row pkm_trainers;
  v_left int;
  v_total int := 0;
  v_key text;
  v_val int;
begin
  if p_add is null or jsonb_typeof(p_add) <> 'object' then raise exception 'pedido inválido'; end if;
  for v_key in select jsonb_object_keys(p_add) loop
    if v_key not in ('carisma', 'aparencia', 'resistencia', 'mental', 'fisico') then raise exception 'atributo inválido: %', v_key; end if;
    v_val := (p_add->>v_key)::int;
    if v_val is null or v_val < 0 then raise exception 'quantidade inválida'; end if;
    v_total := v_total + v_val;
  end loop;
  if v_total <= 0 then raise exception 'nenhum ponto para gastar'; end if;

  select * into v_row from pkm_trainers where id = p_id for update;
  if not found then raise exception 'treinador não encontrado'; end if;

  v_left := 10 + 2 * (v_row.level - 1) - (v_row.carisma + v_row.aparencia + v_row.resistencia + v_row.mental + v_row.fisico);
  if v_total > v_left then raise exception 'você só tem % ponto(s) para distribuir', greatest(v_left, 0); end if;

  update pkm_trainers set
    carisma = carisma + coalesce((p_add->>'carisma')::int, 0),
    aparencia = aparencia + coalesce((p_add->>'aparencia')::int, 0),
    resistencia = resistencia + coalesce((p_add->>'resistencia')::int, 0),
    mental = mental + coalesce((p_add->>'mental')::int, 0),
    fisico = fisico + coalesce((p_add->>'fisico')::int, 0),
    updated_at = now()
  where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function pkm_trainer_spend_points(uuid, jsonb) to anon, authenticated;

-- ---------- 2) alcance das técnicas ----------
alter table pkm_techniques add column if not exists reach int not null default 1 check (reach between 1 and 30);

create or replace function pkm_save_technique(p_token uuid, p_id uuid, p_data jsonb)
returns pkm_techniques
language plpgsql security definer set search_path = public
as $$
declare v_row pkm_techniques;
begin
  perform pkm_assert_master(p_token);

  if p_id is null then
    insert into pkm_techniques (name, type, category, power, pa_cost, reach, description)
    values (
      btrim(p_data->>'name'),
      p_data->>'type',
      coalesce(p_data->>'category', 'fisico'),
      (p_data->>'power')::int,
      coalesce((p_data->>'pa_cost')::int, 1),
      coalesce((p_data->>'reach')::int, 1),
      coalesce(p_data->>'description', '')
    )
    returning * into v_row;
    return v_row;
  end if;

  update pkm_techniques set
    name = coalesce(btrim(p_data->>'name'), name),
    type = coalesce(p_data->>'type', type),
    category = coalesce(p_data->>'category', category),
    power = coalesce((p_data->>'power')::int, power),
    pa_cost = coalesce((p_data->>'pa_cost')::int, pa_cost),
    reach = coalesce((p_data->>'reach')::int, reach),
    description = coalesce(p_data->>'description', description),
    updated_at = now()
  where id = p_id
  returning * into v_row;
  if not found then raise exception 'técnica não encontrada'; end if;
  return v_row;
end;
$$;
grant execute on function pkm_save_technique(uuid, uuid, jsonb) to anon, authenticated;

-- ---------- 3) mover a peça de quem está agindo (sem token; o limite de blocos o app confere) ----------
create or replace function pkm_battle_move(p_id uuid, p_creature uuid, p_x int, p_y int, p_text text)
returns pkm_battles
language plpgsql security definer set search_path = public
as $$
declare
  v_row pkm_battles;
  v_st jsonb;
  v_cols int;
  v_rows int;
  v_pa int;
  v_log jsonb;
begin
  select * into v_row from pkm_battles where id = p_id for update;
  if not found then raise exception 'combate não encontrado'; end if;
  if v_row.status <> 'active' then raise exception 'o combate já acabou'; end if;
  v_st := v_row.state;
  if v_st->'board' is null or jsonb_typeof(v_st->'board') <> 'object' then raise exception 'esse combate não tem tabuleiro'; end if;
  if jsonb_typeof(v_st->'winner') = 'number' then raise exception 'o combate já tem vencedor'; end if;
  if jsonb_array_length(coalesce(v_st->'pending', '[]'::jsonb)) > 0 then raise exception 'aguardando a substituição'; end if;
  if (v_st->'queue'->>0) is distinct from p_creature::text then raise exception 'não é a vez dessa criatura'; end if;

  v_pa := coalesce((v_st->>'pa')::int, 0);
  if v_pa < 1 then raise exception 'sem PA para se mover'; end if;

  v_cols := (v_st->'board'->>'cols')::int;
  v_rows := (v_st->'board'->>'rows')::int;
  if p_x is null or p_y is null or p_x < 0 or p_y < 0 or p_x >= v_cols or p_y >= v_rows then raise exception 'fora do tabuleiro'; end if;

  if exists (
    select 1 from jsonb_each(coalesce(v_st->'board'->'pos', '{}'::jsonb)) e
     where e.key <> p_creature::text and (e.value->>0)::int = p_x and (e.value->>1)::int = p_y
  ) then raise exception 'essa casa está ocupada'; end if;

  v_log := coalesce(v_st->'log', '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object('r', coalesce((v_st->>'round')::int, 1), 't', left(coalesce(nullif(btrim(p_text), ''), 'se moveu'), 200)));
  if jsonb_array_length(v_log) > 300 then
    select jsonb_agg(x order by ord) into v_log
      from jsonb_array_elements(v_log) with ordinality t(x, ord)
     where ord > jsonb_array_length(v_log) - 300;
  end if;

  v_st := jsonb_set(v_st, '{pa}', to_jsonb(v_pa - 1));
  v_st := jsonb_set(v_st, '{board,pos}',
            jsonb_set(coalesce(v_st->'board'->'pos', '{}'::jsonb), array[p_creature::text], jsonb_build_array(p_x, p_y)));
  v_st := jsonb_set(v_st, '{log}', v_log);

  update pkm_battles set state = v_st, updated_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function pkm_battle_move(uuid, uuid, int, int, text) to anon, authenticated;
