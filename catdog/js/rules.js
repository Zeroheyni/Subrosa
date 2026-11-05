/* ============================================================
   CAT & DOG — regras puras (sem tela, sem banco). Testáveis no Node.

   Lados (as chaves guardam o LADO = cor + moeda; o bicho é o contrário da chave):
     'gato' = jogador  → é o CÃO  · ganha moedas felinas (violeta)
     'cao'  = mestre   → é o GATO · ganha moedas caninas (âmbar)
   Cada um ganha a moeda do outro bicho.
   Quem define o valor (em moedas) da parte do lado X é o OUTRO lado.
   O banco é quem paga as moedas (catdog_reconcile); aqui só espelhamos
   as regras para mostrar na tela o que vale e o que está pendente.
   ============================================================ */
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.CD_RULES = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  const TZ = 'America/Sao_Paulo';
  const ONE_OFF_PERIOD = '2000-01-01';
  const END_OF_DAY = '23:59';             // prazo só com data guarda 23:59 (vence no fim do dia)
  const BONUS_RATE = 0.5;                // bônus de "cada um marca a sua parte" quando os dois concluem

  const SIDES = {
    gato: { key:'gato', label:'Cão',  animal:'dog', coin:'moedas felinas', coinOne:'moeda felina', coinWord:'felinas', role:'Jogador' },
    cao:  { key:'cao',  label:'Gato', animal:'cat', coin:'moedas caninas', coinOne:'moeda canina', coinWord:'caninas', role:'Mestre' }
  };
  const other = side => (side === 'gato' ? 'cao' : 'gato');

  const MODES = {
    parts: { key:'parts', label:'Cada um faz a sua parte', short:'Cada um a sua parte', text:'Cada um marca a própria parte e ganha as próprias moedas. Se os dois cumprirem, os dois levam um bônus de 50%.' },
    any:   { key:'any',   label:'Qualquer um conclui',     short:'Qualquer um',   text:'Quem marcar primeiro conclui para os dois, e só quem fez ganha as moedas.' },
    both:  { key:'both',  label:'Só vale com os dois',     short:'Só com os dois', text:'Ninguém ganha nada até os dois concluírem; aí os dois ganham juntos.' }
  };
  const HINTS = {
    facil:   { key:'facil',   label:'Fácil',   suggest:1 },
    media:   { key:'media',   label:'Média',   suggest:3 },
    dificil: { key:'dificil', label:'Difícil', suggest:5 }
  };
  const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const VALUE_MAX = 500;

  // ---------- datas (sempre no fuso de São Paulo) ----------
  function todayISO(now){
    const d = now instanceof Date ? now : new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d);
    const g = t => parts.find(p => p.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  }
  /** Dia da semana (0 = domingo) de uma data ISO yyyy-mm-dd. */
  const dowOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
  const addDays = (iso, n) => {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  /** yyyy-mm-dd (em São Paulo) de um instante. */
  const dayOf = ts => todayISO(new Date(ts));
  /** hh:mm (em São Paulo) de um instante. */
  function timeOf(ts){
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date(ts));
  }
  const fmtDay = iso => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}`;
  };

  // ---------- tarefas ----------
  const isRepeating = t => t.repeat !== 'none';
  const periodOf = (t, today) => (isRepeating(t) ? today : ONE_OFF_PERIOD);
  const isDayOf = (t, today) => t.repeat === 'none' || t.repeat === 'daily' || (t.repeat === 'weekly' && t.repeat_days.includes(dowOf(today)));
  const relevantTo = (t, side) => t.owner === side || t.owner === 'ambos';
  const valueOf = (t, side) => (side === 'gato' ? t.value_gato : t.value_cao);
  const hasValue = (t, side) => valueOf(t, side) !== null && valueOf(t, side) !== undefined;

  /** Lados cuja parte pertence à tarefa. */
  const partsOf = t => (t.owner === 'ambos' ? ['gato', 'cao'] : [t.owner]);

  /** O que eu (side) preciso valorar: partes do OUTRO lado ainda sem valor. */
  const needsMyValue = (t, side) => {
    const o = other(side);
    return partsOf(t).includes(o) && !hasValue(t, o);
  };

  /**
   * Situação de uma tarefa hoje. `comps` = lista de conclusões (task_id, side, period).
   * done[side]: o lado concluiu a parte (em "any", conta se qualquer um concluiu → doneBy)
   * complete: a tarefa inteira está concluída segundo o modo
   */
  function status(t, comps, today){
    const period = periodOf(t, today);
    const mine = comps.filter(c => c.task_id === t.id && c.period === period);
    const has = s => mine.some(c => c.side === s);
    const done = { gato: has('gato'), cao: has('cao') };
    let complete;
    if(t.owner !== 'ambos') complete = done[t.owner];
    else if(t.shared_mode === 'any') complete = done.gato || done.cao;
    else complete = done.gato && done.cao;
    const doneBy = t.shared_mode === 'any' ? (done.gato ? 'gato' : done.cao ? 'cao' : null) : null;
    const when = mine.length ? mine.map(c => c.completed_at).sort().slice(-1)[0] : null;
    return { period, done, complete, doneBy, when };
  }

  /** Posso marcar/desmarcar a minha parte agora? */
  function canToggle(t, side, st, today){
    if(!relevantTo(t, side)) return false;
    if(!isDayOf(t, today)) return false;
    if(t.shared_mode === 'any' && st.doneBy && st.doneBy !== side) return false;
    return true;
  }

  /** Quanto eu ganho nesta tarefa (já descontando o que depende dos dois), para mostrar na tela. */
  function myReward(t, side){
    if(!relevantTo(t, side) || !hasValue(t, side)) return null;
    const v = valueOf(t, side);
    return { value: v, bonus: t.shared_mode === 'parts' ? Math.ceil(v * BONUS_RATE) : 0 };
  }

  // ---------- prazo em texto ----------
  function dueInfo(t, now){
    const n = now instanceof Date ? now : new Date();
    const today = todayISO(n);
    if(t.repeat === 'daily') return { text: 'Todo dia' + (t.due_time ? ' · ' + t.due_time.slice(0, 5) : ''), overdue:false, repeat:true };
    if(t.repeat === 'weekly'){
      const names = t.repeat_days.slice().sort((a, b) => a - b).map(d => WEEKDAYS[d]);
      const txt = t.repeat_days.length === 7 ? 'Todo dia' : names.join(', ');
      return { text: txt + (t.due_time ? ' · ' + t.due_time.slice(0, 5) : ''), overdue:false, repeat:true };
    }
    if(!t.due_at) return { text: '', overdue:false, repeat:false };
    const d = dayOf(t.due_at);
    const hh = timeOf(t.due_at);
    const showTime = hh !== END_OF_DAY;     // 23:59 = "o dia todo" (data sem hora)
    let day;
    if(d === today) day = 'Hoje';
    else if(d === addDays(today, 1)) day = 'Amanhã';
    else if(d === addDays(today, -1)) day = 'Ontem';
    else day = fmtDay(d);
    return { text: day + (showTime ? ' · ' + hh : ''), overdue: new Date(t.due_at) < n, repeat:false, day: d };
  }

  /** Agrupa as tarefas do lado para a tela "Hoje". */
  function todayGroups(tasks, comps, side, now){
    const n = now instanceof Date ? now : new Date();
    const today = todayISO(n);
    const g = { overdue:[], today:[], someday:[], done:[] };
    for(const t of tasks){
      if(!relevantTo(t, side)) continue;
      const st = status(t, comps, today);
      const myDone = t.shared_mode === 'any' ? st.complete : st.done[side];
      if(isRepeating(t)){
        if(!isDayOf(t, today)) continue;
        (myDone ? g.done : g.today).push(t);
      }else if(myDone){
        if(st.when && dayOf(st.when) === today) g.done.push(t);
      }else if(!t.due_at){
        g.someday.push(t);
      }else{
        const d = dayOf(t.due_at);
        if(new Date(t.due_at) < n && d < today) g.overdue.push(t);
        else if(d <= today) g.today.push(t);       // hoje (mesmo que a hora já passou)
      }
    }
    const key = t => (t.due_at ? new Date(t.due_at).getTime() : t.due_time ? new Date('2000-01-01T' + t.due_time).getTime() - 9e12 : 1e15);
    const byDue = (a, b) => key(a) - key(b) || a.created_at.localeCompare(b.created_at);
    g.overdue.sort(byDue); g.today.sort(byDue); g.someday.sort(byDue); g.done.sort(byDue);
    return g;
  }

  /** Lista da aba "Tarefas": separa em ativas e concluídas. */
  function listFor(tasks, comps, filter, side, now){
    const n = now instanceof Date ? now : new Date();
    const today = todayISO(n);
    const o = other(side);
    const pick = t => filter === 'minhas' ? t.owner === side
                    : filter === 'juntas' ? t.owner === 'ambos'
                    : filter === 'outro' ? t.owner === o
                    : filter === 'avaliar' ? needsMyValue(t, side)
                    : false;
    const active = [], finished = [];
    for(const t of tasks){
      if(!pick(t)) continue;
      const st = status(t, comps, today);
      const doneNow = isRepeating(t) ? st.complete : st.complete;
      (doneNow ? finished : active).push(t);
    }
    const when = t => (t.due_at ? new Date(t.due_at).getTime() : 8e15);
    active.sort((a, b) => when(a) - when(b) || a.created_at.localeCompare(b.created_at));
    finished.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { active, finished };
  }

  // ---------- sequência (streak): marcos em dias → moedas de bônus (os mesmos do banco) ----------
  const STREAK_MILESTONES = [[3, 3], [7, 10], [14, 20], [30, 50], [60, 100], [100, 200]];
  function nextMilestone(cur){
    let prev = 0;
    for(const [days, bonus] of STREAK_MILESTONES){
      if(cur < days) return { days, bonus, left: days - cur, prev };
      prev = days;
    }
    return null;
  }

  // ---------- loja ----------
  const isOwnReward = r => r.owner === r.for_side;
  const rewardsToBuy = (rewards, side) => rewards.filter(r => r.for_side === side && r.active);
  const rewardsOffered = (rewards, side) => rewards.filter(r => r.owner === side);
  const toFulfill = (purchases, side) => purchases.filter(p => p.provider === side && p.status === 'pending');
  const waitingFor = (purchases, side) => purchases.filter(p => p.buyer === side && p.provider !== side && p.status === 'pending');

  const pluralCoins = (n, side) => `${n} ${Math.abs(n) === 1 ? SIDES[side].coinOne : SIDES[side].coin}`;

  return {
    TZ, ONE_OFF_PERIOD, END_OF_DAY, BONUS_RATE, SIDES, MODES, HINTS, WEEKDAYS, VALUE_MAX, other,
    todayISO, dowOf, addDays, dayOf, timeOf, fmtDay,
    isRepeating, periodOf, isDayOf, relevantTo, valueOf, hasValue, partsOf, needsMyValue,
    status, canToggle, myReward, dueInfo, todayGroups, listFor, pluralCoins,
    STREAK_MILESTONES, nextMilestone, isOwnReward, rewardsToBuy, rewardsOffered, toFulfill, waitingFor
  };
});
