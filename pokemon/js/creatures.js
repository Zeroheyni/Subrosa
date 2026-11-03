/* ============================================================
   POKÉMON — espécies (bestiário) e criaturas

   Mestre: cria espécies (tipos + Potencial), cria criaturas (IVs sorteados),
   dá XP, aplica dano/cura, move entre equipe e PC.
   Jogador: vê só as criaturas dos treinadores "jogador" (atributos finais,
   sem IV nem Potencial) e mexe em foto e anotações.
   ============================================================ */
window.Creatures = (function(){
  'use strict';

  const R = PKM_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  let view = null;
  let mode = null;            // 'list' | 'bestiary' | 'creature' | 'species'
  let currentId = null;
  let filter = 'all';         // filtro da lista: 'all' | 'free' | id do treinador
  let pending = null;         // anotação ainda não enviada: { id, text }
  const lastBars = {};

  // cor de fundo e do texto de cada tipo
  const TYPE_STYLE = {
    'Normal':['#a8a77a','#14140c'], 'Fogo':['#f0833a','#1d0c00'], 'Água':['#5f8ff2','#06122e'], 'Planta':['#7ac74c','#0c1d03'],
    'Gelo':['#9be3e0','#06201f'], 'Inseto':['#a8bb1f','#161c00'], 'Voador':['#a791f4','#120a33'], 'Veneno':['#a844a6','#ffffff'],
    'Elétrico':['#f8d230','#231b00'], 'Físico':['#cf3a33','#ffffff'], 'Fantasma':['#7a5fa3','#ffffff'], 'Sombrio':['#6d5546','#ffffff'],
    'Mente':['#ff5d8f','#2b0010'], 'Magia':['#dca6ea','#2a0b33'], 'Dragão':['#6f3cff','#ffffff'], 'Metal':['#b9bad0','#12131c'],
    'Terra':['#e3c26b','#2a1e00'], 'Luz':['#fff2a8','#2b2600'], 'Espaço':['#4a5ad8','#ffffff'], 'Tempo':['#3fbfa9','#02211b'],
    'Sangue':['#9a1226','#ffffff'], 'Cristal':['#62e4ec','#02222a'], 'Som':['#ff82c6','#33001d']
  };

  const species = id => App.species.find(s => s.id === id);
  const creature = id => App.creatures.find(c => c.id === id);
  const trainer = id => App.trainers.find(t => t.id === id);
  const nameOf = c => c.nickname || (species(c.species_id) || {}).name || 'Criatura';
  const photoOf = c => c.image_url || ((species(c.species_id) || {}).image_url) || null;
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0;
  const hpClass = (cur, max) => { const r = max ? cur / max : 0; return r > 0.5 ? 'ok' : r > 0.2 ? 'mid' : 'low'; };
  const mulTxt = m => String(m).replace('.', ',');
  const byTeam = (a, b) => (a.slot == null ? 9 : a.slot) - (b.slot == null ? 9 : b.slot);

  /** Criaturas que a pessoa pode ver: o mestre vê tudo; o jogador, só as dos treinadores "jogador". */
  function visible(){
    if(App.isMaster) return App.creatures;
    return App.creatures.filter(c => { const t = c.trainer_id && trainer(c.trainer_id); return t && t.kind === 'player'; });
  }

  // ---------- peças ----------
  function typeChip(t, suffix){
    const [bg, fg] = TYPE_STYLE[t] || ['#555', '#fff'];
    return `<span class="ty" style="--tc:${bg};--tt:${fg}">${esc(t)}${suffix ? `<i>${suffix}</i>` : ''}</span>`;
  }
  const typeChips = types => `<span class="chips">${(types || []).map(t => typeChip(t)).join('')}</span>`;

  function avatar(url, size){
    const inner = url ? `<img src="${esc(url)}" alt="" draggable="false">` : I.ball;
    return `<div class="avatar ${url ? '' : 'no-photo'}" style="--s:${size}px"><div class="avatar-in">${inner}</div></div>`;
  }

  function bar(kind, label, cur, max, key, cls){
    return `
      <div class="meter ${kind}">
        <span class="tag">${label}</span>
        <div class="bar"><div class="bar-fill ${cls || ''}" data-bar="${key}" data-w="${pct(cur, max).toFixed(2)}"></div></div>
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

  function whereText(c){
    const t = c.trainer_id && trainer(c.trainer_id);
    if(!t) return 'Sem dono';
    return `${t.name} · ${c.slot != null ? 'Equipe ' + (c.slot + 1) : 'PC'}`;
  }

  function miniHp(c, sp){
    const max = R.creatureMaxHp(sp, c), cur = R.creatureHp(sp, c);
    return `<div class="mini-hp"><span class="tag">HP</span><div class="bar"><div class="bar-fill ${hpClass(cur, max)}" style="width:${pct(cur, max).toFixed(1)}%"></div></div><span class="num">${cur}/${max}</span></div>`;
  }

  /** Quadro de fraquezas e resistências de um conjunto de tipos. */
  function chartHtml(types){
    const rows = R.typeChart(types);
    const weak = rows.filter(r => r.mult > 1).sort((a, b) => b.mult - a.mult);
    const resist = rows.filter(r => r.mult > 0 && r.mult < 1).sort((a, b) => a.mult - b.mult);
    const immune = rows.filter(r => r.mult === 0);
    const group = (title, list, cls) => list.length ? `
      <div class="chart-row ${cls}"><span class="chart-title">${title}</span>
        <span class="chips">${list.map(r => typeChip(r.type, '×' + mulTxt(r.mult))).join('')}</span></div>` : '';
    return group('Fraco contra', weak, 'weak') + group('Resiste a', resist, 'res') + group('Imune a', immune, 'imm')
      || '<p class="hint">Sem fraquezas nem resistências.</p>';
  }

  // ---------- navegação interna (Criaturas | Bestiário) ----------
  function seg(active){
    if(!App.isMaster) return '';
    return `
      <nav class="seg" aria-label="Seção">
        <a href="#criaturas" class="${active === 'list' ? 'on' : ''}">Criaturas</a>
        <a href="#bestiario" class="${active === 'bestiary' ? 'on' : ''}">Bestiário</a>
      </nav>`;
  }

  // ---------- lista de criaturas ----------
  function card(c, i){
    const sp = species(c.species_id);
    if(!sp) return '';
    return `
      <a class="tcard" href="#criatura/${c.id}" style="--i:${i}">
        ${avatar(photoOf(c), 78)}
        <div class="tcard-body">
          <span class="where">${esc(whereText(c))}</span>
          <strong class="tcard-name">${esc(nameOf(c))}</strong>
          ${c.nickname ? `<span class="sub">${esc(sp.name)}</span>` : ''}
          <span class="chips"><span class="chip lv">Nv ${c.level}</span>${sp.types.map(t => typeChip(t)).join('')}</span>
          ${miniHp(c, sp)}
        </div>
      </a>`;
  }

  function filterChips(list){
    if(!App.isMaster) return '';
    const owners = App.trainers.filter(t => list.some(c => c.trainer_id === t.id));
    const chip = (key, label) => `<button type="button" class="fchip ${filter === key ? 'on' : ''}" data-act="filter" data-filter="${key}">${esc(label)}</button>`;
    return `<div class="filters">${chip('all', 'Todas')}${chip('free', 'Sem dono')}${owners.map(t => chip(t.id, t.name)).join('')}</div>`;
  }

  function renderList(root){
    view = root; mode = 'list'; currentId = null;
    const all = visible();
    if(filter !== 'all' && filter !== 'free' && !trainer(filter)) filter = 'all';
    let list = all;
    if(filter === 'free') list = all.filter(c => !c.trainer_id);
    else if(filter !== 'all') list = all.filter(c => c.trainer_id === filter);
    list = list.slice().sort((a, b) => {
      const ta = (trainer(a.trainer_id) || { name: '￿' }).name, tb = (trainer(b.trainer_id) || { name: '￿' }).name;
      return ta.localeCompare(tb, 'pt-BR') || byTeam(a, b) || a.created_at.localeCompare(b.created_at);
    });

    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Time e PC</span><h1>Criaturas</h1></div>
        ${App.isMaster ? `<button class="btn primary" type="button" data-act="c-new">${I.plus}<span>Nova criatura</span></button>` : ''}
      </header>
      ${seg('list')}
      ${filterChips(all)}
      ${list.length
        ? `<div class="tgrid">${list.map(card).join('')}</div>`
        : `<div class="empty enter">
             <div class="empty-ball"></div>
             <h3>${all.length ? 'Nenhuma criatura nesse filtro' : (App.isMaster ? 'Nenhuma criatura ainda' : 'Você ainda não tem criaturas')}</h3>
             <p>${App.isMaster
               ? (App.species.length ? 'Crie a primeira criatura a partir de uma espécie do bestiário.' : 'Comece criando uma espécie no Bestiário; depois dá para criar criaturas dela.')
               : 'Quando o mestre entregar uma criatura a você, ela aparece aqui.'}</p>
             ${App.isMaster && !App.species.length ? `<a class="btn primary" href="#bestiario">Ir para o Bestiário</a>` : ''}
           </div>`}`;
  }

  // ---------- bestiário (só o mestre) ----------
  function speciesCard(s, i){
    const n = App.creatures.filter(c => c.species_id === s.id).length;
    return `
      <a class="tcard" href="#especie/${s.id}" style="--i:${i}">
        ${avatar(s.image_url, 78)}
        <div class="tcard-body">
          <span class="dexno">${n} ${n === 1 ? 'criatura' : 'criaturas'}</span>
          <strong class="tcard-name">${esc(s.name)}</strong>
          ${typeChips(s.types)}
        </div>
      </a>`;
  }

  function renderBestiary(root){
    view = root; mode = 'bestiary'; currentId = null;
    if(!App.isMaster){ root.innerHTML = ''; App.go('#criaturas'); return; }
    const list = App.species.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Espécies</span><h1>Bestiário</h1></div>
        <button class="btn primary" type="button" data-act="s-new">${I.plus}<span>Nova espécie</span></button>
      </header>
      ${seg('bestiary')}
      ${list.length
        ? `<div class="tgrid">${list.map(speciesCard).join('')}</div>`
        : `<div class="empty enter">
             <div class="empty-ball"></div>
             <h3>Nenhuma espécie ainda</h3>
             <p>Uma espécie guarda os tipos e o Potencial (1 a 10) de cada atributo. Cada criatura criada depois sorteia os próprios IVs.</p>
             <button class="btn primary" type="button" data-act="s-new">${I.plus}<span>Nova espécie</span></button>
           </div>`}`;
  }

  // ---------- ficha da espécie ----------
  function renderSpecies(root, id, opts){
    view = root; mode = 'species'; currentId = id;
    const s = species(id);
    if(!App.isMaster || !s){
      root.innerHTML = `
        <div class="empty enter">
          <div class="empty-ball"></div>
          <h3>Espécie não encontrada</h3>
          <p>Ela não existe mais ou só o mestre pode vê-la.</p>
          <a class="btn" href="#bestiario">${I.back}<span>Voltar</span></a>
        </div>`;
      return;
    }
    const still = opts && opts.still;
    const mine = App.creatures.filter(c => c.species_id === s.id);
    const previewLevel = (opts && opts.previewLevel) || 50;
    const stats = R.STATS.map(st => ({ st, pot: s['pot_' + st.key], val: R.statFinal(previewLevel, s['pot_' + st.key], 10) }));
    const top = Math.max(R.POT_MAX * 20, ...stats.map(x => x.val));

    root.innerHTML = `
      <a class="back" href="#bestiario">${I.back}<span>Bestiário</span></a>
      <div class="sheet ${still ? 'still' : ''}">
        <section class="card id-card">
          <div class="id-top">
            <button class="avatar-btn" type="button" data-act="s-photo" aria-label="Alterar foto de ${esc(s.name)}">
              ${avatar(s.image_url, 132)}
              <span class="avatar-cam">${I.camera}</span>
            </button>
            <div class="id-main">
              <span class="dexno">Espécie</span>
              <h1 class="id-name">${esc(s.name)}</h1>
              ${typeChips(s.types)}
            </div>
          </div>
          ${s.description ? `<p class="concept">${esc(s.description)}</p>` : ''}
          <div class="id-actions col">
            <button class="btn primary" type="button" data-act="c-new" data-species="${s.id}">${I.plus}<span>Nova criatura desta espécie</span></button>
            <div class="id-actions">
              <button class="btn" type="button" data-act="s-edit">${I.edit}<span>Editar espécie</span></button>
              <button class="btn ghost danger-text" type="button" data-act="s-delete">${I.trash}<span>Apagar</span></button>
            </div>
          </div>
        </section>

        <div class="sheet-col">
          <section class="card">
            <div class="card-head">
              <h3>Potencial</h3>
              <label class="prev-lv">prévia no nível
                <input id="prevLv" type="number" inputmode="numeric" min="1" max="100" value="${previewLevel}"></label>
            </div>
            <ul class="stat-list">
              ${stats.map(x => `
                <li>
                  <span class="attr-name">${x.st.label}</span>
                  <div class="bar slim"><div class="bar-fill attr" data-bar="p-${x.st.key}" data-w="${pct(x.val, top).toFixed(2)}"></div></div>
                  <span class="attr-val">${x.val}</span>
                  <span class="meta">Pot ${x.pot}</span>
                </li>`).join('')}
            </ul>
            <p class="hint">A barra mostra o atributo no nível ${previewLevel} com IV 10 (o valor-base). O IV de cada criatura muda isso de −50% a +50%.</p>
          </section>

          <section class="card">
            <div class="card-head"><h3>Fraquezas e resistências</h3></div>
            ${chartHtml(s.types)}
          </section>

          <section class="card">
            <div class="card-head"><h3>Criaturas desta espécie</h3><span class="pts">${mine.length}</span></div>
            ${mine.length
              ? `<div class="pc-list">${mine.map(rowLink).join('')}</div>`
              : '<p class="hint" style="margin:0">Ainda não existe nenhuma.</p>'}
          </section>
        </div>
      </div>`;
    animateBars(root, 'sp' + id);
  }

  function rowLink(c){
    const sp = species(c.species_id);
    if(!sp) return '';
    return `
      <a class="pc-row" href="#criatura/${c.id}">
        ${avatar(photoOf(c), 40)}
        <span class="pc-name">${esc(nameOf(c))}${c.nickname ? `<small>${esc(sp.name)}</small>` : ''}</span>
        <span class="chip lv">Nv ${c.level}</span>
        <span class="pc-where">${esc(whereText(c))}</span>
      </a>`;
  }

  // ---------- ficha da criatura ----------
  function renderCreature(root, id, opts){
    view = root; mode = 'creature'; currentId = id;
    const c = creature(id);
    const sp = c && species(c.species_id);
    const owner = c && c.trainer_id && trainer(c.trainer_id);
    const allowed = c && (App.isMaster || (owner && owner.kind === 'player'));
    if(!c || !sp || !allowed){
      root.innerHTML = `
        <div class="empty enter">
          <div class="empty-ball"></div>
          <h3>Criatura não encontrada</h3>
          <p>Ela não existe mais ou você não pode vê-la.</p>
          <a class="btn" href="#criaturas">${I.back}<span>Voltar</span></a>
        </div>`;
      return;
    }
    const still = opts && opts.still;
    const m = App.isMaster;
    const stats = R.creatureStats(sp, c);
    const maxHp = R.creatureMaxHp(sp, c);
    const hp = R.creatureHp(sp, c);
    const need = R.xpToNext(c.level);
    const top = Math.max(60, ...R.STATS.map(s => stats[s.key]));
    const maxed = c.level >= R.MAX_LEVEL;

    root.innerHTML = `
      <a class="back" href="#criaturas">${I.back}<span>Criaturas</span></a>
      <div class="sheet ${still ? 'still' : ''}">
        <section class="card id-card ${hp === 0 ? 'fainted' : ''}" id="cCard">
          <div class="id-top">
            <button class="avatar-btn" type="button" data-act="c-photo" aria-label="Alterar foto de ${esc(nameOf(c))}">
              ${avatar(photoOf(c), 132)}
              <span class="avatar-cam">${I.camera}</span>
            </button>
            <div class="id-main">
              <span class="where">${esc(whereText(c))}</span>
              <h1 class="id-name">${esc(nameOf(c))}</h1>
              ${c.nickname ? `<span class="sub">${esc(sp.name)}</span>` : ''}
              ${typeChips(sp.types)}
              <span class="chip lv big">Nível ${c.level}</span>
            </div>
          </div>
          ${sp.description ? `<p class="concept">${esc(sp.description)}</p>` : ''}
          ${hp === 0 ? '<div class="faint-banner">Desmaiada</div>' : ''}

          ${bar('hp', 'HP', hp, maxHp, 'hp', hpClass(hp, maxHp))}
          ${maxed ? '<div class="meter xp"><span class="tag">EXP</span><div class="maxed">nível máximo</div><span class="num"></span></div>'
                  : bar('xp', 'EXP', c.xp, need, 'xp', 'xp')}
          <p class="hint">${maxed ? 'Nível 100: o XP continua somando, mas não sobe mais.' : `Faltam ${need - c.xp} XP para o nível ${c.level + 1}.`}
            ${owner ? ` Metade de todo XP dado aqui vai para ${esc(owner.name)}.` : ''}</p>

          ${m ? `
          <div class="controls">
            <div class="ctl">
              <label for="cHpAmt">Dano / cura</label>
              <div class="ctl-row">
                <input id="cHpAmt" type="number" inputmode="numeric" min="1" value="5">
                <button class="btn danger" type="button" data-act="c-dmg">Dano</button>
                <button class="btn good" type="button" data-act="c-heal">Cura</button>
              </div>
              <button class="btn ghost small" type="button" data-act="c-full">Curar totalmente</button>
            </div>
            <div class="ctl">
              <label for="cXpAmt">Dar XP</label>
              <div class="ctl-row">
                <input id="cXpAmt" type="number" inputmode="numeric" min="1" step="1" value="10">
                <button class="btn primary" type="button" data-act="c-xp">Dar XP</button>
              </div>
            </div>
          </div>
          <div class="id-actions">
            <button class="btn" type="button" data-act="c-edit">${I.edit}<span>Editar</span></button>
            <button class="btn" type="button" data-act="c-move">Mover</button>
            <button class="btn ghost danger-text" type="button" data-act="c-delete" aria-label="Apagar criatura">${I.trash}</button>
          </div>` : ''}
        </section>

        <div class="sheet-col">
          <section class="card">
            <div class="card-head"><h3>Atributos</h3><span class="pts" title="Valores finais neste nível">nível ${c.level}</span></div>
            <ul class="stat-list">
              ${R.STATS.map(st => `
                <li>
                  <span class="attr-name">${st.label}</span>
                  <div class="bar slim"><div class="bar-fill attr" data-bar="s-${st.key}" data-w="${pct(stats[st.key], top).toFixed(2)}"></div></div>
                  <span class="attr-val">${stats[st.key]}</span>
                  ${m ? `<span class="meta" title="IV sorteado e Potencial da espécie">IV ${c['iv_' + st.key]} · Pot ${sp['pot_' + st.key]}</span>` : ''}
                </li>`).join('')}
            </ul>
            <div class="derived">
              <div><span class="k">Movimento</span><strong>${R.movementPerAction(stats.velocidade)} <small>blocos por ação</small></strong></div>
              <div><span class="k">Percepção</span><strong>+${R.perceptionBonus(stats.percepcao)} <small>no d20</small></strong></div>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h3>Fraquezas e resistências</h3></div>
            ${chartHtml(sp.types)}
          </section>

          <section class="card notes">
            <div class="card-head"><h3>Anotações</h3><span class="save-state" id="cNotesStatus"></span></div>
            <textarea id="cnotes" rows="5" maxlength="20000" placeholder="Como ela age, o que já viveu, truques que aprendeu…">${esc(pending && pending.id === c.id ? pending.text : c.notes)}</textarea>
          </section>
        </div>
      </div>`;
    animateBars(root, id);
  }

  // ---------- trecho da ficha do treinador: equipe e PC ----------
  function teamSection(trainerId){
    const mine = App.creatures.filter(c => c.trainer_id === trainerId);
    const team = [0, 1, 2].map(i => mine.find(c => c.slot === i) || null);
    const pc = mine.filter(c => c.slot == null).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const used = team.filter(Boolean).length;
    const slotHtml = (c, i) => {
      const sp = c && species(c.species_id);
      if(!c || !sp) return `<div class="slot"><div class="slot-ball"></div><span>Vaga ${i + 1}</span></div>`;
      const max = R.creatureMaxHp(sp, c), cur = R.creatureHp(sp, c);
      return `
        <a class="slot has" href="#criatura/${c.id}">
          ${avatar(photoOf(c), 64)}
          <strong>${esc(nameOf(c))}</strong>
          <span class="chip lv">Nv ${c.level}</span>
          <div class="mini-hp slim"><div class="bar"><div class="bar-fill ${hpClass(cur, max)}" style="width:${pct(cur, max).toFixed(1)}%"></div></div></div>
        </a>`;
    };
    return `
      <section class="card team">
        <div class="card-head">
          <h3>Equipe carregada</h3>
          <span class="pts ${used ? 'has' : ''}">${used}/${R.TEAM_SIZE}</span>
        </div>
        <div class="slots">${team.map(slotHtml).join('')}</div>
        ${pc.length ? `
          <h4 class="pc-title">PC <span>${pc.length}</span></h4>
          <div class="pc-list">${pc.map(rowLink).join('')}</div>` : ''}
        ${App.isMaster ? `<button class="btn ghost small add-c" type="button" data-act="c-new" data-trainer="${trainerId}">${I.plus}<span>Nova criatura para ele</span></button>` : ''}
      </section>`;
  }

  // ---------- ações ----------
  /** Guarda a linha nova no estado e redesenha a tela aberta, sem animar de novo. */
  function applyCreature(row){
    const i = App.creatures.findIndex(c => c.id === row.id);
    if(i >= 0) App.creatures[i] = row; else App.creatures.push(row);
    redraw();
  }
  function applySpecies(row){
    const i = App.species.findIndex(s => s.id === row.id);
    if(i >= 0) App.species[i] = row; else App.species.push(row);
    redraw();
  }
  function redraw(){
    if(!view) return;
    if(mode === 'creature') renderCreature(view, currentId, { still: true });
    else if(mode === 'species') renderSpecies(view, currentId, { still: true, previewLevel: previewLevelNow() });
    else if(mode === 'bestiary') renderBestiary(view);
    else if(mode === 'list') renderList(view);
  }
  const previewLevelNow = () => {
    const el = view && view.querySelector('#prevLv');
    return el ? Math.min(100, Math.max(1, Math.floor(Number(el.value)) || 50)) : 50;
  };

  async function changePhoto(kind, entity, label){
    const res = await Cropper.open({ title: 'Foto de ' + label, url: entity.image_src_url || null, frame: entity.image_frame || null });
    if(!res) return;
    UI.toast('Enviando foto…');
    const folder = kind === 'species' ? 'species' : 'creatures';
    try{
      const cropUrl = await API.uploadImage(res.croppedBlob, folder, 'crop');
      const srcUrl = res.sourceBlob ? await API.uploadImage(res.sourceBlob, folder, 'src') : entity.image_src_url;
      const patch = { image_url: cropUrl, image_src_url: srcUrl, image_frame: res.frame };
      if(kind === 'species'){
        await API.setSpeciesPhoto(entity.id, cropUrl, srcUrl, res.frame);
        applySpecies(Object.assign({}, species(entity.id), patch));
      }else{
        await API.setCreaturePhoto(entity.id, cropUrl, srcUrl, res.frame);
        applyCreature(Object.assign({}, creature(entity.id), patch));
      }
      UI.toast('Foto atualizada', 'good');
    }catch(e){ UI.toast('Não consegui enviar a foto: ' + e.message, 'bad'); }
  }

  async function hpChange(c, sign, btn){
    const sp = species(c.species_id);
    const n = Math.floor(Number(view.querySelector('#cHpAmt').value));
    if(!(n >= 1)){ UI.toast('Digite um valor de 1 para cima', 'bad'); return; }
    const max = R.creatureMaxHp(sp, c);
    const next = Math.min(max, Math.max(0, R.creatureHp(sp, c) + sign * n));
    await UI.busy(btn, async () => {
      try{ applyCreature(await API.creatureHp(c.id, next >= max ? null : next)); }
      catch(e){ UI.toast(e.message, 'bad'); }
    });
  }

  async function healFull(c, btn){
    await UI.busy(btn, async () => {
      try{ applyCreature(await API.creatureHp(c.id, null)); UI.toast('Curada totalmente', 'good'); }
      catch(e){ UI.toast(e.message, 'bad'); }
    });
  }

  async function giveXp(c, btn){
    const n = Math.floor(Number(view.querySelector('#cXpAmt').value));
    if(!(n >= 1)){ UI.toast('Digite um XP de 1 para cima', 'bad'); return; }
    await UI.busy(btn, async () => {
      try{
        const before = c.level;
        const row = await API.creatureAddXp(c.id, n);
        applyCreature(row);
        if(c.trainer_id) App.refreshTrainers();   // o treinador ganhou metade do XP
        if(row.level > before){
          UI.toast(`${nameOf(row)} subiu para o nível ${row.level}!`, 'good');
          const el = view.querySelector('#cCard');
          if(el){ el.classList.add('levelup'); setTimeout(() => el.classList.remove('levelup'), 1400); }
        }else{
          UI.toast(`+${n} XP`, 'good');
        }
      }catch(e){ UI.toast(e.message, 'bad'); }
    });
  }

  async function removeCreature(c){
    const ok = await UI.confirmBox({
      title: 'Apagar criatura',
      html: `Apagar <b>${esc(nameOf(c))}</b>? Isso não pode ser desfeito.`,
      yesLabel: 'Apagar', danger: true
    });
    if(!ok) return;
    try{
      await API.deleteCreature(c.id);
      App.creatures = App.creatures.filter(x => x.id !== c.id);
      App.go('#criaturas');
      UI.toast('Criatura apagada');
    }catch(e){ UI.toast(e.message, 'bad'); }
  }

  async function removeSpecies(s){
    const n = App.creatures.filter(c => c.species_id === s.id).length;
    if(n){
      UI.toast(`Ainda existem ${n} criaturas dessa espécie. Apague ou mude a espécie delas antes.`, 'bad');
      return;
    }
    const ok = await UI.confirmBox({
      title: 'Apagar espécie',
      html: `Apagar a espécie <b>${esc(s.name)}</b>?`,
      yesLabel: 'Apagar', danger: true
    });
    if(!ok) return;
    try{
      await API.deleteSpecies(s.id);
      App.species = App.species.filter(x => x.id !== s.id);
      App.go('#bestiario');
      UI.toast('Espécie apagada');
    }catch(e){ UI.toast(e.message, 'bad'); }
  }

  // ---------- formulário da espécie ----------
  function openSpeciesForm(s){
    const isNew = !s;
    const d = s || { name:'', description:'', types:[] };
    const chosen = new Set(d.types);
    const m = UI.openModal({
      title: isNew ? 'Nova espécie' : 'Editar espécie',
      wide: true,
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>Nome da espécie</span>
            <input name="name" required maxlength="80" value="${esc(d.name)}" placeholder="Nome" autofocus></label>
          <label class="field"><span>Descrição</span>
            <textarea name="description" rows="3" maxlength="800" placeholder="Aparência, hábitos, onde vive…">${esc(d.description)}</textarea></label>
          <fieldset class="attr-edit">
            <legend>Tipos <b data-tcount></b></legend>
            <div class="type-pick">${R.TYPES.map(t => `<button type="button" class="tp" data-type="${t}">${typeChip(t)}</button>`).join('')}</div>
          </fieldset>
          <fieldset class="attr-edit">
            <legend>Potencial (1 a 10)</legend>
            <div class="pot-grid">
              ${R.STATS.map(st => `
                <label class="pot-row"><span>${st.label}</span>
                  <input type="range" name="pot_${st.key}" min="${R.POT_MIN}" max="${R.POT_MAX}" step="1" value="${s ? s['pot_' + st.key] : 5}">
                  <b data-pot="${st.key}">${s ? s['pot_' + st.key] : 5}</b></label>`).join('')}
            </div>
            <p class="attr-info">Potencial 5 = atributo igual à curva-base do nível; 10 = o dobro.</p>
          </fieldset>
          <div class="modal-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">${isNew ? 'Criar espécie' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const counter = form.querySelector('[data-tcount]');

    function paintTypes(){
      form.querySelectorAll('.tp').forEach(b => {
        const on = chosen.has(b.dataset.type);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      counter.textContent = `${chosen.size}/${R.MAX_TYPES}`;
    }
    paintTypes();
    form.addEventListener('click', e => {
      const b = e.target.closest('.tp');
      if(!b) return;
      const t = b.dataset.type;
      if(chosen.has(t)) chosen.delete(t);
      else if(chosen.size >= R.MAX_TYPES){ UI.toast(`No máximo ${R.MAX_TYPES} tipos por espécie`, 'bad'); return; }
      else chosen.add(t);
      paintTypes();
    });
    form.addEventListener('input', e => {
      if(e.target.name && e.target.name.startsWith('pot_')){
        form.querySelector(`[data-pot="${e.target.name.slice(4)}"]`).textContent = e.target.value;
      }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if(!name){ UI.toast('Dê um nome à espécie', 'bad'); return; }
      if(!chosen.size){ UI.toast('Escolha pelo menos um tipo', 'bad'); return; }
      const data = { name, description: form.elements.description.value.trim(), types: R.TYPES.filter(t => chosen.has(t)) };
      R.STATS.forEach(st => { data['pot_' + st.key] = Number(form.elements['pot_' + st.key].value); });
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          const row = await API.saveSpecies(s ? s.id : null, data);
          m.close(true);
          if(isNew){
            App.species.push(row);
            App.go('#especie/' + row.id);
            UI.toast('Espécie criada', 'good');
          }else{
            applySpecies(row);
            UI.toast('Espécie salva', 'good');
          }
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- formulário da criatura ----------
  const rollIv = () => 1 + Math.floor(Math.random() * R.IV_MAX);

  function openCreatureForm(c, opts){
    if(!App.species.length){
      UI.toast('Crie uma espécie no Bestiário primeiro', 'bad');
      App.go('#bestiario');
      return;
    }
    const isNew = !c;
    const o = opts || {};
    const d = c || { species_id: o.speciesId || App.species[0].id, nickname:'', level:1, xp:0, hp_current:null };
    const ivs = {};
    R.STATS.forEach(st => { ivs[st.key] = c ? c['iv_' + st.key] : rollIv(); });

    const m = UI.openModal({
      title: isNew ? 'Nova criatura' : 'Editar criatura',
      wide: true,
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>Espécie</span>
            <select name="species_id">
              ${App.species.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(s =>
                `<option value="${s.id}" ${s.id === d.species_id ? 'selected' : ''}>${esc(s.name)} — ${esc(s.types.join(' / '))}</option>`).join('')}
            </select></label>
          <div class="row2">
            <label class="field"><span>Apelido (opcional)</span>
              <input name="nickname" maxlength="80" value="${esc(d.nickname)}" placeholder="Usa o nome da espécie"></label>
            <label class="field"><span>Nível</span>
              <input type="number" name="level" inputmode="numeric" min="1" max="${R.MAX_LEVEL}" value="${d.level}"></label>
          </div>
          ${isNew ? `
          <label class="field"><span>Dono</span>
            <select name="trainer_id">
              <option value="">Sem dono</option>
              ${App.trainers.map(t => `<option value="${t.id}" ${t.id === o.trainerId ? 'selected' : ''}>${esc(t.name)}${t.kind === 'npc' ? ' (NPC)' : ''}</option>`).join('')}
            </select></label>` : `
          <div class="row2">
            <label class="field"><span>XP atual</span>
              <input type="number" name="xp" inputmode="numeric" min="0" step="1" value="${d.xp}"></label>
            <label class="field"><span>HP atual</span>
              <input type="number" name="hp_current" inputmode="numeric" min="0" value="${d.hp_current == null ? '' : d.hp_current}" placeholder="cheio"></label>
          </div>`}
          <fieldset class="attr-edit">
            <legend>IVs (1 a 20) <button class="btn ghost small roll" type="button" data-roll>Sortear todos</button></legend>
            <div class="iv-grid">
              ${R.STATS.map(st => `
                <label class="iv-cell"><span>${st.short}</span>
                  <input type="number" name="iv_${st.key}" inputmode="numeric" min="${R.IV_MIN}" max="${R.IV_MAX}" value="${ivs[st.key]}">
                  <b data-final="${st.key}"></b></label>`).join('')}
            </div>
            <p class="attr-info" data-info></p>
          </fieldset>
          <div class="modal-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">${isNew ? 'Criar criatura' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const info = form.querySelector('[data-info]');
    const clampIv = v => Math.min(R.IV_MAX, Math.max(R.IV_MIN, Math.floor(Number(v)) || R.IV_MIN));
    const level = () => Math.min(R.MAX_LEVEL, Math.max(1, Math.floor(Number(form.elements.level.value)) || 1));

    function refreshPreview(){
      const sp = species(form.elements.species_id.value);
      if(!sp) return;
      const snap = { level: level() };
      R.STATS.forEach(st => { snap['iv_' + st.key] = clampIv(form.elements['iv_' + st.key].value); });
      const stats = R.creatureStats(sp, snap);
      R.STATS.forEach(st => { form.querySelector(`[data-final="${st.key}"]`).textContent = stats[st.key]; });
      info.innerHTML = `Valor final no nível ${snap.level}. HP máximo: <b>${stats.vit}</b>.`;
    }
    form.addEventListener('input', refreshPreview);
    form.addEventListener('change', refreshPreview);
    form.querySelector('[data-roll]').addEventListener('click', () => {
      R.STATS.forEach(st => { form.elements['iv_' + st.key].value = rollIv(); });
      refreshPreview();
    });
    refreshPreview();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        species_id: form.elements.species_id.value,
        nickname: form.elements.nickname.value.trim(),
        level: level()
      };
      R.STATS.forEach(st => { data['iv_' + st.key] = clampIv(form.elements['iv_' + st.key].value); });
      if(isNew){
        if(form.elements.trainer_id.value) data.trainer_id = form.elements.trainer_id.value;
      }else{
        data.xp = Math.max(0, Math.floor(Number(form.elements.xp.value)) || 0);
        const hp = form.elements.hp_current.value;
        data.hp_current = hp === '' ? null : Math.max(0, Math.floor(Number(hp)) || 0);
      }
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          const row = await API.saveCreature(c ? c.id : null, data);
          m.close(true);
          if(isNew){
            App.creatures.push(row);
            App.go('#criatura/' + row.id);
            UI.toast('Criatura criada', 'good');
          }else{
            applyCreature(row);
            UI.toast('Criatura salva', 'good');
          }
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- mover (dono + equipe/PC) ----------
  function openMoveForm(c){
    const m = UI.openModal({
      title: 'Mover ' + nameOf(c),
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>Dono</span>
            <select name="trainer_id">
              <option value="">Sem dono</option>
              ${App.trainers.map(t => `<option value="${t.id}" ${t.id === c.trainer_id ? 'selected' : ''}>${esc(t.name)}${t.kind === 'npc' ? ' (NPC)' : ''}</option>`).join('')}
            </select></label>
          <label class="field" data-slotfield><span>Onde fica</span>
            <select name="slot"></select></label>
          <p class="attr-info" data-note></p>
          <div class="modal-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">Mover</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const slotSel = form.elements.slot;
    const note = form.querySelector('[data-note]');

    function paintSlots(){
      const tid = form.elements.trainer_id.value;
      form.querySelector('[data-slotfield]').hidden = !tid;
      slotSel.innerHTML = '';
      if(!tid){ note.textContent = 'Sem dono: a criatura fica solta, fora de qualquer equipe ou PC.'; return; }
      const here = id => App.creatures.find(x => x.trainer_id === tid && x.slot === id && x.id !== c.id);
      const opts = [`<option value="pc">PC</option>`];
      for(let i = 0; i < R.TEAM_SIZE; i++){
        const occ = here(i);
        opts.push(`<option value="${i}">Equipe — vaga ${i + 1}${occ ? ' (troca com ' + esc(nameOf(occ)) + ')' : ' (livre)'}</option>`);
      }
      slotSel.innerHTML = opts.join('');
      slotSel.value = tid === c.trainer_id && c.slot != null ? String(c.slot) : (tid === c.trainer_id ? 'pc' : (here(0) ? (here(1) ? (here(2) ? 'pc' : '2') : '1') : '0'));
      note.textContent = 'Em uma vaga ocupada, as duas criaturas trocam de lugar (ou a outra vai para o PC).';
    }
    form.elements.trainer_id.addEventListener('change', paintSlots);
    paintSlots();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const tid = form.elements.trainer_id.value || null;
      const slot = !tid || slotSel.value === 'pc' ? null : Number(slotSel.value);
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          const row = await API.moveCreature(c.id, tid, slot);
          m.close(true);
          await App.reloadAll();      // a troca pode ter mexido em outra criatura
          UI.toast('Criatura movida', 'good');
          if(row) redraw();
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- anotações (salvam sozinhas) ----------
  const commit = UI.debounce(() => flushNotes(), 900);
  const setStatus = txt => { const el = document.getElementById('cNotesStatus'); if(el) el.textContent = txt; };

  async function flushNotes(){
    if(!pending) return;
    const p = pending;
    pending = null;
    commit.cancel();
    setStatus('salvando…');
    try{
      await API.setCreatureNotes(p.id, p.text);
      const c = creature(p.id);
      if(c) c.notes = p.text;
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
      const act = b.dataset.act;
      const c = mode === 'creature' && currentId ? creature(currentId) : null;
      const s = mode === 'species' && currentId ? species(currentId) : null;
      const M = App.isMaster;
      switch(act){
        case 'filter': filter = b.dataset.filter; renderList(root); break;
        case 'c-new': if(M) openCreatureForm(null, { speciesId: b.dataset.species, trainerId: b.dataset.trainer }); break;
        case 'c-edit': if(c && M) openCreatureForm(c); break;
        case 'c-move': if(c && M) openMoveForm(c); break;
        case 'c-delete': if(c && M) removeCreature(c); break;
        case 'c-photo': if(c) changePhoto('creature', c, nameOf(c)); break;
        case 'c-dmg': if(c && M) hpChange(c, -1, b); break;
        case 'c-heal': if(c && M) hpChange(c, 1, b); break;
        case 'c-full': if(c && M) healFull(c, b); break;
        case 'c-xp': if(c && M) giveXp(c, b); break;
        case 's-new': if(M) openSpeciesForm(null); break;
        case 's-edit': if(s && M) openSpeciesForm(s); break;
        case 's-delete': if(s && M) removeSpecies(s); break;
        case 's-photo': if(s && M) changePhoto('species', s, s.name); break;
      }
    });
    root.addEventListener('input', e => {
      if(e.target.id === 'cnotes' && mode === 'creature' && currentId){
        pending = { id: currentId, text: e.target.value };
        setStatus('…');
        commit();
      }else if(e.target.id === 'prevLv' && mode === 'species'){
        renderSpecies(root, currentId, { still: true, previewLevel: previewLevelNow() });
        const el = root.querySelector('#prevLv');
        if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }
    });
    root.addEventListener('focusout', e => { if(e.target.id === 'cnotes') flushNotes(); });
    document.addEventListener('visibilitychange', () => { if(document.hidden) flushNotes(); });
    window.addEventListener('pagehide', flushNotes);
  }

  /** Mudança vinda de outro aparelho: redesenha, sem atropelar quem está digitando. */
  function refresh(){
    if(!view || UI.isModalOpen()) return;
    const a = document.activeElement;
    if(pending || (a && (a.id === 'cnotes' || a.id === 'prevLv' || a.id === 'cHpAmt' || a.id === 'cXpAmt'))) return;
    redraw();
  }

  return {
    init, renderList, renderBestiary, renderSpecies, renderCreature, teamSection,
    openCreatureForm, flushNotes, refresh
  };
})();
