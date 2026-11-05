/* ============================================================
   CAT & DOG — temas visuais (todos escuros)
   Níveis: simples (só cor) · raro (cor + animação) · lendário (cor + animação + temática)
           · mítico (conjunto: os DOIS lados depositam moedas num cofre para liberar).
   • O que cada tema muda mora aqui (cores em `vars`, animações em `fx`/`layers`) e em css/themes.css.
   • O preço, o que cada lado tem e o tema equipado moram no banco (migration 07_themes.sql).
   • As cores das MOEDAS e dos lados (violeta/âmbar) nunca mudam: identidade do jogo.
   • Modo Debug (só mestre, em Ajustes): pré-visualiza qualquer tema sem comprar e sem gravar nada.
   ============================================================ */
window.Themes = (function(){
  'use strict';

  const R = CD_RULES;
  const I = UI.icons;
  const esc = UI.esc;

  // ---------- cores ----------
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixHex = (h1, h2, t) => { const a = hex(h1), b = hex(h2); return toHex(a.map((v, i) => v + (b[i] - v) * t)); };
  const rgba = (h, al) => { const a = hex(h); return `rgba(${a[0]},${a[1]},${a[2]},${al})`; };

  /** Paleta completa a partir de poucas cores: fundo, destaque e segundo destaque. */
  function palette(o){
    const { bg, a, a2 } = o, c2 = o.c2 || a2;
    const text = mixHex('#f6f3ff', a, .07);
    return {
      '--bg': bg,
      '--bg-art': o.art || `radial-gradient(900px 520px at 8% -8%, ${rgba(a, .22)}, transparent 62%), radial-gradient(800px 520px at 100% 108%, ${rgba(c2, .17)}, transparent 62%), radial-gradient(500px 500px at 50% 40%, rgba(255,255,255,.015), transparent 70%)`,
      '--a': a, '--a2': a2, '--ag': rgba(a, .34),
      '--text': text, '--muted': mixHex(text, bg, .5), '--faint': mixHex(text, bg, .72),
      '--top-bg': `linear-gradient(180deg, ${rgba(bg, .92)}, ${rgba(bg, .72)})`,
      '--dock-bg': rgba(mixHex(bg, '#ffffff', .07), .82),
      '--sheet-bg': `linear-gradient(180deg, ${mixHex(bg, '#ffffff', .09)}, ${bg} 42%)`,
      '--toast-bg': rgba(mixHex(bg, '#ffffff', .11), .96),
      '--deep1': mixHex(bg, '#ffffff', .045), '--deep2': bg,
      ...(o.vars || {})
    };
  }

  // ---------- níveis ----------
  const TIERS = {
    padrao:   { label:'Padrão',   cls:'t-padrao' },
    simples:  { label:'Simples',  cls:'t-simples' },
    raro:     { label:'Raro',     cls:'t-raro' },
    lendario: { label:'Lendário', cls:'t-lendario' },
    mitico:   { label:'Mítico',   cls:'t-mitico' }
  };

  // ---------- cenas ----------
  const GF = 'https://fonts.googleapis.com/css2?family=';
  const font = (family, spec, stack) => ({ url: GF + spec + '&display=swap', stack: `'${family}', ${stack || "'Outfit', system-ui, sans-serif"}` });
  /** número pseudo-aleatório estável (as cenas ficam iguais a cada abertura) */
  const sr = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function pines(count, hMin, hMax, fill, seed){
    let p = '';
    for(let i = 0; i < count; i++){
      const x = (i + .5) * (1000 / count) + (sr(i + seed) - .5) * 30;
      const h = hMin + sr(i * 3 + seed) * (hMax - hMin), w = h * .46;
      p += `<polygon points="${(x - w / 2).toFixed(0)},200 ${x.toFixed(0)},${(200 - h).toFixed(0)} ${(x + w / 2).toFixed(0)},200"/>`;
      p += `<polygon points="${(x - w * .38).toFixed(0)},${(200 - h * .38).toFixed(0)} ${x.toFixed(0)},${(200 - h * 1.02).toFixed(0)} ${(x + w * .38).toFixed(0)},${(200 - h * .38).toFixed(0)}"/>`;
    }
    return `<svg viewBox="0 0 1000 200" preserveAspectRatio="none" fill="${fill}" aria-hidden="true">${p}</svg>`;
  }
  function jellies(){
    const list = [['10%', '26s', '46px', '#3fffe0', '-3s'], ['72%', '32s', '62px', '#7a9bff', '-11s'], ['44%', '38s', '34px', '#ff7ad9', '-19s']];
    return list.map(j => `<div class="th-layer jelly" style="--jx:${j[0]};--jd:${j[1]};--js:${j[2]};--jc:${j[3]};animation-delay:${j[4]}"></div>`).join('');
  }
  const FISH = '<svg viewBox="0 0 64 28" aria-hidden="true"><path d="M2 14C12 2 34 2 46 14 34 26 12 26 2 14Z"/><path d="M44 14 62 3V25Z"/></svg>';
  function fishes(){
    return [['34%', '48s', '0s', 54, 1], ['62%', '62s', '-26s', 36, -1]].map(x =>
      `<div class="th-layer fish" style="top:${x[0]};--fd:${x[1]};--fw:${x[3]}px;--fdir:${x[4]};animation-delay:${x[2]}">${FISH}</div>`).join('');
  }

  // ---------- catálogo ----------
  // fx: partículas { t: twinkle|fall|rise|streak|drift|blob, n, c (cor ou lista), s:[min,max] px, d:[min,max] s, o, dx, ch (emoji/letra) }
  // layers: camadas prontas em themes.css (div.th-layer.fx-<nome>) · html: cenas desenhadas em SVG/HTML
  const CATALOG = [
    { id:'meia-noite', tier:'padrao', name:'Meia-noite', tagline:'O visual de sempre: violeta e âmbar sobre a noite.', price:0, vars:{}, swatch:['#b48bff', '#ff6fd0', '#ffb040'] },

    // ===== SIMPLES — só mudam as cores =====
    { id:'oceano', tier:'simples', name:'Oceano', tagline:'Azul profundo com brilho ciano.', price:40, pal:{ bg:'#040d17', a:'#38c8ff', a2:'#3a7bff', c2:'#00e0c6' } },
    { id:'floresta', tier:'simples', name:'Floresta', tagline:'Verde musgo e luz de folhas.', price:40, pal:{ bg:'#050f0a', a:'#5be38a', a2:'#b6e85a', c2:'#1fb97a' } },
    { id:'brasa', tier:'simples', name:'Brasa', tagline:'Vermelho e laranja de fogueira.', price:40, pal:{ bg:'#130706', a:'#ff6a3d', a2:'#ff3d5e', c2:'#ffb347' } },
    { id:'algodao-doce', tier:'simples', name:'Algodão-doce', tagline:'Rosa, azul-bebê e lilás no escuro.', price:40, pal:{ bg:'#0e0713', a:'#ff8fd8', a2:'#8fd9ff', c2:'#c59bff' } },
    { id:'ouro-velho', tier:'simples', name:'Ouro velho', tagline:'Dourado antigo e bronze.', price:40, pal:{ bg:'#0e0b05', a:'#f2c14e', a2:'#d98a2b', c2:'#fff0b3' } },

    // ===== RAROS — cor + animação =====
    { id:'aurora', tier:'raro', name:'Aurora', tagline:'Cortinas de luz verde e violeta ondulando no céu.', price:150,
      pal:{ bg:'#040c12', a:'#6cffc4', a2:'#9a7bff', c2:'#9a7bff' }, layers:['aurora'], fx:[{ t:'twinkle', n:26, c:'#ffffff', s:[1, 2.2], d:[3, 7], o:.8 }] },
    { id:'pulso-neon', tier:'raro', name:'Pulso neon', tagline:'Anéis de neon pulsando e cartões que respiram.', price:150,
      pal:{ bg:'#07040f', a:'#ff2bd6', a2:'#29f0ff', c2:'#29f0ff' }, layers:['pulse'] },
    { id:'chuva-estrelas', tier:'raro', name:'Chuva de estrelas', tagline:'Estrelas cadentes riscando a noite.', price:150,
      pal:{ bg:'#03030a', a:'#b9c8ff', a2:'#7aa2ff', c2:'#c59bff' },
      fx:[{ t:'twinkle', n:40, c:'#ffffff', s:[1, 2.4], d:[2.5, 6], o:.9 }, { t:'streak', n:9, c:'#cfe0ff', s:[70, 140], d:[3.2, 6.5], o:.85, dx:0 }] },
    { id:'lava-lamp', tier:'raro', name:'Lava lamp', tagline:'Bolhas de lava derretendo devagar.', price:150,
      pal:{ bg:'#120408', a:'#ff5a5f', a2:'#ffb347', c2:'#ff3d9a' },
      fx:[{ t:'blob', n:6, c:['#ff4d6d', '#ff9a3d', '#ff3d9a', '#ffb347'], s:[180, 360], d:[16, 30], o:.4 }] },
    { id:'mare', tier:'raro', name:'Maré', tagline:'Ondas suaves subindo e descendo, com bolhas.', price:150,
      pal:{ bg:'#030f14', a:'#3de0d0', a2:'#3aa0ff', c2:'#3aa0ff' }, layers:['waves'],
      fx:[{ t:'rise', n:14, c:'rgba(160,240,255,.7)', s:[3, 9], d:[9, 18], o:.6, dx:14 }] }
    ,
    // ===== LENDÁRIOS — cor + animação + temática =====
    { id:'cyberpunk', tier:'lendario', name:'Cyberpunk', tagline:'Neo-Tóquio: sol de synthwave, grade em movimento, chuva de código e cartões de neon.', price:500,
      pal:{ bg:'#05020d', a:'#ff2e97', a2:'#00f0ff', c2:'#fcee09' },
      vars:{ '--shape':'3px', '--surface':'rgba(16,6,34,.74)', '--surface2':'rgba(30,10,60,.8)', '--line':'rgba(0,240,255,.2)', '--line2':'rgba(255,46,151,.45)', '--stars-o':'0' },
      font: font('Orbitron', 'Orbitron:wght@500;700;800'),
      layers:['cy-sun', 'cy-grid'],
      fx:[{ t:'fall', n:22, c:['#00f0ff', '#ff2e97', '#00f0ff'], s:[11, 17], d:[7, 14], o:.55, dx:0, ch:['0', '1', 'ア', 'カ', 'ネ', 'ン', '#', '7'] }] },

    { id:'abismo', tier:'lendario', name:'Abismo', tagline:'Fundo do mar: raios de luz, águas-vivas brilhantes, peixes e bolhas subindo.', price:500,
      pal:{ bg:'#010a12', a:'#3fffe0', a2:'#2e7bff', c2:'#7a5cff' },
      vars:{ '--shape':'30px', '--surface':'rgba(4,30,46,.55)', '--line':'rgba(63,255,224,.15)', '--line2':'rgba(63,255,224,.32)', '--stars-o':'0' },
      font: font('Marcellus', 'Marcellus'),
      layers:['ab-rays', 'ab-deep'], html: jellies() + fishes(),
      fx:[{ t:'rise', n:24, c:'rgba(150,255,240,.7)', s:[3, 11], d:[8, 17], o:.65, dx:16 }, { t:'drift', n:16, c:'#3fffe0', s:[2, 3.5], d:[3, 7], o:.8 }] },

    { id:'floresta-encantada', tier:'lendario', name:'Floresta encantada', tagline:'Pinheiros na neblina, vaga-lumes dançando e folhas caindo ao luar.', price:500,
      pal:{ bg:'#040b06', a:'#8dff7a', a2:'#ffe27a', c2:'#35c98a' },
      vars:{ '--shape':'18px', '--surface':'rgba(8,28,16,.6)', '--line':'rgba(141,255,122,.14)', '--line2':'rgba(255,226,122,.3)', '--stars-o':'.35' },
      font: font('Cormorant Garamond', 'Cormorant+Garamond:wght@600;700'),
      layers:['fo-moon', 'fo-fog'], html: `<div class="th-layer fo-trees far">${pines(26, 70, 150, 'currentColor', 3)}</div><div class="th-layer fo-trees near">${pines(15, 90, 190, 'currentColor', 9)}</div>`,
      fx:[{ t:'drift', n:26, c:['#ffe27a', '#d6ff7a', '#ffe27a'], s:[2.5, 4.5], d:[3, 8], o:.95 }, { t:'fall', n:9, c:'#8dff7a', s:[13, 21], d:[14, 26], o:.55, dx:80, ch:['🍃', '🍂', '🍃'] }] },

    { id:'cosmos', tier:'lendario', name:'Cosmos', tagline:'Nebulosas girando, planeta com anéis, estrelas cintilando e cometas.', price:500,
      pal:{ bg:'#02030a', a:'#9d8cff', a2:'#ff7ad9', c2:'#45d0ff' },
      vars:{ '--shape':'16px', '--surface':'rgba(10,10,32,.6)', '--line':'rgba(157,140,255,.16)', '--line2':'rgba(157,140,255,.34)' },
      font: font('Space Grotesk', 'Space+Grotesk:wght@500;700'),
      layers:['co-nebula', 'co-planet'],
      fx:[{ t:'twinkle', n:80, c:['#ffffff', '#cfd6ff', '#ffd9f4'], s:[1, 2.6], d:[2.5, 8], o:.95 }, { t:'streak', n:4, c:'#d9e4ff', s:[90, 170], d:[8, 15], o:.9 }] },

    { id:'arcade', tier:'lendario', name:'Arcade 8-bit', tagline:'Fliperama: pixels, tela de tubo, bordas duras e fantasminhas flutuando.', price:500,
      pal:{ bg:'#0a0a1f', a:'#ffe14d', a2:'#ff4d8d', c2:'#4dff88',
        art:'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px) 0 0 / 16px 16px, linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px) 0 0 / 16px 16px, radial-gradient(760px 520px at 50% -6%, rgba(255,77,141,.22), transparent 65%), radial-gradient(600px 420px at 50% 110%, rgba(77,255,136,.12), transparent 65%)' },
      vars:{ '--shape':'0px', '--surface':'rgba(22,22,66,.74)', '--surface2':'rgba(34,34,90,.8)', '--line':'rgba(255,255,255,.2)', '--line2':'rgba(255,225,77,.55)', '--stars-o':'0' },
      font: font('Silkscreen', 'Silkscreen:wght@400;700'),
      fx:[{ t:'twinkle', n:30, c:['#ffe14d', '#ff4d8d', '#4dff88', '#ffffff'], s:[4, 6], d:[1.6, 4], o:.9, sq:true }, { t:'fall', n:9, c:'#ffffff', s:[20, 30], d:[18, 34], o:.7, dx:40, ch:['👾', '🕹️', '⭐', '🍒', '👾'] }] }
  ];

  // ----- completa cada tema com a paleta calculada -----
  CATALOG.forEach(t => {
    if(t.pal) t.vars = palette({ ...t.pal, vars: t.vars });
    if(t.pal && !t.swatch) t.swatch = [t.pal.a, t.pal.a2, t.pal.c2 || t.pal.a2];
  });
  const BY_ID = Object.fromEntries(CATALOG.map(t => [t.id, t]));
  const DEFAULT = 'meia-noite';

  // ---------- estado ----------
  const LS_THEME = 'catdog.theme';        // último tema aplicado neste aparelho (evita piscar ao abrir)
  const LS_DEBUG = 'catdog.debug';
  const SS_PREVIEW = 'catdog.preview';
  let applied = [];                       // variáveis colocadas no <body>
  let appliedId = null;
  let fxEl = null;
  let view = null;

  const me = () => App.side;
  const them = () => R.other(App.side);
  const name = s => R.SIDES[s].label;
  const ls = { get: k => { try{ return localStorage.getItem(k); }catch(e){ return null; } }, set: (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} }, del: k => { try{ localStorage.removeItem(k); }catch(e){} } };
  const ss = { get: k => { try{ return sessionStorage.getItem(k); }catch(e){ return null; } }, set: (k, v) => { try{ sessionStorage.setItem(k, v); }catch(e){} }, del: k => { try{ sessionStorage.removeItem(k); }catch(e){} } };

  const debugOn = () => !!(window.App && App.isMaster) && ls.get(LS_DEBUG) === '1';
  const previewId = () => (debugOn() && BY_ID[ss.get(SS_PREVIEW)] ? ss.get(SS_PREVIEW) : null);
  const equippedId = () => {
    const st = window.App && App.settings && App.settings[me()];
    return st && BY_ID[st.theme] ? st.theme : null;
  };
  const currentId = () => previewId() || equippedId() || (BY_ID[ls.get(LS_THEME)] ? ls.get(LS_THEME) : DEFAULT);

  // ---------- dados do banco ----------
  const owns = (id, side) => id === DEFAULT || (App.themesOwned || []).some(o => o.theme_id === id && o.side === (side || me()));
  const vaultOf = (id, side) => { const v = (App.vault || []).find(x => x.theme_id === id && x.side === side); return v ? v.amount : 0; };
  const priceOf = id => { const c = (App.themeCatalog || []).find(x => x.id === id); return c ? c.price : BY_ID[id].price; };

  // ---------- fontes (só carrega quando o tema pede) ----------
  const fontsLoaded = new Set();
  function loadFont(f){
    if(!f || fontsLoaded.has(f.url)) return;
    fontsLoaded.add(f.url);
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = f.url;
    document.head.appendChild(l);
  }

  // ---------- partículas ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = c => (Array.isArray(c) ? c[Math.floor(Math.random() * c.length)] : c);
  function particles(cfg){
    let out = '';
    for(let i = 0; i < cfg.n; i++){
      const sz = rnd(cfg.s[0], cfg.s[1]), d = rnd(cfg.d[0], cfg.d[1]);
      const st = [`--x:${rnd(0, 100).toFixed(1)}%`, `--y:${rnd(0, 100).toFixed(1)}%`, `--sz:${sz.toFixed(1)}px`, `--dur:${d.toFixed(1)}s`,
        `--delay:${(-rnd(0, d)).toFixed(1)}s`, `--dx:${rnd(-(cfg.dx || 18), cfg.dx || 18).toFixed(0)}px`, `--pc:${pick(cfg.c)}`, `--po:${cfg.o || .8}`].join(';');
      out += `<i class="pt pt-${cfg.t}${cfg.ch ? ' em' : ''}${cfg.sq ? ' sq' : ''}" style="${st}">${cfg.ch ? esc(pick(cfg.ch)) : ''}</i>`;
    }
    return out;
  }
  function buildFx(th){
    let out = '';
    (th.layers || []).forEach(n => { out += `<div class="th-layer fx-${n}"></div>`; });
    if(th.html) out += th.html;
    (th.fx || []).forEach(c => { out += particles(c); });
    return out;
  }

  // ---------- aplicar ----------
  function apply(id){
    const th = BY_ID[id] || BY_ID[DEFAULT];
    if(appliedId === th.id) return;
    const body = document.body;
    applied.forEach(k => body.style.removeProperty(k));
    applied = [];
    Object.entries(th.vars || {}).forEach(([k, v]) => { body.style.setProperty(k, v); applied.push(k); });
    if(th.font){
      loadFont(th.font);
      body.style.setProperty('--display', th.font.stack); applied.push('--display');
    }
    body.dataset.theme = th.id;
    body.dataset.tier = th.tier;
    if(th.vars && th.vars['--shape']) body.dataset.shape = '1'; else delete body.dataset.shape;
    if(!fxEl){
      fxEl = document.createElement('div');
      fxEl.id = 'fx'; fxEl.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(fxEl, document.body.firstChild);
    }
    fxEl.innerHTML = buildFx(th);
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', (th.vars && th.vars['--bg']) || '#06060c');
    appliedId = th.id;
    ls.set(LS_THEME, th.id);
  }
  /** Reaplica o tema certo (equipado, ou a prévia do modo Debug). */
  function sync(){
    apply(currentId());
    paintChip();
  }

  // ---------- faixa do modo Debug ----------
  function paintChip(){
    let chip = document.getElementById('dbgChip');
    const p = previewId();
    if(!debugOn()){ if(chip) chip.remove(); return; }
    if(!chip){
      chip = document.createElement('div');
      chip.id = 'dbgChip'; chip.className = 'dbg-chip';
      document.body.appendChild(chip);
      chip.addEventListener('click', e => { if(e.target.closest('[data-dbg-off]')){ clearPreview(); } });
    }
    chip.innerHTML = p
      ? `<span>🧪 Prévia: <b>${esc(BY_ID[p].name)}</b></span><button type="button" data-dbg-off aria-label="Voltar ao meu tema">Sair da prévia</button>`
      : `<span>🧪 Modo Debug ligado</span>`;
  }
  function setPreview(id){
    if(!debugOn()) return;
    ss.set(SS_PREVIEW, id);
    sync();
    App.refreshView();
  }
  function clearPreview(){
    ss.del(SS_PREVIEW);
    sync();
    App.refreshView();
  }
  function setDebug(on){
    if(on) ls.set(LS_DEBUG, '1'); else { ls.del(LS_DEBUG); ss.del(SS_PREVIEW); }
    sync();
  }

  // ---------- peças da loja ----------
  function preview(th){
    const v = th.vars || {};
    const bgArt = v['--bg-art'] || 'linear-gradient(135deg, rgba(180,139,255,.25), rgba(255,160,60,.2))';
    const bg = v['--bg'] || '#06060c';
    const [c1, c2] = th.swatch;
    return `
      <div class="th-prev" style="background:${bgArt}, ${bg}">
        <i class="th-orb" style="background:linear-gradient(135deg, ${c1}, ${c2})"></i>
        <span class="th-bar" style="background:${c1}"></span>
        <span class="th-bar s" style="background:${c2}"></span>
        <span class="th-tag ${TIERS[th.tier].cls}">${TIERS[th.tier].label}</span>
      </div>`;
  }

  function priceTag(th){
    const s = me();
    return `<span class="th-price">${UI.coin(s, 18)}<b>${priceOf(th.id)}</b></span>`;
  }

  function actions(th){
    const s = me();
    const eq = equippedId() || DEFAULT;
    const dbg = debugOn();
    const test = dbg ? `<button class="btn small ghost" type="button" data-th-act="test" data-th="${th.id}">🧪 ${previewId() === th.id ? 'Testando' : 'Testar'}</button>` : '';
    if(th.tier === 'mitico') return `${test}`;
    if(owns(th.id)){
      return eq === th.id
        ? `<span class="th-on">${I.check}<span>Equipado</span></span>${test}`
        : `<button class="btn primary small" type="button" data-th-act="equip" data-th="${th.id}">Equipar</button>${test}`;
    }
    const can = App.wallets[s] >= priceOf(th.id);
    return `${priceTag(th)}<button class="btn ${can ? 'primary' : ''} small" type="button" data-th-act="buy" data-th="${th.id}" ${can ? '' : 'disabled'}>${can ? 'Comprar' : 'Faltam ' + (priceOf(th.id) - App.wallets[s])}</button>${test}`;
  }

  function card(th){
    const eq = (equippedId() || DEFAULT) === th.id;
    return `
      <article class="th-card ${TIERS[th.tier].cls} ${eq ? 'equipped' : ''}" data-th="${th.id}">
        ${preview(th)}
        <div class="th-body">
          <h3>${esc(th.name)}</h3>
          <p>${esc(th.tagline)}</p>
        </div>
        <div class="th-act">${actions(th)}</div>
      </article>`;
  }

  /** Cofre dos temas míticos: cada lado deposita moedas suas; quando os dois chegam na meta, libera para os dois. */
  function vaultCard(th){
    const s = me(), o = them();
    const goal = priceOf(th.id);
    const dep = side => vaultOf(th.id, side);
    const bar = side => {
      const pct = Math.min(100, Math.round(dep(side) / goal * 100));
      return `
        <div class="vault-row ${side}">
          ${UI.face(side, 22)}
          <div class="vault-bar"><i style="width:${pct}%"></i></div>
          <span class="vault-n">${UI.coin(side, 14)}<b>${dep(side)}</b>/${goal}</span>
        </div>`;
    };
    const unlocked = owns(th.id);
    const eq = (equippedId() || DEFAULT) === th.id;
    const dbg = debugOn();
    const test = dbg ? `<button class="btn small ghost" type="button" data-th-act="test" data-th="${th.id}">🧪 ${previewId() === th.id ? 'Testando' : 'Testar'}</button>` : '';
    let act;
    if(unlocked){
      act = eq ? `<span class="th-on">${I.check}<span>Equipado</span></span>${test}`
               : `<button class="btn primary small" type="button" data-th-act="equip" data-th="${th.id}">Equipar</button>${test}`;
    }else{
      const mine = dep(s);
      act = `
        ${mine < goal ? `<button class="btn primary small" type="button" data-th-act="deposit" data-th="${th.id}">Depositar</button>` : `<span class="th-wait">Sua parte está completa — esperando o ${name(o)}</span>`}
        ${mine > 0 ? `<button class="btn small ghost" type="button" data-th-act="withdraw" data-th="${th.id}">Retirar</button>` : ''}${test}`;
    }
    return `
      <article class="th-card th-vault ${TIERS[th.tier].cls} ${eq ? 'equipped' : ''} ${unlocked ? 'unlocked' : ''}" data-th="${th.id}">
        ${preview(th)}
        <div class="th-body">
          <h3>${esc(th.name)}</h3>
          <p>${esc(th.tagline)}</p>
          ${unlocked ? `<p class="vault-ok">${I.sparkle}<span>Liberado para os dois!</span></p>` : `
          <div class="vault">
            <small>Cofre do conjunto — cada lado deposita ${goal} das <b>suas</b> moedas</small>
            ${bar(s)}${bar(o)}
          </div>`}
        </div>
        <div class="th-act">${act}</div>
      </article>`;
  }

  function group(tier, intro){
    const list = CATALOG.filter(t => t.tier === tier);
    return `
      <section class="group th-group ${TIERS[tier].cls}">
        <header class="group-head"><h2>${TIERS[tier].label}</h2><span class="count">${list.length}</span></header>
        <p class="hint-line">${intro}</p>
        <div class="th-grid">${list.map(t => (tier === 'mitico' ? vaultCard(t) : card(t))).join('')}</div>
      </section>`;
  }

  /** Conteúdo da aba Loja → Temas. */
  function renderStore(){
    const has = id => CATALOG.some(t => t.tier === id);
    return `
      <p class="hint enter">${I.info}<span>Temas são só visual e todos são escuros. Você compra com as <b>suas</b> moedas e equipa o seu: o tema de um lado <b>não</b> muda a tela do outro.</span></p>
      <div class="th-group-first">${card(BY_ID[DEFAULT])}</div>
      ${group('simples', 'Só mudam as cores.')}
      ${group('raro', 'Cores e animação.')}
      ${has('lendario') ? group('lendario', 'Cores, animação e uma temática inteira.') : ''}
      ${has('mitico') ? group('mitico', 'Conjuntos: os dois depositam moedas no cofre para liberar — e libera para os dois.') : ''}`;
  }

  // ---------- ações ----------
  async function reloadAll(){
    await App.reload();
    sync();
    App.refreshView();
  }

  function depositForm(th, mode){
    const s = me();
    const goal = priceOf(th.id);
    const mine = vaultOf(th.id, s);
    const max = mode === 'deposit' ? Math.min(goal - mine, App.wallets[s]) : mine;
    if(max < 1){ UI.toast(mode === 'deposit' ? 'Você não tem moedas para depositar agora' : 'Nada para retirar', 'bad'); return; }
    const m = UI.openModal({
      title: mode === 'deposit' ? `Depositar — ${th.name}` : `Retirar — ${th.name}`,
      html: `
        <form class="form" data-form autocomplete="off">
          <p class="muted">${mode === 'deposit'
            ? `Sua parte do cofre é de ${goal} ${R.SIDES[s].coin}. Você já depositou ${mine}. Dá para retirar enquanto o tema não for liberado.`
            : `Você tem ${mine} ${R.SIDES[s].coin} neste cofre. As moedas voltam para a sua carteira.`}</p>
          <label class="field"><span>Quantas moedas?</span>
            <input class="time-big" type="number" name="n" min="1" max="${max}" step="1" value="${Math.min(max, 10)}" inputmode="numeric"></label>
          <div class="quick-days">
            <button type="button" class="qbtn" data-n="10">10</button>
            <button type="button" class="qbtn" data-n="50">50</button>
            <button type="button" class="qbtn" data-n="${max}">Tudo (${max})</button>
          </div>
          <div class="sheet-actions">
            <button class="btn" type="button" data-modal-close>Cancelar</button>
            <button class="btn primary" type="submit">${mode === 'deposit' ? 'Depositar' : 'Retirar'}</button>
          </div>
        </form>`
    });
    const form = m.body.querySelector('[data-form]');
    form.addEventListener('click', e => {
      const q = e.target.closest('[data-n]');
      if(q) form.elements.n.value = Math.min(max, Number(q.dataset.n));
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const n = Math.floor(Number(form.elements.n.value));
      if(!(n >= 1 && n <= max)){ UI.toast(`Escolha de 1 a ${max}`, 'bad'); return; }
      await UI.busy(form.querySelector('[type=submit]'), async () => {
        try{
          if(mode === 'deposit') await API.vaultDeposit(th.id, n); else await API.vaultWithdraw(th.id, n);
          m.close(true);
          const before = owns(th.id);
          await reloadAll();
          if(!before && owns(th.id)) UI.toast(`✨ ${th.name} liberado para os dois!`, 'good');
          else UI.toast(mode === 'deposit' ? `${n} moedas no cofre` : `${n} moedas de volta`, 'good');
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  function init(root){
    view = root;
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-th-act]');
      if(!b || App.current !== 'loja') return;
      const th = BY_ID[b.dataset.th];
      if(!th) return;
      const act = b.dataset.thAct;
      if(act === 'test'){ previewId() === th.id ? clearPreview() : setPreview(th.id); return; }
      if(act === 'deposit' || act === 'withdraw'){ depositForm(th, act); return; }
      await UI.busy(b, async () => {
        try{
          if(act === 'buy'){
            const ok = await UI.confirmBox({ title: `Comprar ${th.name}?`, text: `Custa ${R.pluralCoins(priceOf(th.id), me())}. O tema fica seu para sempre.`, yesLabel: 'Comprar' });
            if(!ok) return;
            await API.buyTheme(th.id);
            await reloadAll();
            UI.toast(`${th.name} é seu! Toque em Equipar.`, 'good');
          }else if(act === 'equip'){
            await API.equipTheme(th.id);
            if(previewId()) ss.del(SS_PREVIEW);
            await reloadAll();
            UI.toast(`Tema ${th.name} equipado`, 'good');
          }
        }catch(err){ UI.toast(err.message, 'bad'); }
      });
    });
  }

  // aplica logo ao carregar (último tema deste aparelho), antes dos dados chegarem
  try{ if(document.body) apply(BY_ID[ls.get(LS_THEME)] ? ls.get(LS_THEME) : DEFAULT); }catch(e){}

  return { init, sync, apply, renderStore, CATALOG, BY_ID, TIERS, debugOn, setDebug, previewId, setPreview, clearPreview, equippedId, owns, currentId, paintChip };
})();
