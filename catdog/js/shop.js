/* ============================================================
   CAT & DOG — tela "Loja": comprar, oferecer e vales

   Recompensa própria: quem cria compra com as próprias moedas e já vale.
   Presente: quem cria promete cumprir; o preço é em moedas de quem compra,
   e a compra vira um vale pendente até o dono marcar "cumprido" (ou devolver
   as moedas).
   ============================================================ */
window.Shop = (function(){
  'use strict';

  const R = CD_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  let view = null;
  let tab = 'comprar';        // comprar | ofertas | vales

  const me = () => App.side;
  const them = () => R.other(App.side);
  const name = s => R.SIDES[s].label;
  const balance = () => App.wallets[me()];

  const dateOf = ts => {
    const d = R.dayOf(ts), td = R.todayISO();
    return d === td ? 'hoje' : d === R.addDays(td, -1) ? 'ontem' : R.fmtDay(d);
  };

  // ---------- peças ----------
  function priceBadge(side, price){
    return `<span class="reward ${side}">${UI.coin(side, 18)}<b>${price}</b></span>`;
  }

  function rewardCard(r, i, manage){
    const own = R.isOwnReward(r);
    const mine = r.owner === me();
    const missing = r.price - balance();
    const can = missing <= 0;
    return `
      <article class="reward-card ${r.for_side} ${r.active ? '' : 'off'}" data-reward="${r.id}" style="--i:${i || 0}">
        <span class="rc-face ${r.owner}">${UI.face(r.owner, 32)}</span>
        <div class="rc-main">
          <h3>${esc(r.title)}</h3>
          ${r.description ? `<p>${esc(r.description)}</p>` : ''}
          <div class="chips">
            ${own ? `<span class="chip">${I.sparkle}<span>Própria</span></span>`
                  : `<span class="chip shared">${I.gift}<span>${mine ? 'Para o ' + name(r.for_side) : 'Presente do ' + name(r.owner)}</span></span>`}
            ${r.once ? `<span class="chip"><span>Uma vez só</span></span>` : ''}
            ${manage && !r.active ? `<span class="chip late"><span>Esgotada</span></span>` : ''}
          </div>
        </div>
        <div class="rc-side">
          ${priceBadge(r.for_side, r.price)}
          ${manage
            ? `<button class="btn small ghost" type="button" data-act="edit">${I.edit}<span>Editar</span></button>`
            : `<button class="btn small ${can ? 'primary' : ''}" type="button" data-act="buy" ${can ? '' : 'disabled'}>${can ? 'Comprar' : 'Faltam ' + missing}</button>`}
        </div>
      </article>`;
  }

  function voucherCard(p, mode){
    const buyerIsMe = p.buyer === me();
    const who = mode === 'fulfill' ? `${name(p.buyer)} comprou` : mode === 'waiting' ? `Você comprou do ${name(p.provider)}` : (buyerIsMe ? 'Você comprou' : `${name(p.buyer)} comprou`);
    const status = p.status === 'done' ? `<span class="chip ok">${I.check}<span>Cumprido</span></span>`
                 : p.status === 'refunded' ? `<span class="chip"><span>Devolvido</span></span>`
                 : `<span class="chip shared">${I.hourglass}<span>Pendente</span></span>`;
    return `
      <article class="reward-card voucher ${p.buyer}" data-purchase="${p.id}">
        <span class="rc-face ${p.provider}">${UI.face(p.provider, 32)}</span>
        <div class="rc-main">
          <h3>${esc(p.title)}</h3>
          <p>${who} · ${dateOf(p.created_at)}</p>
          <div class="chips">${mode === 'history' || mode === 'waiting' ? status : ''}</div>
        </div>
        <div class="rc-side">
          ${priceBadge(p.buyer, p.price)}
          ${mode === 'fulfill' ? `
            <div class="rc-actions">
              <button class="btn small primary" type="button" data-act="fulfill">${I.check}<span>Cumprido</span></button>
              <button class="btn small ghost" type="button" data-act="refund"><span>Devolver</span></button>
            </div>` : ''}
        </div>
      </article>`;
  }

  // ---------- telas ----------
  function tabsHtml(){
    const need = R.toFulfill(App.purchases, me()).length;
    const t = (key, label, badge) => `<a href="#loja/${key}" class="seg-btn ${tab === key ? 'on' : ''}">${label}${badge ? `<b>${badge}</b>` : ''}</a>`;
    return `<nav class="seg" aria-label="Loja">${t('comprar', 'Comprar')}${t('ofertas', 'Minhas ofertas')}${t('vales', 'Vales', need)}</nav>`;
  }

  function head(){
    const s = me();
    return `
      <header class="view-head enter">
        <div><span class="eyebrow">Recompensas</span><h1>Loja</h1></div>
        <div class="shop-balance ${s}">${UI.coin(s, 26)}<b>${balance()}</b></div>
      </header>`;
  }

  function renderBuy(){
    const mineOwn = R.rewardsToBuy(App.rewards, me()).filter(r => R.isOwnReward(r));
    const gifts = R.rewardsToBuy(App.rewards, me()).filter(r => !R.isOwnReward(r));
    const sect = (title, list, hint) => list.length ? `
      <section class="group"><header class="group-head"><h2>${title}</h2><span class="count">${list.length}</span></header>
        ${hint ? `<p class="hint-line">${hint}</p>` : ''}
        <div class="tasks">${list.map((r, i) => rewardCard(r, i, false)).join('')}</div></section>` : '';
    const empty = !mineOwn.length && !gifts.length;
    return `
      ${sect(`Presentes do ${name(them())}`, gifts, `Ele promete cumprir; você paga com ${R.SIDES[me()].coin}.`)}
      ${sect('Para mim', mineOwn)}
      ${empty ? `
        <div class="empty enter">
          <div class="empty-art ${me()}">${I.gift}</div>
          <h3>A loja está vazia</h3>
          <p>Crie uma recompensa para você ou espere o ${name(them())} oferecer um presente.</p>
          <a class="btn primary" href="#loja/ofertas">${I.plus}<span>Criar recompensa</span></a>
        </div>` : ''}`;
  }

  function renderOffers(){
    const list = R.rewardsOffered(App.rewards, me());
    return `
      <p class="hint enter">${I.info}<span>Aqui ficam as recompensas que <b>você</b> criou: as suas e os presentes que você oferece ao ${name(them())} (você é quem cumpre).</span></p>
      ${list.length
        ? `<div class="tasks">${list.map((r, i) => rewardCard(r, i, true)).join('')}</div>`
        : `<div class="empty enter"><div class="empty-art ${me()}">${I.gift}</div><h3>Nada criado ainda</h3><p>Toque em “Nova recompensa”.</p></div>`}`;
  }

  function renderVouchers(){
    const todo = R.toFulfill(App.purchases, me());
    const wait = R.waitingFor(App.purchases, me());
    const hist = App.purchases.filter(p => p.status !== 'pending' && (p.buyer === me() || p.provider === me())).slice(0, 20);
    const sect = (title, list, mode, cls) => list.length ? `
      <section class="group ${cls || ''}"><header class="group-head"><h2>${title}</h2><span class="count">${list.length}</span></header>
        <div class="tasks">${list.map(p => voucherCard(p, mode)).join('')}</div></section>` : '';
    const empty = !todo.length && !wait.length && !hist.length;
    return `
      ${sect('Para você cumprir', todo, 'fulfill', 'late')}
      ${sect(`Esperando o ${name(them())}`, wait, 'waiting')}
      ${sect('Histórico', hist, 'history', 'soft')}
      ${empty ? `<div class="empty enter"><div class="empty-art ${me()}">${I.hourglass}</div><h3>Nenhum vale ainda</h3><p>Quando alguém comprar um presente, o vale aparece aqui.</p></div>` : ''}`;
  }

  function render(root, t){
    view = root;
    if(t) tab = t;
    const s = me();
    root.innerHTML = `
      ${head()}
      ${tabsHtml()}
      ${tab === 'ofertas' ? renderOffers() : tab === 'vales' ? renderVouchers() : renderBuy()}
      <button class="fab ${s}" type="button" data-act="new" aria-label="Nova recompensa">${I.plus}<span>Nova recompensa</span></button>`;
    const b = root.querySelector('.shop-balance b');
    if(b) UI.countTo(b, balance());
  }

  function refresh(){
    if(!view) return;
    const y = window.scrollY;
    render(view);
    view.querySelectorAll('.enter').forEach(el => el.classList.add('still'));
    window.scrollTo({ top: y });
  }

  // ---------- ações ----------
  async function buy(r, btn){
    const own = R.isOwnReward(r);
    const after = balance() - r.price;
    const ok = await UI.confirmBox({
      title: 'Comprar recompensa',
      html: `<b>${esc(r.title)}</b> por ${R.pluralCoins(r.price, me())}.<br><span class="muted">Saldo depois: ${after} · ${own ? 'vale na hora.' : `vira um vale para o ${name(r.owner)} cumprir.`}</span>`,
      yesLabel: `Comprar por ${r.price}`
    });
    if(!ok) return;
    try{
      await API.buyReward(r.id);
      UI.coinBurst(btn, me(), 0);
      await App.reload();
      App.refreshView();
      UI.toast(own ? `${r.title}: aproveite! 🎉` : `Vale enviado: o ${name(r.owner)} vai cumprir “${r.title}”.`, 'good');
    }catch(e){
      UI.toast(e.message, 'bad');
      await App.reload().catch(() => {});
      App.refreshView();
    }
  }

  async function settle(p, kind){
    const refund = kind === 'refund';
    if(refund){
      const ok = await UI.confirmBox({
        title: 'Devolver as moedas',
        html: `Devolver ${R.pluralCoins(p.price, p.buyer)} ao ${name(p.buyer)} por <b>${esc(p.title)}</b>?`,
        yesLabel: 'Devolver', danger: true
      });
      if(!ok) return;
    }
    try{
      if(refund) await API.refundPurchase(p.id); else await API.fulfillPurchase(p.id);
      await App.reload();
      App.refreshView();
      UI.toast(refund ? 'Moedas devolvidas' : 'Vale cumprido', 'good');
    }catch(e){ UI.toast(e.message, 'bad'); }
  }

  function openForm(r){
    const s = me();
    const isNew = !r;
    const d = r || { title:'', description:'', price:10, once:false, active:true, for_side:s };
    let price = d.price;
    const quick = [5, 10, 20, 50, 100];
    const m = UI.openModal({
      title: isNew ? 'Nova recompensa' : 'Editar recompensa',
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>O que é?</span>
            <input name="title" required maxlength="100" value="${esc(d.title)}" placeholder="Ex.: 1 hora de videogame" autofocus></label>
          <label class="field"><span>Detalhes <small>(opcional)</small></span>
            <textarea name="description" rows="2" maxlength="400" placeholder="Regras, quando pode usar…">${esc(d.description)}</textarea></label>
          ${isNew ? `
          <fieldset class="field"><legend>Para quem?</legend>
            <div class="choice two">
              <label class="opt ${s}"><input type="radio" name="for" value="${s}" checked><span>${UI.face(s, 22)}<b>Para mim</b></span></label>
              <label class="opt ${them()}"><input type="radio" name="for" value="${them()}"><span>${UI.face(them(), 22)}<b>Presente p/ o ${name(them())}</b></span></label>
            </div>
            <p class="hint-line" data-forhint>Você compra com as suas moedas e já vale.</p>
          </fieldset>` : `<p class="hint-line">${R.isOwnReward(d) ? 'Recompensa própria.' : `Presente para o ${name(d.for_side)}: o preço é em ${R.SIDES[d.for_side].coin}.`}</p>`}
          <fieldset class="field"><legend>Preço</legend>
            <div class="stepper ${d.for_side}" data-stepper>
              <button class="icon-btn big" type="button" data-step="-1" aria-label="Menos">${I.minus}</button>
              <div class="stepper-n"><span data-pricecoin>${UI.coin(d.for_side, 34)}</span><input name="price" type="number" inputmode="numeric" min="1" max="5000" value="${price}" aria-label="Preço"></div>
              <button class="icon-btn big" type="button" data-step="1" aria-label="Mais">${I.plus}</button>
            </div>
            <div class="quick center">${quick.map(n => `<button type="button" class="qbtn" data-q="${n}">${n}</button>`).join('')}</div>
          </fieldset>
          <label class="switch"><input type="checkbox" name="once" ${d.once ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Só uma vez <small>(some da loja depois de comprada)</small></span></label>
          ${!isNew ? `<label class="switch"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Disponível na loja</span></label>` : ''}
          <div class="sheet-actions">
            ${!isNew ? `<button class="btn danger ghost" type="button" data-del>${I.trash}<span>Apagar</span></button>` : `<button class="btn" type="button" data-modal-close>Cancelar</button>`}
            <button class="btn primary" type="submit">${isNew ? 'Criar' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const input = form.elements.price;
    const set = n => { input.value = Math.max(1, Math.min(5000, Math.round(Number(n) || 1))); paint(); };
    const forSide = () => (isNew ? form.querySelector('input[name=for]:checked').value : d.for_side);
    function paint(){
      form.querySelectorAll('.qbtn').forEach(b => b.classList.toggle('on', b.dataset.q === String(input.value)));
      const fs = forSide();
      form.querySelector('[data-stepper]').className = `stepper ${fs}`;
      form.querySelector('[data-pricecoin]').innerHTML = UI.coin(fs, 34);
      const hint = form.querySelector('[data-forhint]');
      if(hint) hint.textContent = fs === s ? 'Você compra com as suas moedas e já vale.' : `O ${name(fs)} paga com ${R.SIDES[fs].coin} e você é quem cumpre.`;
    }
    paint();
    form.addEventListener('change', paint);
    input.addEventListener('input', paint);
    form.addEventListener('click', e => {
      const st = e.target.closest('[data-step]'); if(st) set(Number(input.value) + Number(st.dataset.step));
      const q = e.target.closest('[data-q]'); if(q) set(q.dataset.q);
    });
    const del = form.querySelector('[data-del]');
    if(del) del.addEventListener('click', async () => {
      const ok = await UI.confirmBox({ title: 'Apagar recompensa', html: `Apagar <b>${esc(r.title)}</b>? As compras já feitas continuam no histórico.`, yesLabel: 'Apagar', danger: true });
      if(!ok) return;
      try{ await API.deleteReward(r.id); m.close(); await App.reload(); App.refreshView(); UI.toast('Recompensa apagada'); }
      catch(err){ UI.toast(err.message, 'bad'); }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = form.elements.title.value.trim();
      if(!title){ UI.toast('Dê um nome à recompensa', 'bad'); return; }
      const data = { title, description: form.elements.description.value.trim(), price: Math.round(Number(input.value)), once: form.elements.once.checked };
      if(isNew) data.for_side = forSide();
      else data.active = form.elements.active.checked;
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          await API.saveReward(r ? r.id : null, data);
          m.close();
          await App.reload();
          App.refreshView();
          UI.toast(isNew ? 'Recompensa criada' : 'Recompensa salva', 'good');
          if(isNew && location.hash !== '#loja/ofertas') App.go('#loja/ofertas');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  function init(root){
    root.addEventListener('click', e => {
      if(!view || App.current !== 'loja') return;
      const b = e.target.closest('[data-act]');
      if(!b) return;
      const a = b.dataset.act;
      if(a === 'new'){ openForm(null); return; }
      const rc = b.closest('[data-reward]');
      const pc = b.closest('[data-purchase]');
      if(rc){
        const r = App.rewards.find(x => x.id === rc.dataset.reward);
        if(!r) return;
        if(a === 'buy') buy(r, b);
        else if(a === 'edit') openForm(r);
      }else if(pc){
        const p = App.purchases.find(x => x.id === pc.dataset.purchase);
        if(p) settle(p, a === 'refund' ? 'refund' : 'fulfill');
      }
    });
  }

  return { init, render, refresh };
})();
