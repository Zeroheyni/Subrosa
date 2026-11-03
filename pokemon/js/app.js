/* ============================================================
   POKÉMON — inicialização, abas e rotas

   Rotas (hash): #treinadores · #treinador/<id> · #criaturas · #criatura/<id> · #bestiario · #especie/<id> · #bolsa · #bolsa/<id do treinador> · #combate
   O login por PIN é do site todo (shared/auth.js); o app só começa
   depois que SubrosaAuth.onReady avisa o papel (mestre ou jogador).
   ============================================================ */
window.App = (function(){
  'use strict';

  const view = document.getElementById('view');
  const app = { role: null, isMaster: false, trainers: [], species: [], creatures: [], items: [], current: 'trainers', go, reloadAll, refreshTrainers };

  const SOON = {
    combate:   { title: 'Combate',   text: 'Ordem de turnos, PA, dano com tipos, cura e substituição.',                     ico: 'swords' }
  };

  function go(hash){
    if(location.hash === hash) route();
    else location.hash = hash;
  }

  function parse(){
    const parts = location.hash.replace(/^#/, '').split('/');
    return { name: parts[0] || 'treinadores', id: parts[1] || null };
  }

  function setTab(name){
    const tab = name === 'treinador' ? 'treinadores' : ['criatura', 'bestiario', 'especie'].includes(name) ? 'criaturas' : name;
    document.querySelectorAll('.dex-nav .tab').forEach(a => {
      const on = a.dataset.tab === tab;
      a.classList.toggle('on', on);
      if(on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function comingSoon(key){
    const s = SOON[key];
    view.innerHTML = `
      <div class="empty enter">
        <div class="empty-ico">${UI.icons[s.ico]}</div>
        <h3>${s.title}</h3>
        <p>${s.text}</p>
        <span class="chip soon">em construção</span>
      </div>`;
  }

  function route(){
    Trainers.flushNotes();
    Creatures.flushNotes();
    let r = parse();

    // jogador com um único treinador: cai direto na ficha dele
    if(r.name === 'treinadores' && !app.isMaster){
      const mine = app.trainers.filter(t => t.kind === 'player');
      if(mine.length === 1){
        history.replaceState(null, '', '#treinador/' + mine[0].id);
        r = { name: 'treinador', id: mine[0].id };
      }
    }

    setTab(r.name);
    const inCreatures = ['criaturas', 'criatura', 'bestiario', 'especie'].includes(r.name);
    app.current = inCreatures ? 'creatures' : r.name === 'bolsa' ? 'bag' : 'trainers';
    if(r.name === 'treinador' && r.id) Trainers.renderSheet(view, r.id);
    else if(r.name === 'criatura' && r.id) Creatures.renderCreature(view, r.id);
    else if(r.name === 'especie' && r.id) Creatures.renderSpecies(view, r.id);
    else if(r.name === 'bestiario') Creatures.renderBestiary(view);
    else if(r.name === 'criaturas') Creatures.renderList(view);
    else if(r.name === 'bolsa') Bag.render(view, r.id);
    else if(SOON[r.name]) comingSoon(r.name);
    else Trainers.renderList(view);

    view.classList.remove('page-in');
    void view.offsetWidth;
    view.classList.add('page-in');
    window.scrollTo({ top: 0 });
  }

  async function reload(){
    const [trainers, species, creatures, items] = await Promise.all([API.listTrainers(), API.listSpecies(), API.listCreatures(), API.listItems()]);
    app.trainers = trainers;
    app.species = species;
    app.creatures = creatures;
    app.items = items;
  }

  /** Recarrega tudo e redesenha a tela aberta (usado depois de ações que mexem em mais de uma linha). */
  async function reloadAll(){
    await reload();
    refreshView();
  }

  /** Só atualiza a lista de treinadores na memória (a tela aberta não mostra dados dele). */
  async function refreshTrainers(){
    try{ app.trainers = await API.listTrainers(); }catch(e){ /* a próxima mudança tenta de novo */ }
  }

  function refreshView(){
    if(app.current === 'creatures') Creatures.refresh();
    else if(app.current === 'bag') Bag.refresh();
    else Trainers.refresh();
  }

  function showError(e){
    view.innerHTML = `
      <div class="empty enter">
        <div class="empty-ball"></div>
        <h3>Não consegui carregar</h3>
        <p>${UI.esc(e.message)}</p>
        <button class="btn primary" type="button" id="retry">Tentar de novo</button>
      </div>`;
    document.getElementById('retry').onclick = boot;
  }

  async function boot(){
    view.innerHTML = '<div class="loading"><div class="empty-ball spin"></div></div>';
    try{ await reload(); }catch(e){ showError(e); return; }
    route();
  }

  // ---------- cabeçalho: papel, sair, desligar ----------
  function setupHeader(){
    const who = document.getElementById('who');
    document.getElementById('whoRole').textContent = app.isMaster ? 'Mestre' : 'Jogador';
    who.hidden = false;
    who.addEventListener('click', async () => {
      const ok = await UI.confirmBox({
        title: 'Sair',
        text: 'Você vai precisar do PIN para entrar de novo.',
        yesLabel: 'Sair'
      });
      if(ok) SubrosaAuth.logout();
    });
  }

  let poweringOff = false;
  function powerOffToHub(){
    if(poweringOff) return;
    poweringOff = true;
    Trainers.flushNotes();
    Creatures.flushNotes();
    try{ sessionStorage.setItem('subrosa-hub-poweron', '1'); }catch(e){}
    if(UI.reduceMotion()){ location.href = '../'; return; }
    document.body.classList.add('powering-off');
    setTimeout(() => { location.href = '../'; }, 640);
  }
  document.addEventListener('click', e => { if(e.target.closest('[data-power-off]')) powerOffToHub(); });
  window.addEventListener('pageshow', e => {
    if(e.persisted){ poweringOff = false; document.body.classList.remove('powering-off'); }
  });

  // ---------- começo ----------
  SubrosaAuth.onReady(async a => {
    app.role = a.role;
    app.isMaster = a.role === 'master';
    document.body.dataset.role = a.role;
    setupHeader();
    Trainers.init(view);
    Creatures.init(view);
    Bag.init(view);
    window.addEventListener('hashchange', route);
    await boot();

    API.subscribe(['pkm_trainers', 'pkm_species', 'pkm_creatures', 'pkm_items'], UI.debounce(async () => {
      try{ await reload(); refreshView(); }catch(e){ /* tenta de novo na próxima mudança */ }
    }, 250));
  });

  return app;
})();
