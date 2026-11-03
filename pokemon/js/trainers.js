/* ============================================================
   POKÉMON — treinadores: lista e ficha

   Mestre: vê todos (jogadores e NPCs), cria, edita, dá XP, aplica dano/cura.
   Jogador: vê só os treinadores "jogador"; mexe em anotações de RP e foto.
   ============================================================ */
window.Trainers = (function(){
  'use strict';

  const R = PKM_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  let view = null;          // elemento onde a tela é desenhada
  let currentId = null;     // ficha aberta (null = lista)
  let pending = null;       // anotação ainda não enviada: { id, text }
  const lastBars = {};      // largura anterior das barras, pra animar a mudança

  const byId = id => App.trainers.find(t => t.id === id);
  const visible = () => App.isMaster ? App.trainers : App.trainers.filter(t => t.kind === 'player');
  const dexNo = t => String(App.trainers.findIndex(x => x.id === t.id) + 1).padStart(3, '0');
  const hpClass = (cur, max) => { const r = max ? cur / max : 0; return r > 0.5 ? 'ok' : r > 0.2 ? 'mid' : 'low'; };
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0;

  // ---------- peças ----------
  function avatar(t, size){
    const inner = t.image_url
      ? `<img src="${esc(t.image_url)}" alt="" draggable="false">`
      : I.ball;
    return `<div class="avatar ${t.image_url ? '' : 'no-photo'}" style="--s:${size}px"><div class="avatar-in">${inner}</div></div>`;
  }

  function bar(kind, label, cur, max, key, cls){
    const w = pct(cur, max);
    return `
      <div class="meter ${kind}">
        <span class="tag">${label}</span>
        <div class="bar"><div class="bar-fill ${cls || ''}" data-bar="${key}" data-w="${w.toFixed(2)}"></div></div>
        <span class="num">${R.fmtXp(cur)}<i>/</i>${R.fmtXp(max)}</span>
      </div>`;
  }

  function animateBars(root, id){
    root.querySelectorAll('.bar-fill[data-bar]').forEach(el => {
      const key = id + ':' + el.dataset.bar;
      const from = lastBars[key] != null ? lastBars[key] : 0;
      el.style.width = from + '%';
      void el.offsetWidth;
      requestAnimationFrame(() => { el.style.width = el.dataset.w + '%'; });
      lastBars[key] = el.dataset.w;
    });
  }

  // ---------- lista ----------
  function card(t, i){
    const max = R.trainerMaxHp(t.fisico);
    return `
      <a class="tcard" href="#treinador/${t.id}" style="--i:${i}">
        ${avatar(t, 78)}
        <div class="tcard-body">
          <span class="dexno">Nº ${dexNo(t)}</span>
          <strong class="tcard-name">${esc(t.name)}</strong>
          <span class="chips">
            <span class="chip lv">Nv ${t.level}</span>
            ${t.kind === 'npc' ? '<span class="chip npc">NPC</span>' : ''}
          </span>
          <div class="mini-hp"><span class="tag">HP</span><div class="bar"><div class="bar-fill ${hpClass(t.hp_current, max)}" style="width:${pct(t.hp_current, max).toFixed(1)}%"></div></div><span class="num">${t.hp_current}/${max}</span></div>
        </div>
      </a>`;
  }

  function renderList(root){
    view = root;
    currentId = null;
    const list = visible();
    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Fichas</span><h1>Treinadores</h1></div>
        ${App.isMaster ? `<button class="btn primary" type="button" data-act="new">${I.plus}<span>Novo treinador</span></button>` : ''}
      </header>
      ${list.length
        ? `<div class="tgrid">${list.map(card).join('')}</div>`
        : `<div class="empty enter">
             <div class="empty-ball"></div>
             <h3>${App.isMaster ? 'Nenhum treinador ainda' : 'Seu treinador ainda não existe'}</h3>
             <p>${App.isMaster ? 'Crie o primeiro treinador para começar a campanha.' : 'Peça ao mestre para criar a sua ficha. Ela aparece aqui sozinha.'}</p>
             ${App.isMaster ? `<button class="btn primary" type="button" data-act="new">${I.plus}<span>Novo treinador</span></button>` : ''}
           </div>`}`;
  }

  // ---------- ficha ----------
  function renderSheet(root, id, opts){
    view = root;
    currentId = id;
    const t = byId(id);
    if(!t || (!App.isMaster && t.kind !== 'player')){
      root.innerHTML = `
        <div class="empty enter">
          <div class="empty-ball"></div>
          <h3>Treinador não encontrado</h3>
          <p>Essa ficha não existe mais ou você não pode vê-la.</p>
          <a class="btn" href="#treinadores">${I.back}<span>Voltar</span></a>
        </div>`;
      return;
    }
    const still = opts && opts.still;
    const maxHp = R.trainerMaxHp(t.fisico);
    const need = R.xpToNext(t.level);
    const left = R.pointsLeft(t);
    const top = Math.max(10, ...R.TRAINER_ATTRS.map(a => t[a.key]));
    const m = App.isMaster;
    const canBack = App.isMaster || visible().length > 1;

    root.innerHTML = `
      ${canBack ? `<a class="back" href="#treinadores">${I.back}<span>Treinadores</span></a>` : ''}
      <div class="sheet ${still ? 'still' : ''}">
        <section class="card id-card ${t.hp_current === 0 ? 'fainted' : ''}" id="idCard">
          <div class="id-top">
            <button class="avatar-btn" type="button" data-act="photo" aria-label="Alterar foto de ${esc(t.name)}">
              ${avatar(t, 132)}
              <span class="avatar-cam">${I.camera}</span>
            </button>
            <div class="id-main">
              <span class="dexno">Treinador Nº ${dexNo(t)}${t.kind === 'npc' ? ' · NPC' : ''}</span>
              <h1 class="id-name">${esc(t.name)}</h1>
              <span class="chip lv big">Nível ${t.level}</span>
            </div>
          </div>
          ${t.concept ? `<p class="concept">${esc(t.concept)}</p>` : ''}
          ${t.hp_current === 0 ? '<div class="faint-banner">Desmaiado</div>' : ''}

          ${bar('hp', 'HP', t.hp_current, maxHp, 'hp', hpClass(t.hp_current, maxHp))}
          ${bar('xp', 'EXP', t.xp, need, 'xp', 'xp')}
          <p class="hint">HP máximo = 30 + Físico (${t.fisico}) · faltam ${R.fmtXp(need - t.xp)} XP para o nível ${t.level + 1}</p>

          ${m ? `
          <div class="controls">
            <div class="ctl">
              <label for="hpAmt">Dano / cura</label>
              <div class="ctl-row">
                <input id="hpAmt" type="number" inputmode="numeric" min="1" value="1">
                <button class="btn danger" type="button" data-act="dmg">Dano</button>
                <button class="btn good" type="button" data-act="heal">Cura</button>
              </div>
            </div>
            <div class="ctl">
              <label for="xpAmt">Dar XP</label>
              <div class="ctl-row">
                <input id="xpAmt" type="number" inputmode="decimal" min="0.5" step="0.5" value="10">
                <button class="btn primary" type="button" data-act="xp">Dar XP</button>
              </div>
            </div>
          </div>
          <div class="id-actions">
            <button class="btn" type="button" data-act="edit">${I.edit}<span>Editar ficha</span></button>
            <button class="btn ghost danger-text" type="button" data-act="delete">${I.trash}<span>Apagar</span></button>
          </div>` : ''}
        </section>

        <div class="sheet-col">
          <section class="card attrs">
            <div class="card-head">
              <h3>Atributos</h3>
              <span class="pts ${left < 0 ? 'over' : left > 0 ? 'has' : ''}" title="10 pontos na criação + 2 por nível">
                ${left < 0 ? `${-left} pontos a mais` : left > 0 ? `${left} para distribuir` : 'tudo distribuído'}
              </span>
            </div>
            <ul class="attr-list">
              ${R.TRAINER_ATTRS.map(a => `
                <li>
                  <span class="attr-name">${a.label}</span>
                  <div class="bar slim"><div class="bar-fill attr" data-bar="a-${a.key}" data-w="${pct(t[a.key], top).toFixed(2)}"></div></div>
                  <span class="attr-val">${t[a.key]}</span>
                </li>`).join('')}
            </ul>
          </section>

          <section class="card xpmon">
            <div class="card-head"><h3>Experiência dos Pokémon</h3></div>
            <p class="hint">O treinador recebe metade do XP total ganho pelos seus Pokémon, sem tirar deles.</p>
            <div class="xp-pair">
              <div><span class="k">XP ganho pelos Pokémon</span><strong>${R.fmtXp(t.creature_xp_total)}</strong></div>
              <div><span class="k">Metade recebida</span><strong>${R.fmtXp(R.trainerShareOfCreatureXp(t.creature_xp_total))}</strong></div>
            </div>
          </section>

          <section class="card team">
            <div class="card-head"><h3>Equipe carregada</h3><span class="pts">até ${R.TEAM_SIZE}</span></div>
            <div class="slots">
              ${Array.from({ length: R.TEAM_SIZE }, (_, i) => `
                <div class="slot"><div class="slot-ball"></div><span>Vaga ${i + 1}</span></div>`).join('')}
            </div>
            <p class="hint">As criaturas e o PC chegam na próxima fase.</p>
          </section>

          <section class="card notes">
            <div class="card-head"><h3>Anotações de RP</h3><span class="save-state" id="notesStatus"></span></div>
            <textarea id="notes" rows="6" maxlength="20000" placeholder="Escreva aqui o que o seu personagem viveu, pessoas que conheceu, pistas…">${esc(pending && pending.id === t.id ? pending.text : t.notes)}</textarea>
          </section>
        </div>
      </div>`;
    animateBars(root, id);
  }

  // ---------- ações ----------
  function applyRow(row){
    const i = App.trainers.findIndex(t => t.id === row.id);
    if(i >= 0) App.trainers[i] = row; else App.trainers.push(row);
    if(currentId === row.id) renderSheet(view, row.id, { still:true });
    else if(currentId === null && view && view.querySelector('.tgrid, .empty')) renderList(view);
  }

  async function changePhoto(t){
    const res = await Cropper.open({ title: 'Foto de ' + t.name, url: t.image_src_url || null, frame: t.image_frame || null });
    if(!res) return;
    UI.toast('Enviando foto…');
    try{
      const cropUrl = await API.uploadImage(res.croppedBlob, 'trainers', 'crop');
      const srcUrl = res.sourceBlob ? await API.uploadImage(res.sourceBlob, 'trainers', 'src') : t.image_src_url;
      await API.setTrainerPhoto(t.id, cropUrl, srcUrl, res.frame);
      applyRow(Object.assign({}, byId(t.id), { image_url: cropUrl, image_src_url: srcUrl, image_frame: res.frame }));
      UI.toast('Foto atualizada', 'good');
    }catch(e){ UI.toast('Não consegui enviar a foto: ' + e.message, 'bad'); }
  }

  async function hpChange(t, sign, btn){
    const n = Math.floor(Number(view.querySelector('#hpAmt').value));
    if(!(n >= 1)){ UI.toast('Digite um valor de 1 para cima', 'bad'); return; }
    await UI.busy(btn, async () => {
      try{
        const row = await API.trainerHp(t.id, sign * n);
        applyRow(row);
      }catch(e){ UI.toast(e.message, 'bad'); }
    });
  }

  async function giveXp(t, btn){
    const n = Math.round(Number(view.querySelector('#xpAmt').value) * 2) / 2;
    if(!(n > 0)){ UI.toast('Digite um XP maior que zero', 'bad'); return; }
    await UI.busy(btn, async () => {
      try{
        const before = t.level;
        const row = await API.addTrainerXp(t.id, n);
        applyRow(row);
        if(row.level > before){
          UI.toast(`${row.name} subiu para o nível ${row.level}! +${(row.level - before) * R.POINTS_PER_LEVEL} pontos`, 'good');
          const c = view.querySelector('#idCard');
          if(c){ c.classList.add('levelup'); setTimeout(() => c.classList.remove('levelup'), 1400); }
        }else{
          UI.toast(`+${R.fmtXp(n)} XP`, 'good');
        }
      }catch(e){ UI.toast(e.message, 'bad'); }
    });
  }

  async function remove(t){
    const ok = await UI.confirmBox({
      title: 'Apagar treinador',
      html: `Apagar a ficha de <b>${esc(t.name)}</b>? Isso não pode ser desfeito.`,
      yesLabel: 'Apagar', danger: true
    });
    if(!ok) return;
    try{
      await API.deleteTrainer(t.id);
      App.trainers = App.trainers.filter(x => x.id !== t.id);
      App.go('#treinadores');
      UI.toast('Ficha apagada');
    }catch(e){ UI.toast(e.message, 'bad'); }
  }

  // ---------- formulário do mestre (criar e editar) ----------
  function openForm(t){
    const isNew = !t;
    const d = t || { name:'', kind:'player', level:1, xp:0, hp_current:30, creature_xp_total:0, concept:'',
                     carisma:0, aparencia:0, resistencia:0, mental:0, fisico:0 };
    const m = UI.openModal({
      title: isNew ? 'Novo treinador' : 'Editar ficha',
      wide: true,
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>Nome</span>
            <input name="name" required maxlength="80" value="${esc(d.name)}" placeholder="Nome do treinador" autofocus></label>
          <div class="row2">
            <label class="field"><span>Papel</span>
              <select name="kind">
                <option value="player" ${d.kind === 'player' ? 'selected' : ''}>Jogador</option>
                <option value="npc" ${d.kind === 'npc' ? 'selected' : ''}>NPC (só o mestre vê)</option>
              </select></label>
            <label class="field"><span>Nível</span>
              <input type="number" name="level" inputmode="numeric" min="1" value="${d.level}"></label>
          </div>
          <label class="field"><span>Aparência e conceito</span>
            <textarea name="concept" rows="3" maxlength="600" placeholder="Como ele é, de onde vem…">${esc(d.concept)}</textarea></label>
          <div class="row3">
            <label class="field"><span>XP atual</span>
              <input type="number" name="xp" inputmode="decimal" min="0" step="0.5" value="${d.xp}"></label>
            <label class="field"><span>HP atual</span>
              <input type="number" name="hp_current" inputmode="numeric" min="0" value="${isNew ? '' : d.hp_current}" ${isNew ? 'placeholder="cheio"' : ''}></label>
            <label class="field"><span>XP ganho pelos Pokémon</span>
              <input type="number" name="creature_xp_total" inputmode="decimal" min="0" step="0.5" value="${d.creature_xp_total}"></label>
          </div>
          <fieldset class="attr-edit">
            <legend>Atributos</legend>
            <div class="attr-grid">
              ${R.TRAINER_ATTRS.map(a => `
                <label class="field"><span>${a.label}</span>
                  <input type="number" name="${a.key}" inputmode="numeric" min="0" value="${d[a.key]}"></label>`).join('')}
            </div>
            <p class="attr-info" data-info></p>
          </fieldset>
          <div class="modal-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">${isNew ? 'Criar treinador' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const info = form.querySelector('[data-info]');
    const num = n => Number(form.elements[n].value) || 0;

    function refreshInfo(){
      const snap = { level: Math.max(1, Math.floor(num('level'))) };
      R.TRAINER_ATTRS.forEach(a => { snap[a.key] = Math.max(0, Math.floor(num(a.key))); });
      const left = R.pointsLeft(snap);
      info.innerHTML = `HP máximo: <b>${R.trainerMaxHp(snap.fisico)}</b> · Pontos: <b class="${left < 0 ? 'over' : ''}">${left}</b> sobrando de ${R.pointsBudget(snap.level)}`;
    }
    form.addEventListener('input', refreshInfo);
    refreshInfo();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if(!name){ UI.toast('Dê um nome ao treinador', 'bad'); return; }
      const data = {
        name,
        kind: form.elements.kind.value,
        concept: form.elements.concept.value.trim(),
        level: Math.max(1, Math.floor(num('level'))),
        xp: Math.max(0, Math.round(num('xp') * 2) / 2),
        creature_xp_total: Math.max(0, Math.round(num('creature_xp_total') * 2) / 2)
      };
      R.TRAINER_ATTRS.forEach(a => { data[a.key] = Math.max(0, Math.floor(num(a.key))); });
      // campo de HP vazio num treinador novo = vida cheia (o banco usa 30 + Físico)
      if(form.elements.hp_current.value !== '') data.hp_current = Math.max(0, Math.floor(num('hp_current')));
      const btn = form.querySelector('[type=submit]');
      await UI.busy(btn, async () => {
        try{
          const row = await API.saveTrainer(t ? t.id : null, data);
          m.close(true);
          if(isNew){
            App.trainers.push(row);
            App.go('#treinador/' + row.id);
            UI.toast('Treinador criado', 'good');
          }else{
            applyRow(row);
            UI.toast('Ficha salva', 'good');
          }
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- anotações (salvam sozinhas) ----------
  const commit = UI.debounce(() => flushNotes(), 900);
  const setStatus = txt => { const el = document.getElementById('notesStatus'); if(el) el.textContent = txt; };

  async function flushNotes(){
    if(!pending) return;
    const p = pending;
    pending = null;
    commit.cancel();
    setStatus('salvando…');
    try{
      await API.setTrainerNotes(p.id, p.text);
      const t = byId(p.id);
      if(t) t.notes = p.text;
      setStatus('salvo');
    }catch(e){
      if(!pending) pending = p;
      setStatus('não salvou');
      UI.toast('Não consegui salvar a anotação: ' + e.message, 'bad');
    }
  }

  // ---------- eventos (uma vez só, na área da tela) ----------
  function init(root){
    view = root;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if(!b || !root.contains(b)) return;
      const t = currentId ? byId(currentId) : null;
      switch(b.dataset.act){
        case 'new': if(App.isMaster) openForm(null); break;
        case 'edit': if(t && App.isMaster) openForm(t); break;
        case 'delete': if(t && App.isMaster) remove(t); break;
        case 'photo': if(t) changePhoto(t); break;
        case 'dmg': if(t && App.isMaster) hpChange(t, -1, b); break;
        case 'heal': if(t && App.isMaster) hpChange(t, 1, b); break;
        case 'xp': if(t && App.isMaster) giveXp(t, b); break;
      }
    });
    root.addEventListener('input', e => {
      if(e.target.id !== 'notes' || !currentId) return;
      pending = { id: currentId, text: e.target.value };
      setStatus('…');
      commit();
    });
    root.addEventListener('focusout', e => { if(e.target.id === 'notes') flushNotes(); });
    document.addEventListener('visibilitychange', () => { if(document.hidden) flushNotes(); });
    window.addEventListener('pagehide', flushNotes);
  }

  /** Mudança vinda de outro aparelho: redesenha, sem atropelar quem está digitando. */
  function refresh(){
    if(!view || UI.isModalOpen()) return;
    const typing = document.activeElement && document.activeElement.id === 'notes';
    if(pending || typing) return;
    if(currentId) renderSheet(view, currentId, { still:true });
    else if(view.querySelector('.tgrid, .empty')) renderList(view);
  }

  return { init, renderList, renderSheet, flushNotes, refresh };
})();
