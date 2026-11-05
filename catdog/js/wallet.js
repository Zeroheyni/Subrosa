/* ============================================================
   CAT & DOG — tela "Moedas": saldos, extrato e ajuste do mestre
   ============================================================ */
window.Wallet = (function(){
  'use strict';

  const R = CD_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  let view = null;
  let who = 'todas';          // todas | gato | cao
  let shown = null;

  const me = () => App.side;
  const them = () => R.other(App.side);
  const name = s => R.SIDES[s].label;

  const KIND = { task: 'Tarefa', adjust: 'Ajuste do mestre', reward: 'Loja', refund: 'Reembolso', streak: 'Sequência', focus: 'Foco' };

  function dayLabel(iso){
    const td = R.todayISO();
    if(iso === td) return 'Hoje';
    if(iso === R.addDays(td, -1)) return 'Ontem';
    return R.fmtDay(iso);
  }

  function balance(s){
    const isMe = s === me();
    return `
      <div class="balance ${s} ${isMe ? 'me' : ''}">
        <div class="balance-glow" aria-hidden="true"></div>
        <span class="balance-coin">${UI.coin(s, 52)}</span>
        <div class="balance-body">
          <small>${R.SIDES[s].coin}${isMe ? ' · você' : ' · ' + name(s)}</small>
          <b data-v="${App.wallets[s]}" data-side="${s}">${App.wallets[s]}</b>
        </div>
      </div>`;
  }

  /** Tarefas minhas já concluídas cujo valor ainda não foi definido (moedas a caminho). */
  function waiting(){
    const s = me();
    const td = R.todayISO();
    return App.tasks.filter(t => {
      if(!R.relevantTo(t, s) || R.hasValue(t, s)) return false;
      return R.status(t, App.comps, td).done[s];
    });
  }

  function row(l){
    const task = l.task_id ? App.tasks.find(t => t.id === l.task_id) : null;
    const title = l.kind === 'adjust' ? (l.note || 'Ajuste') : (l.note || (task && task.title) || 'Tarefa');
    const pos = l.amount > 0;
    return `
      <li class="log-row ${l.side}">
        <span class="log-coin">${UI.coin(l.side, 30)}</span>
        <span class="log-main"><b>${esc(title)}</b><small>${KIND[l.kind] || l.kind} · ${name(l.side)} · ${R.timeOf(l.created_at)}</small></span>
        <span class="log-amt ${pos ? 'pos' : 'neg'}">${pos ? '+' : '−'}${Math.abs(l.amount)}</span>
      </li>`;
  }

  function render(root){
    view = root;
    const s = me();
    const list = App.log.filter(l => who === 'todas' || l.side === who);
    const byDay = new Map();
    list.forEach(l => {
      const d = R.dayOf(l.created_at);
      if(!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(l);
    });
    const wait = waiting();

    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Carteira</span><h1>Moedas</h1></div>
        ${App.isMaster ? `<button class="btn ghost small" type="button" data-act="adjust">${I.edit}<span>Ajustar</span></button>` : ''}
      </header>

      <section class="balances enter">${balance(s)}${balance(them())}</section>

      ${wait.length ? `
        <p class="hint enter">${I.hourglass}<span><b>${wait.length}</b> ${wait.length === 1 ? 'tarefa concluída espera' : 'tarefas concluídas esperam'} o ${name(them())} definir o valor — as moedas entram quando ele definir.</span></p>` : ''}

      <nav class="seg enter" aria-label="Filtro do extrato">
        ${[['todas', 'Tudo'], [s, 'Minhas'], [them(), 'Do ' + name(them())]].map(([k, label]) =>
          `<button type="button" class="seg-btn ${who === k ? 'on' : ''}" data-who="${k}">${label}</button>`).join('')}
      </nav>

      ${list.length ? [...byDay.entries()].map(([d, rows]) => `
        <section class="log-day">
          <h2>${dayLabel(d)}</h2>
          <ul class="log">${rows.map(row).join('')}</ul>
        </section>`).join('')
      : `<div class="empty enter">
           <div class="empty-art ${s}">${UI.coin(s, 64)}</div>
           <h3>Nada no extrato ainda</h3>
           <p>Conclua tarefas para as moedas começarem a aparecer aqui.</p>
         </div>`}`;
    animate(root);
  }

  function animate(root){
    root.querySelectorAll('.balance b[data-v]').forEach(b => {
      const to = Number(b.dataset.v);
      const from = shown ? shown[b.dataset.side] : to;
      b.dataset.v = String(from);
      b.textContent = from;
      UI.countTo(b, to);
    });
    shown = { gato: App.wallets.gato, cao: App.wallets.cao };
  }

  function refresh(){
    if(!view) return;
    const y = window.scrollY;
    render(view);
    view.querySelectorAll('.enter').forEach(el => el.classList.add('still'));
    window.scrollTo({ top: y });
  }

  // ---------- ajuste (só o mestre) ----------
  function openAdjust(){
    let sideSel = me();
    const m = UI.openModal({
      title: 'Ajustar moedas',
      html: `
        <form class="form" data-form autocomplete="off">
          <p class="hint-line">Uma correção do mestre: soma ou tira moedas e fica registrada no extrato.</p>
          <fieldset class="field"><legend>De quem?</legend>
            <div class="choice two">
              ${['gato', 'cao'].map(k => `
                <label class="opt ${k}"><input type="radio" name="side" value="${k}" ${k === sideSel ? 'checked' : ''}><span>${UI.face(k, 22)}<b>${name(k)}</b></span></label>`).join('')}
            </div>
          </fieldset>
          <label class="field"><span>Quantas moedas? <small>(negativo tira)</small></span>
            <input name="amount" type="number" inputmode="numeric" step="1" min="-10000" max="10000" value="5" required></label>
          <div class="quick">${[-10, -5, -1, 1, 5, 10, 20].map(n => `<button type="button" class="qbtn" data-add="${n}">${n > 0 ? '+' : '−'}${Math.abs(n)}</button>`).join('')}</div>
          <label class="field"><span>Motivo <small>(opcional)</small></span>
            <input name="note" maxlength="120" placeholder="Ex.: bônus de fim de semana"></label>
          <div class="sheet-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">Aplicar</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    form.addEventListener('click', e => {
      const b = e.target.closest('[data-add]');
      if(b) form.elements.amount.value = Number(form.elements.amount.value || 0) + Number(b.dataset.add);
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const amount = Math.round(Number(form.elements.amount.value));
      if(!amount){ UI.toast('Digite uma quantidade diferente de zero', 'bad'); return; }
      const side = form.querySelector('input[name=side]:checked').value;
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          await API.adjust(side, amount, form.elements.note.value.trim() || 'Ajuste');
          m.close();
          await App.reload();
          App.refreshView();
          UI.toast(`${amount > 0 ? '+' : '−'}${R.pluralCoins(Math.abs(amount), side)} para o ${name(side)}`, 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  function init(root){
    root.addEventListener('click', e => {
      const w = e.target.closest('[data-who]');
      if(w && view){ who = w.dataset.who; render(view); return; }
      if(e.target.closest('[data-act="adjust"]') && App.isMaster) openAdjust();
    });
  }

  return { init, render, refresh };
})();
