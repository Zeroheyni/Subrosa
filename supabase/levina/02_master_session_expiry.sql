-- ============================================================
-- Sessão de mestre: de 24h pra 90 dias.
-- Antes disso ficava pedindo o PIN de novo toda hora sem
-- necessidade real de segurança extra (é um app pra um grupo
-- fechado de amigos). O app detecta quando expira mesmo e
-- desloga automaticamente (ver index.html, handleExpiredMasterSession).
-- ============================================================
alter table master_sessions alter column expires_at set default (now() + '90 days'::interval);
