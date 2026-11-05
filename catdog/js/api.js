/* ============================================================
   CAT & DOG — acesso ao Supabase (leitura pública + RPCs)

   O mestre (lado 'cao', que é o GATO) manda o token da sessão (vem do login por PIN do site);
   o jogador (lado 'gato', que é o CÃO) não usa token. Toda ação diz de qual lado vem (p_side).
   ============================================================ */
window.API = (function(){
  'use strict';

  const SUPABASE_URL = 'https://tvhdlqapeofyxfxppjov.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NUWJIuwNHS0Y5tWeC-3aWw_nT4oS805';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const token = () => (window.SubrosaAuth && SubrosaAuth.get() && SubrosaAuth.get().token) || null;
  const mySide = () => (window.SubrosaAuth && SubrosaAuth.role() === 'master' ? 'cao' : 'gato');

  function fail(error){
    const msg = (error && (error.message || error.details)) || 'Erro desconhecido';
    if(/sessão de mestre inválida/i.test(msg) && window.SubrosaAuth){
      SubrosaAuth.logout('Sua sessão de mestre expirou — entre de novo com o PIN.');
    }
    const e = new Error(msg);
    e.cause = error;
    throw e;
  }
  async function rpc(name, args){
    const { data, error } = await sb.rpc(name, args);
    if(error) fail(error);
    return data;
  }
  // toda ação de escrita leva o lado e o token (nulo para o jogador)
  const who = () => ({ p_side: mySide(), p_token: mySide() === 'cao' ? token() : null });

  // ---------- leitura ----------
  async function listTasks(){
    const { data, error } = await sb.from('catdog_tasks').select('*').order('created_at', { ascending:true });
    if(error) fail(error);
    return data || [];
  }
  /** Só as conclusões de hoje e das tarefas avulsas (as repetidas de dias antigos ficam para as estatísticas). */
  async function listCompletions(periods){
    const { data, error } = await sb.from('catdog_completions').select('*').in('period', periods);
    if(error) fail(error);
    return data || [];
  }
  async function listLog(limit){
    const { data, error } = await sb.from('catdog_coin_log').select('*').order('created_at', { ascending:false }).limit(limit || 300);
    if(error) fail(error);
    return data || [];
  }
  async function wallets(){
    const { data, error } = await sb.from('catdog_wallets').select('*');
    if(error) fail(error);
    const w = { gato: 0, cao: 0 };
    (data || []).forEach(r => { w[r.side] = r.coins; });
    return w;
  }

  // ---------- tarefas ----------
  const saveTask = (id, data) => rpc('catdog_save_task', { ...who(), p_id: id || null, p_data: data });
  const deleteTask = id => rpc('catdog_delete_task', { ...who(), p_id: id });
  const setValue = (id, target, value) => rpc('catdog_set_value', { ...who(), p_id: id, p_target: target, p_value: value });
  const complete = (id, done) => rpc('catdog_complete', { ...who(), p_id: id, p_done: !!done });

  // ---------- loja e sequência ----------
  async function listRewards(){
    const { data, error } = await sb.from('catdog_rewards').select('*').order('created_at', { ascending:true });
    if(error) fail(error);
    return data || [];
  }
  async function listPurchases(){
    const { data, error } = await sb.from('catdog_purchases').select('*').order('created_at', { ascending:false }).limit(200);
    if(error) fail(error);
    return data || [];
  }
  const streaks = () => rpc('catdog_streaks', {});
  const saveReward = (id, data) => rpc('catdog_save_reward', { ...who(), p_id: id || null, p_data: data });
  const deleteReward = id => rpc('catdog_delete_reward', { ...who(), p_id: id });
  const buyReward = id => rpc('catdog_buy_reward', { ...who(), p_id: id });
  const fulfillPurchase = id => rpc('catdog_fulfill_purchase', { ...who(), p_id: id });
  const refundPurchase = id => rpc('catdog_refund_purchase', { ...who(), p_id: id });

  // ---------- tempo (timers) ----------
  async function listTimers(){
    const { data, error } = await sb.from('catdog_timers').select('*').order('created_at', { ascending:false }).limit(300);
    if(error) fail(error);
    return data || [];
  }
  async function listSettings(){
    const { data, error } = await sb.from('catdog_settings').select('*');
    if(error) fail(error);
    const o = {};
    (data || []).forEach(r => { o[r.side] = r; });
    return o;
  }
  const serverNow = async () => { const t0 = Date.now(); const v = await rpc('catdog_now', {}); const t1 = Date.now(); return Date.parse(v) - (t0 + t1) / 2; };
  const timerStart = (kind, label, seconds, taskId) => rpc('catdog_timer_start', { ...who(), p_kind: kind, p_label: label || '', p_duration_s: seconds, p_task: taskId || null });
  const timerPause = id => rpc('catdog_timer_pause', { ...who(), p_id: id });
  const timerResume = id => rpc('catdog_timer_resume', { ...who(), p_id: id });
  const timerCancel = id => rpc('catdog_timer_cancel', { ...who(), p_id: id });
  const timerFinish = id => rpc('catdog_timer_finish', { ...who(), p_id: id });
  const setFocusValue = (target, value) => rpc('catdog_set_focus_value', { ...who(), p_target: target, p_value: value });

  const setDayStart = minutes => rpc('catdog_set_day_start', { ...who(), p_minutes: minutes });

  // ---------- temas ----------
  async function listThemeCatalog(){
    const { data, error } = await sb.from('catdog_theme_catalog').select('*');
    if(error) fail(error);
    return data || [];
  }
  async function listThemesOwned(){
    const { data, error } = await sb.from('catdog_theme_owned').select('*');
    if(error) fail(error);
    return data || [];
  }
  async function listVault(){
    const { data, error } = await sb.from('catdog_theme_vault').select('*');
    if(error) fail(error);
    return data || [];
  }
  const buyTheme = id => rpc('catdog_buy_theme', { ...who(), p_theme: id });
  const equipTheme = id => rpc('catdog_equip_theme', { ...who(), p_theme: id });
  const vaultDeposit = (id, n) => rpc('catdog_vault_deposit', { ...who(), p_theme: id, p_amount: n });
  const vaultWithdraw = (id, n) => rpc('catdog_vault_withdraw', { ...who(), p_theme: id, p_amount: n });

  // ---------- alarmes ----------
  async function listAlarms(){
    const { data, error } = await sb.from('catdog_alarms').select('*').order('at_time', { ascending:true });
    if(error) fail(error);
    return data || [];
  }
  const saveAlarm = (id, data) => rpc('catdog_save_alarm', { ...who(), p_id: id || null, p_data: data });
  const toggleAlarm = (id, active) => rpc('catdog_toggle_alarm', { ...who(), p_id: id, p_active: active });
  const deleteAlarm = id => rpc('catdog_delete_alarm', { ...who(), p_id: id });

  // ---------- moedas ----------
  const adjust = (side, amount, note) => rpc('catdog_adjust', { p_token: token(), p_side: side, p_amount: amount, p_note: note || '' });

  // ---------- notificações ----------
  const pushSubscribe = (sub, ua) => rpc('catdog_push_subscribe', {
    ...who(), p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_ua: ua || ''
  });
  const pushUnsubscribe = endpoint => rpc('catdog_push_unsubscribe', { p_endpoint: endpoint });
  async function pushTest(endpoint){
    const res = await fetch(`${SUPABASE_URL}/functions/v1/catdog-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ action: 'test', endpoint })
    });
    const out = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(out.error || `A notificação de teste falhou (${res.status})`);
    return out;
  }

  /** Assina mudanças das tabelas; devolve função pra cancelar. */
  function subscribe(tables, onChange){
    const ch = sb.channel('catdog_live');
    tables.forEach(table => ch.on('postgres_changes', { event:'*', schema:'public', table }, p => onChange(table, p)));
    ch.subscribe();
    return () => sb.removeChannel(ch);
  }

  return {
    sb, token, mySide,
    listTasks, listCompletions, listLog, wallets,
    saveTask, deleteTask, setValue, complete, adjust,
    listAlarms, saveAlarm, toggleAlarm, deleteAlarm,
    listTimers, listSettings, setDayStart,
    listThemeCatalog, listThemesOwned, listVault, buyTheme, equipTheme, vaultDeposit, vaultWithdraw, serverNow, timerStart, timerPause, timerResume, timerCancel, timerFinish, setFocusValue,
    listRewards, listPurchases, streaks, saveReward, deleteReward, buyReward, fulfillPurchase, refundPurchase,
    pushSubscribe, pushUnsubscribe, pushTest, subscribe
  };
})();
