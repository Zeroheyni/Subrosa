/* ============================================================
   CAT & DOG — tela "Loja": comprar, oferecer, vales e temas

   Produto próprio: quem cria compra com as próprias moedas e já vale.
   Presente: quem cria promete cumprir; o preço é em moedas de quem compra,
   e a compra vira um vale pendente até o dono marcar "cumprido" (ou devolver
   as moedas).

   Cada lado tem a PRÓPRIA loja, organizada em abas que ele mesmo cria
   (ex.: "🍰 Doces", "🎮 Jogos"). Cada produto pode ter um emote OU uma imagem
   e uma cor de borda. Quem compra vê a loja do outro com essas abas.
   ============================================================ */
window.Shop = (function(){
  'use strict';

  const R = CD_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  let view = null;
  let tab = 'comprar';        // comprar | ofertas | vales | temas
  let store = null;           // 'mine' (minha loja) | 'theirs' (loja do outro) — só na aba Comprar
  let cat = 'all';            // 'all' | 'none' | id de uma aba de produtos

  const me = () => App.side;
  const them = () => R.other(App.side);
  const name = s => R.SIDES[s].label;
  const balance = () => App.wallets[me()];

  const dateOf = ts => {
    const d = R.dayOf(ts), td = R.todayISO();
    return d === td ? 'hoje' : d === R.addDays(td, -1) ? 'ontem' : R.fmtDay(d);
  };

  const EMOJIS = ['🍰', '🍫', '🍕', '🍿', '🎮', '🎬', '📚', '💆', '🛁', '🎁', '🧸', '🌹', '☕', '🍷', '🎧', '🛍️', '💤', '🧹', '🚗', '✈️', '🐶', '🐱', '⭐', '💖'];
  const BORDERS = ['#b48bff', '#ff6fd0', '#ff5a5f', '#ffb040', '#ffe14d', '#5ee6a6', '#3de0d0', '#4da3ff', '#8c6bff', '#f1ece0'];

  // ---------- imagens dos produtos (ficam no banco, já reduzidas) ----------
  // A lista de produtos vem sem a imagem (é grande); aqui buscamos só as que ainda não temos.
  const imgs = {};            // id → { u: updated_at, src }
  const imgOf = r => (imgs[r.id] && imgs[r.id].u === r.updated_at ? imgs[r.id].src : '');
  let loadingImgs = false;
  async function loadImages(){
    if(loadingImgs) return;
    const need = (App.rewards || []).filter(r => r.has_image && !imgOf(r));
    if(!need.length) return;
    loadingImgs = true;
    try{
      const rows = await API.listRewardImages(need.map(r => r.id));
      rows.forEach(x => { imgs[x.id] = { u: x.updated_at, src: x.image || '' }; });
      if(view && App.current === 'loja' && tab !== 'vales' && tab !== 'temas' && !UI.isModalOpen()) refresh();
    }catch(e){ /* tenta de novo na próxima atualização */ }
    loadingImgs = false;
  }

  /** Reduz a foto escolhida para ~320 px e devolve um data URL pequeno (webp ou jpeg). */
  async function fileToDataUrl(file){
    const url = URL.createObjectURL(file);
    try{
      const img = new Image();
      img.src = url;
      await img.decode();
      const max = 320, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      let q = .84;
      let out = c.toDataURL('image/webp', q);
      if(!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', q);
      const mime = out.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
      while(out.length > 120000 && q > .35){ q -= .12; out = c.toDataURL(mime, q); }
      if(out.length > 140000) throw new Error('imagem grande demais');
      return out;
    }finally{ URL.revokeObjectURL(url); }
  }

  // ---------- lojas e abas ----------
  const mineItems = () => R.rewardsToBuy(App.rewards, me()).filter(r => R.isOwnReward(r));
  const giftItems = () => R.rewardsToBuy(App.rewards, me()).filter(r => !R.isOwnReward(r));
  function currentStore(){
    const m = mineItems().length, g = giftItems().length;
    if(store === 'theirs' && g) return 'theirs';
    if(store === 'mine') return 'mine';
    return (!m && g) ? 'theirs' : 'mine';
  }
  const tabsOf = owner => (App.shopTabs || []).filter(t => t.owner === owner).sort((a, b) => a.position - b.position);
  const tabLabel = t => `${t.emoji ? esc(t.emoji) + ' ' : ''}${esc(t.name)}`;

  function filterItems(items, c){
    if(c === 'all') return items;
    if(c === 'none') return items.filter(r => !r.tab_id);
    return items.filter(r => r.tab_id === c);
  }

  /** Barra de abas de produtos: Tudo · cada aba · Sem aba. `manage` mostra também as abas vazias e os botões de criar/editar. */
  function catBar(items, owner, manage){
    const tabs = tabsOf(owner);
    const cnt = id => items.filter(r => (r.tab_id || null) === id).length;
    const shown = manage ? tabs : tabs.filter(t => cnt(t.id) > 0);
    const noTab = cnt(null);
    if(!manage && !shown.length) return '';
    if(cat !== 'all' && cat !== 'none' && !tabs.some(t => t.id === cat)) cat = 'all';
    const chip = (key, label, n, extra) => `<button class="cat-chip ${cat === key ? 'on' : ''}" type="button" data-act="cat" data-cat="${key}">${label}<b>${n}</b>${extra || ''}</button>`;
    return `
      <div class="cat-bar enter" role="tablist" aria-label="Abas de produtos">
        ${chip('all', 'Tudo', items.length)}
        ${shown.map(t => chip(t.id, tabLabel(t), cnt(t.id), manage ? `<i class="cat-edit" data-act="edittab" data-tab="${t.id}" role="button" aria-label="Editar aba">${I.edit}</i>` : '')).join('')}
        ${shown.length && noTab ? chip('none', 'Sem aba', noTab) : ''}
        ${manage ? `<button class="cat-chip add" type="button" data-act="newtab">${I.plus}<span>Nova aba</span></button>` : ''}
      </div>`;
  }

  // ---------- peças ----------
  function priceBadge(side, price){
    return `<span class="reward ${side}">${UI.coin(side, 18)}<b>${price}</b></span>`;
  }

  function productMedia(r){
    const src = imgOf(r);
    if(r.has_image) return src ? `<img src="${src}" alt="" loading="lazy">` : `<span class="prod-load">${I.hourglass}</span>`;
    if(r.emoji) return `<span class="prod-emoji">${esc(r.emoji)}</span>`;
    return `<span class="prod-emoji ghosty">${I.gift}</span>`;
  }

  function productCard(r, i, manage){
    const own = R.isOwnReward(r);
    const mine = r.owner === me();
    const missing = r.price - balance();
    const can = missing <= 0;
    const style = r.border_color ? `--pc:${r.border_color}` : '';
    return `
      <article class="prod ${r.for_side} ${r.active ? '' : 'off'} ${r.border_color ? 'custom' : ''}" data-reward="${r.id}" style="--i:${i || 0};${style}">
        <div class="prod-media">
          ${productMedia(r)}
          <span class="prod-who ${r.owner}">${UI.face(r.owner, 20)}</span>
          ${r.once ? `<span class="prod-tag">1×</span>` : ''}
        </div>
        <div class="prod-body">
          <h3>${esc(r.title)}</h3>
          ${r.description ? `<p>${esc(r.description)}</p>` : ''}
          <div class="chips">
            ${own ? `<span class="chip">${I.sparkle}<span>Própria</span></span>`
                  : `<span class="chip shared">${I.gift}<span>${mine ? 'Para o ' + name(r.for_side) : 'Presente do ' + name(r.owner)}</span></span>`}
            ${manage && !r.active ? `<span class="chip late"><span>Esgotada</span></span>` : ''}
          </div>
        </div>
        <div class="prod-foot">
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
    return `<nav class="seg" aria-label="Loja">${t('comprar', 'Comprar')}${t('ofertas', 'Meus produtos')}${t('vales', 'Vales', need)}${t('temas', 'Temas')}</nav>`;
  }

  function head(){
    const s = me();
    return `
      <header class="view-head enter">
        <div><span class="eyebrow">Recompensas</span><h1>Loja</h1></div>
        <div class="shop-balance ${s}">${UI.coin(s, 26)}<b>${balance()}</b></div>
      </header>`;
  }

  function grid(list){
    return `<div class="prod-grid">${list.map((r, i) => productCard(r, i, false)).join('')}</div>`;
  }

  function renderBuy(){
    const m = mineItems(), g = giftItems();
    const st = currentStore();
    const owner = st === 'theirs' ? them() : me();
    const items = st === 'theirs' ? g : m;
    const storeBar = g.length ? `
      <nav class="seg store-seg enter" aria-label="Qual loja">
        <button class="seg-btn ${st === 'mine' ? 'on' : ''}" type="button" data-act="store" data-store="mine">${UI.face(me(), 18)}<span>Minha loja</span><b>${m.length}</b></button>
        <button class="seg-btn ${st === 'theirs' ? 'on' : ''}" type="button" data-act="store" data-store="theirs">${UI.face(them(), 18)}<span>Loja do ${name(them())}</span><b>${g.length}</b></button>
      </nav>` : '';
    if(!m.length && !g.length){
      return `
        <div class="empty enter">
          <div class="empty-art ${me()}">${I.gift}</div>
          <h3>A loja está vazia</h3>
          <p>Crie um produto para você ou espere o ${name(them())} oferecer um presente.</p>
          <a class="btn primary" href="#loja/ofertas">${I.plus}<span>Criar produto</span></a>
        </div>`;
    }
    const list = filterItems(items, cat);
    return `
      ${storeBar}
      ${st === 'theirs' ? `<p class="hint-line enter">Presentes do ${name(them())}: ele promete cumprir; você paga com ${R.SIDES[me()].coin}.</p>` : ''}
      ${catBar(items, owner, false)}
      ${list.length ? grid(list) : `<div class="empty enter"><div class="empty-art ${me()}">${I.gift}</div><h3>Nada aqui</h3><p>${items.length ? 'Escolha outra aba acima.' : 'Ainda não há produtos nesta loja.'}</p></div>`}`;
  }

  function renderOffers(){
    const all = R.rewardsOffered(App.rewards, me());
    const list = filterItems(all, cat);
    return `
      <p class="hint enter">${I.info}<span>Aqui ficam os produtos que <b>você</b> criou: os seus e os presentes que você oferece ao ${name(them())} (você é quem cumpre). Organize em <b>abas</b> para quem compra encontrar tudo fácil.</span></p>
      ${catBar(all, me(), true)}
      ${list.length
        ? `<div class="prod-grid">${list.map((r, i) => productCard(r, i, true)).join('')}</div>`
        : `<div class="empty enter"><div class="empty-art ${me()}">${I.gift}</div><h3>${all.length ? 'Nada nesta aba' : 'Nada criado ainda'}</h3><p>${all.length ? 'Escolha outra aba ou crie um produto.' : 'Toque em “Novo produto”.'}</p></div>`}`;
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
    if(t && t !== tab){ tab = t; cat = 'all'; }
    const s = me();
    root.innerHTML = `
      ${head()}
      ${tabsHtml()}
      ${tab === 'ofertas' ? renderOffers() : tab === 'vales' ? renderVouchers() : tab === 'temas' ? Themes.renderStore() : renderBuy()}
      ${tab === 'ofertas' || tab === 'comprar' ? `<button class="fab ${s}" type="button" data-act="new" aria-label="Novo produto">${I.plus}<span>Novo produto</span></button>` : ''}`;
    const b = root.querySelector('.shop-balance b');
    if(b) UI.countTo(b, balance());
    loadImages();
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
      title: 'Comprar produto',
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

  // ---------- aba de produtos (criar / editar / apagar) ----------
  function openTabForm(t){
    const isNew = !t;
    const d = t || { name:'', emoji:'' };
    const m = UI.openModal({
      title: isNew ? 'Nova aba' : 'Editar aba',
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>Nome da aba</span>
            <input name="name" required maxlength="24" value="${esc(d.name)}" placeholder="Ex.: Doces" autofocus></label>
          <label class="field"><span>Emote <small>(opcional)</small></span>
            <input name="emoji" maxlength="16" value="${esc(d.emoji)}" placeholder="🍰"></label>
          <div class="quick-days emoji-pick">${EMOJIS.map(e => `<button type="button" class="qbtn" data-e="${e}">${e}</button>`).join('')}</div>
          <p class="hint-line">Você pode ter até 12 abas. Apagar uma aba <b>não</b> apaga os produtos: eles ficam em “Sem aba”.</p>
          <div class="sheet-actions">
            ${!isNew ? `<button class="btn danger ghost" type="button" data-del>${I.trash}<span>Apagar aba</span></button>` : `<button class="btn" type="button" data-modal-close>Cancelar</button>`}
            <button class="btn primary" type="submit">${isNew ? 'Criar aba' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    form.addEventListener('click', e => { const q = e.target.closest('[data-e]'); if(q) form.elements.emoji.value = q.dataset.e; });
    const del = form.querySelector('[data-del]');
    if(del) del.addEventListener('click', async () => {
      const ok = await UI.confirmBox({ title: 'Apagar aba', html: `Apagar a aba <b>${esc(t.name)}</b>? Os produtos dela ficam em “Sem aba”.`, yesLabel: 'Apagar', danger: true });
      if(!ok) return;
      try{ await API.deleteShopTab(t.id); m.close(); if(cat === t.id) cat = 'all'; await App.reload(); App.refreshView(); UI.toast('Aba apagada'); }
      catch(err){ UI.toast(err.message, 'bad'); }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const nm = form.elements.name.value.trim();
      if(!nm){ UI.toast('Dê um nome à aba', 'bad'); return; }
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          const row = await API.saveShopTab(t ? t.id : null, { name: nm, emoji: form.elements.emoji.value.trim() });
          m.close();
          if(isNew && row) cat = row.id;
          await App.reload();
          App.refreshView();
          UI.toast(isNew ? 'Aba criada' : 'Aba salva', 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- produto (criar / editar) ----------
  function openForm(r){
    const s = me();
    const isNew = !r;
    const d = r || { title:'', description:'', price:10, once:false, active:true, for_side:s, tab_id:null, emoji:'', border_color:null, has_image:false };
    let price = d.price;
    const quick = [5, 10, 20, 50, 100];
    // visual: 'none' | 'emoji' | 'image'
    let vis = d.has_image ? 'image' : (d.emoji ? 'emoji' : 'none');
    let image = d.has_image ? imgOf(d) : '';          // data URL atual
    let imageChanged = false;
    let border = d.border_color || '';
    const myTabs = tabsOf(s);
    const m = UI.openModal({
      title: isNew ? 'Novo produto' : 'Editar produto',
      html: `
        <form class="form" data-form autocomplete="off">
          <div class="prod-live" data-live></div>
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
          </fieldset>` : `<p class="hint-line">${R.isOwnReward(d) ? 'Produto próprio.' : `Presente para o ${name(d.for_side)}: o preço é em ${R.SIDES[d.for_side].coin}.`}</p>`}

          <label class="field"><span>Aba da loja</span>
            <select class="select" name="tab">
              <option value="">Sem aba</option>
              ${myTabs.map(t => `<option value="${t.id}" ${d.tab_id === t.id ? 'selected' : ''}>${t.emoji ? esc(t.emoji) + ' ' : ''}${esc(t.name)}</option>`).join('')}
            </select>
            <small class="fine">${myTabs.length ? 'As abas são suas: crie e edite em “Meus produtos”.' : 'Você ainda não tem abas: crie em “Meus produtos → Nova aba”.'}</small></label>

          <fieldset class="field"><legend>Visual do produto</legend>
            <div class="seg seg-3" role="group" aria-label="Visual">
              <button class="seg-btn" type="button" data-vis="none">Nada</button>
              <button class="seg-btn" type="button" data-vis="emoji">Emote</button>
              <button class="seg-btn" type="button" data-vis="image">Imagem</button>
            </div>
            <div data-vispanel="emoji" hidden>
              <input name="emoji" maxlength="16" value="${esc(d.emoji)}" placeholder="Cole ou escolha um emote">
              <div class="quick-days emoji-pick">${EMOJIS.map(e => `<button type="button" class="qbtn" data-e="${e}">${e}</button>`).join('')}</div>
            </div>
            <div data-vispanel="image" hidden>
              <label class="btn ghost file-btn"><input type="file" name="img" accept="image/*" hidden>${I.plus}<span data-filelabel>Escolher imagem</span></label>
              <small class="fine">A imagem é reduzida automaticamente (320 px) e guardada com o produto.</small>
            </div>
          </fieldset>

          <fieldset class="field"><legend>Cor da borda <small>(na sua loja)</small></legend>
            <div class="swatches" data-swatches>
              <button type="button" class="sw none" data-b="" aria-label="Sem cor"><span>✕</span></button>
              ${BORDERS.map(c => `<button type="button" class="sw" data-b="${c}" style="--c:${c}" aria-label="Cor ${c}"></button>`).join('')}
              <label class="sw custom" aria-label="Outra cor"><input type="color" name="bcolor" value="${border || '#b48bff'}"><span>🎨</span></label>
            </div>
          </fieldset>

          <fieldset class="field"><legend>Preço</legend>
            <div class="stepper ${d.for_side}" data-stepper>
              <button class="icon-btn big" type="button" data-step="-1" aria-label="Menos">${I.minus}</button>
              <div class="stepper-n"><span data-pricecoin>${UI.coin(d.for_side, 34)}</span><input name="price" type="number" inputmode="numeric" min="1" max="5000" value="${price}" aria-label="Preço"></div>
              <button class="icon-btn big" type="button" data-step="1" aria-label="Mais">${I.plus}</button>
            </div>
            <div class="quick center">${quick.map(n => `<button type="button" class="qbtn" data-q="${n}">${n}</button>`).join('')}</div>
          </fieldset>
          <label class="switch"><input type="checkbox" name="once" ${d.once ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Só uma vez <small>(some da loja depois de comprado)</small></span></label>
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

    function liveCard(){
      const fs = forSide();
      const title = form.elements.title.value.trim() || 'Seu produto';
      const emoji = vis === 'emoji' ? form.elements.emoji.value.trim() : '';
      const media = vis === 'image' && image ? `<img src="${image}" alt="">` : emoji ? `<span class="prod-emoji">${esc(emoji)}</span>` : `<span class="prod-emoji ghosty">${I.gift}</span>`;
      return `
        <article class="prod live ${fs} ${border ? 'custom' : ''}" style="${border ? `--pc:${border}` : ''}">
          <div class="prod-media">${media}<span class="prod-who ${s}">${UI.face(s, 20)}</span></div>
          <div class="prod-body"><h3>${esc(title)}</h3></div>
          <div class="prod-foot">${priceBadge(fs, Number(input.value) || 1)}</div>
        </article>`;
    }
    function paint(){
      form.querySelectorAll('.qbtn[data-q]').forEach(b => b.classList.toggle('on', b.dataset.q === String(input.value)));
      const fs = forSide();
      form.querySelector('[data-stepper]').className = `stepper ${fs}`;
      form.querySelector('[data-pricecoin]').innerHTML = UI.coin(fs, 34);
      const hint = form.querySelector('[data-forhint]');
      if(hint) hint.textContent = fs === s ? 'Você compra com as suas moedas e já vale.' : `O ${name(fs)} paga com ${R.SIDES[fs].coin} e você é quem cumpre.`;
      form.querySelectorAll('[data-vis]').forEach(b => b.classList.toggle('on', b.dataset.vis === vis));
      form.querySelectorAll('[data-vispanel]').forEach(p => { p.hidden = p.dataset.vispanel !== vis; });
      form.querySelectorAll('[data-b]').forEach(b => b.classList.toggle('on', (b.dataset.b || '') === border));
      form.querySelector('.sw.custom').classList.toggle('on', !!border && !BORDERS.includes(border));
      form.querySelector('[data-filelabel]').textContent = image ? 'Trocar imagem' : 'Escolher imagem';
      form.querySelector('[data-live]').innerHTML = liveCard();
    }
    paint();
    form.addEventListener('change', e => {
      if(e.target.name === 'bcolor'){ border = e.target.value; }
      paint();
    });
    form.addEventListener('input', e => { if(['price', 'title', 'emoji'].includes(e.target.name)) paint(); });
    form.addEventListener('click', e => {
      const st = e.target.closest('[data-step]'); if(st) set(Number(input.value) + Number(st.dataset.step));
      const q = e.target.closest('[data-q]'); if(q) set(q.dataset.q);
      const v = e.target.closest('[data-vis]'); if(v){ vis = v.dataset.vis; paint(); }
      const em = e.target.closest('[data-e]'); if(em){ form.elements.emoji.value = em.dataset.e; paint(); }
      const bb = e.target.closest('[data-b]'); if(bb){ border = bb.dataset.b; paint(); }
    });
    form.elements.img.addEventListener('change', async () => {
      const f = form.elements.img.files && form.elements.img.files[0];
      if(!f) return;
      try{
        image = await fileToDataUrl(f);
        imageChanged = true;
        paint();
      }catch(err){ UI.toast('Não consegui usar essa imagem. Tente outra.', 'bad'); }
      form.elements.img.value = '';
    });
    const del = form.querySelector('[data-del]');
    if(del) del.addEventListener('click', async () => {
      const ok = await UI.confirmBox({ title: 'Apagar produto', html: `Apagar <b>${esc(r.title)}</b>? As compras já feitas continuam no histórico.`, yesLabel: 'Apagar', danger: true });
      if(!ok) return;
      try{ await API.deleteReward(r.id); m.close(); await App.reload(); App.refreshView(); UI.toast('Produto apagado'); }
      catch(err){ UI.toast(err.message, 'bad'); }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = form.elements.title.value.trim();
      if(!title){ UI.toast('Dê um nome ao produto', 'bad'); return; }
      if(vis === 'image' && !image){ UI.toast('Escolha uma imagem ou troque o visual', 'bad'); return; }
      const data = { title, description: form.elements.description.value.trim(), price: Math.round(Number(input.value)), once: form.elements.once.checked,
        tab_id: form.elements.tab.value || '', border_color: border || '' };
      data.emoji = vis === 'emoji' ? form.elements.emoji.value.trim() : '';
      if(vis !== 'image') data.image = '';
      else if(imageChanged || isNew) data.image = image;
      if(isNew) data.for_side = forSide();
      else data.active = form.elements.active.checked;
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          await API.saveReward(r ? r.id : null, data);
          m.close();
          await App.reload();
          App.refreshView();
          UI.toast(isNew ? 'Produto criado' : 'Produto salvo', 'good');
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
      if(a === 'newtab'){ openTabForm(null); return; }
      if(a === 'edittab'){ e.stopPropagation(); const t = (App.shopTabs || []).find(x => x.id === b.dataset.tab); if(t) openTabForm(t); return; }
      if(a === 'cat'){ cat = b.dataset.cat; refresh(); return; }
      if(a === 'store'){ store = b.dataset.store; cat = 'all'; refresh(); return; }
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

  return { init, render, refresh, loadImages };
})();
