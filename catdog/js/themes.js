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

  /** Eclipse: disco escuro com coroa girando, a Lua (violeta) e o Sol (âmbar) orbitando. */
  function eclipseScene(){
    return `
      <div class="th-layer ec-rays"></div>
      <div class="th-layer ec-orbit"><i class="ec-moon"></i><i class="ec-sun"></i></div>
      <div class="th-layer ec-eclipse"><i class="ec-corona"></i><i class="ec-disc"></i><i class="ec-ring"></i></div>`;
  }

  /** Yin-yang girando, borrões de tinta e o selo vermelho. */
  function yinyangScene(){
    const yy = '<svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="97" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M100 3A97 97 0 0 1 100 197A48.5 48.5 0 0 1 100 100A48.5 48.5 0 0 0 100 3Z" fill="currentColor"/>'
      + '<circle cx="100" cy="51.5" r="14" fill="#0b0a0c"/><circle cx="100" cy="148.5" r="14" fill="currentColor"/></svg>';
    return `
      <div class="th-layer yy-wash a"></div><div class="th-layer yy-wash b"></div>
      <div class="th-layer yy-symbol">${yy}</div>
      <div class="th-layer yy-seal"><span>猫</span><span>犬</span></div>`;
  }

  /** Telhados: lua, nuvens, silhueta da cidade com janelas acendendo; o gato de um lado e o cão do outro. */
  function cityCluster(side){
    // [x, largura, altura] dentro de uma caixa 200 x 230
    const blds = side === 'l' ? [[0, 62, 118], [62, 72, 152], [134, 66, 96]] : [[0, 64, 100], [64, 76, 158], [140, 60, 124]];
    let g = '', k = 0;
    blds.forEach(([x, w, h]) => {
      g += `<rect x="${x}" y="${230 - h}" width="${w + 1}" height="${h}"/>`;
      for(let wy = 230 - h + 12; wy < 222; wy += 15){
        for(let wx = x + 9; wx < x + w - 8; wx += 14){
          k++;
          const r = sr(k + (side === 'l' ? 0 : 99));
          if(r < .42) g += `<rect class="skw${r < .12 ? ' bl' : ''}" x="${wx}" y="${wy}" width="6" height="8" style="animation-delay:-${(r * 40).toFixed(1)}s"/>`;
        }
      }
    });
    const cat = '<g class="pet cat" transform="translate(82 78)"><path class="tail" d="M18 70C-2 70 -4 44 8 34" /><ellipse cx="32" cy="56" rx="16" ry="20"/><circle cx="40" cy="30" r="11.5"/><polygon points="31,22 34,9 41,20"/><polygon points="41,20 49,10 51,24"/><circle class="eye" cx="37" cy="29" r="1.9"/><circle class="eye" cx="44" cy="29" r="1.9"/></g>';
    const dog = '<g class="pet dog" transform="translate(30 70)"><path class="tail" d="M52 74C66 72 70 58 62 48"/><ellipse cx="34" cy="58" rx="17" ry="21"/><ellipse cx="24" cy="30" rx="12.5" ry="11.5"/><ellipse cx="12" cy="35" rx="8.5" ry="5.5"/><ellipse class="ear" cx="33" cy="26" rx="5" ry="11" transform="rotate(16 33 26)"/><circle class="eye" cx="22" cy="27" r="1.9"/></g>';
    return `<svg viewBox="0 0 200 230" preserveAspectRatio="xMinYMax meet" aria-hidden="true">${g}${side === 'l' ? cat.replace('translate(82 78)', 'translate(76 2)') : dog.replace('translate(30 70)', 'translate(70 -7)')}</svg>`;
  }
  function cityScene(){
    let strip = '';
    for(let i = 0; i < 16; i++){
      const w = 40 + sr(i + 5) * 40, h = 20 + sr(i * 2 + 1) * 54, x = i * 64 + sr(i) * 10;
      strip += `<rect x="${x.toFixed(0)}" y="${(100 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"/>`;
    }
    return `
      <div class="th-layer ct-moon"></div>
      <div class="th-layer ct-cloud a"></div><div class="th-layer ct-cloud b"></div>
      <div class="th-layer ct-strip"><svg viewBox="0 0 1024 100" preserveAspectRatio="none" aria-hidden="true">${strip}</svg></div>
      <div class="th-layer ct-side l">${cityCluster('l')}</div>
      <div class="th-layer ct-side r">${cityCluster('r')}</div>`;
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
    { id:'cyberpunk', tier:'lendario', name:'Retro Wave', tagline:'Synthwave dos anos 80: sol listrado, grade em movimento, chuva de código e cartões de neon.', price:500,
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
    ,
    // ===== MÍTICOS — conjuntos (os dois lados depositam moedas para liberar) =====
    { id:'eclipse', tier:'mitico', name:'Eclipse', tagline:'A Lua e o Sol se encontrando: coroa girando, órbitas e bordas de ouro e prata.', price:600,
      pal:{ bg:'#06030c', a:'#ffc46b', a2:'#ff8a3d', c2:'#8c6bff' },
      sideAcc:{ gato:['#cdbdff', '#8c6bff'], cao:['#ffc46b', '#ff8a3d'] },
      vars:{ '--shape':'14px', '--surface':'rgba(14,7,28,.66)', '--surface2':'rgba(26,14,48,.74)', '--line':'rgba(255,200,120,.16)', '--line2':'rgba(200,170,255,.34)', '--stars-o':'.7',
        '--bg-art':'radial-gradient(700px 520px at 50% 18%, rgba(255,196,107,.16), transparent 62%), radial-gradient(900px 600px at 50% 0%, rgba(140,107,255,.2), transparent 66%), radial-gradient(600px 400px at 50% 110%, rgba(140,107,255,.14), transparent 65%)' },
      font: font('Cinzel', 'Cinzel:wght@600;800'),
      html: eclipseScene(),
      fx:[{ t:'twinkle', n:60, c:['#ffffff', '#ffe9c4', '#dcd2ff'], s:[1, 2.4], d:[2.5, 7], o:.95 }] },

    { id:'yin-yang', tier:'mitico', name:'Yin-Yang', tagline:'Tinta e papel: um equilíbrio girando, borrões de nanquim, pétalas e o selo vermelho.', price:600,
      pal:{ bg:'#0b0a0c', a:'#e8402f', a2:'#ff8a5c', c2:'#f1ece0' },
      sideAcc:{ gato:['#f1ece0', '#b9b2a2'], cao:['#e8402f', '#ff8a5c'] },
      vars:{ '--shape':'3px', '--surface':'rgba(22,19,19,.7)', '--surface2':'rgba(34,29,29,.78)', '--line':'rgba(241,236,224,.14)', '--line2':'rgba(241,236,224,.34)', '--text':'#f1ece0', '--muted':'#aaa396', '--faint':'#6c675d', '--stars-o':'0',
        '--bg-art':'radial-gradient(120% 90% at 50% 40%, transparent 50%, rgba(0,0,0,.6)), radial-gradient(500px 360px at 18% 12%, rgba(241,236,224,.06), transparent 70%), repeating-linear-gradient(0deg, rgba(255,255,255,.012) 0 2px, transparent 2px 5px)' },
      font: font('Shippori Mincho', 'Shippori+Mincho:wght@500;800', "'Noto Serif JP', serif"),
      html: yinyangScene(),
      fx:[{ t:'fall', n:12, c:['#f1ece0', '#e8402f'], s:[12, 20], d:[14, 26], o:.5, dx:90, ch:['🌸', '🌸', '❀'] }] },

    { id:'telhados', tier:'mitico', name:'Telhados da cidade', tagline:'Noite na cidade: o gato e o cão nos telhados, janelas acendendo e a lua alta.', price:600,
      pal:{ bg:'#070b1c', a:'#ffd36b', a2:'#ff9a5a', c2:'#6bb8ff' },
      sideAcc:{ gato:['#7db8ff', '#9a8aff'], cao:['#ffd36b', '#ff9a5a'] },
      vars:{ '--shape':'24px', '--surface':'rgba(10,16,40,.62)', '--surface2':'rgba(18,26,60,.7)', '--line':'rgba(125,184,255,.16)', '--line2':'rgba(255,211,107,.3)', '--stars-o':'.55',
        '--bg-art':'linear-gradient(180deg, rgba(40,52,120,.35), transparent 60%), radial-gradient(800px 520px at 80% 8%, rgba(125,184,255,.16), transparent 62%)' },
      font: font('Fredoka', 'Fredoka:wght@500;600;700'),
      html: cityScene(),
      fx:[{ t:'twinkle', n:46, c:['#ffffff', '#cfe0ff', '#ffe9b0'], s:[1, 2.4], d:[2.5, 7], o:.9 }, { t:'streak', n:2, c:'#e6f0ff', s:[80, 130], d:[10, 18], o:.8 }] }
  ];

  // ---------- relógio da tela Hoje (raros, lendários e míticos têm o seu) ----------
  // minor/major: marcas dos minutos e das horas (line · dot · square · diamond · star · window · none)
  // hand: estilo dos ponteiros (CSS .hs-<nome>) · pad: formato do miolo (circle · square · squircle · cut)
  // tip / tipH: peça na ponta do ponteiro de segundos / de horas
  const CLOCKS = {
    'aurora':             { minor:'dot',    major:'dot',     hand:'glow',   tip:'✨' },
    'pulso-neon':         { minor:'line',   major:'line',    hand:'neon' },
    'chuva-estrelas':     { minor:'dot',    major:'star',    hand:'thin',   tip:'☄️' },
    'lava-lamp':          { minor:'none',   major:'dot',     hand:'fat' },
    'mare':               { minor:'dot',    major:'dot',     hand:'glass',  tip:'🫧' },
    'cyberpunk':          { minor:'line',   major:'diamond', hand:'retro',  pad:'cut' },
    'abismo':             { minor:'dot',    major:'dot',     hand:'glass',  tip:'🐠' },
    'floresta-encantada': { minor:'dot',    major:'diamond', hand:'twig',   tip:'🍃' },
    'cosmos':             { minor:'dot',    major:'star',    hand:'thin',   tip:'🪐' },
    'arcade':             { minor:'square', major:'square',  hand:'block',  pad:'square', tip:'👾' },
    'eclipse':            { minor:'line',   major:'dot',     hand:'gold',   tip:'☀️', tipH:'🌙' },
    'yin-yang':           { minor:'dot',    major:'dot',     hand:'brush' },
    'telhados':           { minor:'none',   major:'window',  hand:'round',  pad:'squircle', tip:'🐾' }
  };
  CATALOG.forEach(t => { if(CLOCKS[t.id]) t.clock = CLOCKS[t.id]; });

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
  let appliedSide = null;
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
    const acc = th.sideAcc && window.App && App.side ? th.sideAcc[App.side] : null;
    const vars = acc ? { ...th.vars, '--a': acc[0], '--a2': acc[1], '--ag': rgba(acc[0], .34) } : (th.vars || {});
    Object.entries(vars).forEach(([k, v]) => { body.style.setProperty(k, v); applied.push(k); });
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
    const want = currentId();
    if(want === appliedId && BY_ID[want].sideAcc && appliedSide !== (window.App && App.side)) appliedId = null;   // acento depende do lado
    apply(want);
    appliedSide = window.App && App.side;
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

  // ---------- abas por raridade ----------
  const TAB_ORDER = ['simples', 'raro', 'lendario', 'mitico'];
  const TAB_TEXT = {
    simples:  ['Simples', 'Só mudam as cores.'],
    raro:     ['Raros', 'Cores e animação (e o relógio ganha um visual próprio).'],
    lendario: ['Lendários', 'Cores, animação e uma temática inteira: fonte, formas, cenas e relógio.'],
    mitico:   ['Míticos', 'Conjuntos: os dois depositam moedas no cofre para liberar — e libera para os dois.']
  };
  let themeTab = null;
  function currentTab(){
    if(!themeTab) themeTab = ss.get('catdog.themeTab');
    if(!TAB_ORDER.includes(themeTab)){
      const eq = BY_ID[equippedId() || DEFAULT];
      themeTab = TAB_ORDER.includes(eq.tier) ? eq.tier : 'simples';
    }
    return themeTab;
  }
  function tabsBar(){
    const cur = currentTab();
    return `<nav class="seg th-tabs" aria-label="Raridade">${TAB_ORDER.map(t => {
      const list = CATALOG.filter(x => x.tier === t);
      const own = list.filter(x => owns(x.id)).length;
      return `<button class="seg-btn ${TIERS[t].cls} ${cur === t ? 'on' : ''}" type="button" data-th-tab="${t}"><i class="th-dot"></i><span>${TAB_TEXT[t][0]}</span><b>${own}/${list.length}</b></button>`;
    }).join('')}</nav>`;
  }

  /** Conteúdo da aba Loja → Temas. */
  function renderStore(){
    const cur = currentTab();
    const list = CATALOG.filter(t => t.tier === cur);
    return `
      <p class="hint enter">${I.info}<span>Temas são só visual e todos são escuros. Você compra com as <b>suas</b> moedas e equipa o seu: o tema de um lado <b>não</b> muda a tela do outro.</span></p>
      ${tabsBar()}
      <section class="group th-group ${TIERS[cur].cls}">
        <p class="hint-line">${TAB_TEXT[cur][1]}</p>
        ${cur === 'simples' ? `<div class="th-group-first">${card(BY_ID[DEFAULT])}</div>` : ''}
        <div class="th-grid">${list.map(t => (cur === 'mitico' ? vaultCard(t) : card(t))).join('')}</div>
      </section>`;
  }

  /** Configuração do relógio do tema em uso (a tela Hoje desenha o relógio a partir disto). */
  function clockCfg(){
    const t = BY_ID[currentId()];
    return (t && t.clock) || {};
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
      const tb = e.target.closest('[data-th-tab]');
      if(tb && App.current === 'loja'){ themeTab = tb.dataset.thTab; ss.set('catdog.themeTab', themeTab); App.refreshView(); return; }
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

  return { init, sync, apply, renderStore, clockCfg, CATALOG, BY_ID, TIERS, debugOn, setDebug, previewId, setPreview, clearPreview, equippedId, owns, currentId, paintChip };
})();
