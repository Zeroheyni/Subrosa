/* ============================================================
   CAT & DOG — relógio da tela Hoje
   • mostrador analógico (ponteiros de hora, minuto e segundo) com o relógio digital no meio;
   • quando há um timer seu rodando, um aro se forma ao redor do relógio (barra de progresso);
   • botão para trocar entre a hora do seu país e a do outro lado (Portugal ↔ Brasília);
   • 12 h ou 24 h: escolha em Ajustes (vale só neste aparelho, chave catdog.clock24).
   ============================================================ */
window.Clock = (function(){
  'use strict';

  const R = CD_RULES;
  const K24 = 'catdog.clock24';
  const CX = 150, CY = 150;
  const RING_R = 140, RING_C = 2 * Math.PI * RING_R;

  let viewOther = false;          // false = hora do meu país · true = hora do outro lado
  let ticker = null;
  const lastAngle = {};           // ponteiros giram sempre pelo caminho curto (nada de rodopio ao virar 59 → 0)

  const me = () => App.side;
  const shown = () => (viewOther ? R.other(me()) : me());
  const nowMs = () => Date.now() + (App.skew || 0);

  // ---------- preferência 12 h / 24 h ----------
  function use24(){
    try{ return localStorage.getItem(K24) !== '0'; }catch(e){ return true; }
  }
  function setUse24(v){
    try{ localStorage.setItem(K24, v ? '1' : '0'); }catch(e){}
    tick(true);
  }

  // ---------- peças ----------
  function ticks(){
    let out = '';
    for(let i = 0; i < 60; i++){
      const a = (i / 60) * 2 * Math.PI, big = i % 5 === 0;
      const r1 = 121, r2 = big ? 108 : 114;
      out += `<line x1="${(CX + Math.sin(a) * r1).toFixed(1)}" y1="${(CY - Math.cos(a) * r1).toFixed(1)}" x2="${(CX + Math.sin(a) * r2).toFixed(1)}" y2="${(CY - Math.cos(a) * r2).toFixed(1)}" class="${big ? 'ck-tk big' : 'ck-tk'}"/>`;
    }
    return out;
  }

  const SWAP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/></svg>';

  function html(){
    const k = shown(), o = R.other(k);
    return `
      <section class="clock-card v-${k} enter" data-ckroot aria-label="Relógio">
        <div class="clock-dial" data-c-go>
          <svg viewBox="0 0 300 300" aria-hidden="true">
            <defs>
              <linearGradient id="ck-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient>
              <radialGradient id="ck-face" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="rgba(255,255,255,.07)"/><stop offset="1" stop-color="rgba(255,255,255,.015)"/></radialGradient>
            </defs>
            <circle class="ck-track" cx="${CX}" cy="${CY}" r="${RING_R}"/>
            <circle class="ck-prog" data-c-prog cx="${CX}" cy="${CY}" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${RING_C.toFixed(1)}"/>
            <circle class="ck-face" cx="${CX}" cy="${CY}" r="128"/>
            ${ticks()}
            <g class="ck-hand ck-h" data-c-h><line x1="${CX}" y1="${CY - 70}" x2="${CX}" y2="${CY - 92}"/></g>
            <g class="ck-hand ck-m" data-c-m><line x1="${CX}" y1="${CY - 70}" x2="${CX}" y2="${CY - 104}"/></g>
            <g class="ck-hand ck-s" data-c-s><line x1="${CX}" y1="${CY - 70}" x2="${CX}" y2="${CY - 108}"/><circle cx="${CX}" cy="${CY - 108}" r="3.6"/></g>
            <circle class="ck-pad" cx="${CX}" cy="${CY}" r="64"/>
          </svg>
          <div class="clock-in">
            <small data-c-label></small>
            <b data-c-time>--:--</b>
            <em data-c-sub></em>
          </div>
        </div>
        <div class="clock-meta">
          <div class="clock-date">
            <b data-c-date></b>
            <small data-c-note></small>
          </div>
          <button class="clock-switch" type="button" data-c-switch aria-label="Ver a hora do outro país">${SWAP}<span data-c-switch-label>Ver ${R.TZ_NAMES[o]}</span></button>
        </div>
      </section>`;
  }

  // ---------- atualização ----------
  /** Ângulo equivalente a `target` mais próximo do último usado (gira pelo caminho curto). */
  function unwrap(key, target){
    const last = lastAngle[key];
    if(last === undefined){ lastAngle[key] = target; return target; }
    const d = (((target - last) % 360) + 540) % 360 - 180;
    lastAngle[key] += d;
    return lastAngle[key];
  }
  const setAngle = (el, key, deg) => { if(el) el.style.transform = `rotate(${unwrap(key, deg).toFixed(2)}deg)`; };
  const setText = (el, v) => { if(el && el.textContent !== v) el.textContent = v; };

  /** Diferença de horas entre dois países agora (o outro menos o mostrado), em horas. */
  function offsetHours(from, to, ms){
    const a = R.wall(ms, R.TZS[from]), b = R.wall(ms, R.TZS[to]);
    const u = w => Date.UTC(+w.year, +w.month - 1, +w.day, +w.hour, +w.minute);
    return Math.round((u(b) - u(a)) / 1800000) / 2;
  }

  function tick(force){
    const root = document.querySelector('[data-ckroot]');
    if(!root){ stop(); return; }
    if(document.hidden && !force) return;
    const ms = nowMs();
    const k = shown(), o = R.other(k);
    const w = R.wall(ms, R.TZS[k]);
    const h = +w.hour, m = +w.minute, s = +w.second;
    const f24 = use24();

    // ponteiros
    setAngle(root.querySelector('[data-c-s]'), 's', s * 6);
    setAngle(root.querySelector('[data-c-m]'), 'm', (m + s / 60) * 6);
    setAngle(root.querySelector('[data-c-h]'), 'h', ((h % 12) + m / 60) * 30);

    // digital no meio
    const hh = f24 ? w.hour : String(h % 12 || 12);
    setText(root.querySelector('[data-c-time]'), `${hh}:${w.minute}`);
    setText(root.querySelector('[data-c-label]'), R.TZ_NAMES[k].toUpperCase() + (f24 ? '' : (h < 12 ? ' · AM' : ' · PM')));

    // aro do timer
    const p = window.Tempo && Tempo.progress ? Tempo.progress() : null;
    const ring = root.querySelector('[data-c-prog]');
    root.classList.toggle('has-timer', !!p);
    root.classList.toggle('t-paused', !!(p && p.paused));
    root.classList.toggle('t-break', !!(p && p.kind === 'break'));
    ring.setAttribute('stroke-dashoffset', (RING_C * (1 - (p ? p.pct : 0))).toFixed(1));
    setText(root.querySelector('[data-c-sub]'), p ? `${p.label} ${p.text}` : `:${w.second}`);
    root.querySelector('.clock-dial').classList.toggle('go', !!p);

    // data e diferença de fuso (ou o timer)
    const dateTxt = new Intl.DateTimeFormat('pt-BR', { timeZone: R.TZS[k], weekday:'long', day:'numeric', month:'long' }).format(new Date(ms));
    setText(root.querySelector('[data-c-date]'), p ? `${p.label} ${p.paused ? 'pausado' : 'em andamento'}` : `Hora de ${R.TZ_NAMES[k]}`);
    const dh = offsetHours(k, o, ms);
    const diff = dh === 0 ? 'no mesmo horário' : dh > 0 ? `${R.TZ_NAMES[o]} está ${Math.abs(dh)} h à frente` : `${R.TZ_NAMES[o]} está ${Math.abs(dh)} h atrás`;
    const dateShort = dateTxt.charAt(0).toUpperCase() + dateTxt.slice(1);
    setText(root.querySelector('[data-c-note]'), p ? 'Toque no relógio para abrir o timer' : viewOther ? `${dateShort} · ${diff}` : diff);
    setText(root.querySelector('[data-c-switch-label]'), `Ver ${R.TZ_NAMES[viewOther ? me() : o]}`);
    root.classList.toggle('v-gato', k === 'gato');
    root.classList.toggle('v-cao', k === 'cao');
    root.classList.toggle('other', viewOther);
  }

  function start(){
    if(ticker) return;
    ticker = setInterval(tick, 250);
  }
  function stop(){ if(ticker){ clearInterval(ticker); ticker = null; } }

  /** Chame depois de pôr o html() na tela. */
  function mount(){
    Object.keys(lastAngle).forEach(k => delete lastAngle[k]);
    const root = document.querySelector('[data-ckroot]');
    if(root) root.classList.add('ck-still');      // os ponteiros já nascem na hora certa (sem varrer a tela)
    tick(true);
    start();
    setTimeout(() => { if(root) root.classList.remove('ck-still'); }, 80);
  }

  // ---------- eventos (uma vez só) ----------
  document.addEventListener('click', e => {
    if(e.target.closest('[data-c-switch]')){
      viewOther = !viewOther;
      tick(true);
      return;
    }
    const go = e.target.closest('[data-c-go].go');
    if(go) App.go('#tempo');
  });
  document.addEventListener('visibilitychange', () => { if(!document.hidden) tick(true); });

  return { html, mount, stop, use24, setUse24 };
})();
