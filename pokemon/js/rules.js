/* ============================================================
   POKÉMON — regras do jogo como funções puras (sem tela, sem banco)

   Fonte: Guia do sistema de RPG + Ficha do treinador do mestre.
   Funciona no navegador (window.PKM_RULES) e no Node (module.exports),
   pra dar pra testar contra os exemplos do guia.
   ============================================================ */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.PKM_RULES = api;
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  // ---------- treinador ----------
  const TRAINER_ATTRS = [
    { key:'carisma',     label:'Carisma' },
    { key:'aparencia',   label:'Aparência' },
    { key:'resistencia', label:'Resistência' },
    { key:'mental',      label:'Mental' },
    { key:'fisico',      label:'Físico' }
  ];
  const TRAINER_BASE_HP = 30;
  const TRAINER_START_POINTS = 10;
  const POINTS_PER_LEVEL = 2;
  const TEAM_SIZE = 3;

  /** HP máximo do treinador = 30 + Físico. */
  function trainerMaxHp(fisico){ return TRAINER_BASE_HP + (Number(fisico) || 0); }

  /** XP pra passar do nível atual pro próximo = nível × 10. */
  function xpToNext(level){ return Math.max(1, Number(level) || 1) * 10; }

  /** Total de pontos de atributo que o treinador já ganhou: 10 na criação + 2 por nível acima do 1. */
  function pointsBudget(level){
    return TRAINER_START_POINTS + POINTS_PER_LEVEL * (Math.max(1, Number(level) || 1) - 1);
  }

  function pointsSpent(t){
    return TRAINER_ATTRS.reduce((s, a) => s + (Number(t[a.key]) || 0), 0);
  }

  /** Pontos que ainda dá pra distribuir (negativo = passou do que tem direito). */
  function pointsLeft(t){ return pointsBudget(t.level) - pointsSpent(t); }

  /** O treinador recebe metade do XP total ganho pelos seus Pokémon (em meios pontos). */
  function trainerShareOfCreatureXp(total){ return Math.floor(Number(total) || 0) / 2; }

  /** Dá XP a um treinador e devolve {level, xp, levelsGained} (o excedente é mantido). */
  function applyTrainerXp(level, xp, amount){
    let lv = Math.max(1, Number(level) || 1);
    let cur = (Number(xp) || 0) + (Number(amount) || 0);
    let gained = 0;
    while(cur >= xpToNext(lv)){ cur -= xpToNext(lv); lv++; gained++; }
    return { level: lv, xp: cur, levelsGained: gained };
  }

  /** Mostra XP em meios pontos: 12 -> "12", 12.5 -> "12,5". */
  function fmtXp(n){
    const v = Math.round((Number(n) || 0) * 2) / 2;
    return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
  }

  // ---------- criaturas: atributos ----------
  const STATS = [
    { key:'vit',        label:'Vitalidade',     short:'HP'  },
    { key:'forca',      label:'Força',          short:'FOR' },
    { key:'destreza',   label:'Destreza',       short:'DES' },
    { key:'deffis',     label:'Defesa Física',  short:'DEF' },
    { key:'defesp',     label:'Defesa Especial',short:'DEE' },
    { key:'velocidade', label:'Velocidade',     short:'VEL' },
    { key:'evasao',     label:'Evasão',         short:'EVA' },
    { key:'percepcao',  label:'Percepção',      short:'PER' },
    { key:'precisao',   label:'Precisão',       short:'PRE' }
  ];
  const MAX_LEVEL = 100;
  const IV_MIN = 1, IV_MAX = 20, POT_MIN = 1, POT_MAX = 10;

  // B(nível): curva-base, interpolada linearmente entre estes pontos
  const B_CURVE = [[1,15],[10,30],[20,50],[30,75],[40,100],[50,150],[60,300],[70,400],[80,500],[90,750],[100,1000]];

  function baseCurve(level){
    const lv = Math.min(MAX_LEVEL, Math.max(1, Number(level) || 1));
    for(let i = 1; i < B_CURVE.length; i++){
      const [x1, y1] = B_CURVE[i];
      if(lv <= x1){
        const [x0, y0] = B_CURVE[i - 1];
        return y0 + (y1 - y0) * (lv - x0) / (x1 - x0);
      }
    }
    return B_CURVE[B_CURVE.length - 1][1];
  }

  /** M(IV): IV 1 = 0,5×; IV 10 = 1×; IV 20 = 1,5×. */
  function ivMultiplier(iv){
    const v = Math.min(IV_MAX, Math.max(IV_MIN, Number(iv) || 10));
    return v <= 10 ? 0.5 + (v - 1) / 18 : 1 + (v - 10) / 20;
  }

  /** Atributo final = arredondar(B(nível) × Potencial ÷ 5 × M(IV)). */
  function statFinal(level, potential, iv){
    const pot = Math.min(POT_MAX, Math.max(POT_MIN, Number(potential) || POT_MIN));
    return Math.round(baseCurve(level) * pot / 5 * ivMultiplier(iv));
  }

  /** Os 9 atributos finais de uma criatura. `species` tem pot_<chave>; `creature` tem level e iv_<chave>. */
  function creatureStats(species, creature){
    const out = {};
    STATS.forEach(s => { out[s.key] = statFinal(creature.level, species['pot_' + s.key], creature['iv_' + s.key]); });
    return out;
  }

  /** HP máximo da criatura = Vitalidade final. */
  function creatureMaxHp(species, creature){
    return statFinal(creature.level, species.pot_vit, creature.iv_vit);
  }

  /** HP atual: o banco guarda nulo quando a criatura está com a vida cheia. */
  function creatureHp(species, creature){
    const max = creatureMaxHp(species, creature);
    return creature.hp_current == null ? max : Math.min(max, Math.max(0, creature.hp_current));
  }

  /** Dá XP a uma criatura (inteiro): sobe de nível até o 100 e mantém o excedente. */
  function applyCreatureXp(level, xp, amount){
    let lv = Math.min(MAX_LEVEL, Math.max(1, Number(level) || 1));
    let cur = (Number(xp) || 0) + (Number(amount) || 0);
    let gained = 0;
    while(lv < MAX_LEVEL && cur >= xpToNext(lv)){ cur -= xpToNext(lv); lv++; gained++; }
    return { level: lv, xp: cur, levelsGained: gained };
  }

  /** Movimento por ação = mín(20, máx(5, 5 + piso(Velocidade ÷ 200))). */
  function movementPerAction(velocidade){
    return Math.min(20, Math.max(5, 5 + Math.floor((Number(velocidade) || 0) / 200)));
  }

  /** Bônus de Percepção no d20 = piso(Percepção ÷ 150), no máximo +20. */
  function perceptionBonus(percepcao){
    return Math.min(20, Math.floor((Number(percepcao) || 0) / 150));
  }

  // ---------- tipos ----------
  // Fonte: tabelas ofensiva (adv/dis) e defensiva (res/imu) do guia, juntadas por par.
  const TYPE_DATA = {
    'Normal':   { adv:[], dis:['Tempo','Físico'], res:[], imu:['Fantasma'] },
    'Fogo':     { adv:['Gelo','Planta','Metal'], dis:['Água','Terra','Tempo'], res:['Fogo','Planta','Gelo','Inseto','Metal'], imu:[] },
    'Água':     { adv:['Fogo','Terra','Cristal'], dis:['Planta','Elétrico','Som','Gelo'], res:['Fogo','Água','Metal'], imu:[] },
    'Planta':   { adv:['Água','Terra','Cristal'], dis:['Fogo','Gelo','Inseto','Veneno','Voador'], res:['Água','Elétrico','Terra','Planta'], imu:['Tempo'] },
    'Gelo':     { adv:['Planta','Terra','Voador'], dis:['Fogo','Metal','Som','Físico'], res:['Gelo','Água','Planta'], imu:[] },
    'Inseto':   { adv:['Planta','Mente'], dis:['Fogo','Voador','Veneno','Metal','Físico'], res:['Planta','Terra'], imu:[] },
    'Voador':   { adv:['Planta','Inseto','Físico'], dis:['Elétrico','Gelo','Cristal'], res:['Planta','Inseto','Físico'], imu:['Terra'] },
    'Veneno':   { adv:['Planta','Inseto','Físico','Sangue'], dis:['Terra','Metal'], res:['Planta','Inseto','Veneno','Físico'], imu:[] },
    'Elétrico': { adv:['Água','Voador','Som'], dis:['Terra','Planta','Cristal'], res:['Elétrico','Voador','Metal'], imu:[] },
    'Físico':   { adv:['Normal','Gelo','Cristal','Inseto'], dis:['Voador','Veneno','Mente','Magia'], res:['Inseto','Físico'], imu:[] },
    'Fantasma': { adv:['Mente','Fantasma','Físico'], dis:['Sombrio','Luz','Magia'], res:['Veneno','Inseto'], imu:['Normal','Físico'] },
    'Sombrio':  { adv:['Mente','Fantasma'], dis:['Físico','Inseto','Luz','Magia'], res:['Sombrio','Fantasma'], imu:['Mente'] },
    'Mente':    { adv:['Físico','Normal'], dis:['Inseto','Fantasma','Sombrio'], res:['Mente','Físico'], imu:[] },
    'Magia':    { adv:['Físico','Sombrio'], dis:['Veneno','Metal','Fogo'], res:['Inseto','Sombrio','Dragão'], imu:[] },
    'Dragão':   { adv:['Dragão','Tempo'], dis:['Gelo','Magia','Metal','Espaço'], res:['Fogo','Água','Elétrico','Planta','Magia'], imu:['Tempo'] },
    'Metal':    { adv:['Gelo','Cristal','Magia'], dis:['Fogo','Água','Elétrico','Terra'], res:['Normal','Planta','Gelo','Voador','Inseto','Mente','Dragão','Metal'], imu:['Veneno'] },
    'Terra':    { adv:['Fogo','Elétrico','Veneno','Metal','Cristal'], dis:['Água','Planta','Gelo','Inseto'], res:['Veneno','Cristal','Fogo'], imu:['Elétrico'] },
    'Luz':      { adv:['Sombrio','Fantasma','Magia'], dis:['Metal','Espaço'], res:['Fantasma','Magia'], imu:['Luz'] },
    'Espaço':   { adv:['Tempo','Dragão','Luz'], dis:['Dragão','Som','Cristal'], res:['Elétrico','Mente','Espaço'], imu:[] },
    'Tempo':    { adv:['Normal','Espaço'], dis:['Gelo','Fantasma','Luz'], res:['Fogo','Elétrico','Tempo'], imu:[] },
    'Sangue':   { adv:['Água','Planta','Físico','Normal'], dis:['Fogo','Veneno','Gelo','Metal'], res:['Sangue','Água','Inseto'], imu:[] },
    'Cristal':  { adv:['Gelo','Elétrico','Luz','Som','Água'], dis:['Terra','Físico','Metal'], res:['Normal','Voador','Gelo','Cristal'], imu:[] },
    'Som':      { adv:['Água','Voador','Mente'], dis:['Elétrico','Cristal','Metal'], res:['Som','Físico','Água'], imu:[] }
  };
  const TYPES = Object.keys(TYPE_DATA);
  const MAX_TYPES = 3;

  /**
   * Multiplicador de um tipo de ataque contra UM tipo de defesa (0, 0.5, 1 ou 2).
   * Imunidade (tabela defensiva) vence tudo; fora isso vale o que as duas tabelas dizem.
   * Se uma diz 2× e a outra 0,5×, elas se anulam em 1×.
   */
  function typeVs(attack, defend){
    const a = TYPE_DATA[attack], d = TYPE_DATA[defend];
    if(!a || !d) return 1;
    if(d.imu.includes(attack)) return 0;
    const off = a.adv.includes(defend) && a.dis.includes(defend) ? 1 : a.adv.includes(defend) ? 2 : a.dis.includes(defend) ? 0.5 : 1;
    const def = d.res.includes(attack) ? 0.5 : 1;
    if(off === 1) return def;
    if(def === 1) return off;
    return off === def ? off : 1;
  }

  /**
   * Multiplicador de um tipo de ataque contra uma criatura de até 3 tipos.
   * Multiplica os tipos entre si, com as regras especiais do guia:
   *  - três resistências (0,5× em cada um dos 3 tipos) = imunidade (0×);
   *  - imunidade + tipo fraco (2×) = 0,5×; o terceiro tipo, se houver, aplica depois
   *    (outro 2× leva a 1×; 0,5× leva a 0,25×). Imunidade sem um 2× para anular continua 0×.
   */
  function typeMultiplier(attack, defTypes){
    const ms = (defTypes || []).slice(0, MAX_TYPES).map(t => typeVs(attack, t));
    if(!ms.length) return 1;
    if(ms.length === 3 && ms.every(m => m === 0.5)) return 0;
    const zeros = ms.filter(m => m === 0).length;
    if(zeros){
      let twos = ms.filter(m => m === 2).length;
      if(zeros > twos) return 0;
      let result = 1;
      let pairs = zeros;
      for(const m of ms){
        if(m === 0) continue;
        if(m === 2 && pairs > 0){ pairs--; result *= 0.5; continue; }
        result *= m;
      }
      return result;
    }
    return ms.reduce((p, m) => p * m, 1);
  }

  /** Tabela de fraquezas/resistências de uma criatura: [{ type, mult }] para os 23 tipos de ataque. */
  function typeChart(defTypes){
    return TYPES.map(t => ({ type: t, mult: typeMultiplier(t, defTypes) }));
  }

  // ---------- técnicas e combate ----------
  const PA_PER_TURN = 5;
  const MAX_TECHNIQUES = 4;
  const POWER_MIN = 1, POWER_MAX = 150;
  const CATEGORIES = [
    { key:'fisico',   label:'Física',   atk:'forca',    def:'deffis' },
    { key:'especial', label:'Especial', atk:'destreza', def:'defesp' }
  ];
  const POWER_BANDS = [
    { from:1,   label:'Inicial' },
    { from:50,  label:'Intermediária' },
    { from:80,  label:'Avançada' },
    { from:110, label:'Especial' },
    { from:130, label:'Muito poderosa e rara' }
  ];

  /** Faixa de Poder da técnica (Inicial, Intermediária…). */
  function powerBand(power){
    let label = POWER_BANDS[0].label;
    POWER_BANDS.forEach(b => { if(power >= b.from) label = b.label; });
    return label;
  }

  /**
   * Dano de uma técnica. Poder bruto = Poder × Ataque ÷ 200; antes do tipo = bruto × Ataque ÷ (Ataque + Defesa);
   * depois vem o multiplicador de tipo e só no fim se arredonda (mínimo 1, exceto imunidade = 0).
   * Exemplo do guia: Poder 100, Ataque 150, Defesa 150 → 37,5; com 2× → 75.
   */
  function techniqueDamage(power, atk, def, mult){
    const raw = power * atk / 200;
    const before = raw * atk / Math.max(1, atk + def);
    const exact = before * mult;
    const damage = mult === 0 ? 0 : Math.max(1, Math.round(exact));
    return { raw, before, mult, exact, damage };
  }

  /** Teste oposto: d20 + Precisão do atacante contra d20 + Evasão do alvo; empate favorece o atacante. */
  function hitTest(precisao, evasao, d20Atk, d20Def){
    const atk = d20Atk + precisao, def = d20Def + evasao;
    return { atk, def, hit: atk >= def };
  }

  /** Cura dos PA que sobraram: 4% da HP máxima por PA, no máximo 20% por turno. */
  function paHeal(paLeft, maxHp){
    const pct = Math.min(Math.max(0, paLeft) * 4, 20);
    return Math.round(maxHp * pct / 100);
  }

  /** Desempate de Velocidade por cara ou coroa (regra do guia). rng() < 0,5 = cara. */
  function resolveTies(ids, rng){
    const flip = rng || Math.random;
    let rest = ids.slice();
    const out = [];
    while(rest.length > 1){
      const heads = rest.filter(() => flip() < 0.5);
      if(heads.length === 1){
        out.push(heads[0]);
        rest = rest.filter(x => x !== heads[0]);
      }
      // ninguém, todas ou várias com cara: todas lançam de novo
    }
    return out.concat(rest);
  }

  /** Ordem de ação: maior Velocidade primeiro; empates por cara ou coroa. items = [{ id, speed }]. */
  function initiativeOrder(items, rng){
    const groups = new Map();
    items.forEach(it => {
      const k = Number(it.speed) || 0;
      if(!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it.id);
    });
    return Array.from(groups.keys()).sort((a, b) => b - a)
      .reduce((acc, k) => acc.concat(resolveTies(groups.get(k), rng)), []);
  }

  /** Distância no tabuleiro em blocos: a diagonal custa 1, então vale o maior dos dois eixos. */
  function gridDistance(a, b){
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  }

  const REACH_MIN = 1, REACH_MAX = 30;
  const BOARD_MIN = 8, BOARD_MAX = 30, BOARD_DEFAULT = 20;

  /** XP de uma batalha: cada criatura derrotada vale o próprio nível; quem participou recebe o total inteiro. */
  function battleXp(defeatedLevels){
    return defeatedLevels.reduce((s, l) => s + Math.max(0, Math.floor(Number(l) || 0)), 0);
  }

  return {
    PA_PER_TURN, MAX_TECHNIQUES, POWER_MIN, POWER_MAX, CATEGORIES, POWER_BANDS,
    powerBand, techniqueDamage, hitTest, paHeal, resolveTies, initiativeOrder, battleXp,
    gridDistance, REACH_MIN, REACH_MAX, BOARD_MIN, BOARD_MAX, BOARD_DEFAULT,
    TRAINER_ATTRS, TRAINER_BASE_HP, TRAINER_START_POINTS, POINTS_PER_LEVEL, TEAM_SIZE,
    trainerMaxHp, xpToNext, pointsBudget, pointsSpent, pointsLeft,
    trainerShareOfCreatureXp, applyTrainerXp, fmtXp,
    STATS, MAX_LEVEL, IV_MIN, IV_MAX, POT_MIN, POT_MAX, B_CURVE,
    baseCurve, ivMultiplier, statFinal, creatureStats, creatureMaxHp, creatureHp, applyCreatureXp,
    movementPerAction, perceptionBonus,
    TYPE_DATA, TYPES, MAX_TYPES, typeVs, typeMultiplier, typeChart
  };
});
