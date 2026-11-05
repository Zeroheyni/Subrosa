/* ============================================================
   CAT & DOG — telas "Hoje" e "Tarefas": cartões, detalhe, formulário e valor

   Cada lado vê as próprias tarefas e as compartilhadas. As tarefas do outro
   lado também aparecem (aba "Do Gato"/"Do Cão") porque é o outro quem define
   o valor das moedas.
   ============================================================ */
window.Tasks = (function(){
  'use strict';

  const R = CD_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  let view = null;
  let mode = null;            // 'today' | 'list'
  let filter = 'minhas';      // minhas | juntas | outro | avaliar
  let doneOpen = false;

  const me = () => App.side;
  const them = () => R.other(App.side);
  const name = s => R.SIDES[s].label;
  const today = () => R.todayISO();
  const tz = () => R.tzOf(me());       // fuso de quem está olhando

  // ---------- peças de tela ----------
  function chip(html, cls){ return `<span class="chip ${cls || ''}">${html}</span>`; }

  function parts(t, st){
    if(t.owner !== 'ambos') return '';
    return `<span class="duo-parts" aria-label="Quem já fez">${['gato', 'cao'].map(s => `
      <span class="dp ${s} ${st.done[s] ? 'done' : ''}" title="${name(s)}${st.done[s] ? ' — feito' : ''}">${UI.face(s, 20)}${st.done[s] ? `<i>${I.check}</i>` : ''}</span>`).join('')}</span>`;
  }

  function rewardBadge(t){
    const s = me();
    if(R.relevantTo(t, s)){
      const r = R.myReward(t, s);
      if(r) return `<span class="reward ${s}" title="${R.pluralCoins(r.value, s)}${r.bonus ? ` (+${r.bonus} de bônus se os dois cumprirem)` : ''}">${UI.coin(s, 18)}<b>+${r.value}</b></span>`;
      return `<span class="reward pending" title="O ${name(them())} ainda vai definir o valor">${I.hourglass}<b>?</b></span>`;
    }
    // tarefa do outro: mostro o que ele ganha
    const o = them();
    if(R.hasValue(t, o)) return `<span class="reward ${o}" title="Valor que você definiu">${UI.coin(o, 18)}<b>${R.valueOf(t, o)}</b></span>`;
    return `<span class="reward pending" title="Sem valor ainda">${I.hourglass}<b>?</b></span>`;
  }

  function card(t, i){
    const s = me();
    const st = R.status(t, App.comps, new Date());
    const mine = R.relevantTo(t, s);
    const info = R.dueInfo(t);
    const canT = mine && R.canToggle(t, s, st);
    const myDone = t.shared_mode === 'any' ? st.complete : st.done[s];
    const doneByOther = t.shared_mode === 'any' && st.doneBy && st.doneBy !== s;
    const needVal = R.needsMyValue(t, s);
    const mode = t.shared_mode ? R.MODES[t.shared_mode] : null;

    const lead = mine
      ? `<button class="check ${s} ${myDone ? 'on' : ''}" type="button" data-act="toggle" ${canT ? '' : 'disabled'} aria-pressed="${myDone ? 'true' : 'false'}"
           aria-label="${myDone ? 'Desmarcar' : 'Concluir'} ${esc(t.title)}">${I.check}</button>`
      : `<span class="lead-face ${them()}">${UI.face(them(), 30)}</span>`;

    const chips = [
      info.text ? chip(`${info.repeat ? I.repeat : I.clock}<span>${esc(info.text)}</span>`, info.overdue && !myDone ? 'late' : '') : '',
      mode ? chip(`${I.users}<span>${esc(mode.short)}</span>`, 'shared') : '',
      doneByOther ? chip(`${I.check}<span>feita pelo ${name(st.doneBy)}</span>`, 'ok') : '',
      mine && !canT && !myDone && !doneByOther && t.repeat === 'weekly' ? chip(`<span>não é dia</span>`) : ''
    ].filter(Boolean).join('');

    const valueBtn = needVal
      ? `<button class="pill-btn" type="button" data-act="value" data-target="${them()}">${UI.coin(them(), 16)}<span>${R.hasValue(t, them()) ? 'Mudar valor' : 'Definir valor'} do ${name(them())}</span></button>`
      : '';

    return `
      <article class="task ${mine ? s : 'other'} ${myDone ? 'is-done' : ''}" data-id="${t.id}" style="--i:${i || 0}">
        ${lead}
        <div class="task-main" data-act="open" role="button" tabindex="0">
          <h3 class="task-title">${esc(t.title)}</h3>
          ${chips ? `<div class="chips">${chips}</div>` : ''}
          ${valueBtn}
        </div>
        <div class="task-side">${rewardBadge(t)}${parts(t, st)}</div>
      </article>`;
  }

  function group(title, list, cls, extra){
    if(!list.length) return '';
    return `
      <section class="group ${cls || ''}">
        <header class="group-head"><h2>${title}</h2><span class="count">${list.length}</span>${extra || ''}</header>
        <div class="tasks">${list.map((t, i) => card(t, i)).join('')}</div>
      </section>`;
  }

  // ---------- HOJE ----------
  function greeting(){
    const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: tz(), hourCycle:'h23', hour:'2-digit' }).format(new Date()));
    return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }
  const longDate = () => {
    const s = new Intl.DateTimeFormat('pt-BR', { timeZone: tz(), weekday:'long', day:'numeric', month:'long' }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  function ring(done, total){
    const pct = total ? done / total : 0;
    const C = 2 * Math.PI * 34;
    return `
      <div class="ring ${me()}" role="img" aria-label="${done} de ${total} tarefas de hoje">
        <svg viewBox="0 0 80 80"><circle class="ring-bg" cx="40" cy="40" r="34"/>
          <circle class="ring-fg" cx="40" cy="40" r="34" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}" style="--c:${C.toFixed(1)};--o:${(C * (1 - pct)).toFixed(1)}"/></svg>
        <div class="ring-n"><b>${done}</b><small>de ${total}</small></div>
      </div>`;
  }

  function earnedToday(){
    const td = today();
    return App.log.filter(l => l.side === me() && l.amount > 0 && (l.kind === 'task' || l.kind === 'streak') && R.dayOf(l.created_at) === td).reduce((n, l) => n + l.amount, 0);
  }

  function walletCard(s, isMe){
    return `
      <a class="wallet ${s} ${isMe ? 'me' : ''}" href="#moedas">
        <span class="wallet-coin">${UI.coin(s, 40)}</span>
        <span class="wallet-body">
          <small>${s === 'gato' ? 'felinas' : 'caninas'}${isMe ? ' · você' : ''}</small>
          <b data-v="${App.wallets[s]}">${App.wallets[s]}</b>
        </span>
      </a>`;
  }

  function nextAlarmChip(){
    const n = Alarms.next();
    return n ? `<a class="presence alarm-chip enter" href="#tempo/alarmes">${I.bell}<span>Próximo alarme <b>${n.time}</b>${n.label ? ' · ' + esc(n.label) : ''} <small>${n.when}</small></span></a>` : '';
  }

  function presenceChip(){
    const o = App.timers.find(t => t.side === them() && t.kind === 'focus' && (t.status === 'running' || t.status === 'paused'));
    if(!o) return '';
    return `<a class="presence enter" href="#tempo">${UI.face(them(), 20)}<span><b>${name(them())}</b> está em foco${o.label ? ' · ' + esc(o.label) : ''}</span></a>`;
  }

  function streakCard(){
    const s = me(), o = them();
    const mine = App.streaks[s] || { cur: 0, best: 0, today_done: false };
    const theirs = App.streaks[o] || { cur: 0, best: 0 };
    const next = R.nextMilestone(mine.cur);
    const pct = next ? Math.round(((mine.cur - next.prev) / (next.days - next.prev)) * 100) : 100;
    const lit = mine.today_done;
    const sub = mine.cur === 0 ? 'Conclua uma tarefa hoje para começar.'
      : lit ? (next ? `Faltam ${next.left} ${next.left === 1 ? 'dia' : 'dias'} para +${next.bonus} moedas.` : 'Você zerou os marcos. Lenda!')
      : 'Conclua uma tarefa hoje para manter a sequência.';
    return `
      <section class="streak ${s} ${lit ? 'lit' : ''} enter" aria-label="Sequência de dias">
        <span class="streak-flame">${I.flame}</span>
        <div class="streak-body">
          <b>${mine.cur} ${mine.cur === 1 ? 'dia' : 'dias'} seguidos</b>
          <small>${sub}</small>
          ${next ? `<div class="streak-bar"><i style="width:${pct}%"></i></div>` : ''}
        </div>
        <span class="streak-other ${o}" title="Sequência do ${name(o)} (melhor: ${theirs.best})">${UI.face(o, 18)}<b>${theirs.cur}</b>${I.flame}</span>
      </section>`;
  }

  function renderToday(root){
    view = root; mode = 'today';
    const s = me();
    const g = R.todayGroups(App.tasks, App.comps, s, new Date());
    const total = g.overdue.length + g.today.length + g.done.length;
    const pend = App.tasks.filter(t => R.needsMyValue(t, s));
    const gain = earnedToday();

    root.innerHTML = `
      <section class="hero ${s} enter">
        <div class="hero-face">${UI.face(s, 54)}</div>
        <div class="hero-text">
          <p class="hello">${greeting()}</p>
          <h1>${name(s)}</h1>
          <p class="date">${longDate()}</p>
        </div>
        ${ring(g.done.length, total)}
      </section>

      <section class="duo enter">
        ${walletCard(s, true)}
        ${walletCard(them(), false)}
      </section>
      ${streakCard()}
      ${presenceChip()}
      ${nextAlarmChip()}
      ${gain ? `<p class="gain enter">${UI.coin(s, 16)}<span>Hoje você já ganhou <b>${R.pluralCoins(gain, s)}</b></span></p>` : ''}

      ${pend.length ? `
        <a class="notice enter" href="#tarefas/avaliar">
          <span class="notice-ico">${UI.coin(them(), 26)}</span>
          <span><b>${pend.length} ${pend.length === 1 ? 'tarefa espera' : 'tarefas esperam'} o seu valor</b>
          <small>Defina quanto vale para o ${name(them())} ganhar as moedas.</small></span>
          ${I.chevron}
        </a>` : ''}

      ${group('Atrasadas', g.overdue, 'late')}
      ${group('Para hoje', g.today, '')}
      ${group('Quando der', g.someday, 'soft')}
      ${g.done.length ? `
        <section class="group done">
          <header class="group-head"><h2>Feitas hoje</h2><span class="count">${g.done.length}</span></header>
          <div class="tasks">${g.done.map((t, i) => card(t, i)).join('')}</div>
        </section>` : ''}

      ${!g.overdue.length && !g.today.length && !g.someday.length && !g.done.length ? `
        <div class="empty enter">
          <div class="empty-art ${s}">${UI.face(s, 72)}</div>
          <h3>Nada para hoje</h3>
          <p>Crie a primeira tarefa e comece a juntar ${R.SIDES[s].coin}.</p>
        </div>` : ''}

      <button class="fab ${s}" type="button" data-act="new" aria-label="Nova tarefa">${I.plus}<span>Nova tarefa</span></button>`;
    animateNumbers(root);
  }

  // ---------- TAREFAS ----------
  function tabsHtml(){
    const s = me();
    const pend = App.tasks.filter(t => R.needsMyValue(t, s)).length;
    const tab = (key, label, badge) => `<a href="#tarefas/${key}" class="seg-btn ${filter === key ? 'on' : ''}">${label}${badge ? `<b>${badge}</b>` : ''}</a>`;
    return `<nav class="seg" aria-label="Filtro">
      ${tab('minhas', 'Minhas')}${tab('juntas', 'Juntas')}${tab('outro', 'Do ' + name(them()))}${pend ? tab('avaliar', 'Avaliar', pend) : ''}
    </nav>`;
  }

  function renderList(root, f){
    view = root; mode = 'list';
    const s = me();
    if(f) filter = f;
    if(filter === 'avaliar' && !App.tasks.some(t => R.needsMyValue(t, s))) filter = 'minhas';
    const { active, finished } = R.listFor(App.tasks, App.comps, filter, s, new Date());

    const empties = {
      minhas: ['Nenhuma tarefa sua', 'Toque em “Nova tarefa” para criar a primeira.'],
      juntas: ['Nenhuma tarefa em conjunto', 'Crie uma tarefa compartilhada para fazerem juntos.'],
      outro: [`O ${name(them())} ainda não tem tarefas`, 'Quando ele criar, elas aparecem aqui para você definir o valor.'],
      avaliar: ['Tudo avaliado', 'Não há nada esperando o seu valor.']
    }[filter];

    root.innerHTML = `
      <header class="view-head enter">
        <div><span class="eyebrow">${filter === 'outro' ? 'Do outro lado' : filter === 'avaliar' ? 'Esperando você' : 'Lista'}</span><h1>Tarefas</h1></div>
      </header>
      ${tabsHtml()}
      ${filter === 'outro' || filter === 'avaliar' ? `<p class="hint enter">${I.info}<span>O valor das moedas ${filter === 'avaliar' ? 'dessas tarefas' : 'do ' + name(them())} é você quem define.</span></p>` : ''}
      ${active.length
        ? `<div class="tasks">${active.map((t, i) => card(t, i)).join('')}</div>`
        : `<div class="empty enter"><div class="empty-art ${s}">${UI.face(filter === 'outro' ? them() : s, 64)}</div><h3>${empties[0]}</h3><p>${empties[1]}</p></div>`}
      ${finished.length ? `
        <details class="fold" ${doneOpen ? 'open' : ''}>
          <summary>Concluídas <span class="count">${finished.length}</span></summary>
          <div class="tasks">${finished.map((t, i) => card(t, i)).join('')}</div>
        </details>` : ''}
      <button class="fab ${s}" type="button" data-act="new" aria-label="Nova tarefa">${I.plus}<span>Nova tarefa</span></button>`;
    const fold = root.querySelector('.fold');
    if(fold) fold.addEventListener('toggle', () => { doneOpen = fold.open; });
  }

  function refresh(){
    if(!view) return;
    const y = window.scrollY;
    if(mode === 'today') renderToday(view);
    else if(mode === 'list') renderList(view);
    view.querySelectorAll('.enter').forEach(el => el.classList.add('still'));
    window.scrollTo({ top: y });
  }

  let shown = null;           // saldos que estavam na tela: a contagem parte deles
  function animateNumbers(root){
    root.querySelectorAll('b[data-v]').forEach(b => {
      const side = b.closest('.wallet').classList.contains('gato') ? 'gato' : 'cao';
      const to = Number(b.dataset.v);
      b.dataset.v = String(shown ? shown[side] : to);
      b.textContent = b.dataset.v;
      UI.countTo(b, to);
    });
    shown = { gato: App.wallets.gato, cao: App.wallets.cao };
  }

  // ---------- ações ----------
  async function toggle(t, btn){
    const s = me();
    const st = R.status(t, App.comps, new Date());
    const myDone = t.shared_mode === 'any' ? st.complete : st.done[s];
    const to = !myDone;
    btn.disabled = true;
    btn.classList.toggle('on', to);
    const before = App.wallets[s];
    const seen = new Set(App.log.map(l => l.id));
    try{
      await API.complete(t.id, to);
      await App.reload();
      const gained = App.wallets[s] - before;
      const streakRows = App.log.filter(l => l.kind === 'streak' && l.side === s && !seen.has(l.id));
      const streakGain = streakRows.reduce((n, l) => n + l.amount, 0);
      if(to && gained > 0) UI.coinBurst(view.querySelector(`[data-id="${t.id}"] .check`) || btn, s, gained);
      if(to && gained === 0 && R.relevantTo(t, s) && !R.hasValue(t, s)) UI.toast(`Concluída! As moedas entram quando o ${name(them())} definir o valor.`);
      else if(to && gained === 0 && t.shared_mode === 'both') UI.toast(`Sua parte está feita. As moedas saem quando o ${name(them())} também concluir.`);
      else if(!to && gained < 0) UI.toast(`${R.pluralCoins(-gained, s)} devolvidas.`);
      if(streakRows.length){
        setTimeout(() => {
          UI.toast(`${streakRows[streakRows.length - 1].note}! +${R.pluralCoins(streakGain, s)} de bônus`, 'good');
          UI.coinBurst(document.querySelector('.streak-flame') || document.querySelector('.top-wallets .pill.me'), s, streakGain);
        }, 700);
      }
      App.refreshView();
    }catch(e){
      UI.toast(e.message, 'bad');
      await App.reload().catch(() => {});
      App.refreshView();
    }
  }

  // ---------- detalhe ----------
  function openDetail(t){
    const s = me();
    const st = R.status(t, App.comps, new Date());
    const info = R.dueInfo(t);
    const mode = t.shared_mode ? R.MODES[t.shared_mode] : null;
    const mineT = R.relevantTo(t, s);

    const partRow = side => {
      const v = R.valueOf(t, side);
      const setter = R.other(side);
      return `
        <li class="part ${side}">
          <span class="part-face">${UI.face(side, 30)}</span>
          <span class="part-main"><b>${side === s ? 'Sua parte' : 'Parte do ' + name(side)}</b>
            <small>${st.done[side] ? 'Feita' : (t.shared_mode === 'any' && st.complete ? 'Não precisa' : 'A fazer')}</small></span>
          <span class="part-val">${v == null ? `<span class="reward pending">${I.hourglass}<b>?</b></span>` : `<span class="reward ${side}">${UI.coin(side, 18)}<b>${v}</b></span>`}</span>
          ${setter === s ? `<button class="icon-btn small" type="button" data-detail="value" data-target="${side}" aria-label="Definir valor">${I.edit}</button>` : ''}
        </li>`;
    };

    const m = UI.openModal({
      title: 'Tarefa',
      html: `
        <div class="detail">
          <h3 class="detail-title">${esc(t.title)}</h3>
          <div class="chips">
            ${info.text ? chip(`${info.repeat ? I.repeat : I.clock}<span>${esc(info.text)}</span>`, info.overdue && !st.complete ? 'late' : '') : ''}
            ${mode ? chip(`${I.users}<span>${esc(mode.label)}</span>`, 'shared') : chip(`${UI.face(t.owner, 14)}<span>Só do ${name(t.owner)}</span>`)}
            ${t.hint ? chip(`<span>${R.HINTS[t.hint].label}</span>`) : ''}
          </div>
          ${t.notes ? `<p class="detail-notes">${esc(t.notes)}</p>` : ''}
          ${mode ? `<p class="detail-mode">${esc(mode.text)}</p>` : ''}
          <p class="sub-title">Moedas</p>
          <ul class="parts">${R.partsOf(t).map(partRow).join('')}</ul>
          <p class="detail-foot">Criada por ${esc(name(t.created_by))}. ${t.hint ? `Sugestão de dificuldade: <b>${R.HINTS[t.hint].label.toLowerCase()}</b>.` : ''}</p>
          ${mineT ? `
          <div class="sheet-actions">
            <button class="btn danger ghost" type="button" data-detail="delete">${I.trash}<span>Apagar</span></button>
            <button class="btn primary" type="button" data-detail="edit">${I.edit}<span>Editar</span></button>
          </div>` : ''}
        </div>`
    });
    m.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-detail]');
      if(!b) return;
      const act = b.dataset.detail;
      if(act === 'edit'){ m.close(); openForm(t); }
      else if(act === 'value'){ m.close(); openValue(t, b.dataset.target); }
      else if(act === 'delete'){
        const ok = await UI.confirmBox({ title: 'Apagar tarefa', html: `Apagar <b>${esc(t.title)}</b>? As moedas já ganhas continuam no extrato.`, yesLabel: 'Apagar', danger: true });
        if(!ok) return;
        try{ await API.deleteTask(t.id); m.close(); await App.reload(); App.refreshView(); UI.toast('Tarefa apagada'); }
        catch(err){ UI.toast(err.message, 'bad'); }
      }
    });
  }

  // ---------- valor ----------
  function openValue(t, target){
    const hint = t.hint ? R.HINTS[t.hint] : null;
    let v = R.hasValue(t, target) ? R.valueOf(t, target) : (hint ? hint.suggest : 3);
    const quick = [1, 2, 3, 5, 8, 10, 15, 20];
    const m = UI.openModal({
      title: `Valor para ${name(target)}`,
      html: `
        <form class="value-form" data-form autocomplete="off">
          <p class="value-task">${esc(t.title)}</p>
          ${hint ? `<p class="hint-line">${esc(name(t.created_by))} marcou como <b>${hint.label.toLowerCase()}</b> (sugestão: ${hint.suggest}).</p>` : ''}
          <div class="stepper ${target}">
            <button class="icon-btn big" type="button" data-step="-1" aria-label="Menos">${I.minus}</button>
            <div class="stepper-n">${UI.coin(target, 34)}<input name="v" type="number" inputmode="numeric" min="0" max="${R.VALUE_MAX}" value="${v}" aria-label="Moedas"></div>
            <button class="icon-btn big" type="button" data-step="1" aria-label="Mais">${I.plus}</button>
          </div>
          <p class="stepper-label">${R.SIDES[target].coin}</p>
          <div class="quick">${quick.map(n => `<button class="qbtn" type="button" data-q="${n}">${n}</button>`).join('')}</div>
          <div class="sheet-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">Definir valor</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const input = form.elements.v;
    const set = n => { input.value = Math.max(0, Math.min(R.VALUE_MAX, Math.round(Number(n) || 0))); paint(); };
    const paint = () => form.querySelectorAll('.qbtn').forEach(b => b.classList.toggle('on', b.dataset.q === String(input.value)));
    paint();
    form.addEventListener('click', e => {
      const st = e.target.closest('[data-step]'); if(st) set(Number(input.value) + Number(st.dataset.step));
      const q = e.target.closest('[data-q]'); if(q) set(q.dataset.q);
    });
    input.addEventListener('input', paint);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          await API.setValue(t.id, target, Math.max(0, Math.min(R.VALUE_MAX, Math.round(Number(input.value) || 0))));
          m.close();
          await App.reload();
          App.refreshView();
          UI.toast(`Valor definido: ${R.pluralCoins(Number(input.value), target)}`, 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- formulário ----------
  function openForm(t){
    const s = me();
    const isNew = !t;
    const d = t || { title:'', notes:'', owner:s, shared_mode:'parts', repeat:'none', repeat_days:[], due_at:null, due_time:null, hint:null };
    // o prazo vale, por padrão, no relógio de quem faz a tarefa (compartilhada: de quem criou); dá para trocar
    const doer = t ? R.taskSide(t) : s;
    const dueAllDay = d.due_at ? R.allDaySide(d.due_at) : null;
    const dueDay = !d.due_at ? '' : dueAllDay ? R.dueParts(d).day : (w => `${w.year}-${w.month}-${w.day}`)(R.wall(d.due_at, R.TZS[doer]));
    const dueHm = d.due_at && !dueAllDay ? R.timeOf(d.due_at, doer) : '';
    const tzOpt = k => `<option value="${k}" ${k === doer ? 'selected' : ''}>Hora de ${R.TZ_NAMES[k]}</option>`;
    const when = d.repeat !== 'none' ? 'repeat' : d.due_at ? 'date' : 'none';
    const days = new Set(d.repeat_days || []);

    const m = UI.openModal({
      title: isNew ? 'Nova tarefa' : 'Editar tarefa',
      html: `
        <form class="form" data-form autocomplete="off">
          <label class="field"><span>O que precisa ser feito?</span>
            <input name="title" required maxlength="120" value="${esc(d.title)}" placeholder="Ex.: Lavar a louça" autofocus></label>
          <label class="field"><span>Anotação <small>(opcional)</small></span>
            <textarea name="notes" rows="2" maxlength="1000" placeholder="Detalhes, onde, como…">${esc(d.notes)}</textarea></label>

          ${isNew ? `
          <fieldset class="field"><legend>De quem é?</legend>
            <div class="choice two">
              <label class="opt ${s}"><input type="radio" name="kind" value="mine" checked><span>${UI.face(s, 22)}<b>Só minha</b></span></label>
              <label class="opt both"><input type="radio" name="kind" value="shared"><span>${I.users}<b>Compartilhada</b></span></label>
            </div>
          </fieldset>
          <fieldset class="field" data-shared hidden><legend>Como funciona?</legend>
            <div class="choice col">
              ${Object.values(R.MODES).map((md, i) => `
                <label class="opt wide"><input type="radio" name="mode" value="${md.key}" ${i === 0 ? 'checked' : ''}>
                  <span><b>${esc(md.label)}</b><small>${esc(md.text)}</small></span></label>`).join('')}
            </div>
          </fieldset>` : ''}

          <fieldset class="field"><legend>Quando?</legend>
            <div class="choice three">
              <label class="opt"><input type="radio" name="when" value="none" ${when === 'none' ? 'checked' : ''}><span>${I.sparkle}<b>Sem prazo</b></span></label>
              <label class="opt"><input type="radio" name="when" value="date" ${when === 'date' ? 'checked' : ''}><span>${I.clock}<b>Data</b></span></label>
              <label class="opt"><input type="radio" name="when" value="repeat" ${when === 'repeat' ? 'checked' : ''}><span>${I.repeat}<b>Repetir</b></span></label>
            </div>
            <div class="when-panel" data-when="date" hidden>
              <div class="row2">
                <input type="date" name="day" value="${dueDay}" aria-label="Dia">
                <input type="time" name="hm" value="${dueHm}" aria-label="Hora (opcional)">
              </div>
              <div class="tz-row" data-tzrow hidden>
                <select name="tz" class="select" aria-label="Relógio do prazo">${tzOpt(s)}${tzOpt(them())}</select>
                <small class="fine" data-tzhint></small>
              </div>
              <div class="quick-days">
                <button type="button" class="qbtn" data-day="0">Hoje</button>
                <button type="button" class="qbtn" data-day="1">Amanhã</button>
                <button type="button" class="qbtn" data-day="7">Em 1 semana</button>
              </div>
            </div>
            <div class="when-panel" data-when="repeat" hidden>
              <div class="choice two">
                <label class="opt"><input type="radio" name="rep" value="daily" ${d.repeat !== 'weekly' ? 'checked' : ''}><span><b>Todo dia</b></span></label>
                <label class="opt"><input type="radio" name="rep" value="weekly" ${d.repeat === 'weekly' ? 'checked' : ''}><span><b>Dias da semana</b></span></label>
              </div>
              <div class="weekdays" data-weekdays hidden>
                ${R.WEEKDAYS.map((w, i) => `<button type="button" class="wd ${days.has(i) ? 'on' : ''}" data-wd="${i}" aria-pressed="${days.has(i)}">${w}</button>`).join('')}
              </div>
              <label class="field inline"><span>Hora <small>(opcional)</small></span><input type="time" name="rtime" value="${d.due_time ? d.due_time.slice(0, 5) : ''}"></label>
              <small class="fine">Vale no relógio de quem faz: Portugal para o Cão, Brasília para o Gato.</small>
            </div>
          </fieldset>

          <fieldset class="field"><legend>Quão difícil? <small>(ajuda o ${name(them())} a dar o valor)</small></legend>
            <div class="choice three">
              ${Object.values(R.HINTS).map(h => `
                <label class="opt"><input type="radio" name="hint" value="${h.key}" ${d.hint === h.key ? 'checked' : ''}><span><b>${h.label}</b></span></label>`).join('')}
            </div>
          </fieldset>

          <div class="sheet-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">${isNew ? 'Criar tarefa' : 'Salvar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const radio = n => (form.querySelector(`input[name="${n}"]:checked`) || {}).value;

    function paint(){
      const w = radio('when');
      form.querySelectorAll('[data-when]').forEach(p => { p.hidden = p.dataset.when !== w; });
      const wk = form.querySelector('[data-weekdays]');
      wk.hidden = !(w === 'repeat' && radio('rep') === 'weekly');
      const sh = form.querySelector('[data-shared]');
      if(sh) sh.hidden = radio('kind') !== 'shared';
      paintTz();
    }
    // com hora digitada, mostra a mesma hora no relógio do outro lugar
    function paintTz(){
      const row = form.querySelector('[data-tzrow]');
      const hint = form.querySelector('[data-tzhint]');
      const hm = form.elements.hm.value, day = form.elements.day.value;
      row.hidden = !(radio('when') === 'date' && hm);
      if(row.hidden) return;
      const k = form.elements.tz.value, o = R.other(k);
      if(!day){ hint.textContent = ''; return; }
      const at = R.zonedToISO(day, hm, R.TZS[k]);
      const w = R.wall(at, R.TZS[o]);
      const oDay = `${w.year}-${w.month}-${w.day}`;
      const shift = oDay === day ? '' : oDay > day ? ' (dia seguinte)' : ' (dia anterior)';
      hint.textContent = `= ${R.timeOf(at, o)}${shift} em ${R.TZ_NAMES[o]}`;
    }
    paint();
    form.addEventListener('change', paint);
    form.addEventListener('input', e => { if(e.target.name === 'hm' || e.target.name === 'day') paintTz(); });
    form.addEventListener('click', e => {
      const wd = e.target.closest('[data-wd]');
      if(wd){
        const n = Number(wd.dataset.wd);
        if(days.has(n)) days.delete(n); else days.add(n);
        wd.classList.toggle('on', days.has(n));
        wd.setAttribute('aria-pressed', days.has(n) ? 'true' : 'false');
      }
      const q = e.target.closest('[data-day]');
      if(q){ form.elements.day.value = R.addDays(today(), Number(q.dataset.day)); paintTz(); }
      // clicar de novo na dificuldade marcada a desmarca
    });
    form.querySelectorAll('input[name=hint]').forEach(r => {
      r.addEventListener('click', () => { if(r.dataset.was === '1'){ r.checked = false; r.dataset.was = '0'; } else { form.querySelectorAll('input[name=hint]').forEach(x => { x.dataset.was = '0'; }); r.dataset.was = '1'; } });
      if(r.checked) r.dataset.was = '1';
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = form.elements.title.value.trim();
      if(!title){ UI.toast('Dê um nome à tarefa', 'bad'); return; }
      const w = radio('when');
      const data = { title, notes: form.elements.notes.value.trim(), hint: radio('hint') || null, repeat: 'none', repeat_days: [] };
      if(isNew){
        data.owner = radio('kind') === 'shared' ? 'ambos' : s;
        if(data.owner === 'ambos') data.shared_mode = radio('mode') || 'parts';
      }
      if(w === 'date'){
        const day = form.elements.day.value;
        if(!day){ UI.toast('Escolha o dia', 'bad'); return; }
        const hm = form.elements.hm.value;
        // com hora: no relógio escolhido; só com data ("o dia todo"): 23:59 no relógio de quem faz
        data.due_at = hm ? R.zonedToISO(day, hm, R.TZS[form.elements.tz.value]) : R.zonedToISO(day, R.END_OF_DAY, R.TZS[doer]);
      }else if(w === 'repeat'){
        data.repeat = radio('rep') || 'daily';
        if(data.repeat === 'weekly'){
          if(!days.size){ UI.toast('Escolha pelo menos um dia da semana', 'bad'); return; }
          data.repeat_days = [...days].sort((a, b) => a - b);
        }
        data.due_time = form.elements.rtime.value || null;
      }
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          const row = await API.saveTask(t ? t.id : null, data);
          m.close(true);
          await App.reload();
          App.refreshView();
          UI.toast(isNew ? 'Tarefa criada' : 'Tarefa salva', 'good');
          // tarefa nova do outro lado precisa de valor? avisa quem vai definir
          if(isNew && row) UI.toast(`O ${name(them())} vai definir quanto ela vale.`);
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- eventos ----------
  function init(root){
    root.addEventListener('click', e => {
      if(App.current !== 'hoje' && App.current !== 'tarefas') return;
      const taskEl = e.target.closest('.task');
      const act = e.target.closest('[data-act]');
      if(!act) return;
      const a = act.dataset.act;
      if(a === 'new'){ openForm(null); return; }
      if(!taskEl) return;
      const t = App.tasks.find(x => x.id === taskEl.dataset.id);
      if(!t) return;
      if(a === 'toggle'){ e.stopPropagation(); toggle(t, act); }
      else if(a === 'value'){ e.stopPropagation(); openValue(t, act.dataset.target); }
      else if(a === 'open') openDetail(t);
    });
    root.addEventListener('keydown', e => {
      if((e.key === 'Enter' || e.key === ' ') && e.target.matches('.task-main')){
        e.preventDefault();
        const t = App.tasks.find(x => x.id === e.target.closest('.task').dataset.id);
        if(t) openDetail(t);
      }
    });
  }

  return { init, renderToday, renderList, refresh, openForm, openValue };
})();
