/* ============================================================
   SUBROSA — login por PIN (vale pro site todo)

   Carregue no <head>, ANTES de qualquer outro script da página:
     <script src="shared/auth.js"></script>          (no hub)
     <script src="../shared/auth.js"></script>       (dentro de um projeto)

   Se a pessoa não estiver logada, a página fica escondida atrás de uma
   tela de bloqueio estilo celular (teclado numérico). Um PIN entra como
   mestre, outro como jogador. Quem confere o PIN é o banco (hub_login);
   o PIN não existe neste arquivo.

   API:
     SubrosaAuth.onReady(cb)   cb({role, token, exp}) roda quando estiver logado
                               (na hora se já estiver, ou depois do PIN certo)
     SubrosaAuth.get()         { role:'master'|'player', token, exp } ou null
     SubrosaAuth.role()        'master' | 'player' | null
     SubrosaAuth.logout(msg?)  apaga o login e recarrega (msg aparece na tela de PIN)

   Guardado em localStorage 'subrosa.auth' (o localStorage é um só pro site
   todo, então hub e projetos compartilham o login). Jogador: 30 dias.
   Mestre: o prazo da sessão que o banco devolve (90 dias). Pro Levina o
   token do mestre também é copiado pra chave antiga 'subrosa-master-token'.
   ============================================================ */
