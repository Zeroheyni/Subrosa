// ============================================================
// Edge Function: advance-day
// Só o mestre pode chamar (token validado no servidor).
// Roda a simulação inteira do dia e salva o resultado.
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { advanceDay } from '../_shared/simulation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: 'token ausente' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cliente com a service_role key — só existe dentro do servidor,
    // nunca é enviado pro navegador de ninguém.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Valida a sessão de mestre
    const { data: session, error: sessionError } = await supabase
      .from('master_sessions')
      .select('token, expires_at')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: 'sessão de mestre inválida ou expirada' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Busca o estado atual
    const { data: row, error: fetchError } = await supabase
      .from('game_state')
      .select('data')
      .eq('id', 1)
      .single();

    if (fetchError || !row) {
      return new Response(JSON.stringify({ error: 'não foi possível carregar o estado do jogo' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Roda a simulação
    const newData = advanceDay(row.data);

    // Salva
    const { error: updateError } = await supabase
      .from('game_state')
      .update({ data: newData, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (updateError) {
      return new Response(JSON.stringify({ error: 'não foi possível salvar o novo estado' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, day: newData.day }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
