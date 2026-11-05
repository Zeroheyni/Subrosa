// ============================================================
// Edge Function: catdog-push  (projeto Cat & Dog)
// Envia notificações Web Push para os aparelhos inscritos em catdog_push_subs.
//
// Fase 1: só a ação "test" ({ action: 'test', endpoint }) — manda uma notificação
// de teste para o aparelho que pediu. As próximas fases acrescentam a varredura
// de alarmes, timers e prazos.
//
// Segredos (supabase secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// A chave privada nunca vai para o repositório.
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Sub = { id: string; side: string; endpoint: string; p256dh: string; auth: string };
type Payload = { title: string; body: string; tag?: string; url?: string };

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

let vapidReady = false;
function setupVapid() {
  if (vapidReady) return;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'https://zeroheyni.github.io/Subrosa/';
  if (!pub || !priv) throw new Error('chaves de notificação não configuradas');
  webpush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
}

/** Envia para um aparelho. Se o serviço de push disser que a inscrição morreu (404/410), apaga a linha. */
async function sendTo(sub: Sub, payload: Payload): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: 'high' },
    );
    return { ok: true };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await supabase.from('catdog_push_subs').delete().eq('id', sub.id);
    }
    return { ok: false, status, error: (e as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, endpoint } = await req.json();
    setupVapid();

    if (action === 'test') {
      if (!endpoint || typeof endpoint !== 'string') return json({ error: 'endpoint ausente' }, 400);
      const { data: sub, error } = await supabase
        .from('catdog_push_subs')
        .select('id, side, endpoint, p256dh, auth')
        .eq('endpoint', endpoint)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!sub) return json({ error: 'este aparelho não está inscrito' }, 404);

      const res = await sendTo(sub as Sub, {
        title: 'Cat & Dog 🐾',
        body: sub.side === 'cao' ? 'Funcionou! As notificações do Gato (mestre) chegam neste aparelho.' : 'Funcionou! As notificações do Cão (jogador) chegam neste aparelho.',
        tag: 'catdog-test',
        url: 'catdog/',
      });
      return json(res, res.ok ? 200 : 502);
    }

    return json({ error: 'ação desconhecida' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
