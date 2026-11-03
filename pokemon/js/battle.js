/* ============================================================
   POKÉMON — combate (controle do mestre, sem tabuleiro)

   O mestre conduz; o jogador assiste ao vivo. O estado do combate (lados, ordem
   da rodada, PA, log) fica num jsonb em pkm_battles; o HP continua nas criaturas.

   Regras do guia: 5 PA por turno; ordem por Velocidade (empate: cara ou coroa);
   acerto d20 + Precisão contra d20 + Evasão (empate favorece quem ataca);
   dano pela fórmula do guia com o multiplicador de tipo; PA que sobram curam
   4% da HP máxima cada (até 20%); nocaute = substituição imediata; troca voluntária
   custa os 5 PA de quem sai; quem fica sem criaturas perde; criaturas vencedoras que
   participaram recebem o XP inteiro (soma dos níveis das derrotadas).
   ============================================================ */
window.Battle = (function(){
  'use strict';

  const R = PKM_RULES;
  const esc = UI.esc;
  const I = UI.icons;

  let view = null;
  let viewId = null;        // combate aberto por #combate/<id>
  let working = false;      // uma ação do mestre em andamento
  let sel = null;           // peça selecionada no tabuleiro (o mestre pode ajustar qualquer uma)
  let boardScroll = { x: 0, y: 0, key: '' };   // rolagem do tabuleiro (celular) e de quem já foi centralizado

  // ---------- acesso rápido ----------
  const cr = id => App.creatures.find(c => c.id === id) || null;
  const spOf = c => c && App.species.find(s => s.id === c.species_id);
  const tech = id => App.techniques.find(t => t.id === id);
  const d20 = () => 1 + Math.floor(Math.random() * 20);
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0;
  const hpClass = (cur, max) => { const r = max ? cur / max : 0; return r > 0.5 ? 'ok' : r > 0.2 ? 'mid' : 'low'; };

  const nm = id => { const c = cr(id); return c ? Creatures.nameOf(c) : 'criatura apagada'; };
  const statsOf = id => { const c = cr(id), s = spOf(c); return c && s ? R.creatureStats(s, c) : null; };
  const maxHpOf = id => { const c = cr(id), s = spOf(c); return c && s ? R.creatureMaxHp(s, c) : 0; };
  const hpOf = id => { const c = cr(id), s = spOf(c); return c && s ? R.creatureHp(s, c) : 0; };
  const speedOf = id => { const s = statsOf(id); return s ? s.velocidade : 0; };
  const sideOf = (st, id) => st.sides.findIndex(s => s.roster.includes(id));
  const allActive = st => st.sides.reduce((a, s) => a.concat(s.active), []);
  const rowOf = id => App.battles.find(b => b.id === id) || null;

  function activeBattle(){
    return App.battles.filter(b => b.status === 'active')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
  }

  // ---------- estado: operações puras sobre o objeto do combate ----------
  function log(st, text){
    st.log.push({ r: st.round, t: text });
    if(st.log.length > 300) st.log = st.log.slice(-300);
  }

  function startRound(st){
    st.round++;
    st.queue = R.initiativeOrder(allActive(st).filter(cr).map(id => ({ id, speed: speedOf(id) })));
    st.pa = R.PA_PER_TURN;
    log(st, `Rodada ${st.round} — ordem: ${st.queue.map(nm).join(' › ') || '—'}`);
  }

  // ---------- tabuleiro: as peças ficam em state.board.pos = { idDaCriatura: [x, y] } ----------
  function spawnCell(st, si, idx, n){
    const b = st.board;
    const x = si === 0 ? Math.min(1, b.cols - 1) : Math.max(b.cols - 2, 0);
    const y = Math.min(b.rows - 1, Math.max(0, Math.round((idx + 1) * b.rows / (n + 1)) - 1));
    return [x, y];
  }
  const cellFree = (st, x, y, exceptId) =>
    !Object.keys(st.board.pos).some(id => id !== exceptId && st.board.pos[id][0] === x && st.board.pos[id][1] === y);

  /** Casa livre mais próxima de (x, y), procurando em anéis cada vez maiores. */
  function placeNear(st, id, x, y){
    const b = st.board;
    const max = Math.max(b.cols, b.rows);
    for(let r = 0; r <= max; r++){
      for(let dy = -r; dy <= r; dy++){
        for(let dx = -r; dx <= r; dx++){
          if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if(nx < 0 || ny < 0 || nx >= b.cols || ny >= b.rows) continue;
          if(cellFree(st, nx, ny, id)){ b.pos[id] = [nx, ny]; return; }
        }
      }
    }
  }

  /** Quem entra em campo ocupa o lugar de quem saiu (ou da última vaga aberta do lado). */
  function enterBoard(st, si, id, replacedId){
    if(!st.board) return;
    let at = replacedId && st.board.pos[replacedId];
    if(replacedId) delete st.board.pos[replacedId];
    at = at || st.board.vacated[si].shift() || spawnCell(st, si, st.sides[si].active.length - 1, Math.max(1, st.perSide));
    placeNear(st, id, at[0], at[1]);
  }

  const posOf = (st, id) => (st.board && st.board.pos[id]) || null;
  const distBetween = (st, a, b) => (posOf(st, a) && posOf(st, b)) ? R.gridDistance(posOf(st, a), posOf(st, b)) : null;

  function newState(sidesDef, perSide, boardCfg){
    const st = {
      v: 1, round: 0, perSide,
      sides: sidesDef.map(s => ({ name: s.name, trainerId: s.trainerId, roster: s.roster.slice(), active: s.roster.slice(0, perSide) })),
      participated: [], defeated: [], queue: [], pa: R.PA_PER_TURN, pending: [], winner: null, xpGiven: false, log: []
    };
    st.sides.forEach(s => s.active.forEach(id => st.participated.push(id)));
    if(boardCfg){
      st.board = { cols: boardCfg.cols, rows: boardCfg.rows, bg: boardCfg.bg || null, pos: {}, vacated: [[], []] };
      st.sides.forEach((s, si) => s.active.forEach((id, i) => { st.board.pos[id] = spawnCell(st, si, i, s.active.length); }));
    }
    log(st, `Combate: ${st.sides[0].name} × ${st.sides[1].name}`);
    startRound(st);
    return st;
  }

  /** Quem entra age na mesma rodada se a vez dele ainda não passou (Velocidade menor ou igual à de quem age agora). */
  function insertIntoQueue(st, id, refSpeed, from){
    const sp = speedOf(id);
    if(sp > refSpeed) return;
    let i = from;
    while(i < st.queue.length && speedOf(st.queue[i]) >= sp) i++;
    st.queue.splice(i, 0, id);
  }

  /** Depois de tirar alguém de campo: decide vitória ou pede substituição. */
  function afterRemoval(st, si){
    const side = st.sides[si];
    const alive = side.roster.filter(id => cr(id) && hpOf(id) > 0);
    if(!alive.length){
      st.winner = 1 - si;
      st.pending = [];
      log(st, `${side.name} ficou sem criaturas — ${st.sides[st.winner].name} vence!`);
      return;
    }
    const bench = alive.filter(id => !side.active.includes(id));
    const need = Math.min(st.perSide - side.active.length, bench.length);
    if(need > 0) st.pending.push({ side: si, need });
  }

  function faint(st, id){
    const si = sideOf(st, id);
    if(si < 0) return;
    const side = st.sides[si];
    side.active = side.active.filter(x => x !== id);
    st.queue = st.queue.filter(x => x !== id);
    if(st.board && st.board.pos[id]){ st.board.vacated[si].push(st.board.pos[id]); delete st.board.pos[id]; }
    st.defeated.push({ id, level: (cr(id) || {}).level || 1, side: si });
    log(st, `${nm(id)} ficou fora de combate!`);
    afterRemoval(st, si);
  }

  /** Passa a vez: cura dos PA que sobraram (se pedido) e chama o próximo. */
  async function endTurn(st, withHeal){
    const id = st.queue[0];
    if(id && withHeal && cr(id) && hpOf(id) > 0){
      const heal = Math.min(R.paHeal(st.pa, maxHpOf(id)), maxHpOf(id) - hpOf(id));
      if(heal > 0){
        await setHp(id, hpOf(id) + heal);
        log(st, `${nm(id)} guardou ${st.pa} PA e curou ${heal} HP`);
      }
    }
    st.queue.shift();
    nextActor(st);
  }

  function nextActor(st){
    st.queue = st.queue.filter(id => allActive(st).includes(id) && cr(id));
    if(!st.queue.length) startRound(st);
    st.pa = R.PA_PER_TURN;
  }

  /** Depois de qualquer ação: vitória, substituição pendente ou fim de turno automático. */
  async function settle(st){
    if(st.winner != null) return;
    if(st.pending.length) return;
    if(st.pa <= 0) await endTurn(st, false);
  }

  async function setHp(id, hp){
    const max = maxHpOf(id);
    const v = Math.max(0, Math.min(max, hp));
    const row = await API.creatureHp(id, v >= max ? null : v);
    const i = App.creatures.findIndex(c => c.id === row.id);
    if(i >= 0) App.creatures[i] = row;
  }

  /** Quantos blocos a criatura anda por ação de movimento (regra do guia). */
  const moveLimit = id => R.movementPerAction((statsOf(id) || {}).velocidade);

  function doMove(st, id, x, y){
    const from = posOf(st, id);
    const d = from ? R.gridDistance(from, [x, y]) : 0;
    st.pa -= 1;
    st.board.pos[id] = [x, y];
    log(st, `${nm(id)} se moveu ${d} ${d === 1 ? 'bloco' : 'blocos'}`);
    return settle(st);
  }

  // ---------- ataque ----------
  /** Resolve (sem aplicar) um ataque com os dados já definidos. */
  function resolveAttack(aId, t, tId, dA, dD){
    const A = statsOf(aId), D = statsOf(tId), spT = spOf(cr(tId));
    const cat = R.CATEGORIES.find(c => c.key === t.category) || R.CATEGORIES[0];
    const mult = R.typeMultiplier(t.type, spT.types);
    const hit = R.hitTest(A.precisao, D.evasao, dA, dD);
    const dmg = R.techniqueDamage(t.power, A[cat.atk], D[cat.def], mult);
    return { hit, dmg, mult, cat, atk: A[cat.atk], def: D[cat.def] };
  }

  async function doAttack(st, t, tId, dA, dD){
    const aId = st.queue[0];
    const r = resolveAttack(aId, t, tId, dA, dD);
    st.pa -= t.pa_cost;
    if(!r.hit.hit){
      log(st, `${nm(aId)} usou ${t.name} em ${nm(tId)} e errou (${r.hit.atk} contra ${r.hit.def})`);
    }else{
      const before = hpOf(tId);
      await setHp(tId, before - r.dmg.damage);
      const eff = r.mult === 0 ? ' — não afeta' : r.mult > 1 ? ' — super efetivo!' : r.mult < 1 ? ' — pouco efetivo' : '';
      log(st, `${nm(aId)} usou ${t.name} em ${nm(tId)}: ${r.dmg.damage} de dano${eff} (${r.hit.atk} contra ${r.hit.def})`);
      if(hpOf(tId) <= 0) faint(st, tId);
    }
    await settle(st);
  }

  // ---------- executar uma ação do mestre ----------
  async function act(fn, forceStatus){
    if(working) return;
    const row = currentRow();
    if(!row) return;
    working = true;
    const st = JSON.parse(JSON.stringify(row.state));
    try{
      await fn(st);
      const status = forceStatus || (st.winner != null ? 'ended' : row.status);
      const saved = await API.saveBattle(row.id, status, st);
      const i = App.battles.findIndex(b => b.id === saved.id);
      if(i >= 0) App.battles[i] = saved; else App.battles.push(saved);
    }catch(e){
      UI.toast(e.message, 'bad');
      try{ await App.reloadAll(); }catch(_){ /* sem rede */ }
    }finally{
      working = false;
      draw();
      if(App.isMaster) App.refreshTrainers();
    }
  }

  /** Último combate com vencedor que o mestre ainda não concluiu (fica na tela até dar o XP e clicar em Concluir). */
  function lastResult(){
    return App.battles.filter(b => b.status === 'ended' && b.state.winner != null && !b.state.closed)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
  }
  const currentRow = () => viewId ? rowOf(viewId) : (activeBattle() || lastResult());

  // ---------- tela ----------
  function render(root, id){
    view = root;
    viewId = id || null;
    draw();
  }

  function fighter(st, id, now){
    const c = cr(id), sp = spOf(c);
    if(!c || !sp) return '<div class="fighter out"><div class="f-body"><strong>criatura apagada</strong></div></div>';
    const max = R.creatureMaxHp(sp, c), cur = R.creatureHp(sp, c);
    return `
      <a class="fighter ${now ? 'now' : ''} ${cur === 0 ? 'out' : ''}" href="#criatura/${c.id}">
        ${Creatures.avatarOf(c, 58)}
        <div class="f-body">
          <strong>${esc(Creatures.nameOf(c))}</strong>
          <span class="chips"><span class="chip lv">Nv ${c.level}</span>${sp.types.map(t => Creatures.typeChip(t)).join('')}</span>
          <div class="mini-hp"><span class="tag">HP</span><div class="bar"><div class="bar-fill ${hpClass(cur, max)}" style="width:${pct(cur, max).toFixed(1)}%"></div></div><span class="num">${cur}/${max}</span></div>
        </div>
        ${now ? '<span class="turn-flag">vez</span>' : ''}
      </a>`;
  }

  function sidePanel(st, si){
    const side = st.sides[si];
    const bench = side.roster.filter(id => !side.active.includes(id));
    const cur = st.queue[0];
    return `
      <section class="card side ${st.winner === si ? 'won' : ''}">
        <div class="card-head"><h3>${esc(side.name)}</h3>${st.winner === si ? '<span class="pts has">venceu</span>' : ''}</div>
        <div class="fighters">
          ${side.active.length ? side.active.map(id => fighter(st, id, st.winner == null && cur === id)).join('') : '<p class="hint" style="margin:0">Ninguém em campo.</p>'}
        </div>
        ${bench.length ? `
          <div class="bench"><span class="chart-title">Banco</span>
            ${bench.map(id => {
              const out = !cr(id) || hpOf(id) === 0;
              return `<span class="bench-chip ${out ? 'out' : ''}">${esc(nm(id))}${cr(id) ? ` · Nv ${cr(id).level}` : ''}${out ? ' · fora' : ` · ${hpOf(id)}/${maxHpOf(id)}`}</span>`;
            }).join('')}
          </div>` : ''}
      </section>`;
  }

  function paBig(n){
    return `<span class="pa big" aria-label="${n} de ${R.PA_PER_TURN} PA">${Array.from({ length: R.PA_PER_TURN }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function actionPanel(st){
    const id = st.queue[0];
    const c = cr(id);
    if(!c) return '';
    const known = Techniques.knownBy(id);
    const heal = Math.min(R.paHeal(st.pa, maxHpOf(id)), maxHpOf(id) - hpOf(id));
    const canSwap = st.pa === R.PA_PER_TURN && st.sides[sideOf(st, id)].roster.some(x => !allActive(st).includes(x) && cr(x) && hpOf(x) > 0);
    const mv = R.movementPerAction((statsOf(id) || {}).velocidade);
    return `
      <section class="card actions">
        <div class="act-head"><div>Vez de <strong>${esc(nm(id))}</strong><small> · ${esc(st.sides[sideOf(st, id)].name)}</small></div>${paBig(st.pa)}</div>
        ${known.length ? `
          <div class="tech-btns">
            ${known.map(t => `
              <button class="tech-btn" type="button" data-act="b-tech" data-id="${t.id}" ${st.pa < t.pa_cost ? 'disabled' : ''}>
                ${Creatures.typeChip(t.type)}
                <strong>${esc(t.name)}</strong>
                <small>${Techniques.catLabel(t.category)} · Poder ${t.power} · alcance ${t.reach || 1}</small>
                ${Techniques.paDots(t.pa_cost)}
              </button>`).join('')}
          </div>`
        : '<p class="hint" style="margin:0 0 10px">Essa criatura não sabe técnicas. Escolha no perfil dela (aba Criaturas).</p>'}
        <div class="act-row">
          ${st.board ? '' : `<button class="btn" type="button" data-act="b-move" ${st.pa < 1 ? 'disabled' : ''} title="Gasta 1 PA; até ${mv} blocos por ação">Mover · 1 PA</button>`}
          <button class="btn" type="button" data-act="b-swap" ${canSwap ? '' : 'disabled'} title="Gasta os 5 PA de quem sai">Trocar · 5 PA</button>
          <button class="btn good" type="button" data-act="b-end">Encerrar turno${heal > 0 ? ` · +${heal} HP` : ''}</button>
        </div>
      </section>`;
  }

  function pendingPanel(st){
    const p = st.pending[0];
    const side = st.sides[p.side];
    const bench = side.roster.filter(id => !side.active.includes(id) && cr(id) && hpOf(id) > 0);
    return `
      <section class="card actions alert">
        <div class="act-head"><div>Substituição de <strong>${esc(side.name)}</strong></div><span class="pts over">${p.need === 1 ? 'entra 1' : 'entram ' + p.need}</span></div>
        <p class="hint" style="margin:0 0 10px">Quem entra recebe os próprios 5 PA e age na mesma rodada, quando chegar a vez dele.</p>
        <div class="sub-list">
          ${bench.map(id => `<button class="btn" type="button" data-act="b-sub" data-side="${p.side}" data-id="${id}">${esc(nm(id))} · Nv ${cr(id).level} · ${hpOf(id)}/${maxHpOf(id)}</button>`).join('')}
        </div>
      </section>`;
  }

  function resultPanel(st, row){
    const win = st.winner != null ? st.sides[st.winner] : null;
    const losing = st.winner != null ? 1 - st.winner : null;
    const defeatedLevels = st.defeated.filter(d => d.side === losing).map(d => d.level);
    const total = R.battleXp(defeatedLevels);
    const winners = win ? st.participated.filter(id => win.roster.includes(id) && cr(id)) : [];
    return `
      <section class="card result">
        <div class="card-head"><h3>${win ? `${esc(win.name)} venceu` : 'Combate encerrado'}</h3><span class="pts">rodada ${st.round}</span></div>
        ${App.isMaster && win && !st.xpGiven ? `
          <p class="hint" style="margin:0 0 10px">Cada criatura derrotada vale o próprio nível (${defeatedLevels.join(' + ') || '0'}). Quem participou recebe o total inteiro, e o treinador ganha metade.</p>
          <div class="xp-row"><label for="bXp">XP para cada uma</label><input id="bXp" type="number" inputmode="numeric" min="0" step="1" value="${total}"></div>
          <div class="pick-list">
            ${winners.map(id => `<label class="pick-row"><input type="checkbox" value="${id}" checked><span class="tech-name"><strong>${esc(nm(id))}</strong><small>Nv ${cr(id).level}${hpOf(id) === 0 ? ' · fora de combate' : ''}</small></span></label>`).join('')}
          </div>
          <div class="act-row"><button class="btn primary" type="button" data-act="b-xp">Dar XP</button></div>` : ''}
        ${App.isMaster && row.status === 'ended' ? `
          <div class="act-row">
            <button class="btn" type="button" data-act="b-heal">Curar todos os participantes</button>
            ${st.closed ? '' : '<button class="btn primary" type="button" data-act="b-close">Concluir</button>'}
          </div>` : ''}
        ${st.xpGiven ? '<p class="hint" style="margin:8px 0 0">XP já distribuído.</p>' : ''}
      </section>`;
  }

  function logPanel(st){
    const lines = st.log.slice().reverse();
    return `
      <section class="card logcard">
        <div class="card-head"><h3>Registro</h3></div>
        <ol class="log">${lines.map(l => `<li><span>R${l.r}</span>${esc(l.t)}</li>`).join('')}</ol>
      </section>`;
  }

  function historyRow(b){
    const s = b.state;
    const date = new Date(b.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const res = b.status === 'active' ? 'em andamento' : s.winner != null ? `${s.sides[s.winner].name} venceu` : 'encerrado';
    return `
      <a class="hist-row" href="#combate/${b.id}">
        <span class="hist-main"><strong>${esc(s.sides[0].name)} × ${esc(s.sides[1].name)}</strong><small>${date} · rodada ${s.round} · ${res}</small></span>
        <span class="chip ${b.status === 'active' ? 'lv' : ''}">${b.status === 'active' ? 'ao vivo' : 'fim'}</span>
      </a>`;
  }

  // ---------- tabuleiro: desenho ----------
  const isPlayerOwned = id => { const c = cr(id), t = c && c.trainer_id && App.trainers.find(x => x.id === c.trainer_id); return !!t && t.kind === 'player'; };

  /** Quem pode mover a peça de quem está agindo agora. */
  function canMoveActor(st, live){
    if(!live || st.winner != null || st.pending.length || st.pa < 1 || !st.queue.length) return false;
    return App.isMaster || isPlayerOwned(st.queue[0]);
  }

  function boardHtml(st, live){
    const b = st.board;
    const actor = st.winner == null ? st.queue[0] : null;
    if(!sel || !b.pos[sel] || !App.isMaster) sel = actor;
    const can = canMoveActor(st, live);
    const ids = Object.keys(b.pos).filter(cr);
    let reach = '';
    if(can && sel && sel === actor && b.pos[sel]){
      const n = moveLimit(sel), [x, y] = b.pos[sel];
      const x0 = Math.max(0, x - n), x1 = Math.min(b.cols - 1, x + n), y0 = Math.max(0, y - n), y1 = Math.min(b.rows - 1, y + n);
      reach = `<div class="reach" style="left:${x0 / b.cols * 100}%;top:${y0 / b.rows * 100}%;width:${(x1 - x0 + 1) / b.cols * 100}%;height:${(y1 - y0 + 1) / b.rows * 100}%"></div>`;
    }
    const pieces = ids.map(id => {
      const c = cr(id), sp = spOf(c), [x, y] = b.pos[id];
      const si = sideOf(st, id);
      const max = R.creatureMaxHp(sp, c), cur = R.creatureHp(sp, c);
      const photo = Creatures.photoOf(c);
      return `
        <div class="piece side${si} ${id === actor ? 'now' : ''} ${id === sel ? 'sel' : ''}" data-piece="${id}"
             style="left:${(x + 0.5) / b.cols * 100}%;top:${(y + 0.5) / b.rows * 100}%;width:${100 / b.cols}%" title="${esc(nm(id))} · ${cur}/${max} HP">
          <div class="piece-face">${photo ? `<img src="${esc(photo)}" alt="" draggable="false">` : '<span class="piece-ball"></span>'}</div>
          <div class="piece-hp"><i class="${hpClass(cur, max)}" style="width:${pct(cur, max).toFixed(0)}%"></i></div>
        </div>`;
    }).join('');
    const hint = !live ? '' : can
      ? (sel === actor
          ? `Toque numa casa para mover ${esc(nm(actor))} (1 PA, até ${moveLimit(actor)} blocos).${App.isMaster ? ' Toque em outra peça para ajustá-la sem gastar PA.' : ''}`
          : `Toque numa casa para ajustar ${esc(nm(sel))} (sem gastar PA). Toque na peça de quem está agindo para voltar.`)
      : '';
    return `
      <section class="card board-card">
        <div class="card-head"><h3>Tabuleiro</h3><span class="pts">${b.cols}×${b.rows}</span></div>
        <div class="board-scroll">
          <div class="board" data-board style="--cols:${b.cols};--rows:${b.rows};aspect-ratio:${b.cols} / ${b.rows};width:max(100%, ${b.cols * 30}px);max-width:${b.cols * 56}px${b.bg ? `;background-image:url('${esc(b.bg)}')` : ''}">
            <div class="board-grid"></div>
            ${reach}
            ${pieces}
          </div>
        </div>
        ${hint ? `<p class="hint">${hint}</p>` : ''}
      </section>`;
  }

  /** Clique numa casa do tabuleiro. */
  async function boardClick(e){
    const board = e.target.closest('[data-board]');
    if(!board) return;
    const row = currentRow();
    if(!row || row.status !== 'active' || working) return;
    const st = row.state;
    if(!st.board) return;
    const piece = e.target.closest('[data-piece]');
    if(piece && App.isMaster){
      sel = piece.dataset.piece === sel ? st.queue[0] : piece.dataset.piece;
      draw();
      return;
    }
    const b = st.board;
    const rect = board.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * b.cols);
    const y = Math.floor((e.clientY - rect.top) / rect.height * b.rows);
    if(x < 0 || y < 0 || x >= b.cols || y >= b.rows) return;
    const actor = st.queue[0];
    const target = sel || actor;

    if(target !== actor){                       // ajuste do mestre: sem PA, sem limite
      if(!App.isMaster) return;
      if(!cellFree(st, x, y, target)){ UI.toast('Essa casa está ocupada', 'bad'); return; }
      act(async st2 => { st2.board.pos[target] = [x, y]; });
      return;
    }
    if(!canMoveActor(st, true)) return;
    const from = b.pos[actor];
    if(from && from[0] === x && from[1] === y) return;
    if(!cellFree(st, x, y, actor)){ UI.toast('Essa casa está ocupada', 'bad'); return; }
    const d = from ? R.gridDistance(from, [x, y]) : 0;
    const lim = moveLimit(actor);
    if(d > lim){ UI.toast(`Longe demais: ${nm(actor)} anda até ${lim} blocos por ação`, 'bad'); return; }

    if(App.isMaster){ act(st2 => doMove(st2, actor, x, y)); return; }
    // jogador: a mudança vai por uma função própria, sem token
    working = true;
    try{
      const saved = await API.battleMove(row.id, actor, x, y, `${nm(actor)} se moveu ${d} ${d === 1 ? 'bloco' : 'blocos'}`);
      const i = App.battles.findIndex(x2 => x2.id === saved.id);
      if(i >= 0) App.battles[i] = saved;
    }catch(err){ UI.toast(err.message, 'bad'); }
    finally{ working = false; draw(); }
  }

  function draw(){
    if(!view) return;
    const row = currentRow();
    if(viewId && !row){
      view.innerHTML = `
        <div class="empty enter">
          <div class="empty-ball"></div><h3>Combate não encontrado</h3>
          <p>Ele não existe mais.</p><a class="btn" href="#combate">${I.back}<span>Voltar</span></a>
        </div>`;
      return;
    }
    if(!row){
      const past = App.battles.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
      view.innerHTML = `
        <header class="view-head enter">
          <div><span class="eyebrow">Controle</span><h1>Combate</h1></div>
          ${App.isMaster ? `<button class="btn primary" type="button" data-act="b-new">${I.plus}<span>Novo combate</span></button>` : ''}
        </header>
        <div class="empty enter">
          <div class="empty-ico">${I.swords}</div>
          <h3>Nenhum combate em andamento</h3>
          <p>${App.isMaster ? 'Monte um combate com as criaturas de cada lado. A ordem, os PA, o dano e as trocas ficam por conta do app.' : 'Quando o mestre começar um combate, ele aparece aqui ao vivo.'}</p>
        </div>
        ${App.isMaster && past.length ? `<h4 class="pc-title">Combates anteriores <span>${past.length}</span></h4><div class="pc-list">${past.map(historyRow).join('')}</div>` : ''}`;
      return;
    }

    const st = row.state;
    const live = row.status === 'active';
    const oldBs = view.querySelector('.board-scroll');
    if(oldBs){ boardScroll.x = oldBs.scrollLeft; boardScroll.y = oldBs.scrollTop; }
    view.innerHTML = `
      ${viewId ? `<a class="back" href="#combate">${I.back}<span>Combate</span></a>` : ''}
      <header class="view-head enter">
        <div><span class="eyebrow">${live ? 'Ao vivo' : 'Encerrado'}</span><h1>Rodada ${st.round}</h1></div>
        ${App.isMaster ? (live
          ? `<button class="btn ghost danger-text" type="button" data-act="b-stop">Encerrar combate</button>`
          : `<span class="head-btns"><button class="btn primary" type="button" data-act="b-new">${I.plus}<span>Novo combate</span></button>
               <button class="btn ghost danger-text" type="button" data-act="b-del" aria-label="Apagar combate">${I.trash}</button></span>`) : ''}
      </header>

      ${live && st.winner == null ? `
        <div class="turnbar">
          <span class="chart-title">Ordem da rodada</span>
          <div class="queue">${st.queue.map((id, i) => `<span class="q ${i === 0 ? 'now' : ''}">${esc(nm(id))}</span>`).join('') || '<span class="q">—</span>'}</div>
        </div>` : ''}

      ${st.board ? boardHtml(st, live) : ''}

      <div class="battle">
        ${sidePanel(st, 0)}
        ${sidePanel(st, 1)}
      </div>

      ${live && st.winner == null
        ? (App.isMaster
            ? (st.pending.length ? pendingPanel(st) : actionPanel(st))
            : `<section class="card actions"><div class="act-head"><div>${st.pending.length ? `Aguardando <strong>${esc(st.sides[st.pending[0].side].name)}</strong> escolher quem entra` : `Vez de <strong>${esc(nm(st.queue[0]))}</strong>`}</div>${st.pending.length ? '' : paBig(st.pa)}</div></section>`)
        : resultPanel(st, row)}

      ${logPanel(st)}`;
    placeBoardScroll(st);
  }

  /** Mantém a rolagem do tabuleiro e, quando muda quem age, centraliza nessa peça (útil no celular). */
  function placeBoardScroll(st){
    const bs = view.querySelector('.board-scroll');
    if(!bs) return;
    const key = (viewId || 'live') + ':' + st.round + ':' + (st.queue[0] || '');
    const now = bs.querySelector('.piece.now');
    if(now && key !== boardScroll.key && (bs.scrollWidth > bs.clientWidth || bs.scrollHeight > bs.clientHeight)){
      boardScroll.key = key;
      bs.scrollLeft = now.offsetLeft - bs.clientWidth / 2;
      bs.scrollTop = now.offsetTop - bs.clientHeight / 2;
    }else{
      bs.scrollLeft = boardScroll.x;
      bs.scrollTop = boardScroll.y;
    }
  }

  /** Reduz a foto de fundo (até 1600 px no lado maior) e devolve um Blob webp ou jpeg abaixo do limite do bucket. */
  async function prepareBackground(file){
    const url = URL.createObjectURL(file);
    try{
      const img = await new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('Não consegui abrir essa imagem')); im.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k));
      cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      for(const [type, q] of [['image/webp', 0.85], ['image/jpeg', 0.85], ['image/jpeg', 0.6]]){
        const blob = await new Promise(r => cv.toBlob(r, type, q));
        if(blob && blob.type === type && blob.size <= 4.6 * 1024 * 1024) return blob;
      }
      throw new Error('A imagem de fundo ficou grande demais');
    }finally{ URL.revokeObjectURL(url); }
  }

  // ---------- novo combate ----------
  function aliveCreatures(){
    return App.creatures.filter(c => spOf(c) && R.creatureHp(spOf(c), c) > 0);
  }

  function openSetup(){
    const alive = aliveCreatures();
    if(alive.length < 2){
      UI.toast('Precisa de pelo menos 2 criaturas com vida para montar um combate', 'bad');
      return;
    }
    const ownerName = c => (App.trainers.find(t => t.id === c.trainer_id) || {}).name || 'Sem dono';
    const ordered = alive.slice().sort((a, b) =>
      ownerName(a).localeCompare(ownerName(b), 'pt-BR') || (a.slot == null ? 9 : a.slot) - (b.slot == null ? 9 : b.slot) || a.created_at.localeCompare(b.created_at));

    const sideBox = i => `
      <fieldset class="attr-edit side-setup" data-side="${i}">
        <legend>Lado ${i === 0 ? 'A' : 'B'}</legend>
        <label class="field"><span>Treinador</span>
          <select name="trainer${i}">
            <option value="">Sem treinador (selvagem / outro)</option>
            ${App.trainers.map(t => `<option value="${t.id}">${esc(t.name)}${t.kind === 'npc' ? ' (NPC)' : ''}</option>`).join('')}
          </select></label>
        <label class="field"><span>Nome do lado</span><input name="name${i}" maxlength="40" value="${i === 0 ? 'Lado A' : 'Lado B'}"></label>
        <div class="pick-list" data-list="${i}">
          ${ordered.map(c => `
            <label class="pick-row" data-cid="${c.id}" data-trainer="${c.trainer_id || ''}" data-slot="${c.slot == null ? '' : c.slot}">
              <input type="checkbox" value="${c.id}">
              <span class="tech-name"><strong>${esc(Creatures.nameOf(c))}</strong><small>Nv ${c.level} · ${esc(ownerName(c))}${c.slot != null ? ' · equipe ' + (c.slot + 1) : ''}</small></span>
            </label>`).join('')}
        </div>
      </fieldset>`;

    const m = UI.openModal({
      title: 'Novo combate',
      wide: true,
      html: `
        <form class="form" data-form>
          <label class="field"><span>Criaturas em campo por lado</span>
            <select name="per"><option value="1">1 contra 1</option><option value="2">2 contra 2 (duplas)</option></select></label>
          <div class="row3">
            <label class="field"><span>Colunas (${R.BOARD_MIN} a ${R.BOARD_MAX})</span>
              <input type="number" name="cols" inputmode="numeric" min="${R.BOARD_MIN}" max="${R.BOARD_MAX}" value="${R.BOARD_DEFAULT}"></label>
            <label class="field"><span>Linhas (${R.BOARD_MIN} a ${R.BOARD_MAX})</span>
              <input type="number" name="rows" inputmode="numeric" min="${R.BOARD_MIN}" max="${R.BOARD_MAX}" value="${R.BOARD_DEFAULT}"></label>
            <label class="field"><span>Foto de fundo (opcional)</span>
              <input type="file" name="bg" accept="image/png,image/jpeg,image/webp"></label>
          </div>
          <p class="attr-info">Marque as criaturas de cada lado. As primeiras da lista entram em campo; as outras ficam no banco. Escolher um treinador marca a equipe dele.</p>
          <div class="setup-sides">${sideBox(0)}${sideBox(1)}</div>
          <div class="modal-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">Começar combate</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const boxes = i => [...form.querySelectorAll(`[data-list="${i}"] input[type=checkbox]`)];

    function syncExclusive(){
      const picked = [0, 1].map(i => new Set(boxes(i).filter(b => b.checked).map(b => b.value)));
      [0, 1].forEach(i => boxes(i).forEach(b => {
        const other = picked[1 - i].has(b.value);
        b.disabled = other;
        b.closest('.pick-row').classList.toggle('off', other);
      }));
    }
    [0, 1].forEach(i => {
      form.elements['trainer' + i].addEventListener('change', e => {
        const tid = e.target.value;
        const t = App.trainers.find(x => x.id === tid);
        if(t) form.elements['name' + i].value = t.name;
        boxes(i).forEach(b => {
          const row = b.closest('.pick-row');
          b.checked = !!tid && row.dataset.trainer === tid && row.dataset.slot !== '' && !picked1(b.value, 1 - i);
        });
        syncExclusive();
      });
    });
    const picked1 = (id, i) => boxes(i).some(b => b.value === id && b.checked);
    form.addEventListener('change', syncExclusive);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const per = Number(form.elements.per.value);
      const defs = [0, 1].map(i => ({
        name: form.elements['name' + i].value.trim() || (i === 0 ? 'Lado A' : 'Lado B'),
        trainerId: form.elements['trainer' + i].value || null,
        roster: boxes(i).filter(b => b.checked).map(b => b.value)
      }));
      if(!defs[0].roster.length || !defs[1].roster.length){ UI.toast('Cada lado precisa de pelo menos uma criatura', 'bad'); return; }
      const clamp = n => Math.min(R.BOARD_MAX, Math.max(R.BOARD_MIN, Math.floor(Number(form.elements[n].value)) || R.BOARD_DEFAULT));
      const boardCfg = { cols: clamp('cols'), rows: clamp('rows'), bg: null };
      const bgFile = form.elements.bg.files && form.elements.bg.files[0];
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          if(bgFile){
            UI.toast('Enviando o fundo…');
            boardCfg.bg = await API.uploadImage(await prepareBackground(bgFile), 'boards', 'bg');
          }
          const st = newState(defs, per, boardCfg);
          const row = await API.saveBattle(null, 'active', st);
          App.battles.push(row);
          m.close(true);
          viewId = null;
          App.go('#combate');
          draw();
          UI.toast('Combate começou', 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // ---------- usar técnica (rolagem) ----------
  function openTechnique(t){
    const row = currentRow();
    if(!row) return;
    const st = row.state;
    const aId = st.queue[0];
    const aSide = sideOf(st, aId);
    const targets = allActive(st).filter(id => id !== aId && cr(id) && hpOf(id) > 0)
      .sort((a, b) => (sideOf(st, a) === aSide ? 1 : 0) - (sideOf(st, b) === aSide ? 1 : 0));
    if(!targets.length){ UI.toast('Não há alvo em campo', 'bad'); return; }

    const reach = t.reach || 1;
    const inReach = id => { const d = distBetween(st, aId, id); return d == null || d <= reach; };
    const hasBoard = !!st.board;
    const m = UI.openModal({
      title: `${nm(aId)} usa ${t.name}`,
      wide: true,
      html: `
        <form class="form" data-form>
          <div class="atk-head">${Creatures.typeChip(t.type)}<span>${Techniques.catLabel(t.category)} · Poder ${t.power} · ${t.pa_cost} PA · alcance ${reach}</span></div>
          <label class="field"><span>Alvo</span>
            <select name="target">${targets.map(id => { const d = distBetween(st, aId, id); return `<option value="${id}" data-out="${inReach(id) ? 0 : 1}">${esc(nm(id))} (${esc(st.sides[sideOf(st, id)].name)}${sideOf(st, id) === aSide ? ' — aliado' : ''}) · ${hpOf(id)}/${maxHpOf(id)}${d != null ? ` · a ${d} ${d === 1 ? 'bloco' : 'blocos'}` : ''}${inReach(id) ? '' : ' — fora de alcance'}</option>`; }).join('')}</select></label>
          ${hasBoard ? '<label class="check"><input type="checkbox" name="ignore"> <span>Ignorar o alcance (decisão do mestre)</span></label>' : ''}
          <div class="row2">
            <label class="field"><span>d20 do atacante</span>
              <input type="number" name="da" inputmode="numeric" min="1" max="20" value="${d20()}"></label>
            <label class="field"><span>d20 do alvo</span>
              <input type="number" name="dd" inputmode="numeric" min="1" max="20" value="${d20()}"></label>
          </div>
          <button class="btn ghost small" type="button" data-roll>Rolar os dados de novo</button>
          <div class="atk-result" data-result></div>
          <div class="modal-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">Aplicar</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    const out = form.querySelector('[data-result]');
    const die = n => Math.min(20, Math.max(1, Math.floor(Number(form.elements[n].value)) || 1));

    const submitBtn = form.querySelector('[type=submit]');
    /** Alvos fora de alcance ficam desabilitados, a menos que o mestre marque "ignorar". */
    function applyReach(){
      const ignore = !!(form.elements.ignore && form.elements.ignore.checked);
      const opts = [...form.elements.target.options];
      opts.forEach(o => { o.disabled = o.dataset.out === '1' && !ignore; });
      if(form.elements.target.selectedOptions[0] && form.elements.target.selectedOptions[0].disabled){
        const first = opts.find(o => !o.disabled);
        if(first) form.elements.target.value = first.value;
      }
      const none = !opts.some(o => !o.disabled);
      submitBtn.disabled = none;
      return none;
    }

    function preview(){
      if(applyReach()){ out.innerHTML = '<div class="res-line miss"><b>Ninguém ao alcance</b><span>Mova a peça para perto, ou marque "ignorar o alcance".</span></div>'; return; }
      const tId = form.elements.target.value;
      const r = resolveAttack(aId, t, tId, die('da'), die('dd'));
      const statLabel = key => (R.STATS.find(s => s.key === key) || {}).label;
      const multTxt = r.mult === 0 ? 'imune (0×)' : '×' + String(r.mult).replace('.', ',');
      out.innerHTML = `
        <div class="res-line ${r.hit.hit ? 'hit' : 'miss'}"><b>${r.hit.hit ? 'ACERTOU' : 'ERROU'}</b>
          <span>${die('da')} + Precisão ${r.hit.atk - die('da')} = <b>${r.hit.atk}</b> contra ${die('dd')} + Evasão ${r.hit.def - die('dd')} = <b>${r.hit.def}</b></span></div>
        ${r.hit.hit ? `
        <div class="res-line"><b>${r.dmg.damage} de dano</b>
          <span>${statLabel(r.cat.atk)} ${r.atk} contra ${statLabel(r.cat.def)} ${r.def} · antes do tipo ${String(Math.round(r.dmg.before * 10) / 10).replace('.', ',')} · tipo ${multTxt}</span></div>` : ''}`;
    }
    form.addEventListener('input', preview);
    form.addEventListener('change', preview);
    form.querySelector('[data-roll]').onclick = () => { form.elements.da.value = d20(); form.elements.dd.value = d20(); preview(); };
    preview();

    form.addEventListener('submit', e => {
      e.preventDefault();
      const tId = form.elements.target.value, da = die('da'), dd = die('dd');
      m.close(true);
      act(st2 => doAttack(st2, t, tId, da, dd));
    });
  }

  function openSwap(){
    const row = currentRow();
    if(!row) return;
    const st = row.state;
    const id = st.queue[0];
    const si = sideOf(st, id);
    const bench = st.sides[si].roster.filter(x => !allActive(st).includes(x) && cr(x) && hpOf(x) > 0);
    const m = UI.openModal({
      title: `Trocar ${nm(id)}`,
      html: `
        <p class="confirm-text">A troca voluntária custa os <b>${R.PA_PER_TURN} PA</b> de ${esc(nm(id))}. Quem entra recebe os próprios PA e age na mesma rodada, quando chegar a vez dele.</p>
        <div class="sub-list">${bench.map(x => `<button class="btn" type="button" data-pick="${x}">${esc(nm(x))} · Nv ${cr(x).level} · ${hpOf(x)}/${maxHpOf(x)}</button>`).join('')}</div>
        <div class="modal-actions"><button class="btn" type="button" data-modal-close>Cancelar</button></div>`
    });
    m.body.addEventListener('click', e => {
      const b = e.target.closest('[data-pick]');
      if(!b) return;
      const inId = b.dataset.pick;
      m.close(true);
      act(async st2 => {
        const out = st2.queue[0], s2 = st2.sides[sideOf(st2, out)];
        const outSpeed = speedOf(out);
        s2.active = s2.active.filter(x => x !== out);
        st2.queue.shift();
        s2.active.push(inId);
        enterBoard(st2, sideOf(st2, out), inId, out);
        if(!st2.participated.includes(inId)) st2.participated.push(inId);
        log(st2, `${s2.name} trocou ${nm(out)} por ${nm(inId)}`);
        insertIntoQueue(st2, inId, outSpeed, 0);
        nextActor(st2);
      });
    });
  }

  // ---------- eventos ----------
  function init(root){
    view = root;
    root.addEventListener('click', e => {
      if(e.target.closest('[data-board]')){ boardClick(e); return; }
      const b = e.target.closest('[data-act]');
      if(!b || !root.contains(b) || !b.dataset.act.startsWith('b-') || !App.isMaster) return;
      const row = currentRow();
      switch(b.dataset.act){
        case 'b-new': openSetup(); break;
        case 'b-tech': { const t = tech(b.dataset.id); if(t && row) openTechnique(t); break; }
        case 'b-move': act(async st => {
          const id = st.queue[0];
          st.pa -= 1;
          log(st, `${nm(id)} se moveu (até ${R.movementPerAction((statsOf(id) || {}).velocidade)} blocos)`);
          await settle(st);
        }); break;
        case 'b-swap': openSwap(); break;
        case 'b-end': act(st => endTurn(st, true)); break;
        case 'b-sub': act(async st => {
          const si = Number(b.dataset.side), id = b.dataset.id;
          const p = st.pending.findIndex(x => x.side === si);
          if(p < 0) return;
          st.sides[si].active.push(id);
          enterBoard(st, si, id, null);
          if(!st.participated.includes(id)) st.participated.push(id);
          log(st, `${st.sides[si].name} mandou ${nm(id)} para o campo`);
          const ref = st.queue.length ? speedOf(st.queue[0]) : -1;
          insertIntoQueue(st, id, ref, st.queue.length ? 1 : 0);
          st.pending[p].need--;
          if(st.pending[p].need <= 0) st.pending.splice(p, 1);
          await settle(st);
        }); break;
        case 'b-stop': (async () => {
          const ok = await UI.confirmBox({ title: 'Encerrar combate', html: 'Encerrar o combate agora, sem vencedor?', yesLabel: 'Encerrar', danger: true });
          if(ok) act(async st => { log(st, 'O mestre encerrou o combate'); st.queue = []; st.pending = []; }, 'ended');
        })(); break;
        case 'b-xp': {
          if(!row) break;
          const amount = Math.max(0, Math.floor(Number(view.querySelector('#bXp').value)) || 0);
          const ids = [...view.querySelectorAll('.result input[type=checkbox]:checked')].map(x => x.value);
          if(!amount || !ids.length){ UI.toast('Escolha quem recebe e um XP maior que zero', 'bad'); break; }
          UI.busy(b, async () => {
            await act(async st => {
              for(const id of ids){
                const before = cr(id).level;
                const r = await API.creatureAddXp(id, amount);
                const i = App.creatures.findIndex(c => c.id === r.id);
                if(i >= 0) App.creatures[i] = r;
                log(st, `${nm(id)} ganhou ${amount} XP${r.level > before ? ` e subiu para o nível ${r.level}` : ''}`);
              }
              st.xpGiven = true;
            });
            UI.toast('XP distribuído', 'good');
          });
          break;
        }
        case 'b-close': act(async st => { st.closed = true; }); break;
        case 'b-heal': {
          if(!row) break;
          UI.busy(b, async () => {
            try{
              for(const id of row.state.participated){ if(cr(id)) await setHp(id, maxHpOf(id)); }
              UI.toast('Todos curados', 'good');
              draw();
            }catch(err){ UI.toast(err.message, 'bad'); }
          });
          break;
        }
        case 'b-del': (async () => {
          if(!row) return;
          const ok = await UI.confirmBox({ title: 'Apagar combate', html: 'Apagar o registro desse combate? Isso não pode ser desfeito.', yesLabel: 'Apagar', danger: true });
          if(!ok) return;
          try{
            await API.deleteBattle(row.id);
            App.battles = App.battles.filter(x => x.id !== row.id);
            App.go('#combate');
            UI.toast('Combate apagado');
          }catch(err){ UI.toast(err.message, 'bad'); }
        })(); break;
      }
    });
  }

  /** Mudança vinda de outro aparelho (ou do próprio mestre). */
  function refresh(){
    if(!view || UI.isModalOpen() || working) return;
    const a = document.activeElement;
    if(a && a.id === 'bXp') return;
    draw();
    // o jogador pode ter gastado o último PA movendo a peça: quem fecha o turno é o mestre
    const row = App.isMaster && currentRow();
    if(row && row.status === 'active' && row.state.winner == null && !row.state.pending.length && row.state.queue.length && row.state.pa <= 0){
      act(st => endTurn(st, false));
    }
  }

  return { init, render, refresh };
})();