(function(){
  'use strict';

  const SUPABASE_URL = 'https://tvhdlqapeofyxfxppjov.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NUWJIuwNHS0Y5tWeC-3aWw_nT4oS805';
  const AUTH_KEY = 'subrosa.auth';
  const NOTICE_KEY = 'subrosa.auth.notice';
  const LEGACY_MASTER_KEY = 'subrosa-master-token';
  const PLAYER_DAYS = 30;
  const PIN_LENGTH = 4;

  const listeners = [];
  let auth = readStored();
  let loggingOut = false;

  function readStored(){
    try{
      const a = JSON.parse(localStorage.getItem(AUTH_KEY));
      if(a && (a.role === 'master' || a.role === 'player') && a.exp > Date.now()) return a;
      if(a) { localStorage.removeItem(AUTH_KEY); }
    } catch(e){}
    return null;
  }

  function store(a){
    auth = a;
    try{
      localStorage.setItem(AUTH_KEY, JSON.stringify(a));
      if(a.role === 'master' && a.token) localStorage.setItem(LEGACY_MASTER_KEY, a.token);
      else localStorage.removeItem(LEGACY_MASTER_KEY);
    } catch(e){}
  }

  function logout(notice){
    if(loggingOut) return;
    loggingOut = true;
    auth = null;
    try{
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(LEGACY_MASTER_KEY);
      if(notice) sessionStorage.setItem(NOTICE_KEY, notice);
    } catch(e){}
    location.reload();
  }

  function onReady(cb){
    if(auth) cb(auth);
    else listeners.push(cb);
  }

  window.SubrosaAuth = {
    get: () => auth,
    role: () => auth ? auth.role : null,
    token: () => auth ? auth.token || null : null,
    onReady,
    logout
  };

  if(auth) return;   // já logado: nada de tela de bloqueio

  /* ---------- tela de bloqueio ---------- */
  const root = document.documentElement;
  root.classList.add('sr-locked');

  const style = document.createElement('style');
  style.textContent = `
    html.sr-locked{overflow:hidden;background:#07050f;}
    html.sr-locked body > *:not(#srLock){display:none !important;}
    #srLock{
      position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;
      padding:calc(46px + env(safe-area-inset-top)) 24px calc(28px + env(safe-area-inset-bottom));
      color:#f3e9f7;font-family:'Inter',system-ui,sans-serif;user-select:none;-webkit-user-select:none;
      background:
        radial-gradient(ellipse 120% 70% at 20% -8%, rgba(255,92,154,.34), transparent 60%),
        radial-gradient(ellipse 110% 70% at 100% 4%, rgba(155,107,255,.30), transparent 62%),
        radial-gradient(ellipse 90% 60% at 50% 112%, rgba(255,92,154,.16), transparent 60%),
        #07050f;
      transition:opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1), filter .5s ease;
      touch-action:manipulation;
    }
    #srLock.sr-unlocking{opacity:0;transform:scale(1.06) translateY(-3%);filter:blur(6px);pointer-events:none;}
    #srLock .sr-top{text-align:center;margin-top:2vh;}
    #srLock .sr-time{font-family:'Chakra Petch',sans-serif;font-weight:600;font-size:64px;line-height:1;letter-spacing:2px;text-shadow:0 0 30px rgba(255,92,154,.35);}
    #srLock .sr-date{margin-top:8px;font-size:15px;color:rgba(243,233,247,.72);}
    #srLock .sr-date::first-letter{text-transform:uppercase;}
    #srLock .sr-mid{margin-top:auto;margin-bottom:auto;text-align:center;padding-top:2vh;}
    #srLock .sr-brand{
      font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:13px;letter-spacing:8px;padding-left:8px;
      background:linear-gradient(100deg,#ff5c9a,#9b6bff);-webkit-background-clip:text;background-clip:text;color:transparent;
    }
    #srLock .sr-msg{margin-top:14px;min-height:20px;font-size:15px;color:rgba(243,233,247,.85);transition:color .2s ease;}
    #srLock .sr-msg.err{color:#ff6b8a;}
    #srLock .sr-dots{display:flex;gap:18px;justify-content:center;margin-top:22px;}
    #srLock .sr-dots i{
      width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(243,233,247,.7);background:transparent;
      transition:background .15s ease, transform .2s cubic-bezier(.34,1.45,.5,1), border-color .2s ease, box-shadow .2s ease;
    }
    #srLock .sr-dots i.on{background:#f3e9f7;border-color:#f3e9f7;transform:scale(1.12);}
    #srLock .sr-dots.ok i{background:#ff5c9a;border-color:#ff5c9a;box-shadow:0 0 14px rgba(255,92,154,.8);}
    #srLock .sr-dots.bad i{border-color:#ff6b8a;background:#ff6b8a;}
    #srLock .sr-dots.shake{animation:srShake .42s cubic-bezier(.36,.07,.19,.97);}
    @keyframes srShake{10%,90%{transform:translateX(-2px);}20%,80%{transform:translateX(4px);}30%,50%,70%{transform:translateX(-8px);}40%,60%{transform:translateX(8px);}}
    #srLock .sr-pad{
      display:grid;grid-template-columns:repeat(3,76px);gap:16px 24px;justify-content:center;margin-bottom:6px;
    }
    #srLock .sr-key{
      width:76px;height:76px;border-radius:50%;border:0;padding:0;cursor:pointer;color:#f3e9f7;
      background:rgba(255,255,255,.09);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);
      font-family:'Chakra Petch',sans-serif;font-weight:500;font-size:32px;
      display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;
      transition:background .12s ease, transform .12s ease;
    }
    #srLock .sr-key:active, #srLock .sr-key.press{background:rgba(255,255,255,.28);transform:scale(.93);}
    #srLock .sr-key.ghost{background:none;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;pointer-events:none;}
    #srLock .sr-key.del{background:none;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;font-size:0;}
    #srLock .sr-key.del svg{width:30px;height:30px;}
    #srLock.sr-busy .sr-pad{opacity:.55;pointer-events:none;}
    @media (max-height:640px){
      #srLock .sr-time{font-size:48px;}
      #srLock .sr-key{width:64px;height:64px;font-size:27px;}
      #srLock .sr-pad{grid-template-columns:repeat(3,64px);gap:10px 20px;}
    }
    @media (prefers-reduced-motion:reduce){
      #srLock, #srLock *{transition:none !important;animation:none !important;}
    }`;
  document.head.appendChild(style);

  const DEL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9.5 12 14.5M12 9.5l5 5"/></svg>';

  let el, dotsEl, msgEl, timeEl, dateEl, clockTimer;
  let pin = '';
  let busy = false;
  let notice = '';
  try{ notice = sessionStorage.getItem(NOTICE_KEY) || ''; sessionStorage.removeItem(NOTICE_KEY); } catch(e){}

  function build(){
    el = document.createElement('div');
    el.id = 'srLock';
    el.innerHTML = `
      <div class="sr-top"><div class="sr-time"></div><div class="sr-date"></div></div>
      <div class="sr-mid">
        <div class="sr-brand">SUBROSA</div>
        <div class="sr-msg"></div>
        <div class="sr-dots">${'<i></i>'.repeat(PIN_LENGTH)}</div>
      </div>
      <div class="sr-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="sr-key" data-k="${n}" type="button" aria-label="${n}">${n}</button>`).join('')}
        <button class="sr-key ghost" type="button" tabindex="-1" aria-hidden="true"></button>
        <button class="sr-key" data-k="0" type="button" aria-label="0">0</button>
        <button class="sr-key del" data-k="del" type="button" aria-label="Apagar">${DEL_SVG}</button>
      </div>`;
    document.body.appendChild(el);
    dotsEl = el.querySelector('.sr-dots');
    msgEl = el.querySelector('.sr-msg');
    timeEl = el.querySelector('.sr-time');
    dateEl = el.querySelector('.sr-date');
    setMsg(notice || 'Digite o PIN', !!notice);
    tickClock();
    clockTimer = setInterval(tickClock, 5000);

    el.addEventListener('click', (e)=>{
      const k = e.target.closest('[data-k]');
      if(k) press(k.dataset.k);
    });
  }

  function tickClock(){
    const d = new Date();
    timeEl.textContent = d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    dateEl.textContent = d.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
  }

  function setMsg(text, isErr){
    msgEl.textContent = text;
    msgEl.classList.toggle('err', !!isErr);
  }

  function paintDots(){
    [...dotsEl.children].forEach((d, i) => d.classList.toggle('on', i < pin.length));
  }

  function buzz(ms){ try{ if(navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(ms); } catch(e){} }

  function press(k){
    if(busy) return;
    if(k === 'del'){ pin = pin.slice(0, -1); paintDots(); return; }
    if(pin.length >= PIN_LENGTH) return;
    pin += k;
    paintDots();
    if(pin.length === PIN_LENGTH) submit();
  }

  async function submit(){
    busy = true;
    el.classList.add('sr-busy');
    setMsg('Verificando…');
    let res = null;
    try{
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hub_login`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', apikey: SUPABASE_KEY },
        body: JSON.stringify({ p_pin: pin })
      });
      if(!r.ok) throw new Error('http ' + r.status);
      res = await r.json();
    } catch(err){
      console.error('Falha no login', err);
      fail('Sem conexão. Tente de novo.', false);
      return;
    }
    if(res && res.ok){
      const exp = res.role === 'master' && res.expires_at
        ? new Date(res.expires_at).getTime()
        : Date.now() + PLAYER_DAYS * 86400000;
      store({ role: res.role, token: res.token || null, exp });
      success();
    } else if(res && res.error === 'locked'){
      fail('Muitas tentativas. Aguarde alguns minutos.', true);
    } else {
      fail('PIN incorreto', true);
    }
  }

  function fail(text, shake){
    setMsg(text, true);
    dotsEl.classList.add('bad');
    if(shake){ dotsEl.classList.remove('shake'); void dotsEl.offsetWidth; dotsEl.classList.add('shake'); }
    buzz(shake ? [40, 40, 40] : 20);
    setTimeout(()=>{
      pin = '';
      dotsEl.classList.remove('bad', 'shake');
      paintDots();
      busy = false;
      el.classList.remove('sr-busy');
      if(msgEl.classList.contains('err')) setTimeout(()=>{ if(!busy && !pin) setMsg('Digite o PIN'); }, 1800);
    }, 650);
  }

  function success(){
    dotsEl.classList.add('ok');
    setMsg('');
    buzz(18);
    clearInterval(clockTimer);
    document.removeEventListener('keydown', onKey, true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(()=>{
      root.classList.remove('sr-locked');       // a página aparece por baixo
      el.classList.add('sr-unlocking');
      listeners.splice(0).forEach(cb => { try{ cb(auth); } catch(e){ console.error(e); } });
      setTimeout(()=>{ el.remove(); style.remove(); }, reduce ? 0 : 520);
    }, reduce ? 0 : 280);
  }

  function onKey(e){
    if(!el) return;
    if(e.metaKey || e.ctrlKey || e.altKey) return;
    if(/^[0-9]$/.test(e.key)){ e.preventDefault(); flash(e.key); press(e.key); }
    else if(e.key === 'Backspace'){ e.preventDefault(); press('del'); }
  }
  function flash(k){
    const b = el.querySelector(`[data-k="${k}"]`);
    if(!b) return;
    b.classList.add('press');
    setTimeout(()=> b.classList.remove('press'), 110);
  }
  document.addEventListener('keydown', onKey, true);

  if(document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
