-- Projeto Cat & Dog (id catdog) — Temas visuais
-- Só acrescenta (tabelas novas, uma coluna, funções novas, um tipo novo no extrato). Nada existente é apagado.
--
-- Níveis: padrão (grátis) · simples · raro · lendário · mítico.
-- Simples/raro/lendário: cada lado COMPRA com as próprias moedas e EQUIPA o seu tema (um não muda a tela do outro).
-- Mítico ("conjunto"): cada lado deposita moedas SUAS num cofre do tema; quando os DOIS chegam na meta, o tema
-- é liberado para os dois (cada um equipa o seu). Antes de liberar, quem depositou pode retirar.
-- O preço de cada tema fica aqui no banco (catdog_theme_catalog): o app só mostra, quem manda é o servidor.
-- Os visuais (cores, animações) ficam no app: catdog/js/themes.js e catdog/css/themes.css.

-- ---------- extrato: tipo novo ----------
alter table catdog_coin_log drop constraint if exists catdog_coin_log_kind_check;
alter table catdog_coin_log add constraint catdog_coin_log_kind_check
  check (kind in ('task', 'adjust', 'reward', 'refund', 'streak', 'focus', 'theme'));

-- ---------- catálogo (preço por tema; no mítico = meta de CADA lado) ----------
create table if not exists catdog_theme_catalog (
  id text primary key,
  tier text not null check (tier in ('padrao', 'simples', 'raro', 'lendario', 'mitico')),
  price int not null check (price >= 0)
);
insert into catdog_theme_catalog (id, tier, price) values
  ('meia-noite', 'padrao', 0),
  ('oceano', 'simples', 40), ('floresta', 'simples', 40), ('brasa', 'simples', 40), ('algodao-doce', 'simples', 40), ('ouro-velho', 'simples', 40),
  ('aurora', 'raro', 150), ('pulso-neon', 'raro', 150), ('chuva-estrelas', 'raro', 150), ('lava-lamp', 'raro', 150), ('mare', 'raro', 150),
  ('cyberpunk', 'lendario', 500), ('abismo', 'lendario', 500), ('floresta-encantada', 'lendario', 500), ('cosmos', 'lendario', 500), ('arcade', 'lendario', 500),
  ('eclipse', 'mitico', 600), ('yin-yang', 'mitico', 600), ('telhados', 'mitico', 600)
on conflict (id) do nothing;

-- ---------- temas de cada lado ----------
create table if not exists catdog_theme_owned (
  side text not null check (side in ('gato', 'cao')),
  theme_id text not null references catdog_theme_catalog(id),
  source text not null check (source in ('compra', 'cofre')),
  paid int not null default 0,
  created_at timestamptz not null default now(),
  primary key (side, theme_id)
);

-- cofre dos temas míticos: quanto cada lado já depositou
create table if not exists catdog_theme_vault (
  side text not null check (side in ('gato', 'cao')),
  theme_id text not null references catdog_theme_catalog(id),
  amount int not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (side, theme_id)
);

alter table catdog_settings add column if not exists theme text not null default 'meia-noite';

