-- Projeto Cat & Dog (id catdog) — Fase 4: agendador dos avisos
-- Instala pg_cron + pg_net (já disponíveis no projeto) e agenda catdog_ping() a cada 10 segundos.
-- catdog_ping() é barata: só chama a Edge Function catdog-push quando há algo novo para avisar.
-- Para desligar os avisos automáticos:  select cron.unschedule('catdog-ping');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- (re)agenda sem duplicar
do $$
begin
  if exists (select 1 from cron.job where jobname = 'catdog-ping') then
    perform cron.unschedule('catdog-ping');
  end if;
  perform cron.schedule('catdog-ping', '10 seconds', 'select public.catdog_ping()');
end $$;
