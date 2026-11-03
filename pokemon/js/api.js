/* ============================================================
   POKÉMON — acesso ao Supabase (leitura pública + RPCs)

   O mestre manda o token da sessão (vem do login por PIN do site);
   o jogador só mexe em anotações e fotos, que não pedem token.
   ============================================================ */
window.API = (function(){
  'use strict';

  const SUPABASE_URL = 'https://tvhdlqapeofyxfxppjov.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NUWJIuwNHS0Y5tWeC-3aWw_nT4oS805';
  const BUCKET = 'pokemon-images';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const token = () => (window.SubrosaAuth && SubrosaAuth.get() && SubrosaAuth.get().token) || null;

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

  // ---------- treinadores ----------
  async function listTrainers(){
    const { data, error } = await sb.from('pkm_trainers').select('*').order('created_at', { ascending:true });
    if(error) fail(error);
    return data || [];
  }
  const saveTrainer = (id, data) => rpc('pkm_save_trainer', { p_token: token(), p_id: id || null, p_data: data });
  const addTrainerXp = (id, amount) => rpc('pkm_trainer_add_xp', { p_token: token(), p_id: id, p_amount: amount });
  const trainerHp = (id, delta) => rpc('pkm_trainer_hp', { p_token: token(), p_id: id, p_delta: delta });
  const deleteTrainer = id => rpc('pkm_delete_trainer', { p_token: token(), p_id: id });
  const setTrainerNotes = (id, notes) => rpc('pkm_trainer_set_notes', { p_id: id, p_notes: notes });
  const setTrainerPhoto = (id, url, srcUrl, frame) =>
    rpc('pkm_trainer_set_photo', { p_id: id, p_image_url: url, p_image_src_url: srcUrl, p_image_frame: frame });

  // ---------- imagens ----------
  const extFor = type => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  /** Envia um Blob pro bucket e devolve a URL pública. `folder` ex.: 'trainers'. */
  async function uploadImage(blob, folder, tag){
    const path = `${folder}/${uid()}${tag ? '-' + tag : ''}.${extFor(blob.type)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type, cacheControl: '31536000', upsert: false
    });
    if(error) fail(error);
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  /** Assina mudanças das tabelas; devolve função pra cancelar. */
  function subscribe(tables, onChange){
    const ch = sb.channel('pokemon_live');
    tables.forEach(table => ch.on('postgres_changes', { event:'*', schema:'public', table }, p => onChange(table, p)));
    ch.subscribe();
    return () => sb.removeChannel(ch);
  }

  return {
    sb, token, listTrainers, saveTrainer, addTrainerXp, trainerHp, deleteTrainer,
    setTrainerNotes, setTrainerPhoto, uploadImage, subscribe
  };
})();
