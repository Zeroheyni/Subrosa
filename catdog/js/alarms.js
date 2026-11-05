/* ============================================================
   CAT & DOG — alarmes (tela Tempo › Alarmes) e avisos que chegam com o app aberto

   Cada lado tem os seus alarmes (uma vez, todo dia ou dias da semana).
   Quem faz tocar com o app FECHADO é o servidor (pg_cron → catdog-push → notificação).
   Com o app ABERTO, o próprio app toca (som, vibração e tela de alarme) e também
   mostra os avisos que chegam do servidor; a chave de cada aviso evita tocar duas vezes.
   ============================================================ */
window.Alarms = (function(){
  'use strict';

  const R = CD_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  const RUNG_KEY = 'catdog.rung';
  const LOCAL_WINDOW_S = 120;          // o app aberto só toca se o alarme venceu há menos de 2 min
  const SNOOZE_MIN = 5;

  let view = null;
  let overlay = null;
  let ringTimer = null;
  let clock = null;

  const me = () => App.side;
  const mine = () => App.alarms.filter(a => a.side === me()).sort((x, y) => x.at_time.localeCompare(y.at_time));

  // ---------- hora do meu fuso (Portugal para o jogador, Brasília para o mestre) ----------
  const nowMs = () => Date.now() + (App.skew || 0);
  function spNow(){
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: R.TZS[me()], hourCycle: 'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })
      .formatToParts(new Date(nowMs())).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
    const iso = `${p.year}-${p.month}-${p.day}`;
    return { iso, sec: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second), dow: new Date(iso + 'T12:00:00Z').getUTCDay() };
  }
  const secOf = t => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };
  const hm = t => t.slice(0, 5);

  // ---------- texto ----------
  function repeatText(a){
    if(a.repeat === 'daily') return 'Todo dia';
    if(a.repeat === 'weekly') return a.repeat_days.slice().sort((x, y) => x - y).map(d => R.WEEKDAYS[d]).join(' · ');
    const n = spNow();
    if(a.on_date === n.iso) return 'Hoje';
    if(a.on_date === R.addDays(n.iso, 1)) return 'Amanhã';
    const [y, m, d] = a.on_date.split('-');
    return `${d}/${m}`;
  }

  /** Dia em que o alarme vale hoje (ou null se hoje não toca). */
  function fireDay(a, n){
    if(!a.active) return null;
    if(a.repeat === 'none') return a.on_date === n.iso ? n.iso : null;
    if(a.repeat === 'daily') return n.iso;
    return a.repeat_days.includes(n.dow) ? n.iso : null;
  }

  /** Próximo alarme ligado do meu lado (para o cartão da tela Hoje). */
  function next(){
    const n = spNow();
    let best = null;
    mine().forEach(a => {
      if(!a.active) return;
      for(let i = 0; i < 8; i++){
        const iso = R.addDays(n.iso, i);
        const dow = new Date(iso + 'T12:00:00Z').getUTCDay();
        const ok = a.repeat === 'none' ? a.on_date === iso : (a.repeat === 'daily' || a.repeat_days.includes(dow));
        if(!ok) continue;
        if(i === 0 && secOf(a.at_time) <= n.sec) continue;
        const k = i * 86400 + secOf(a.at_time);
        if(!best || k < best.k) best = { k, a, i, dow };
        break;
      }
    });
    if(!best) return null;
    return { time: hm(best.a.at_time), label: best.a.label, when: best.i === 0 ? 'hoje' : best.i === 1 ? 'amanhã' : R.WEEKDAYS[best.dow] };
  }

  // ---------- já tocou (neste aparelho) ----------
  function rungSet(){
    try{ return new Set(JSON.parse(localStorage.getItem(RUNG_KEY) || '[]')); }catch(e){ return new Set(); }
  }
  function markRung(key){
    const s = rungSet(); s.add(key);
    try{ localStorage.setItem(RUNG_KEY, JSON.stringify([...s].slice(-60))); }catch(e){}
  }

  // ---------- tela de alarme tocando ----------
  function ring(a, key, titleOverride){
    if(rungSet().has(key)) return;
    markRung(key);
    stopRing();
    const label = a ? (a.label || 'Alarme') : (titleOverride || 'Alarme').replace(/^⏰\s*/, '');
    const time = a ? hm(a.at_time) : '';
    overlay = document.createElement('div');
    overlay.className = 'ring-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-label', 'Alarme');
    overlay.innerHTML = `
      <div class="ring-card ${me()}">
        <div class="ring-bell">${I.bell}</div>
        ${time ? `<b class="ring-time">${esc(time)}</b>` : ''}
        <h2>${esc(label)}</h2>
        <div class="ring-actions">
          <button class="btn primary big-play" type="button" data-ring="stop" autofocus>Parar</button>
          <button class="btn" type="button" data-ring="snooze">Soneca · ${SNOOZE_MIN} min</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', async e => {
      const b = e.target.closest('[data-ring]');
      if(!b) return;
      const snooze = b.dataset.ring === 'snooze';
      stopRing();
      if(snooze) await snoozeAlarm(label);
    });
    let n = 0;
    const go = () => { Tempo.beep(); if(++n >= 45) stopRing(); };   // ~90 s e para
    go();
    ringTimer = setInterval(go, 2000);
  }

  function stopRing(){
    if(ringTimer){ clearInterval(ringTimer); ringTimer = null; }
    if(overlay){ overlay.remove(); overlay = null; }
    try{ if(navigator.vibrate) navigator.vibrate(0); }catch(e){}
  }

  async function snoozeAlarm(label){
    const at = new Date(nowMs() + SNOOZE_MIN * 60000);
    const p = R.timeOf(at, me());
    try{
      await API.saveAlarm(null, { label, at_time: p, repeat: 'none' });
      await App.reload();
      App.refreshView();
      UI.toast(`Soneca: toca de novo às ${p}`, 'good');
    }catch(err){ UI.toast(err.message, 'bad'); }
  }

  // ---------- o app aberto confere os próprios alarmes ----------
  function check(){
    const n = spNow();
    const rung = rungSet();
    mine().forEach(a => {
      const day = fireDay(a, n);
      if(!day) return;
      const at = secOf(a.at_time);
      if(n.sec < at || n.sec >= at + LOCAL_WINDOW_S) return;
      if(Date.parse(a.updated_at) > Date.parse(R.zonedToISO(day, hm(a.at_time), R.TZS[me()]))) return;   // editado depois da hora
      const key = `alarm:${a.id}:${a.repeat === 'none' ? a.on_date : day}`;
      if(!rung.has(key)) ring(a, key);
    });
  }

  /** Aviso que o serviço de push entregou enquanto o app estava aberto (veio pelo service worker). */
  function onPush(p){
    if(!p) return;
    const key = p.key || '';
    if(key.startsWith('alarm:')){
      const id = key.split(':')[1];
      const a = App.alarms.find(x => x.id === id);
      if(a && a.side !== me()) return;
      ring(a || null, key, p.title);
    }else if(key.startsWith('due:') || key.startsWith('purchase:')){
      if(rungSet().has(key)) return;
      markRung(key);
      UI.toast(`${p.title} · ${p.body}`);
      Tempo.beep();
    }
  }

  // ---------- tela ----------
  function pushHint(){
    const ok = Push.supported() && 'Notification' in window && Notification.permission === 'granted';
    if(ok) return '';
    return `<a class="hint-card enter" href="#ajustes">${I.bell}<span><b>Alarmes com o app fechado</b> precisam das notificações. Toque para ativar em Ajustes.</span></a>`;
  }

  function row(a){
    return `
      <div class="alarm ${a.active ? '' : 'off'} enter" data-id="${a.id}">
        <button class="alarm-main" type="button" data-al="edit" aria-label="Editar alarme das ${hm(a.at_time)}">
          <b class="alarm-time">${hm(a.at_time)}</b>
          <span class="alarm-info"><span class="alarm-label">${esc(a.label || 'Alarme')}</span><small>${esc(repeatText(a))}</small></span>
        </button>
        <label class="switch" aria-label="${a.active ? 'Desligar' : 'Ligar'} alarme">
          <input type="checkbox" data-al-toggle ${a.active ? 'checked' : ''}><span class="switch-ui"></span>
        </label>
      </div>`;
  }

  function render(root){
    view = root;
    const list = mine();
    const s = me();
    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Tempo</span><h1>Alarmes</h1></div>
      </header>
      ${Tempo.tabsHtml('alarmes')}
      ${pushHint()}
      ${list.length
        ? `<div class="alarm-list">${list.map(row).join('')}</div>`
        : `<div class="empty enter"><div class="empty-art ${s}">${I.bell}</div><h3>Nenhum alarme</h3><p>Crie um alarme único ou que se repete. Ele toca mesmo com o app fechado.</p></div>`}
      <button class="fab ${s}" type="button" data-al="new" aria-label="Novo alarme">${I.plus}<span>Novo alarme</span></button>`;
  }

  function refresh(){
    if(!view) return;
    const y = window.scrollY;
    render(view);
    view.querySelectorAll('.enter').forEach(el => el.classList.add('still'));
    window.scrollTo({ top: y });
  }

  // ---------- formulário ----------
  function openForm(a){
    const isNew = !a;
    const d = a || { label:'', at_time:'07:00', repeat:'daily', repeat_days:[] };
    const days = new Set(d.repeat_days || []);
    const m = UI.openModal({
      title: isNew ? 'Novo alarme' : 'Editar alarme',
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>Horário</span>
            <input type="time" name="at" required value="${hm(d.at_time)}" class="time-big" autofocus></label>
          <label class="field"><span>Nome <small>(opcional)</small></span>
            <input name="label" maxlength="60" value="${esc(d.label)}" placeholder="Ex.: Acordar"></label>
          <fieldset class="field"><legend>Repetir</legend>
            <div class="choice three">
              <label class="opt"><input type="radio" name="rep" value="none" ${d.repeat === 'none' ? 'checked' : ''}><span><b>Uma vez</b></span></label>
              <label class="opt"><input type="radio" name="rep" value="daily" ${d.repeat === 'daily' ? 'checked' : ''}><span><b>Todo dia</b></span></label>
              <label class="opt"><input type="radio" name="rep" value="weekly" ${d.repeat === 'weekly' ? 'checked' : ''}><span><b>Dias</b></span></label>
            </div>
            <div class="weekdays" data-weekdays hidden>
              ${R.WEEKDAYS.map((w, i) => `<button type="button" class="wd ${days.has(i) ? 'on' : ''}" data-wd="${i}" aria-pressed="${days.has(i)}">${w}</button>`).join('')}
            </div>
          </fieldset>
          <div class="sheet-actions">
            ${isNew ? '<button class="btn" type="button" data-modal-close>Cancelar</button>' : '<button class="btn danger" type="button" data-del>Apagar</button>'}
            <button class="btn primary" type="submit">${isNew ? 'Criar alarme' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const rep = () => (form.querySelector('input[name="rep"]:checked') || {}).value;
    const paint = () => { form.querySelector('[data-weekdays]').hidden = rep() !== 'weekly'; };
    paint();
    form.addEventListener('change', paint);
    form.addEventListener('click', e => {
      const wd = e.target.closest('[data-wd]');
      if(!wd) return;
      const n = Number(wd.dataset.wd);
      if(days.has(n)) days.delete(n); else days.add(n);
      wd.classList.toggle('on', days.has(n));
      wd.setAttribute('aria-pressed', days.has(n) ? 'true' : 'false');
    });
    if(!isNew){
      form.querySelector('[data-del]').onclick = async () => {
        const ok = await UI.confirmBox({ title: 'Apagar alarme', text: 'Apagar este alarme?', yesLabel: 'Apagar', danger: true });
        if(!ok) return;
        try{ await API.deleteAlarm(a.id); m.close(true); await App.reload(); App.refreshView(); UI.toast('Alarme apagado'); }
        catch(err){ UI.toast(err.message, 'bad'); }
      };
    }
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const r = rep();
      const data = { at_time: form.elements.at.value, label: form.elements.label.value.trim(), repeat: r, repeat_days: [], active: true };
      if(!data.at_time){ UI.toast('Escolha o horário', 'bad'); return; }
      if(r === 'weekly'){
        if(!days.size){ UI.toast('Escolha pelo menos um dia da semana', 'bad'); return; }
        data.repeat_days = [...days].sort((x, y) => x - y);
      }
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          Tempo.unlockAudio();
          await API.saveAlarm(a ? a.id : null, data);
          m.close(true);
          await App.reload();
          App.refreshView();
          UI.toast(isNew ? 'Alarme criado' : 'Alarme salvo', 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- eventos ----------
  function active(){ return App.current === 'tempo' && App.sub === 'alarmes'; }

  function init(root){
    root.addEventListener('click', e => {
      if(!active()) return;
      const b = e.target.closest('[data-al]');
      if(!b) return;
      if(b.dataset.al === 'new') openForm(null);
      else if(b.dataset.al === 'edit'){
        const a = App.alarms.find(x => x.id === b.closest('.alarm').dataset.id);
        if(a) openForm(a);
      }
    });
    root.addEventListener('change', async e => {
      if(!active() || !e.target.matches('[data-al-toggle]')) return;
      const id = e.target.closest('.alarm').dataset.id;
      Tempo.unlockAudio();
      try{ await API.toggleAlarm(id, e.target.checked); await App.reload(); App.refreshView(); }
      catch(err){ UI.toast(err.message, 'bad'); await App.reload().catch(() => {}); App.refreshView(); }
    });

    // o navegador só libera som depois de um toque: destrava no primeiro
    const unlock = () => { Tempo.unlockAudio(); document.removeEventListener('pointerdown', unlock, true); };
    document.addEventListener('pointerdown', unlock, true);

    // avisos do servidor entregues ao app aberto (o service worker repassa)
    if('serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('message', e => {
        if(e.data && e.data.type === 'catdog-push') onPush(e.data.payload);
      });
    }
    if(!clock) clock = setInterval(check, 1000);
  }

  return { init, render, refresh, openForm, check, onPush, stopRing, next };
})();
