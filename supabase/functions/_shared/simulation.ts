// ============================================================
// Lógica de simulação do "avançar dia" — portada do imperio.html
// Roda no servidor (Edge Function), não no navegador de ninguém.
// ============================================================

function uid(prefix: string): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

function pushNotification(data: any, icon: string, text: string) {
  data.notifications.unshift({ id: uid('ntf'), day: data.day, icon, text });
  if (data.notifications.length > 60) data.notifications.pop();
}

function triggerHeatEvent(data: any, biz: any, tier: string) {
  if (tier === 'investigacao') {
    pushNotification(data, '🔎', `Investigação preliminar aberta sobre "${biz.name}" (calor ${Math.round(biz.heat)}%).`);
  } else if (tier === 'congelamento') {
    biz.frozenDaysLeft = 3 + Math.floor(Math.random() * 3);
    pushNotification(data, '🧊', `"${biz.name}" foi congelado por ${biz.frozenDaysLeft} dias após alerta financeiro.`);
  } else if (tier === 'invasao') {
    const loss = biz.illegal ? 0 : data.clean.balance * 0.15;
    biz.frozenDaysLeft = 6 + Math.floor(Math.random() * 4);
    if (loss > 0) {
      data.clean.balance -= loss;
      data.clean.transactions.push({ day: data.day, label: `Perda por invasão — ${biz.name}`, amount: -loss });
    }
    pushNotification(data, '🚨', `Invasão em "${biz.name}"! Operação parada e perdas registradas.`);
  }
}

function triggerPropertyHeatEvent(data: any, prop: any, tier: string) {
  if (tier === 'investigacao') {
    pushNotification(data, '🔎', `Investigação preliminar aberta sobre "${prop.name}" (calor ${Math.round(prop.heat)}%).`);
  } else if (tier === 'congelamento') {
    prop.frozenDaysLeft = 3 + Math.floor(Math.random() * 3);
    pushNotification(data, '🧊', `"${prop.name}" foi congelada por ${prop.frozenDaysLeft} dias após alerta financeiro.`);
  } else if (tier === 'invasao') {
    const loss = data.clean.balance * 0.1;
    prop.frozenDaysLeft = 6 + Math.floor(Math.random() * 4);
    if (loss > 0) {
      data.clean.balance -= loss;
      data.clean.transactions.push({ day: data.day, label: `Perda por invasão — ${prop.name}`, amount: -loss });
    }
    pushNotification(data, '🚨', `Invasão em "${prop.name}"! Propriedade interditada e perdas registradas.`);
  }
}

function triggerPropertyEvent(data: any, prop: any, forcedType: string | null) {
  const buffs = [
    { label: 'Pico de produtividade', percent: 12 + Math.floor(Math.random() * 13) },
    { label: 'Contrato bônus fechado', percent: 8 + Math.floor(Math.random() * 10) }
  ];
  const debuffs = [
    { label: 'Fornecimento atrasado', percent: -(10 + Math.floor(Math.random() * 15)) },
    { label: 'Funcionários doentes', percent: -(8 + Math.floor(Math.random() * 12)) },
    { label: 'Equipamento com defeito', percent: -(12 + Math.floor(Math.random() * 10)) }
  ];
  const pool = forcedType === 'buff' ? buffs : forcedType === 'debuff' ? debuffs : [...buffs, ...debuffs];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const days = 1 + Math.floor(Math.random() * 7);
  prop.activeEvent = { label: pick.label, percent: pick.percent, daysLeft: days, totalDays: days };
  pushNotification(data, pick.percent >= 0 ? '📈' : '📉', `"${prop.name}": ${pick.label} (${pick.percent > 0 ? '+' : ''}${pick.percent}% por ${days} dia(s)).`);
}

function applyCalendarEvent(data: any, ev: any, dayApplying: number) {
  let targetLabel = ev.title;
  let amount = 0;
  const acct = ev.mode === 'sujo' ? data.dirty : data.clean;

  if (ev.targetType === 'business') {
    const biz = data.businesses.find((b: any) => b.id === ev.targetId);
    if (biz) {
      amount = ev.valueType === 'percent' ? biz.dailyIncome * (ev.value / 100) : ev.value;
      targetLabel = `${ev.title} — ${biz.name}`;
    }
  } else if (ev.targetType === 'property') {
    const prop = data.properties.find((p: any) => p.id === ev.targetId);
    if (prop) {
      amount = ev.valueType === 'percent' ? prop.dailyIncome * (ev.value / 100) : ev.value;
      targetLabel = `${ev.title} — ${prop.name}`;
    }
  } else {
    amount = ev.valueType === 'fixed' ? ev.value : 0;
  }

  if (amount !== 0) {
    acct.balance += amount;
    acct.transactions.push({ day: dayApplying, label: targetLabel, amount });
  }
  ev.applied = true;
}

