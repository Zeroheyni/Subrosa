/* ============================================================
   POKÉMON — técnicas
   O mestre cria as técnicas (tipo, categoria, Poder, custo em PA) e escolhe
   até 4 para cada criatura. O jogador só vê as técnicas das criaturas dele.
   ============================================================ */
window.Techniques = (function(){
  'use strict';

  const R = PKM_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  let view = null;

  const tech = id => App.techniques.find(t => t.id === id);
  const catLabel = key => (R.CATEGORIES.find(c => c.key === key) || R.CATEGORIES[0]).label;
  const typeChip = t => Creatures.typeChip(t);
  const paDots = n => `<span class="pa" title="${n} PA">${'<i></i>'.repeat(n)}</span>`;

  /** Técnicas que a criatura sabe, na ordem em que o mestre escolheu. */
  function knownBy(creatureId){
    return App.ctechs
      .filter(l => l.creature_id === creatureId)
      .sort((a, b) => a.position - b.position)
      .map(l => tech(l.technique_id))
      .filter(Boolean);
  }
  const usedBy = id => App.ctechs.filter(l => l.technique_id === id).length;

  function techRow(t, extra){
    return `
      <div class="tech-row">
        ${typeChip(t.type)}
        <span class="tech-name"><strong>${esc(t.name)}</strong><small>${catLabel(t.category)} · Poder ${t.power} · alcance ${t.reach || 1} · ${R.powerBand(t.power)}</small></span>
        ${paDots(t.pa_cost)}
        ${extra || ''}
      </div>`;
  }

  // ---------- lista (só o mestre) ----------
  function render(root){
    view = root;
    if(!App.isMaster){ App.go('#criaturas'); return; }
    const list = App.techniques.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">Golpes</span><h1>Técnicas</h1></div>
        <button class="btn primary" type="button" data-act="t-new">${I.plus}<span>Nova técnica</span></button>
      </header>
      ${Creatures.seg('techniques')}
      ${list.length ? `
        <div class="tgrid">
          ${list.map((t, i) => {
            const n = usedBy(t.id);
            return `
              <button class="tcard tech-card" type="button" data-act="t-edit" data-id="${t.id}" style="--i:${i}">
                <div class="tcard-body">
                  <span class="chips">${typeChip(t.type)}<span class="chip">${catLabel(t.category)}</span></span>
                  <strong class="tcard-name">${esc(t.name)}</strong>
                  <span class="where">Poder ${t.power} · alcance ${t.reach || 1} · ${R.powerBand(t.power)}</span>
                  ${t.description ? `<span class="sub clip">${esc(t.description)}</span>` : ''}
                </div>
                <div class="tech-side">${paDots(t.pa_cost)}<small>${n} ${n === 1 ? 'criatura' : 'criaturas'}</small></div>
              </button>`;
          }).join('')}
        </div>`
      : `<div class="empty enter">
           <div class="empty-ball"></div>
           <h3>Nenhuma técnica ainda</h3>
           <p>Crie as técnicas do seu universo: tipo, física ou especial, Poder de 1 a 150 e custo de 1 a 5 PA. Depois escolha até ${R.MAX_TECHNIQUES} para cada criatura.</p>
           <button class="btn primary" type="button" data-act="t-new">${I.plus}<span>Nova técnica</span></button>
         </div>`}`;
  }

  // ---------- trecho da ficha da criatura ----------
  function creatureCard(c){
    const known = knownBy(c.id);
    return `
      <section class="card">
        <div class="card-head">
          <h3>Técnicas</h3>
          <span class="pts ${known.length ? 'has' : ''}">${known.length}/${R.MAX_TECHNIQUES}</span>
        </div>
        ${known.length
          ? `<div class="tech-list">${known.map(t => techRow(t)).join('')}</div>`
          : `<p class="hint" style="margin:0">${App.isMaster ? 'Essa criatura ainda não sabe nenhuma técnica.' : 'Ainda não aprendeu nenhuma técnica.'}</p>`}
        ${App.isMaster ? `<button class="btn ghost small add-c" type="button" data-act="t-pick" data-id="${c.id}">${I.edit}<span>Escolher técnicas</span></button>` : ''}
      </section>`;
  }

  // ---------- formulário ----------
  function openForm(t){
    const isNew = !t;
    const d = t || { name:'', type:'Normal', category:'fisico', power:40, pa_cost:1, reach:1, description:'' };
    const m = UI.openModal({
      title: isNew ? 'Nova técnica' : 'Editar técnica',
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>Nome</span>
            <input name="name" required maxlength="80" value="${esc(d.name)}" placeholder="Nome da técnica" autofocus></label>
          <div class="row2">
            <label class="field"><span>Tipo</span>
              <select name="type">${R.TYPES.map(x => `<option ${x === d.type ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label class="field"><span>Categoria</span>
              <select name="category">${R.CATEGORIES.map(c => `<option value="${c.key}" ${c.key === d.category ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
          </div>
          <div class="row2">
            <label class="field"><span>Poder (1 a ${R.POWER_MAX})</span>
              <input type="number" name="power" inputmode="numeric" min="${R.POWER_MIN}" max="${R.POWER_MAX}" value="${d.power}"></label>
            <label class="field"><span>Custo em PA (1 a 5)</span>
              <input type="number" name="pa_cost" inputmode="numeric" min="1" max="${R.PA_PER_TURN}" value="${d.pa_cost}"></label>
          </div>
          <label class="field"><span>Alcance em blocos (1 a ${R.REACH_MAX})</span>
            <input type="number" name="reach" inputmode="numeric" min="${R.REACH_MIN}" max="${R.REACH_MAX}" value="${d.reach || 1}"></label>
          <p class="attr-info" data-info></p>
          <label class="field"><span>Descrição</span>
            <textarea name="description" rows="3" maxlength="600" placeholder="O que a técnica faz, como é vista em cena…">${esc(d.description)}</textarea></label>
          <div class="modal-actions">
            ${isNew ? '' : `<button class="btn ghost danger-text" type="button" data-del>${I.trash}<span>Apagar</span></button>`}
            <span class="grow"></span>
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">${isNew ? 'Criar técnica' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const info = form.querySelector('[data-info]');
    const power = () => Math.min(R.POWER_MAX, Math.max(R.POWER_MIN, Math.floor(Number(form.elements.power.value)) || R.POWER_MIN));
    const cost = () => Math.min(R.PA_PER_TURN, Math.max(1, Math.floor(Number(form.elements.pa_cost.value)) || 1));
    const refreshInfo = () => {
      const cat = R.CATEGORIES.find(c => c.key === form.elements.category.value);
      const stat = id => (R.STATS.find(s => s.key === id) || {}).label;
      info.innerHTML = `Faixa: <b>${R.powerBand(power())}</b> · usa <b>${stat(cat.atk)}</b> do atacante contra <b>${stat(cat.def)}</b> do alvo.`;
    };
    form.addEventListener('input', refreshInfo);
    form.addEventListener('change', refreshInfo);
    refreshInfo();

    if(!isNew){
      form.querySelector('[data-del]').onclick = async () => {
        const n = usedBy(t.id);
        if(n){ UI.toast(`${n} ${n === 1 ? 'criatura sabe' : 'criaturas sabem'} essa técnica. Tire dela antes de apagar.`, 'bad'); return; }
        const ok = await UI.confirmBox({ title: 'Apagar técnica', html: `Apagar <b>${esc(t.name)}</b>?`, yesLabel: 'Apagar', danger: true });
        if(!ok) return;
        try{
          await API.deleteTechnique(t.id);
          App.techniques = App.techniques.filter(x => x.id !== t.id);
          m.close(true);
          render(view);
          UI.toast('Técnica apagada');
        }catch(e){ UI.toast(e.message, 'bad'); }
      };
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if(!name){ UI.toast('Dê um nome à técnica', 'bad'); return; }
      const data = {
        name,
        type: form.elements.type.value,
        category: form.elements.category.value,
        power: power(),
        pa_cost: cost(),
        reach: Math.min(R.REACH_MAX, Math.max(R.REACH_MIN, Math.floor(Number(form.elements.reach.value)) || 1)),
        description: form.elements.description.value.trim()
      };
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          const row = await API.saveTechnique(t ? t.id : null, data);
          m.close(true);
          const i = App.techniques.findIndex(x => x.id === row.id);
          if(i >= 0) App.techniques[i] = row; else App.techniques.push(row);
          render(view);
          UI.toast(isNew ? 'Técnica criada' : 'Técnica salva', 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- escolher as técnicas de uma criatura (até 4) ----------
  function openPicker(c){
    if(!App.techniques.length){
      UI.toast('Crie técnicas primeiro (aba Criaturas › Técnicas)', 'bad');
      App.go('#tecnicas');
      return;
    }
    const chosen = knownBy(c.id).map(t => t.id);
    const all = App.techniques.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const m = UI.openModal({
      title: 'Técnicas de ' + (c.nickname || (App.species.find(s => s.id === c.species_id) || {}).name || 'criatura'),
      wide: true,
      html: `
        <form class="form" data-form>
          <p class="attr-info"><b data-count></b> escolhidas — no máximo ${R.MAX_TECHNIQUES}.</p>
          <div class="pick-list">
            ${all.map(t => `
              <label class="pick-row">
                <input type="checkbox" value="${t.id}" ${chosen.includes(t.id) ? 'checked' : ''}>
                ${techRow(t)}
              </label>`).join('')}
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">Salvar</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const boxes = [...form.querySelectorAll('input[type=checkbox]')];
    const sync = () => {
      const n = boxes.filter(b => b.checked).length;
      form.querySelector('[data-count]').textContent = n + '/' + R.MAX_TECHNIQUES;
      boxes.forEach(b => { b.disabled = !b.checked && n >= R.MAX_TECHNIQUES; b.closest('.pick-row').classList.toggle('off', b.disabled); });
    };
    form.addEventListener('change', sync);
    sync();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      // mantém a ordem em que já estavam; as novas vão para o fim
      const picked = boxes.filter(b => b.checked).map(b => b.value);
      const ids = chosen.filter(id => picked.includes(id)).concat(picked.filter(id => !chosen.includes(id)));
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          await API.setCreatureTechniques(c.id, ids);
          m.close(true);
          await App.reloadAll();
          UI.toast('Técnicas salvas', 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  function init(root){
    view = root;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if(!b || !root.contains(b) || !b.dataset.act.startsWith('t-')) return;
      if(!App.isMaster) return;
      switch(b.dataset.act){
        case 't-new': openForm(null); break;
        case 't-edit': { const t = tech(b.dataset.id); if(t) openForm(t); break; }
        case 't-pick': { const c = App.creatures.find(x => x.id === b.dataset.id); if(c) openPicker(c); break; }
      }
    });
  }

  function refresh(){
    if(!view || UI.isModalOpen()) return;
    render(view);
  }

  return { init, render, refresh, knownBy, creatureCard, techRow, paDots, catLabel };
})();