alter table catdog_theme_catalog enable row level security;
alter table catdog_theme_owned enable row level security;
alter table catdog_theme_vault enable row level security;
drop policy if exists "catdog_theme_catalog_select_public" on catdog_theme_catalog;
create policy "catdog_theme_catalog_select_public" on catdog_theme_catalog for select using (true);
drop policy if exists "catdog_theme_owned_select_public" on catdog_theme_owned;
create policy "catdog_theme_owned_select_public" on catdog_theme_owned for select using (true);
drop policy if exists "catdog_theme_vault_select_public" on catdog_theme_vault;
create policy "catdog_theme_vault_select_public" on catdog_theme_vault for select using (true);

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['catdog_theme_owned', 'catdog_theme_vault'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- comprar (simples, raro, lendário) ----------
create or replace function catdog_buy_theme(p_side text, p_token uuid, p_theme text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c catdog_theme_catalog;
  v_bal int;
begin
  perform catdog_assert_side(p_side, p_token);
  perform pg_advisory_xact_lock(hashtext('catdog_wallet_' || p_side));
  select * into c from catdog_theme_catalog where id = p_theme;
  if not found then raise exception 'tema não encontrado'; end if;
  if c.tier = 'padrao' then raise exception 'esse tema já é seu'; end if;
  if c.tier = 'mitico' then raise exception 'tema mítico: deposite no cofre com o outro lado'; end if;
  if exists (select 1 from catdog_theme_owned where side = p_side and theme_id = p_theme) then raise exception 'você já tem esse tema'; end if;

  select coalesce(sum(amount), 0) into v_bal from catdog_coin_log where side = p_side;
  if v_bal < c.price then raise exception 'moedas insuficientes: faltam %', c.price - v_bal; end if;

  insert into catdog_theme_owned (side, theme_id, source, paid) values (p_side, p_theme, 'compra', c.price);
  insert into catdog_coin_log (side, amount, kind, note) values (p_side, -c.price, 'theme', left('Tema: ' || p_theme, 200));
end;
$$;
grant execute on function catdog_buy_theme(text, uuid, text) to anon, authenticated;

-- ---------- equipar ----------
create or replace function catdog_equip_theme(p_side text, p_token uuid, p_theme text)
returns void
language plpgsql security definer set search_path = public
as $$
declare c catdog_theme_catalog;
begin
  perform catdog_assert_side(p_side, p_token);
  select * into c from catdog_theme_catalog where id = p_theme;
  if not found then raise exception 'tema não encontrado'; end if;
  if c.tier <> 'padrao' and not exists (select 1 from catdog_theme_owned where side = p_side and theme_id = p_theme) then
    raise exception 'você ainda não tem esse tema';
  end if;
  update catdog_settings set theme = p_theme, updated_at = now() where side = p_side;
end;
$$;
grant execute on function catdog_equip_theme(text, uuid, text) to anon, authenticated;

-- ---------- cofre dos míticos ----------
create or replace function catdog_vault_deposit(p_side text, p_token uuid, p_theme text, p_amount int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c catdog_theme_catalog;
  v_bal int;
  v_have int;
  v_other int;
begin
  perform catdog_assert_side(p_side, p_token);
  perform pg_advisory_xact_lock(hashtext('catdog_wallet_' || p_side));
  perform pg_advisory_xact_lock(hashtext('catdog_theme_' || p_theme));
  select * into c from catdog_theme_catalog where id = p_theme;
  if not found or c.tier <> 'mitico' then raise exception 'esse tema não tem cofre'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'informe quantas moedas depositar'; end if;
  if exists (select 1 from catdog_theme_owned where side = p_side and theme_id = p_theme) then raise exception 'esse tema já foi liberado'; end if;

  select coalesce(amount, 0) into v_have from catdog_theme_vault where side = p_side and theme_id = p_theme;
  v_have := coalesce(v_have, 0);
  if v_have + p_amount > c.price then raise exception 'a sua parte do cofre é de % moedas (faltam %)', c.price, c.price - v_have; end if;

  select coalesce(sum(amount), 0) into v_bal from catdog_coin_log where side = p_side;
  if v_bal < p_amount then raise exception 'moedas insuficientes: faltam %', p_amount - v_bal; end if;

  insert into catdog_theme_vault (side, theme_id, amount) values (p_side, p_theme, p_amount)
  on conflict (side, theme_id) do update set amount = catdog_theme_vault.amount + p_amount, updated_at = now();
  insert into catdog_coin_log (side, amount, kind, note) values (p_side, -p_amount, 'theme', left('Cofre: ' || p_theme, 200));

  -- os dois completaram a meta: libera o tema para os dois
  select coalesce(amount, 0) into v_other from catdog_theme_vault where side = (case p_side when 'gato' then 'cao' else 'gato' end) and theme_id = p_theme;
  if v_have + p_amount >= c.price and coalesce(v_other, 0) >= c.price then
    insert into catdog_theme_owned (side, theme_id, source, paid) values ('gato', p_theme, 'cofre', c.price), ('cao', p_theme, 'cofre', c.price)
    on conflict do nothing;
  end if;
end;
$$;
grant execute on function catdog_vault_deposit(text, uuid, text, int) to anon, authenticated;

create or replace function catdog_vault_withdraw(p_side text, p_token uuid, p_theme text, p_amount int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_have int;
begin
  perform catdog_assert_side(p_side, p_token);
  perform pg_advisory_xact_lock(hashtext('catdog_wallet_' || p_side));
  perform pg_advisory_xact_lock(hashtext('catdog_theme_' || p_theme));
  if exists (select 1 from catdog_theme_owned where side = p_side and theme_id = p_theme) then raise exception 'esse tema já foi liberado: as moedas foram gastas'; end if;
  select amount into v_have from catdog_theme_vault where side = p_side and theme_id = p_theme for update;
  if coalesce(v_have, 0) < 1 then raise exception 'você não tem moedas nesse cofre'; end if;
  if p_amount is null or p_amount < 1 or p_amount > v_have then raise exception 'você pode retirar de 1 a % moedas', v_have; end if;
  update catdog_theme_vault set amount = amount - p_amount, updated_at = now() where side = p_side and theme_id = p_theme;
  insert into catdog_coin_log (side, amount, kind, note) values (p_side, p_amount, 'theme', left('Cofre (retirada): ' || p_theme, 200));
end;
$$;
grant execute on function catdog_vault_withdraw(text, uuid, text, int) to anon, authenticated;
