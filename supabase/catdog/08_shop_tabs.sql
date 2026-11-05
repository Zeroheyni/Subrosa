-- Projeto Cat & Dog (id catdog) — Loja com abas de produtos, emote/imagem e cor da borda
-- Só acrescenta (tabela nova, colunas novas, funções novas; catdog_save_reward é atualizada e continua
-- aceitando exatamente o que aceitava antes). Nada existente é apagado.
--
-- Cada lado cria as PRÓPRIAS abas de produtos (ex.: "🍰 Doces", "🎮 Jogos"). Quem compra enxerga a loja do outro
-- com essas abas. Cada produto (recompensa) pode ter: uma aba, um emote OU uma imagem e uma cor de borda.
-- A imagem é guardada no próprio banco como "data URL" já reduzida pelo app (até ~150 mil caracteres);
-- não usa Storage nem libera envio público de arquivos.

create table if not exists catdog_shop_tabs (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('gato', 'cao')),
  name text not null check (char_length(btrim(name)) between 1 and 24),
  emoji text not null default '' check (char_length(emoji) <= 16),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists catdog_shop_tabs_owner_idx on catdog_shop_tabs (owner, position);

alter table catdog_rewards add column if not exists tab_id uuid references catdog_shop_tabs(id) on delete set null;
alter table catdog_rewards add column if not exists emoji text not null default '' check (char_length(emoji) <= 16);
alter table catdog_rewards add column if not exists image text check (image is null or (image like 'data:image/%' and char_length(image) <= 150000));
alter table catdog_rewards add column if not exists border_color text check (border_color is null or border_color ~ '^#[0-9a-fA-F]{6}$');

alter table catdog_shop_tabs enable row level security;
drop policy if exists "catdog_shop_tabs_select_public" on catdog_shop_tabs;
create policy "catdog_shop_tabs_select_public" on catdog_shop_tabs for select using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'catdog_shop_tabs') then
    alter publication supabase_realtime add table catdog_shop_tabs;
  end if;
end $$;

-- ---------- abas ----------
create or replace function catdog_save_shop_tab(p_side text, p_token uuid, p_id uuid, p_data jsonb)
returns catdog_shop_tabs
language plpgsql security definer set search_path = public
as $$
declare
  t catdog_shop_tabs;
  v_name text := left(btrim(coalesce(p_data->>'name', '')), 24);
  v_emoji text := left(btrim(coalesce(p_data->>'emoji', '')), 16);
begin
  perform catdog_assert_side(p_side, p_token);
  if char_length(v_name) < 1 then raise exception 'dê um nome à aba'; end if;
  if p_id is null then
    if (select count(*) from catdog_shop_tabs where owner = p_side) >= 12 then raise exception 'limite de 12 abas por loja'; end if;
    insert into catdog_shop_tabs (owner, name, emoji, position)
    values (p_side, v_name, v_emoji, coalesce((select max(position) from catdog_shop_tabs where owner = p_side), 0) + 1)
    returning * into t;
  else
    update catdog_shop_tabs set name = v_name, emoji = v_emoji where id = p_id and owner = p_side returning * into t;
    if not found then raise exception 'aba não encontrada'; end if;
  end if;
  return t;
end;
$$;
grant execute on function catdog_save_shop_tab(text, uuid, uuid, jsonb) to anon, authenticated;

-- apagar a aba NÃO apaga os produtos: eles ficam "sem aba"
create or replace function catdog_delete_shop_tab(p_side text, p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform catdog_assert_side(p_side, p_token);
  delete from catdog_shop_tabs where id = p_id and owner = p_side;
  if not found then raise exception 'aba não encontrada'; end if;
end;
$$;
grant execute on function catdog_delete_shop_tab(text, uuid, uuid) to anon, authenticated;

-- ---------- recompensas: agora com aba, emote, imagem e cor da borda ----------
-- Campos novos só mudam se a chave vier em p_data (quem não manda, não mexe). Vazio = limpar.
create or replace function catdog_save_reward(p_side text, p_token uuid, p_id uuid, p_data jsonb)
returns catdog_rewards
language plpgsql security definer set search_path = public
as $$
declare
  v_row catdog_rewards;
  v_title text;
  v_for text;
  v_price int;
  v_tab uuid;
  v_emoji text;
  v_image text;
  v_border text;
begin
  perform catdog_assert_side(p_side, p_token);
  v_title := btrim(coalesce(p_data->>'title', ''));
  if char_length(v_title) < 1 then raise exception 'dê um nome à recompensa'; end if;
  v_price := (p_data->>'price')::int;
  if v_price is null or v_price < 1 or v_price > 5000 then raise exception 'o preço vai de 1 a 5000 moedas'; end if;

  if p_id is not null then
    select * into v_row from catdog_rewards where id = p_id for update;
    if not found then raise exception 'recompensa não encontrada'; end if;
    if v_row.owner <> p_side then raise exception 'essa recompensa não é sua'; end if;
    v_tab := v_row.tab_id; v_emoji := v_row.emoji; v_image := v_row.image; v_border := v_row.border_color;
  else
    v_emoji := '';
  end if;

  if p_data ? 'tab_id' then
    v_tab := nullif(p_data->>'tab_id', '')::uuid;
    if v_tab is not null and not exists (select 1 from catdog_shop_tabs where id = v_tab and owner = p_side) then raise exception 'aba inválida'; end if;
  end if;
  if p_data ? 'emoji' then v_emoji := left(btrim(coalesce(p_data->>'emoji', '')), 16); end if;
  if p_data ? 'image' then
    v_image := nullif(p_data->>'image', '');
    if v_image is not null and (v_image not like 'data:image/%' or char_length(v_image) > 150000) then raise exception 'imagem inválida ou grande demais'; end if;
  end if;
  if p_data ? 'border_color' then
    v_border := nullif(p_data->>'border_color', '');
    if v_border is not null and v_border !~ '^#[0-9a-fA-F]{6}$' then raise exception 'cor da borda inválida'; end if;
  end if;

  if p_id is null then
    v_for := coalesce(nullif(p_data->>'for_side', ''), p_side);
    if v_for not in ('gato', 'cao') then raise exception 'lado inválido'; end if;
    insert into catdog_rewards (owner, for_side, title, description, price, once, tab_id, emoji, image, border_color)
    values (p_side, v_for, v_title, coalesce(p_data->>'description', ''), v_price, coalesce((p_data->>'once')::boolean, false), v_tab, v_emoji, v_image, v_border)
    returning * into v_row;
    return v_row;
  end if;

  update catdog_rewards set
    title = v_title,
    description = coalesce(p_data->>'description', description),
    price = v_price,
    once = coalesce((p_data->>'once')::boolean, once),
    active = coalesce((p_data->>'active')::boolean, active),
    tab_id = v_tab, emoji = v_emoji, image = v_image, border_color = v_border,
    updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function catdog_save_reward(text, uuid, uuid, jsonb) to anon, authenticated;
