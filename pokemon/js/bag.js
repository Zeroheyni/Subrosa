/* ============================================================
   POKÉMON — bolsa
   Inspirada na Bolsa dos jogos: bolsos, quantidade, sem limite de carga.
   A bolsa é do jogador também: mestre e jogador adicionam, tiram e editam.
   O mestre vê a bolsa de todos os treinadores; o jogador, a dos treinadores "jogador".
   ============================================================ */
window.Bag = (function(){
  'use strict';

  const esc = UI.esc;
  const I = UI.icons;

  const POCKETS = [
    { key:'itens',    label:'Itens',        color:'#36aaff', ico:'<path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/>' },
    { key:'remedios', label:'Remédios', color:'#3ddc84', ico:'<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3z"/>' },
    { key:'bolas',    label:'Bolas',        color:'#e53b3b', ico:'<circle cx="12" cy="12" r="9"/><path d="M3 12h6M15 12h6"/><circle cx="12" cy="12" r="2.6"/>' },
    { key:'tecnicas', label:'Técnicas',     color:'#a98bff', ico:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>' },
    { key:'chave',    label:'Chave',        color:'#ffcb05', ico:'<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M15 12v3"/>' }
  ];
  const pocketOf = key => POCKETS.find(p => p.key === key) || POCKETS[0];
  const pocketIco = (p, size) => `<svg class="ico" style="width:${size}px;height:${size}px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p.ico}</svg>`;

  let view = null;
  let pocket = 'itens';        // bolso aberto
  let ownerId = null;          // treinador cuja bolsa está na tela
  let busyIds = new Set();     // itens com uma mudança de quantidade em andamento

  const trainer = id => App.trainers.find(t => t.id === id);
  const item = id => App.items.find(i => i.id === id);
  const owners = () => App.isMaster ? App.trainers : App.trainers.filter(t => t.kind === 'player');
  const mine = () => App.items.filter(i => i.trainer_id === ownerId);

  // ---------- tela ----------
  function render(root, id){
    view = root;
    const list = owners();
    if(id && list.some(t => t.id === id)) ownerId = id;
    else if(!ownerId || !list.some(t => t.id === ownerId)) ownerId = list.length ? list[0].id : null;
    draw();
  }

  function row(it, i){
    const p = pocketOf(it.pocket);
    const thumb = it.image_url
      ? `<img src="${esc(it.image_url)}" alt="" draggable="false">`
      : pocketIco(p, 26);
    return `
      <li class="bag-row ${it.qty === 0 ? 'out' : ''}" style="--pc:${p.color};--i:${i}" data-id="${it.id}">
        <button class="bag-main" type="button" data-act="i-edit" data-id="${it.id}">
          <span class="bag-thumb">${thumb}</span>
          <span class="bag-text">
            <strong>${esc(it.name)}</strong>
            ${it.description ? `<small>${esc(it.description)}</small>` : ''}
          </span>
        </button>
        <div class="qty">
          <button type="button" class="qty-btn" data-act="i-minus" data-id="${it.id}" aria-label="Tirar 1 de ${esc(it.name)}" ${it.qty === 0 ? 'disabled' : ''}>−</button>
          <span class="qty-n"><i>×</i>${it.qty}</span>
          <button type="button" class="qty-btn" data-act="i-plus" data-id="${it.id}" aria-label="Pôr 1 de ${esc(it.name)}">+</button>
        </div>
      </li>`;
  }

  function draw(){
    if(!view) return;
    const list = owners();
    const own = ownerId && trainer(ownerId);
    if(!own){
      view.innerHTML = `
        <div class="empty enter">
          <div class="empty-ico">${I.bag}</div>
          <h3>${App.isMaster ? 'Crie um treinador primeiro' : 'Sua bolsa ainda não existe'}</h3>
          <p>${App.isMaster ? 'Cada treinador tem a própria bolsa.' : 'Ela aparece aqui quando o mestre criar o seu treinador.'}</p>
          ${App.isMaster ? `<a class="btn primary" href="#treinadores">Ir para os treinadores</a>` : ''}
        </div>`;
      return;
    }
    const all = mine();
    const p = pocketOf(pocket);
    const shown = all.filter(i => i.pocket === pocket).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const count = key => all.filter(i => i.pocket === key).length;

    view.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Inventário</span><h1>Bolsa</h1></div>
        <button class="btn primary" type="button" data-act="i-new">${I.plus}<span>Adicionar item</span></button>
      </header>
      ${list.length > 1 ? `<div class="filters">${list.map(t =>
        `<a class="fchip ${t.id === ownerId ? 'on' : ''}" href="#bolsa/${t.id}">${esc(t.name)}${t.kind === 'npc' ? ' (NPC)' : ''}</a>`).join('')}</div>` : ''}

      <div class="bag" style="--pc:${p.color}">
        <nav class="pockets" aria-label="Bolsos">
          ${POCKETS.map(k => `
            <button type="button" class="pocket ${k.key === pocket ? 'on' : ''}" style="--pc:${k.color}" data-act="i-pocket" data-pocket="${k.key}" aria-pressed="${k.key === pocket}">
              ${pocketIco(k, 20)}<span>${k.label}</span>${count(k.key) ? `<b>${count(k.key)}</b>` : ''}
            </button>`).join('')}
        </nav>
        <section class="bag-page">
          <div class="bag-title">${pocketIco(p, 22)}<h2>${p.label}</h2><span class="pts">${shown.length} ${shown.length === 1 ? 'item' : 'itens'}</span></div>
          ${shown.length
            ? `<ul class="bag-list">${shown.map(row).join('')}</ul>`
            : `<div class="bag-empty">
                 <p>Nada em <b>${p.label}</b> na bolsa de ${esc(own.name)}.</p>
                 <button class="btn" type="button" data-act="i-new">${I.plus}<span>Adicionar aqui</span></button>
               </div>`}
        </section>
      </div>`;
  }

  // ---------- ações ----------
  function applyItem(row){
    const i = App.items.findIndex(x => x.id === row.id);
    if(i >= 0) App.items[i] = row; else App.items.push(row);
    draw();
  }

  async function bump(id, delta){
    if(busyIds.has(id)) return;
    busyIds.add(id);
    try{ applyItem(await API.itemQty(id, delta)); }
    catch(e){ UI.toast(e.message, 'bad'); }
    finally{ busyIds.delete(id); }
  }

  async function changePhoto(it){
    const res = await Cropper.open({ title: 'Foto de ' + it.name, url: it.image_src_url || null, frame: it.image_frame || null });
    if(!res) return;
    UI.toast('Enviando foto…');
    try{
      const cropUrl = await API.uploadImage(res.croppedBlob, 'items', 'crop');
      const srcUrl = res.sourceBlob ? await API.uploadImage(res.sourceBlob, 'items', 'src') : it.image_src_url;
      await API.setItemPhoto(it.id, cropUrl, srcUrl, res.frame);
      applyItem(Object.assign({}, item(it.id), { image_url: cropUrl, image_src_url: srcUrl, image_frame: res.frame }));
      UI.toast('Foto atualizada', 'good');
    }catch(e){ UI.toast('Não consegui enviar a foto: ' + e.message, 'bad'); }
  }

  async function removeItem(it, modal){
    const ok = await UI.confirmBox({
      title: 'Tirar da bolsa',
      html: `Apagar <b>${esc(it.name)}</b> da bolsa? Isso não pode ser desfeito.`,
      yesLabel: 'Apagar', danger: true
    });
    if(!ok) return;
    try{
      await API.deleteItem(it.id);
      App.items = App.items.filter(x => x.id !== it.id);
      modal.close(true);
      draw();
      UI.toast('Item apagado');
    }catch(e){ UI.toast(e.message, 'bad'); }
  }

  // ---------- formulário (novo e editar) ----------
  function openForm(it){
    const isNew = !it;
    const d = it || { name:'', pocket, qty:1, description:'' };
    const m = UI.openModal({
      title: isNew ? 'Novo item' : 'Editar item',
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>Nome</span>
            <input name="name" required maxlength="80" value="${esc(d.name)}" placeholder="Nome do item" autofocus></label>
          <div class="row2">
            <label class="field"><span>Bolso</span>
              <select name="pocket">${POCKETS.map(k => `<option value="${k.key}" ${k.key === d.pocket ? 'selected' : ''}>${k.label}</option>`).join('')}</select></label>
            <label class="field"><span>Quantidade</span>
              <input type="number" name="qty" inputmode="numeric" min="0" step="1" value="${d.qty}"></label>
          </div>
          <label class="field"><span>Descrição</span>
            <textarea name="description" rows="3" maxlength="600" placeholder="O que faz, de onde veio…">${esc(d.description)}</textarea></label>
          <div class="modal-actions">
            ${isNew ? '' : `<button class="btn ghost danger-text" type="button" data-del>${I.trash}<span>Apagar</span></button>
                            <button class="btn ghost" type="button" data-photo>${I.camera}<span>Foto</span></button>`}
            <span class="grow"></span>
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">${isNew ? 'Adicionar' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    if(!isNew){
      form.querySelector('[data-del]').onclick = () => removeItem(it, m);
      form.querySelector('[data-photo]').onclick = () => { m.close(true); changePhoto(it); };
    }
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if(!name){ UI.toast('Dê um nome ao item', 'bad'); return; }
      const data = {
        name,
        pocket: form.elements.pocket.value,
        qty: Math.max(0, Math.floor(Number(form.elements.qty.value)) || 0),
        description: form.elements.description.value.trim()
      };
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          const row = await API.saveItem(it ? it.id : null, ownerId, data);
          m.close(true);
          pocket = row.pocket;          // abre o bolso onde o item foi parar
          applyItem(row);
          UI.toast(isNew ? 'Item adicionado' : 'Item salvo', 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- eventos ----------
  function init(root){
    view = root;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if(!b || !root.contains(b) || !b.dataset.act.startsWith('i-')) return;
      switch(b.dataset.act){
        case 'i-new': openForm(null); break;
        case 'i-edit': { const it = item(b.dataset.id); if(it) openForm(it); break; }
        case 'i-plus': bump(b.dataset.id, 1); break;
        case 'i-minus': bump(b.dataset.id, -1); break;
        case 'i-pocket': pocket = b.dataset.pocket; draw(); break;
      }
    });
  }

  /** Mudança vinda de outro aparelho. */
  function refresh(){
    if(!view || UI.isModalOpen()) return;
    draw();
  }

  return { init, render, refresh };
})();
