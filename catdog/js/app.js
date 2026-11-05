/* ============================================================
   CAT & DOG — começo do app: login, dados, rotas, cabeçalho
   Rotas (hash): #hoje · #tarefas · #tarefas/<minhas|juntas|outro|avaliar> · #moedas · #ajustes
   ============================================================ */
window.App = (function(){
  'use strict';

  const R = CD_RULES;
  const I = UI.icons;
  const view = document.getElementById('view');

  const app = {
    role: null, isMaster: false, side: 'gato',
    tasks: [], comps: [], log: [], wallets: { gato: 0, cao: 0 },
    current: 'hoje', go, reload, refreshView
  };

  function go(hash){ location.hash = hash; }

  function parse(){
    const parts = location.hash.replace(/^#/, '').split('/');
    return { name: parts[0] || 'hoje', arg: parts[1] || null };
  }

  function setTab(name){
    document.querySelectorAll('.dock .tab').forEach(a => {
      const on = a.dataset.tab === name;
      a.classList.toggle('on', on);
      if(on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function route(){
    const r = parse();
    const name = ['hoje', 'tarefas', 'moedas', 'ajustes'].includes(r.name) ? r.name : 'hoje';
    app.current = name;
    setTab(name);
    if(name === 'tarefas') Tasks.renderList(view, ['minhas', 'juntas', 'outro', 'avaliar'].includes(r.arg) ? r.arg : null);
    else if(name === 'moedas') Wallet.render(view);
    else if(name === 'ajustes') Settings.render(view);
    else Tasks.renderToday(view);
    view.classList.remove('page-in');
    void view.offsetWidth;
    view.classList.add('page-in');
    window.scrollTo({ top: 0 });
    paintBadge();
  }

  function refreshView(){
    paintTop();
    paintBadge();
    if(app.current === 'tarefas' || app.current === 'hoje') Tasks.refresh();
    else if(app.current === 'moedas') Wallet.refresh();
  }

  // ---------- dados ----------
  async function reload(){
    const td = R.todayISO();
    const [tasks, comps, log, wallets] = await Promise.all([
      API.listTasks(), API.listCompletions([td, R.ONE_OFF_PERIOD]), API.listLog(300), API.wallets()
    ]);
    app.tasks = tasks; app.comps = comps; app.log = log; app.wallets = wallets;
    app.day = td;
  }

  // ---------- cabeçalho ----------
  let topShown = null;
  function paintTop(){
    const host = document.getElementById('topWallets');
    const s = app.side, o = R.other(s);
    host.innerHTML = [s, o].map(k => `
      <a class="pill ${k} ${k === s ? 'me' : ''}" href="#moedas" title="${R.SIDES[k].coin}">${UI.coin(k, 22)}<b data-v="${app.wallets[k]}" data-side="${k}">${app.wallets[k]}</b></a>`).join('');
    host.querySelectorAll('b[data-v]').forEach(b => {
      const to = Number(b.dataset.v);
      const from = topShown ? topShown[b.dataset.side] : to;
      b.dataset.v = String(from); b.textContent = from;
      UI.countTo(b, to);
    });
    topShown = { gato: app.wallets.gato, cao: app.wallets.cao };
  }

  function paintBadge(){
    const n = app.tasks.filter(t => R.needsMyValue(t, app.side)).length;
    const b = document.getElementById('badgeTasks');
    b.hidden = !n;
    b.textContent = n;
  }

  let poweringOff = false;
  function powerOffToHub(){
    if(poweringOff) return;
    poweringOff = true;
    try{ sessionStorage.setItem('subrosa-hub-poweron', '1'); }catch(e){}
    if(UI.reduceMotion()){ location.href = '../'; return; }
    document.body.classList.add('powering-off');
    setTimeout(() => { location.href = '../'; }, 560);
  }
  document.addEventListener('click', e => { if(e.target.closest('[data-power-off]')) powerOffToHub(); });
  window.addEventListener('pageshow', e => {
    if(e.persisted){ poweringOff = false; document.body.classList.remove('powering-off'); }
  });

  function showError(e){
    view.innerHTML = `
      <div class="empty enter">
        <div class="empty-art"><svg width="64" height="64" viewBox="0 0 32 32"><use href="#paw" fill="currentColor"/></svg></div>
        <h3>Não consegui carregar</h3>
        <p>${UI.esc(e.message)}</p>
        <button class="btn primary" type="button" id="retry">Tentar de novo</button>
      </div>`;
    document.getElementById('retry').onclick = boot;
  }

  async function boot(){
    view.innerHTML = '<div class="loading"><svg class="spin" width="46" height="46" viewBox="0 0 32 32"><use href="#paw" fill="currentColor"/></svg></div>';
    try{ await reload(); }catch(e){ showError(e); return; }
    paintTop();
    route();
  }

  // ---------- começo ----------
  SubrosaAuth.onReady(async a => {
    app.role = a.role;
    app.isMaster = a.role === 'master';
    app.side = app.isMaster ? 'cao' : 'gato';
    document.body.dataset.side = app.side;
    document.querySelectorAll('[data-ico]').forEach(el => { el.innerHTML = I[el.dataset.ico] || ''; });

    Tasks.init(view);
    Wallet.init(view);
    Settings.init(view);
    window.addEventListener('hashchange', route);
    await boot();

    API.subscribe(['catdog_tasks', 'catdog_completions', 'catdog_coin_log'], UI.debounce(async () => {
      try{ await reload(); refreshView(); }catch(e){ /* tenta de novo na próxima mudança */ }
    }, 250));

    // virou o dia (ou voltou ao app depois de um tempo): recarrega para "hoje" ficar certo
    const checkDay = async () => {
      if(R.todayISO() !== app.day){
        try{ await reload(); route(); }catch(e){}
      }
    };
    setInterval(checkDay, 60000);
    document.addEventListener('visibilitychange', () => { if(!document.hidden) checkDay(); });
  });

  return app;
})();
