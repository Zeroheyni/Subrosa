-- ============================================================
-- ROLADOR DE DADOS
-- Registro compartilhado de rolagens, ao vivo pros dois lados.
-- O resultado é calculado no servidor (não no navegador) pra não
-- dar pra fraudar pelo console. Baixo risco, então sem exigir
-- token de mestre — igual ao resto do lado do jogador.
-- ============================================================

create table if not exists dice_rolls (
  id uuid primary key default gen_random_uuid(),
  roller text not null check (roller in ('cat','dog')),
  dice_type text not null check (dice_type in ('d2','d4','d6','d8','d10','d20','d100','custom')),
  custom_sides int,
  result int not null,
  created_at timestamptz not null default now()
);

alter table dice_rolls enable row level security;

drop policy if exists "dice_rolls_select_public" on dice_rolls;
create policy "dice_rolls_select_public" on dice_rolls
  for select
  using (true);

create or replace function roll_dice(p_roller text, p_dice_type text, p_custom_sides int default null)
returns dice_rolls
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sides int;
  v_result int;
  v_row dice_rolls;
begin
  if p_roller not in ('cat','dog') then
    raise exception 'roller invalido';
  end if;

  v_sides := case p_dice_type
    when 'd2' then 2
    when 'd4' then 4
    when 'd6' then 6
    when 'd8' then 8
    when 'd10' then 10
    when 'd20' then 20
    when 'd100' then 100
    when 'custom' then p_custom_sides
    else null
  end;

  if v_sides is null or v_sides < 2 or v_sides > 100000 then
    raise exception 'numero de lados invalido';
  end if;

  v_result := floor(random() * v_sides)::int + 1;

  insert into dice_rolls (roller, dice_type, custom_sides, result)
  values (p_roller, p_dice_type, case when p_dice_type = 'custom' then v_sides else null end, v_result)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function roll_dice(text, text, int) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dice_rolls'
  ) then
    alter publication supabase_realtime add table dice_rolls;
  end if;
end $$;
