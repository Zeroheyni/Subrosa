-- ============================================================
-- LOGIN POR PIN DO HUB (vale pro site todo, todos os projetos)
--
-- Um PIN numérico entra direto no papel certo:
--   * PIN do MESTRE  -> papel 'master' + token de sessão (master_sessions, 90 dias)
--   * PIN do JOGADOR -> papel 'player'
-- Os PINs NUNCA ficam no código nem neste arquivo (o repositório é público):
-- só o hash (bcrypt) no banco.
--   - mestre:  game_secrets.pin_hash (id = 1)  — o mesmo que o master_login já usava
--   - jogador: hub_pins.pin_hash (role = 'player')
--
-- Trocar um PIN (rode no SQL, sem salvar o valor em arquivo):
--   update game_secrets set pin_hash = extensions.crypt('NOVO', extensions.gen_salt('bf')) where id = 1;
--   update hub_pins     set pin_hash = extensions.crypt('NOVO', extensions.gen_salt('bf')) where role = 'player';
--
-- Proteção contra chute: 8 PINs errados em 5 minutos trava as tentativas
-- por alguns minutos (vale pra todo mundo junto, já que não há como saber
-- quem está tentando). O erro volta como resposta normal (não como exceção)
-- porque uma exceção desfaria o registro da tentativa.
--
-- master_login (a função antiga, sem trava) perde o acesso público: o único
-- caminho de login passa a ser hub_login.
-- ============================================================

create table if not exists hub_pins (
  role text primary key check (role in ('player')),
  pin_hash text not null
);
alter table hub_pins enable row level security;   -- de propósito sem policy: ninguém lê pela API

create table if not exists hub_login_attempts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now()
);
alter table hub_login_attempts enable row level security;  -- idem

create or replace function hub_login(p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_master_hash text;
  v_player_hash text;
  v_token uuid;
  v_exp timestamptz;
begin
  delete from hub_login_attempts where at < now() - interval '1 day';

  if (select count(*) from hub_login_attempts where at > now() - interval '5 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  select pin_hash into v_master_hash from game_secrets where id = 1;
  select pin_hash into v_player_hash from hub_pins where role = 'player';

  if p_pin is not null and v_master_hash is not null and crypt(p_pin, v_master_hash) = v_master_hash then
    insert into master_sessions default values returning token, expires_at into v_token, v_exp;
    return jsonb_build_object('ok', true, 'role', 'master', 'token', v_token, 'expires_at', v_exp);
  end if;

  if p_pin is not null and v_player_hash is not null and crypt(p_pin, v_player_hash) = v_player_hash then
    return jsonb_build_object('ok', true, 'role', 'player');
  end if;

  insert into hub_login_attempts default values;
  return jsonb_build_object('ok', false, 'error', 'pin');
end;
$$;
grant execute on function hub_login(text) to anon, authenticated;

-- o login antigo só de mestre não tem trava de tentativas: fecha o acesso público
revoke execute on function master_login(text) from public, anon, authenticated;
