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

  return {
    TRAINER_ATTRS, TRAINER_BASE_HP, TRAINER_START_POINTS, POINTS_PER_LEVEL, TEAM_SIZE,
    trainerMaxHp, xpToNext, pointsBudget, pointsSpent, pointsLeft,
    trainerShareOfCreatureXp, applyTrainerXp, fmtXp
  };
});
