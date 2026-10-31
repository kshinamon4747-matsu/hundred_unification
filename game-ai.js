'use strict';

function borderTargets(id, ownerTest) {
  const out = new Set();
  state.tiles.forEach((t, i) => {
    if (t.owner === id && !t.occupation)
      neighbors(i).forEach((n) => {
        if (ownerTest(state.tiles[n].owner)) out.add(n);
      });
  });
  return [...out];
}
function capitalConnectedCount(owner, skip = -1) {
  const capital = state.tiles.findIndex((t, i) => i !== skip && t.owner === owner && t.capital);
  if (capital < 0) return 0;
  const seen = new Set([capital]),
    queue = [capital];
  while (queue.length) {
    for (const n of neighbors(queue.shift()))
      if (n !== skip && state.tiles[n].owner === owner && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return seen.size;
}
function supplyCutValue(i, owner) {
  const before = capitalConnectedCount(owner),
    after = capitalConnectedCount(owner, i);
  return Math.max(0, before - after - 1);
}
function distance(a, b) {
  return Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) + Math.abs((a % 10) - (b % 10));
}
function threatensOwnCapital(id, i) {
  const capital = state.tiles.findIndex((t) => t.owner === id && t.capital);
  return (
    capital >= 0 &&
    state.tiles[i].owner !== id &&
    state.tiles[i].owner !== 'neutral' &&
    distance(i, capital) <= 2
  );
}
function shouldAvoidContestedTarget(id, i) {
  const t = state.tiles[i];
  return recentCaptureCount(t) >= 2 && !t.capital && !threatensOwnCapital(id, i);
}
function ignoresWarFatigue(id, i) {
  return threatensOwnCapital(id, i) || state.tiles[i].capital;
}
function warFatiguePriorityPenalty(id, i) {
  if (ignoresWarFatigue(id, i)) return 0;
  const fatigue = warFatigueValue(id, state.tiles[i].owner);
  return fatigue >= 30 ? (fatigue - 20) * 0.4 : 0;
}
function targetScore(id, i) {
  const t = state.tiles[i],
    owner = t.owner,
    capital = state.tiles.findIndex((x) => x.owner === owner && x.capital),
    cut = supplyCutValue(i, owner),
    f = state.factions[id],
    profile = AI_PROFILE[id];
  let score = Math.random() * 5 - tileDefense(i) * 1.2;
  if (threatensOwnCapital(id, i)) {
    const ownCapital = state.tiles.findIndex((x) => x.owner === id && x.capital);
    score += 230 + (3 - distance(i, ownCapital)) * 30;
  }
  if (t.isolation) score += 48 + Math.min(20, t.isolation * 2);
  if (cut) score += 32 + cut * 9;
  if (t.capital) score += 150;
  else if (capital >= 0) {
    const d = distance(i, capital);
    score += Math.max(0, 28 - d * 4);
    if (neighbors(i).includes(capital)) score += 42;
  }
  if (t.building && t.building !== 'capital') score += BUILDINGS[t.building]?.cost / 6 || 0;
  if (shouldAvoidContestedTarget(id, i)) score -= 180;
  if (t.capital || (capital >= 0 && neighbors(i).includes(capital))) score += profile.capitalBias;
  if (cut) score += profile.cutBias * cut;
  if (t.building === profile.preferredTarget) score += profile.targetBias;
  score += (Math.floor(f.army * 0.68) + support(i, id) - tileDefense(i)) * 1.4;
  if (owner === threatLeader() && owner !== id && threatLevel() === 1) score += 30;
  score -= warFatiguePriorityPenalty(id, i);
  return score;
}
const AI_PROFILE = {
  red: {
    style: 'offensive',
    attack: 0.78,
    normal: 1.02,
    strategic: 0.9,
    reserve: 13,
    armyScale: 0.84,
    armyBase: 6,
    recruitRatio: 0.8,
    recruitFood: 26,
    minRecruitPopulation: 8,
    maxRecruit: 2,
    secondRecruitPopulation: 14,
    settle: 0.48,
    farmLand: 6,
    townLand: 7,
    barracksLand: 10,
    fortLand: 18,
    buildCycle: ['barracks', 'farm', 'town', 'town', 'fort'],
    preferredTarget: 'barracks',
    targetBias: 6,
    capitalBias: 8,
    cutBias: 5,
  },
  blue: {
    style: 'commercial',
    attack: 0.65,
    normal: 1.08,
    strategic: 0.94,
    reserve: 18,
    armyScale: 0.72,
    armyBase: 4,
    recruitRatio: 0.75,
    recruitFood: 34,
    minRecruitPopulation: 10,
    maxRecruit: 2,
    secondRecruitPopulation: 18,
    secondRecruitChance: 0.3,
    settle: 0.5,
    farmLand: 6,
    townLand: 7,
    barracksLand: 13,
    fortLand: 20,
    buildCycle: ['town', 'farm', 'town', 'barracks', 'fort'],
    preferredTarget: 'town',
    targetBias: 10,
    capitalBias: 6,
    cutBias: 3,
  },
  ochre: {
    style: 'sustained',
    attack: 0.74,
    normal: 0.98,
    strategic: 0.85,
    reserve: 13,
    armyScale: 0.84,
    armyBase: 4,
    recruitRatio: 0.9,
    recruitFood: 20,
    minRecruitPopulation: 9,
    maxRecruit: 2,
    secondRecruitPopulation: 15,
    settle: 0.6,
    farmLand: 4,
    townLand: 8,
    barracksLand: 9,
    fortLand: 16,
    buildCycle: ['farm', 'town', 'barracks', 'fort', 'farm'],
    preferredTarget: 'farm',
    targetBias: 8,
    capitalBias: 7,
    cutBias: 4,
  },
};
function strategicTarget(id, i) {
  const t = state.tiles[i],
    capital = state.tiles.findIndex((x) => x.owner === t.owner && x.capital);
  return !!(
    threatensOwnCapital(id, i) ||
    t.isolation ||
    t.capital ||
    supplyCutValue(i, t.owner) ||
    (capital >= 0 && neighbors(i).includes(capital))
  );
}
function aiArmyGoal(id) {
  const profile = AI_PROFILE[id];
  return Math.max(16, Math.ceil(land(id) * profile.armyScale) + profile.armyBase);
}
function shouldAiAttack(id, i) {
  const f = state.factions[id],
    profile = AI_PROFILE[id],
    t = state.tiles[i],
    capitalDefense = threatensOwnCapital(id, i),
    strategic = strategicTarget(id, i),
    expectedAttack = Math.floor(f.army * 0.68) + support(i, id) + 3,
    expectedDefense = tileDefense(i) + 3,
    ratio = expectedAttack / Math.max(1, expectedDefense),
    expectedLoss = Math.max(1, Math.ceil(expectedDefense / 5)),
    reserve = capitalDefense
      ? Math.max(3, Math.ceil(land(id) / 10))
      : Math.max(profile.reserve, Math.ceil(land(id) / 4)),
    latePressure = Math.max(0, Math.min(0.22, (state.year - 100) / 500)),
    threshold =
      (capitalDefense
        ? Math.min(profile.strategic, 0.78)
        : strategic
          ? profile.strategic
          : profile.normal) - latePressure;
  if (t.occupation === 2 || shouldAvoidContestedTarget(id, i) || f.army < 7 || ratio < threshold)
    return false;
  return t.capital || f.army - expectedLoss >= reserve;
}
function chooseAiTarget(id, targets) {
  const viable = targets.filter((i) => shouldAiAttack(id, i));
  return viable.length
    ? viable.map((i) => ({ i, score: targetScore(id, i) })).sort((a, b) => b.score - a.score)[0].i
    : null;
}
function canAiRecruit(id) {
  const f = state.factions[id],
    profile = AI_PROFILE[id];
  return f.gold >= 15 && f.food >= 8 && f.population >= profile.minRecruitPopulation;
}
function recruitAi(id) {
  const f = state.factions[id];
  if (!canAiRecruit(id)) return false;
  f.gold -= 15;
  f.food -= 8;
  f.population -= 3;
  f.army += 4;
  return true;
}
function shouldPrioritizeRecruit(id) {
  const f = state.factions[id],
    profile = AI_PROFILE[id],
    goal = aiArmyGoal(id);
  if (f.army >= goal || !canAiRecruit(id)) return false;
  return f.food >= profile.recruitFood || f.army < Math.ceil(goal * profile.recruitRatio);
}
function canRecruitThisAction(id, turn) {
  const profile = AI_PROFILE[id],
    f = state.factions[id];
  return (
    turn.recruits < profile.maxRecruit &&
    (turn.recruits === 0 ||
      (turn.secondRecruitAllowed && f.population >= (profile.secondRecruitPopulation || Infinity)))
  );
}
function aiBuildChoice(id) {
  const s = stats(id),
    inc = income(id),
    profile = AI_PROFILE[id];
  if (inc.food < 0 || s.farms < Math.ceil(s.land / profile.farmLand)) return 'farm';
  if (profile.style === 'commercial' && s.towns < 12) return 'town';
  if (profile.style === 'offensive' && s.pop <= 8 && s.towns < 12) return 'town';
  if (profile.style === 'sustained' && s.towns < 12) return 'town';
  if (s.pop >= s.capacity - 2 || s.towns < Math.ceil(s.land / profile.townLand)) return 'town';
  if (
    profile.style === 'sustained' &&
    borderTargets(id, (o) => o !== 'neutral' && o !== id).length &&
    s.forts < Math.ceil(s.land / 12)
  )
    return 'fort';
  if (s.barracks < Math.ceil(s.land / profile.barracksLand)) return 'barracks';
  if (
    borderTargets(id, (o) => o !== 'neutral' && o !== id).length &&
    s.forts < Math.ceil(s.land / profile.fortLand)
  )
    return 'fort';
  return profile.buildCycle[rand(profile.buildCycle.length)];
}
function chooseAiBuildTile(id, building) {
  const own = state.tiles
      .map((t, i) => (t.owner === id && !t.building && t.occupation !== 2 ? i : -1))
      .filter((i) => i >= 0),
    capital = state.tiles.findIndex((t) => t.owner === id && t.capital);
  if (!own.length) return -1;
  return own
    .map((i) => {
      const enemyEdges = neighbors(i).filter(
          (n) => !['neutral', id].includes(state.tiles[n].owner),
        ).length,
        border = enemyEdges > 0;
      let score = Math.random() * 4;
      if (['fort', 'barracks'].includes(building))
        score += enemyEdges * 12 + (capital >= 0 ? Math.max(0, 6 - distance(i, capital)) : 0);
      else if (!border) score += 8;
      return { i, score };
    })
    .sort((a, b) => b.score - a.score)[0].i;
}
function strategicFortTile(id) {
  const capital = state.tiles.findIndex((t) => t.owner === id && t.capital),
    own = state.tiles
      .map((t, i) => (t.owner === id && !t.building && t.occupation !== 2 ? i : -1))
      .filter((i) => i >= 0);
  if (!own.length) return -1;
  const scored = own
    .map((i) => {
      const enemies = neighbors(i).filter((n) => !['neutral', id].includes(state.tiles[n].owner)),
        countries = new Set(enemies.map((n) => state.tiles[n].owner));
      return {
        i,
        score:
          countries.size * 100 +
          enemies.length * 14 +
          supplyCutValue(i, id) * 18 +
          (capital >= 0 ? Math.max(0, 5 - distance(i, capital)) : 0),
      };
    })
    .filter((x) => x.score >= 100);
  return scored.length ? scored.sort((a, b) => b.score - a.score)[0].i : -1;
}
function redFortTile() {
  return strategicFortTile('red');
}
function enemyNearFort(id, i) {
  return state.tiles.some((t, n) => !['neutral', id].includes(t.owner) && distance(i, n) <= 2);
}
function updateAiFortUse(id) {
  state.tiles.forEach((t, i) => {
    if (t.owner === id && t.building === 'fort' && !t.occupation)
      t.fortIdle = enemyNearFort(id, i) ? 0 : (t.fortIdle || 0) + 1;
    else if (t.fortIdle) t.fortIdle = 0;
  });
}
function unusedAiFort(id) {
  return (
    state.tiles
      .map((t, i) =>
        t.owner === id && t.building === 'fort' && !t.occupation && (t.fortIdle || 0) >= 3 ? i : -1,
      )
      .filter((i) => i >= 0)
      .sort((a, b) => (state.tiles[b].fortIdle || 0) - (state.tiles[a].fortIdle || 0))[0] ?? -1
  );
}
function demolishUnusedAiFort(id, turn) {
  const i = unusedAiFort(id);
  if (i < 0) return false;
  state.tiles[i].building = null;
  state.tiles[i].fortIdle = 0;
  turn.demolished = true;
  return true;
}
function buildAi(id) {
  const f = state.factions[id],
    building = aiBuildChoice(id),
    b = BUILDINGS[building],
    reserve = AI_PROFILE[id].reserve,
    fortTile = building === 'fort' ? strategicFortTile(id) : -1,
    i = fortTile >= 0 ? fortTile : chooseAiBuildTile(id, building);
  if (i < 0 || f.gold < b.cost + reserve) return false;
  state.tiles[i].building = building;
  state.tiles[i].fortIdle = 0;
  f.gold -= b.cost;
  return true;
}
function settleAi(id, neutral) {
  const f = state.factions[id];
  if (!neutral.length || f.gold < 10 || f.food < 8 || f.population <= 2) return false;
  const i = neutral[rand(neutral.length)];
  state.tiles[i].owner = id;
  state.tiles[i].isolation = 0;
  state.tiles[i].occupation = 1;
  state.tiles[i].fortIdle = 0;
  f.gold -= 10;
  f.food -= 8;
  f.population--;
  addLog(`${META[id].name}が中立地帯を開拓し、安定化を開始した。`, '', {
    participants: [id],
  });
  return true;
}
function advanceOccupations(id) {
  state.tiles.forEach((t) => {
    if (t.owner !== id) return;
    if (t.occupation === 2) t.occupation = 1;
    else if (t.occupation === 1) t.occupation = 0;
  });
}
function advanceAllOccupations() {
  IDS.forEach(advanceOccupations);
}
function aiInitiativeOrder(year = state.year) {
  const ids = ['red', 'blue', 'ochre'],
    offset = (Math.max(1, year) - 1 + (state.aiInitiativeOffset || 0)) % ids.length;
  return ids.slice(offset).concat(ids.slice(0, offset));
}
function needsAiEconomyBuild(id) {
  const s = stats(id),
    inc = income(id);
  return inc.food < 0 || s.pop >= s.capacity - 2;
}
function aiAttackChance(id) {
  return Math.min(0.95, AI_PROFILE[id].attack + (state.year >= 120 ? 0.15 : 0));
}
function invadeForAi(id, target, turn, reason = '') {
  if (target === null) return false;
  turn.attacks++;
  turn.attackFailed = !aiInvade(id, target, reason);
  return true;
}
function aiAction(id, turn, action) {
  const f = state.factions[id];
  if (!f?.alive) return false;
  const profile = AI_PROFILE[id];
  const neutral = borderTargets(id, (o) => o === 'neutral'),
    enemies = borderTargets(id, (o) => o !== id && o !== 'neutral');
  const leader = threatLeader(),
    level = threatLevel(),
    coalitionTargets = enemies.filter((i) => state.tiles[i].owner === leader && leader !== id);
  const capitalThreats = enemies.filter((i) => threatensOwnCapital(id, i));
  const capitalDefenseTarget = !turn.attackFailed ? chooseAiTarget(id, capitalThreats) : null;
  if (capitalDefenseTarget !== null) {
    const intruder = state.tiles[capitalDefenseTarget].owner,
      capital = state.tiles.findIndex((t) => t.owner === id && t.capital);
    if (intruder === 'player')
      addLog(
        `${META[id].name}は首都から${distance(capitalDefenseTarget, capital)}マスまで迫った${META[intruder].name}を最優先目標とし、首都防衛の反撃を開始した。`,
        'war',
        { participants: [id, intruder] },
      );
    return invadeForAi(id, capitalDefenseTarget, turn, 'capital-defense');
  }
  if (needsAiEconomyBuild(id) && !turn.built && buildAi(id)) {
    turn.built = true;
    return true;
  }
  if (turn.attacks > 0 && state.year < 120 && !turn.built && buildAi(id)) {
    turn.built = true;
    return true;
  }
  const strategicTargets = enemies.filter((i) => strategicTarget(id, i)),
    strategic = !turn.attackFailed ? chooseAiTarget(id, strategicTargets) : null;
  if (invadeForAi(id, strategic, turn)) return true;
  const coalitionTarget = !turn.attackFailed ? chooseAiTarget(id, coalitionTargets) : null;
  if (level === 1 && coalitionTarget !== null && Math.random() < 0.62)
    return invadeForAi(id, coalitionTarget, turn);
  if (canRecruitThisAction(id, turn) && shouldPrioritizeRecruit(id) && recruitAi(id)) {
    turn.recruits++;
    return true;
  }
  if (!turn.demolished && demolishUnusedAiFort(id, turn)) return true;
  if (state.year >= 120 && Math.random() < 0.9 && settleAi(id, neutral)) return true;
  const target = !turn.attackFailed ? chooseAiTarget(id, enemies) : null;
  if (profile.style === 'offensive' && target !== null && Math.random() < aiAttackChance(id))
    return invadeForAi(id, target, turn);
  if (
    profile.style === 'sustained' &&
    Math.random() < profile.settle * 0.55 &&
    settleAi(id, neutral)
  )
    return true;
  if (!turn.built && buildAi(id)) {
    turn.built = true;
    return true;
  }
  if (Math.random() < profile.settle && settleAi(id, neutral)) return true;
  if (target !== null && Math.random() < aiAttackChance(id)) return invadeForAi(id, target, turn);
  if (canRecruitThisAction(id, turn) && f.army < aiArmyGoal(id) + 4 && recruitAi(id)) {
    turn.recruits++;
    return true;
  }
  return false;
}
function runAiYear() {
  const order = aiInitiativeOrder(),
    turns = {};
  for (const id of order)
    if (state.factions[id].alive) {
      updateAiFortUse(id);
      produce(id);
      turns[id] = {
        actions: yearlyOrders(id),
        attacks: 0,
        attackFailed: false,
        recruits: 0,
        secondRecruitAllowed:
          AI_PROFILE[id].secondRecruitChance == null ||
          Math.random() < AI_PROFILE[id].secondRecruitChance,
        built: false,
        demolished: false,
      };
    }
  const rounds = Math.max(0, ...Object.values(turns).map((t) => t.actions));
  for (let action = 0; action < rounds && !state.gameOver; action++)
    for (const id of order) {
      const turn = turns[id];
      if (!turn || action >= turn.actions || !state.factions[id].alive) continue;
      aiAction(id, turn, action);
      if (state.gameOver) break;
    }
}
function aiInvade(id, i, reason = '') {
  const f = state.factions[id],
    t = state.tiles[i],
    loser = t.owner,
    def = tileDefense(i) + rand(5),
    attack = Math.floor(f.army * 0.68) + support(i, id) + rand(5);
  if (attack >= def) {
    const loss = Math.max(1, Math.ceil(def / 5)),
      attackerBefore = f.army,
      defenderBefore = loser === 'player' ? state.army : state.factions[loser]?.army || 0;
    f.army = Math.max(0, attackerBefore - loss);
    if (loser === 'player') state.army = Math.max(0, defenderBefore - Math.ceil(loss / 2));
    else if (state.factions[loser])
      state.factions[loser].army = Math.max(0, defenderBefore - Math.ceil(loss / 2));
    const defenderAfter = loser === 'player' ? state.army : state.factions[loser]?.army || 0;
    recordWarBattle(id, loser, attackerBefore - f.army, defenderBefore - defenderAfter);
    if (reason !== 'capital-defense' || loser === 'player')
      addLog(
        reason === 'capital-defense'
          ? `${META[id].name}は首都防衛の反撃に成功し、${META[loser].name}の領土を奪い返した。`
          : `${META[id].name}が${META[loser].name}の領土を奪った。`,
        'war',
        { participants: [id, loser] },
      );
    capture(i, id);
    return true;
  }
  const loss = Math.max(2, Math.ceil(def / 3));
  const attackerBefore = f.army;
  f.army = Math.max(0, attackerBefore - loss);
  recordWarBattle(id, loser, attackerBefore - f.army, 0);
  if (reason === 'capital-defense' && loser === 'player')
    addLog(
      `${META[id].name}の首都防衛反撃は${META[loser].name}に阻まれ、兵${loss}人を失った。`,
      'war',
      { participants: [id, loser] },
    );
  else if (reason !== 'capital-defense' && loser === 'player')
    addLog(`${META[id].name}の侵攻を撃退した。敵兵${loss}人を退けた。`, 'good', {
      participants: [id, loser],
    });
  return false;
}
function updateSupply() {
  for (const id of IDS) {
    const capital = state.tiles.findIndex((t) => t.owner === id && t.capital),
      connected = new Set();
    if (capital >= 0) {
      const queue = [capital];
      connected.add(capital);
      while (queue.length) {
        const current = queue.shift();
        for (const n of neighbors(current)) {
          if (state.tiles[n].owner === id && !connected.has(n)) {
            connected.add(n);
            queue.push(n);
          }
        }
      }
    }
    state.tiles.forEach((t, i) => {
      if (t.owner === id) t.isolation = connected.has(i) ? 0 : (t.isolation || 0) + 2;
      else if (t.owner === 'neutral') t.isolation = 0;
    });
  }
}
function updateThreatNotices() {
  const level = threatLevel(),
    leader = threatLeader(),
    notices = state.threatNotices;
  if (!level) {
    notices.leader = null;
    notices.level = 0;
    return;
  }
  if (notices.leader === leader && notices.level >= level) return;
  notices.leader = leader;
  notices.level = level;
  const name = META[leader].name;
  addLog(`${name}が領土を広げ、列国がその拡大を警戒し始めた。`, 'war', {
    participants: [leader],
    important: leader === 'player',
  });
  toast(`${name}への警戒が強まりました`);
}
