/* ============================================================
   CAT & DOG — tela "Tempo": foco (pomodoro), contagem regressiva e cronômetro

   Cada timer é uma linha no banco (uma fase): fechar o app não perde nada.
   O relógio da tela corrige o do aparelho com a hora do servidor (App.skew) e
   quem confere se o tempo acabou, na hora de pagar as moedas, é o servidor.
   Foco concluído (mínimo 15 min) rende moedas do próprio lado; o valor é
   definido pelo OUTRO lado (Ajustes). Pausa, contagem e cronômetro não rendem.
   ============================================================ */
window.Tempo = (function(){
  'use strict';

  const R = CD_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  const CFG_KEY = 'catdog.pomodoro';
  const KINDS = {
    foco:       { kind:'focus',     label:'Foco',      text:'Foco' },
    contagem:   { kind:'countdown', label:'Contagem',  text:'Contagem regressiva' },
    cronometro: { kind:'stopwatch', label:'Cronômetro', text:'Cronômetro' }
  };
  const KIND_TEXT = { focus:'Foco', break:'Pausa', countdown:'Contagem', stopwatch:'Cronômetro' };

  let view = null;
  let tab = 'foco';
  let ticker = null;
  let finishing = false;
  let result = null;             // timer recém-concluído, mostrado até o usuário dispensar
  let wake = null;
  let audio = null;
  let draft = { foco: 1500, contagem: 600 };   // durações escolhidas, em segundos
  let draftTask = '';
  let draftLabel = '';

  const me = () => App.side;
  const them = () => R.other(App.side);
  const name = s => R.SIDES[s].label;

  // ---------- configuração do pomodoro (só deste aparelho) ----------
  function cfg(){
    let c = {};
    try{ c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); }catch(e){}
    return { focus: c.focus || 25, brk: c.brk || 5, longBrk: c.longBrk || 15 };
  }
  function saveCfg(c){ try{ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }catch(e){} }

  // ---------- dados ----------
  const nowMs = () => Date.now() + (App.skew || 0);
  const active = side => App.timers.find(t => t.side === side && (t.status === 'running' || t.status === 'paused')) || null;
  const mine = () => active(me());

  function elapsedMs(t){
    let e = t.elapsed_before_s * 1000;
    if(t.status === 'running' && t.resumed_at) e += nowMs() - Date.parse(t.resumed_at);
    return Math.max(0, e);
  }
  const remainingMs = t => (t.duration_s == null ? null : t.duration_s * 1000 - elapsedMs(t));

  function fmt(ms, up){
    const s = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
  }
  const mins = s => Math.round(s / 60);

  function today(){
    const td = R.todayISO();
    const list = App.timers.filter(t => t.side === me() && t.kind === 'focus' && t.status === 'done' && t.finished_at && R.dayOf(t.finished_at) === td);
    return {
      count: list.length,
      minutes: Math.round(list.reduce((n, t) => n + (t.elapsed_s || 0), 0) / 60),
      coins: list.reduce((n, t) => n + t.coins, 0),
      paid: list.filter(t => t.coins > 0).length
    };
  }
  const myFocusValue = () => (App.settings[me()] ? App.settings[me()].focus_value : 2);

  // ---------- sons, vibração, tela acesa ----------
  function unlockAudio(){
    try{
      if(!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if(audio.state === 'suspended') audio.resume();
    }catch(e){}
  }
  function beep(){
    try{
      if(!audio) return;
      const t0 = audio.currentTime;
      [0, .22, .44].forEach((d, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = i === 2 ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + d + .02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + .2);
        o.connect(g); g.connect(audio.destination);
        o.start(t0 + d); o.stop(t0 + d + .22);
      });
    }catch(e){}
    try{ if(navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]); }catch(e){}
  }
  async function keepAwake(on){
    try{
      if(on && !wake && navigator.wakeLock){
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }else if(!on && wake){ await wake.release(); wake = null; }
    }catch(e){ wake = null; }
  }
  document.addEventListener('visibilitychange', () => { if(!document.hidden && mine() && mine().status === 'running') keepAwake(true); });

  // ---------- peças de tela ----------
  const R_DIAL = 112, C_DIAL = 2 * Math.PI * R_DIAL;

  function ticks(){
    let out = '';
    for(let i = 0; i < 60; i++){
      const a = (i / 60) * 2 * Math.PI, big = i % 5 === 0;
      const r1 = 127, r2 = big ? 121 : 124;
      out += `<line x1="${(130 + Math.sin(a) * r1).toFixed(1)}" y1="${(130 - Math.cos(a) * r1).toFixed(1)}" x2="${(130 + Math.sin(a) * r2).toFixed(1)}" y2="${(130 - Math.cos(a) * r2).toFixed(1)}" class="${big ? 'tk big' : 'tk'}"/>`;
    }
    return out;
  }

  function dial(inner, pctFilled, cls){
    return `
      <div class="dial ${cls || ''}">
        <svg viewBox="0 0 260 260" aria-hidden="true">
          ${ticks()}
          <circle class="dial-bg" cx="130" cy="130" r="${R_DIAL}"/>
          <circle class="dial-fg" cx="130" cy="130" r="${R_DIAL}" stroke-dasharray="${C_DIAL.toFixed(1)}" stroke-dashoffset="${(C_DIAL * (1 - pctFilled)).toFixed(1)}"/>
        </svg>
        <div class="dial-in">${inner}</div>
      </div>`;
  }

  function otherPresence(){
    const o = active(them());
    if(!o || o.kind !== 'focus') return '';
    const m = Math.floor(elapsedMs(o) / 60000);
    return `<p class="presence">${UI.face(them(), 20)}<span><b>${name(them())}</b> está em foco${o.status === 'paused' ? ' (pausado)' : ` há ${m} min`}${o.label ? ` · ${esc(o.label)}` : ''}</span></p>`;
  }

  // ---------- tela: sem timer ativo ----------
  function setupView(){
    const k = KINDS[tab];
    const c = cfg();
    const tasks = App.tasks.filter(t => R.relevantTo(t, me()) && !R.status(t, App.comps, R.todayISO()).complete && R.isDayOf(t, R.todayISO()));
    const dur = tab === 'foco' ? draft.foco : draft.contagem;
    const tdy = today();
    const presets = tab === 'foco' ? [15, 25, 45, 60] : [1, 5, 10, 15, 30, 60];
    const val = myFocusValue();
    const s = me();

    return `
      ${tab !== 'cronometro' ? `
      <div class="setup">
        ${dial(`<small>${k.text}</small><b data-dur>${fmt(dur * 1000)}</b>`, 1, 'idle')}
        <div class="stepper ${s}">
          <button class="icon-btn big" type="button" data-step="-1" aria-label="Menos">${I.minus}</button>
          <div class="step-label"><b data-mins>${mins(dur)}</b><small>minutos</small></div>
          <button class="icon-btn big" type="button" data-step="1" aria-label="Mais">${I.plus}</button>
        </div>
        <div class="quick center">${presets.map(n => `<button class="qbtn ${n * 60 === dur ? 'on' : ''}" type="button" data-q="${n}">${n} min</button>`).join('')}</div>
      </div>` : `
      <div class="setup">
        ${dial(`<small>${k.text}</small><b>00:00</b>`, 0, 'idle')}
        <p class="hint-line center">Conta o tempo para cima. Toque em iniciar e pare quando quiser.</p>
      </div>`}

      ${tab === 'foco' ? `
        <label class="field"><span>Em qual tarefa? <small>(opcional)</small></span>
          <select name="task" class="select">
            <option value="">Sem tarefa</option>
            ${tasks.map(t => `<option value="${t.id}" ${draftTask === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}
          </select></label>` : ''}
      <label class="field"><span>Nome <small>(opcional)</small></span>
        <input name="label" maxlength="60" value="${esc(draftLabel)}" placeholder="${tab === 'foco' ? 'Ex.: escrever o relatório' : tab === 'contagem' ? 'Ex.: chá' : 'Ex.: treino'}"></label>

      <button class="btn primary start" type="button" data-act="start">${I.flame}<span>Iniciar ${tab === 'foco' ? 'foco' : tab === 'contagem' ? 'contagem' : 'cronômetro'}</span></button>

      ${tab === 'foco' ? `
        <p class="hint enter">${I.info}<span>Cada sessão de foco concluída (a partir de <b>15 min</b>) vale <b>${R.pluralCoins(val, s)}</b>${App.settings[s] ? ` — valor definido pelo ${name(them())}` : ''}. Até 8 sessões pagas por dia. Foco concluído também mantém a sua sequência.</span></p>
        <section class="card today">
          <div class="card-head"><h3>Hoje</h3><span class="pts">${tdy.paid}/8 pagas</span></div>
          <div class="today-grid">
            <div><b>${tdy.count}</b><small>sessões</small></div>
            <div><b>${tdy.minutes}</b><small>min de foco</small></div>
            <div><b>+${tdy.coins}</b><small>${UI.coin(s, 14)} moedas</small></div>
          </div>
        </section>
        <details class="fold cfg"><summary>Ajustar pausas</summary>
          <div class="cfg-grid">
            <label>Foco padrão<input type="number" name="cfgFocus" min="5" max="180" value="${c.focus}"></label>
            <label>Pausa<input type="number" name="cfgBrk" min="1" max="60" value="${c.brk}"></label>
            <label>Pausa longa<input type="number" name="cfgLong" min="1" max="60" value="${c.longBrk}"></label>
          </div>
          <p class="fine">A pausa longa vem depois de cada 4ª sessão de foco do dia.</p>
        </details>` : ''}`;
  }

  // ---------- tela: timer ativo ----------
  function activeView(t){
    const paused = t.status === 'paused';
    const task = t.task_id ? App.tasks.find(x => x.id === t.task_id) : null;
    const rem = remainingMs(t);
    const pct = rem == null ? ((elapsedMs(t) % 60000) / 60000) : Math.max(0, Math.min(1, rem / (t.duration_s * 1000)));
    const text = rem == null ? fmt(elapsedMs(t), true) : fmt(rem);
    const title = t.label || (task && task.title) || '';
    return `
      <div class="setup running ${t.kind} ${paused ? 'paused' : ''}">
        ${dial(`<small data-state>${paused ? 'Pausado' : KIND_TEXT[t.kind]}</small><b data-time>${text}</b>${title ? `<em>${esc(title)}</em>` : ''}`, pct, `${t.kind} ${paused ? 'paused' : ''}`)}
        ${task ? `<p class="chip-row"><span class="chip shared">${I.list}<span>${esc(task.title)}</span></span></p>` : ''}
        <div class="ctl">
          <button class="icon-btn big ghost" type="button" data-act="cancel" aria-label="Cancelar">${I.x}</button>
          <button class="btn primary big-play" type="button" data-act="${paused ? 'resume' : 'pause'}">${paused ? I.flame : I.clock}<span>${paused ? 'Retomar' : 'Pausar'}</span></button>
          ${t.kind === 'stopwatch'
            ? `<button class="icon-btn big" type="button" data-act="finish" aria-label="Concluir">${I.check}</button>`
            : `<button class="icon-btn big" type="button" data-act="finish" data-early aria-label="Concluir">${I.check}</button>`}
        </div>
        ${t.kind === 'focus' ? `<p class="hint-line center">Vale ${R.pluralCoins(myFocusValue(), me())} se terminar o tempo todo (mín. 15 min).</p>` : ''}
      </div>`;
  }

  // ---------- tela: resultado ----------
  function resultView(t){
    const c = cfg();
    const tdy = today();
    const isLong = t.kind === 'focus' && tdy.count > 0 && tdy.count % 4 === 0;
    const brk = isLong ? c.longBrk : c.brk;
    const task = t.task_id ? App.tasks.find(x => x.id === t.task_id) : null;
    const taskOpen = task && !R.status(task, App.comps, R.todayISO()).complete && R.canToggle(task, me(), R.status(task, App.comps, R.todayISO()), R.todayISO());
    const m = Math.round((t.elapsed_s || 0) / 60);
    const head = t.kind === 'focus' ? 'Sessão de foco concluída!' : t.kind === 'break' ? 'Pausa concluída' : t.kind === 'countdown' ? 'Tempo esgotado!' : 'Cronômetro parado';
    return `
      <div class="setup result ${me()}">
        <div class="result-art">${UI.face(me(), 76)}</div>
        <h2>${head}</h2>
        <p class="muted">${t.kind === 'stopwatch' ? fmt((t.elapsed_s || 0) * 1000, true) : `${m} ${m === 1 ? 'minuto' : 'minutos'}`}${t.label ? ` · ${esc(t.label)}` : ''}</p>
        ${t.kind === 'focus' ? (t.coins > 0
          ? `<div class="reward ${me()} big">${UI.coin(me(), 24)}<b>+${t.coins}</b></div>`
          : `<p class="hint-line center">${t.duration_s < 900 ? 'Sessões com menos de 15 min não rendem moedas.' : 'Você já recebeu as 8 sessões pagas de hoje.'}</p>`) : ''}
        <div class="result-actions">
          ${t.kind === 'focus' ? `<button class="btn primary" type="button" data-act="break" data-min="${brk}">${I.clock}<span>${isLong ? 'Pausa longa' : 'Pausa'} de ${brk} min</span></button>` : ''}
          ${taskOpen ? `<button class="btn" type="button" data-act="done-task" data-task="${task.id}">${I.check}<span>Concluir “${esc(task.title.length > 22 ? task.title.slice(0, 21) + '…' : task.title)}”</span></button>` : ''}
          <button class="btn ghost" type="button" data-act="dismiss">${t.kind === 'break' ? 'Voltar ao foco' : 'Fechar'}</button>
        </div>
      </div>`;
  }

  // ---------- render ----------
  function tabsHtml(activeKey){
    const cur = activeKey || tab;
    const t = (key, label) => `<a href="#tempo/${key}" class="seg-btn ${cur === key ? 'on' : ''}">${label}</a>`;
    return `<nav class="seg" aria-label="Tipo de timer">${t('foco', 'Foco')}${t('contagem', 'Contagem')}${t('cronometro', 'Cronômetro')}${t('alarmes', 'Alarmes')}</nav>`;
  }

  function render(root, t){
    view = root;
    if(t && KINDS[t]) tab = t;
    const a = mine();
    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Tempo</span><h1>${a ? KIND_TEXT[a.kind] : result ? 'Pronto!' : 'Timers'}</h1></div>
      </header>
      ${!a && !result ? tabsHtml() : ''}
      ${otherPresence()}
      <div class="tempo-body">${a ? activeView(a) : result ? resultView(result) : setupView()}</div>`;
    startTicker();
    keepAwake(!!(a && a.status === 'running'));
    updateTitle();
  }

  function refresh(){
    if(!view) return;
    // não redesenha por cima do que a pessoa está digitando
    if(!mine() && !result && view.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName)) return;
    const y = window.scrollY;
    render(view);
    view.querySelectorAll('.enter').forEach(el => el.classList.add('still'));
    window.scrollTo({ top: y });
  }

  // ---------- relógio ----------
  function startTicker(){
    stopTicker();
    if(!mine()) return;
    tick();
    ticker = setInterval(tick, 250);
  }
  function stopTicker(){ if(ticker){ clearInterval(ticker); ticker = null; } }

  function updateTitle(text){
    document.title = text ? `${text} · Cat & Dog` : 'Cat & Dog';
  }

  function tick(){
    const t = mine();
    if(!t){ stopTicker(); updateTitle(); return; }
    const rem = remainingMs(t);
    const text = rem == null ? fmt(elapsedMs(t), true) : fmt(rem);
    updateTitle(t.status === 'paused' ? '⏸ ' + text : text);
    if(view && App.current === 'tempo'){
      const el = view.querySelector('[data-time]');
      if(el && el.textContent !== text) el.textContent = text;
      const fg = view.querySelector('.dial-fg');
      if(fg){
        const pct = rem == null ? ((elapsedMs(t) % 60000) / 60000) : Math.max(0, Math.min(1, rem / (t.duration_s * 1000)));
        fg.setAttribute('stroke-dashoffset', (C_DIAL * (1 - pct)).toFixed(1));
      }
    }
    if(rem != null && rem <= 0 && t.status === 'running' && !finishing) finish(t, true);
  }

  // ---------- ações ----------
  async function start(kind, label, seconds, taskId){
    unlockAudio();
    try{
      result = null;
      await API.timerStart(kind, label, seconds, taskId || null);
      await App.reload();
      App.refreshView();
    }catch(e){
      UI.toast(e.message, 'bad');
      await App.reload().catch(() => {});
      App.refreshView();
    }
  }

  async function finish(t, auto){
    if(finishing) return;
    finishing = true;
    try{
      const row = await API.timerFinish(t.id);
      await App.reload();
      result = row;
      beep();
      if(row.coins > 0) UI.coinBurst(document.querySelector('.top-wallets .pill.me'), me(), row.coins);
      await keepAwake(false);
      updateTitle();
      App.refreshView();
      if(row.coins > 0) UI.toast(`Foco concluído! +${R.pluralCoins(row.coins, me())}`, 'good');
      else UI.toast(`${KIND_TEXT[row.kind]} concluído`, 'good');
    }catch(e){
      // relógio do aparelho adiantado: o servidor ainda não considera terminado
      if(/ainda não acabou/.test(e.message) && auto){ setTimeout(() => { finishing = false; }, 1200); return; }
      UI.toast(e.message, 'bad');
      await App.reload().catch(() => {});
      App.refreshView();
    }
    finishing = false;
  }

  async function simple(fn, ...args){
    try{ await fn(...args); await App.reload(); App.refreshView(); }
    catch(e){ UI.toast(e.message, 'bad'); await App.reload().catch(() => {}); App.refreshView(); }
  }

  function readDraft(){
    if(!view) return;
    const lab = view.querySelector('input[name=label]'); if(lab) draftLabel = lab.value;
    const tk = view.querySelector('select[name=task]'); if(tk) draftTask = tk.value;
  }

  const inTempo = () => App.current === 'tempo' && App.sub !== 'alarmes';

  function init(root){
    root.addEventListener('click', async e => {
      if(!inTempo()) return;
      const step = e.target.closest('[data-step]');
      const q = e.target.closest('[data-q]');
      if(step || q){
        const key = tab === 'foco' ? 'foco' : 'contagem';
        const max = tab === 'foco' ? 180 : 1440;
        const cur = mins(draft[key]);
        const next = q ? Number(q.dataset.q) : Math.max(tab === 'foco' ? 5 : 1, Math.min(max, cur + Number(step.dataset.step) * (tab === 'foco' ? 5 : (cur >= 60 ? 5 : 1))));
        draft[key] = next * 60;
        if(key === 'foco'){ const c = cfg(); c.focus = next; saveCfg(c); }
        readDraft();
        render(view);
        return;
      }
      const b = e.target.closest('[data-act]');
      if(!b) return;
      const a = b.dataset.act;
      const t = mine();
      if(a === 'start'){
        readDraft();
        const k = KINDS[tab].kind;
        const taskId = tab === 'foco' ? draftTask : '';
        const task = taskId ? App.tasks.find(x => x.id === taskId) : null;
        const label = (draftLabel || '').trim() || (task ? task.title.slice(0, 60) : '');
        await start(k, label, k === 'stopwatch' ? null : (tab === 'foco' ? draft.foco : draft.contagem), taskId);
        draftLabel = '';
      }
      else if(a === 'pause' && t) simple(API.timerPause, t.id);
      else if(a === 'resume' && t){ unlockAudio(); simple(API.timerResume, t.id); }
      else if(a === 'cancel' && t){
        const ok = await UI.confirmBox({ title: 'Cancelar timer', text: t.kind === 'focus' ? 'Cancelar agora não rende moedas. Quer mesmo parar?' : 'Quer mesmo cancelar este timer?', yesLabel: 'Cancelar timer', noLabel: 'Continuar', danger: true });
        if(ok) simple(API.timerCancel, t.id);
      }
      else if(a === 'finish' && t){
        if(t.kind !== 'stopwatch' && remainingMs(t) > 1500){
          const ok = await UI.confirmBox({ title: 'Ainda não acabou', text: 'O tempo ainda não terminou. Para concluir antes, cancele o timer (sem moedas).', yesLabel: 'Cancelar timer', noLabel: 'Continuar', danger: true });
          if(ok) simple(API.timerCancel, t.id);
        }else finish(t, false);
      }
      else if(a === 'break'){ const mm = Number(b.dataset.min) || 5; result = null; start('break', 'Pausa', mm * 60, null); }
      else if(a === 'dismiss'){ const wasBreak = result && result.kind === 'break'; result = null; if(wasBreak) tab = 'foco'; render(view); }
      else if(a === 'done-task'){
        const task = App.tasks.find(x => x.id === b.dataset.task);
        result = null;
        if(task){ try{ await API.complete(task.id, true); await App.reload(); UI.toast('Tarefa concluída!', 'good'); }catch(err){ UI.toast(err.message, 'bad'); } }
        App.refreshView();
      }
    });
    root.addEventListener('change', e => {
      if(!inTempo()) return;
      const n = e.target.name;
      if(n === 'cfgFocus' || n === 'cfgBrk' || n === 'cfgLong'){
        const c = cfg();
        const v = Math.max(1, Math.min(180, Math.round(Number(e.target.value) || 1)));
        if(n === 'cfgFocus'){ c.focus = Math.max(5, v); draft.foco = c.focus * 60; }
        if(n === 'cfgBrk') c.brk = Math.min(60, v);
        if(n === 'cfgLong') c.longBrk = Math.min(60, v);
        saveCfg(c);
        readDraft();
        render(view);
      }else if(n === 'task' || n === 'label') readDraft();
    });
    root.addEventListener('input', e => { if(inTempo() && e.target.name === 'label') draftLabel = e.target.value; });
    draft.foco = cfg().focus * 60;
  }

  /** Garante que o relógio rode (e conclua sozinho) mesmo fora da tela Tempo. */
  function watch(){
    if(mine()){ if(!ticker) startTicker(); }
    else{ stopTicker(); updateTitle(); keepAwake(false); }
  }

  return { init, render, refresh, tick, watch, mine, tabsHtml, beep, unlockAudio };
})();