// Personagens atribuídos a um negócio/propriedade/pesquisa modificam certas
// estatísticas dele. Retorna o multiplicador combinado (1 = sem efeito).
function getModifierMultiplier(data: any, entityType: string, entityId: string, stat: string): number {
  const characters = data.characters || [];
  let totalPercent = 0;
  characters.forEach((c: any) => {
    if (c.assignedTo && c.assignedTo.type === entityType && c.assignedTo.id === entityId) {
      (c.modifiers || []).forEach((m: any) => {
        if (m.stat === stat) totalPercent += (m.percent || 0);
      });
    }
  });
  return 1 + (totalPercent / 100);
}

// Faz uma cópia do estado atual (sem o histórico, pra não duplicar o passado dentro dele mesmo)
function snapshotWithoutHistory(data: any) {
  const h = data.history;
  data.history = [];
  const clone = JSON.parse(JSON.stringify(data));
  data.history = h;
  return clone;
}

export function advanceDay(data: any) {
  const snapshot = snapshotWithoutHistory(data);
  data.history.push(snapshot);

  const dayApplying = data.day;

  // 1. Negócios
  data.businesses.forEach((biz: any) => {
    if (biz.status === 'developing') {
      biz.daysElapsed += 1;
      const accel = Math.floor(biz.investment / 10000);
      const effectiveDays = Math.max(1, biz.daysToComplete - accel);
      if (biz.daysElapsed >= effectiveDays) {
        biz.status = 'mature';
        pushNotification(data, '🏗️', `"${biz.name}" concluiu a fase de desenvolvimento e passou a operar.`);
      }
    } else if (biz.status === 'mature') {
      if (biz.frozenDaysLeft > 0) {
        biz.frozenDaysLeft -= 1;
        pushNotification(data, '🧊', `"${biz.name}" segue congelado. Sem renda hoje.`);
      } else {
        const incomeMult = getModifierMultiplier(data, 'business', biz.id, 'income');
        const heatGainMult = getModifierMultiplier(data, 'business', biz.id, 'heatGain');
        const eventRiskMult = getModifierMultiplier(data, 'business', biz.id, 'eventRiskChance');
        const income = biz.dailyIncome * incomeMult;

        const acct = biz.illegal ? data.dirty : data.clean;
        acct.balance += income;
        acct.transactions.push({ day: dayApplying, label: `Renda — ${biz.name}`, amount: income });

        if (!biz.illegal && biz.launderPercent > 0) {
          const laundered = income * (biz.launderPercent / 100);
          const actuallyLaundered = Math.min(laundered, data.dirty.balance);
          if (actuallyLaundered > 0) {
            data.dirty.balance -= actuallyLaundered;
            data.clean.balance += actuallyLaundered;
            data.dirty.transactions.push({ day: dayApplying, label: `Lavagem via ${biz.name}`, amount: -actuallyLaundered });
            data.clean.transactions.push({ day: dayApplying, label: `Entrada legitimada — ${biz.name}`, amount: actuallyLaundered });
          }
          const heatGain = (biz.launderPercent / 30) * heatGainMult;
          biz.heat = Math.min(100, biz.heat + heatGain);
        } else if (!biz.illegal) {
          biz.heat = Math.max(0, biz.heat - 1.5);
        }

        if (!biz.illegal && biz.heat > 20) {
          let chance = 0.04;
          let tier = 'investigacao';
          if (biz.heat > 80) { chance = 0.10; tier = 'invasao'; }
          else if (biz.heat > 50) { chance = 0.07; tier = 'congelamento'; }
          if (Math.random() < chance * eventRiskMult) {
            triggerHeatEvent(data, biz, tier);
          }
        }
      }
    }
  });

  // 2. Propriedades
  data.properties.forEach((prop: any) => {
    if (prop.frozenDaysLeft > 0) {
      prop.frozenDaysLeft -= 1;
      pushNotification(data, '🧊', `"${prop.name}" segue congelada. Sem renda hoje.`);
      return;
    }
    const incomeMult = getModifierMultiplier(data, 'property', prop.id, 'income');
    const heatGainMult = getModifierMultiplier(data, 'property', prop.id, 'heatGain');
    const eventRiskMult = getModifierMultiplier(data, 'property', prop.id, 'eventRiskChance');
    const baseIncome = prop.dailyIncome * incomeMult;
    let income = baseIncome - prop.maintenance;
    if (prop.activeEvent) {
      const mult = 1 + (prop.activeEvent.percent / 100);
      income = (baseIncome * mult) - prop.maintenance;
      prop.activeEvent.daysLeft -= 1;
      if (prop.activeEvent.daysLeft <= 0) {
        pushNotification(data, prop.activeEvent.percent >= 0 ? '📈' : '📉', `O evento "${prop.activeEvent.label}" em "${prop.name}" chegou ao fim.`);
        prop.activeEvent = null;
      }
    } else {
      if (Math.random() < 0.12) {
        triggerPropertyEvent(data, prop, null);
        const mult = 1 + (prop.activeEvent.percent / 100);
        income = (baseIncome * mult) - prop.maintenance;
      }
    }
    const acct = prop.illegal ? data.dirty : data.clean;
    acct.balance += income;
    acct.transactions.push({ day: dayApplying, label: `Renda líquida — ${prop.name}`, amount: income });

    if (!prop.illegal) {
      const launderPercent = prop.launderPercent || 0;
      if (launderPercent > 0) {
        const laundered = baseIncome * (launderPercent / 100);
        const actuallyLaundered = Math.min(laundered, data.dirty.balance);
        if (actuallyLaundered > 0) {
          data.dirty.balance -= actuallyLaundered;
          data.clean.balance += actuallyLaundered;
          data.dirty.transactions.push({ day: dayApplying, label: `Lavagem via ${prop.name}`, amount: -actuallyLaundered });
          data.clean.transactions.push({ day: dayApplying, label: `Entrada legitimada — ${prop.name}`, amount: actuallyLaundered });
        }
        prop.heat = Math.min(100, (prop.heat || 0) + (launderPercent / 30) * heatGainMult);
      } else {
        prop.heat = Math.max(0, (prop.heat || 0) - 1.5);
      }

      if (prop.heat > 20) {
        let chance = 0.04;
        let tier = 'investigacao';
        if (prop.heat > 80) { chance = 0.10; tier = 'invasao'; }
        else if (prop.heat > 50) { chance = 0.07; tier = 'congelamento'; }
        if (Math.random() < chance * eventRiskMult) {
          triggerPropertyHeatEvent(data, prop, tier);
        }
      }
    }
  });

  // 3. Pesquisas em andamento
  (data.researches || []).forEach((res: any) => {
    if (res.completed) return;
    const speedMult = getModifierMultiplier(data, 'research', res.id, 'researchSpeed');
    res.daysElapsed += 1 * speedMult;
    if (res.daysElapsed >= res.durationDays) {
      res.daysElapsed = res.durationDays;
      res.completed = true;
      pushNotification(data, res.legal ? '🔬' : '🧪', `Pesquisa "${res.name}" concluída — decida o que fazer com o resultado.`);
    }
  });

  // 4. Gastos fixos (a cada 30 dias)
  if (dayApplying % 30 === 0) {
    data.clean.fixedExpenses.forEach((exp: any) => {
      data.clean.balance -= exp.amount;
      data.clean.transactions.push({ day: dayApplying, label: `Gasto fixo — ${exp.label}`, amount: -exp.amount });
    });
  }

  // 5. Eventos do calendário com efeito
  data.events.forEach((ev: any) => {
    const isToday = ev.day === dayApplying;
    const isRecurringToday = ev.recurring && dayApplying >= ev.day && (!ev.recurEndDay || dayApplying <= ev.recurEndDay);
    if ((isToday || isRecurringToday) && ev.type === 'efeito') {
      applyCalendarEvent(data, ev, dayApplying);
    }
  });

  data.day += 1;
  return data;
}

export function goBackDay(data: any) {
  if (!data.history || data.history.length === 0) {
    throw new Error('Não há dias anteriores para voltar.');
  }
  const history = data.history;
  const prev = history.pop();
  prev.history = history;
  return prev;
}
