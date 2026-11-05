'use strict';

function borderTargets(id, ownerTest) {
  const out = new Set();
  state.tiles.forEach((t, i) => {
    if (t.owner === id && !t.occupation)
      movementNeighbors(i).forEach((n) => {
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
    for (const n of movementNeighbors(queue.shift()))
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
  const owner = state.tiles[i].owner;
  if (isSanctioned(owner) && owner !== id) return 0;
  const fatigue = warFatigueValue(id, owner);
  return fatigue >= 30 ? (fatigue - 20) * 0.4 : 0;
}
function targetScore(id, i) {
  const t = state.tiles[i],
    owner = t.owner,
    capital = state.tiles.findIndex((x) => x.owner === owner && x.capital),
    cut = supplyCutValue(i, owner),
    profile = AI_PROFILE[id],
    combat = combatCalculation(id, i);
  let score = Math.random() * 5 - tileDefense(i) * 1.2;
  if (threatensOwnCapital(id, i)) {
    const ownCapital = state.tiles.findIndex((x) => x.owner === id && x.capital);
    score += 230 + (3 - distance(i, ownCapital)) * 30;
  }
  if (t.supplyStatus === 'cut') score += 48 + Math.min(20, t.isolation * 2);
  if (cut) score += 32 + cut * 9;
  if (t.capital) score += 150;
  else if (capital >= 0) {
    const d = distance(i, capital);
    score += Math.max(0, 28 - d * 4);
    if (movementNeighbors(i).includes(capital)) score += 42;
  }
  if (t.building && t.building !== 'capital') score += BUILDINGS[t.building]?.cost / 6 || 0;
  score -= combat.crossingBonus * 8;
  score -= terrainInvasionLoss(t) * 14;
  if (t.building === 'farm') score += Math.max(0, terrainFarmFood(t) - BUILDINGS.farm.food) * 4;
  if (shouldAvoidContestedTarget(id, i)) score -= 180;
  if (t.capital || (capital >= 0 && movementNeighbors(i).includes(capital)))
    score += profile.capitalBias;
  if (cut) score += profile.cutBias * cut;
  if (t.building === profile.preferredTarget) score += profile.targetBias;
  score += (combat.attack - combat.baseDefense) * 1.4;
  if (owner === threatLeader() && owner !== id && threatLevel() === 1) score += 30;
  if (isSanctioned(owner) && owner !== id) score += 90;
  score -= warFatiguePriorityPenalty(id, i);
  return score;
}
const AI_PROFILE = {
  red: {
    style: 'offensive',
    attack: 0.72,
    normal: 1.02,
    strategic: 0.9,
    reserve: 13,
    armyScale: 0.84,
    armyBase: 7,
    recruitRatio: 0.8,
    recruitFood: 26,
    minRecruitPopulation: 8,
    maxRecruit: 2,
    secondRecruitPopulation: 13,
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
    armyBase: 5,
    recruitRatio: 0.75,
    recruitFood: 34,
    minRecruitPopulation: 10,
    maxRecruit: 2,
    secondRecruitPopulation: 18,
    secondRecruitChance: 0.2,
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
    armyBase: 5,
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
    t.supplyStatus === 'cut' ||
    t.capital ||
    supplyCutValue(i, t.owner) ||
    (capital >= 0 && movementNeighbors(i).includes(capital))
  );
}
function aiArmyGoal(id) {
  const profile = AI_PROFILE[id];
  return Math.max(16, Math.ceil(land(id) * profile.armyScale) + profile.armyBase);
}
function aiAttackAssessment(id, i) {
  const f = state.factions[id],
    profile = AI_PROFILE[id],
    t = state.tiles[i],
    capitalDefense = threatensOwnCapital(id, i),
    strategic = strategicTarget(id, i),
    combat = combatCalculation(id, i, { attackRoll: 3, defenseRoll: 3 }),
    ratio = combat.attack / Math.max(1, combat.defense),
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
  if (activeCeasefire(id, t.owner))
    return { ok: false, reason: 'ceasefire', combat, ratio, threshold, reserve };
  if (t.occupation === 2)
    return { ok: false, reason: 'occupation_protection', combat, ratio, threshold, reserve };
  if (shouldAvoidContestedTarget(id, i))
    return { ok: false, reason: 'contested_lock', combat, ratio, threshold, reserve };
  if (combat.baseArmy < 7)
    return { ok: false, reason: 'weak_origin', combat, ratio, threshold, reserve };
  if (ratio < threshold)
    return { ok: false, reason: 'insufficient_odds', combat, ratio, threshold, reserve };
  if (!t.capital && f.army - combat.victoryLoss < reserve)
    return { ok: false, reason: 'reserve_shortage', combat, ratio, threshold, reserve };
  return { ok: true, reason: 'viable', combat, ratio, threshold, reserve };
}
function shouldAiAttack(id, i) {
  return aiAttackAssessment(id, i).ok;
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
function ochreOffensiveReady(id = 'ochre') {
  const f = state.factions[id];
  return (
    id === 'ochre' && !!f?.alive && f.food >= 80 && f.population >= 12 && f.army >= aiArmyGoal(id)
  );
}
function ochrePreparedOffensiveTarget(targets) {
  const decisive = targets.filter((i) => {
    const combat = combatCalculation('ochre', i, { attackRoll: 3, defenseRoll: 3 }),
      mode = globalThis.__GARRISON_OCHRE_MODE__ || 'relaxed',
      defense =
        mode === 'ignore'
          ? Math.max(1, combat.defense - garrisonDefenseAt(i))
          : Math.max(1, combat.defense),
      threshold = mode === 'relaxed' ? 1.05 : 1.15;
    return combat.attack / defense >= threshold;
  });
  return decisive.length ? chooseAiTarget('ochre', decisive) : null;
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
      const enemyEdges = movementNeighbors(i).filter(
          (n) => !['neutral', id].includes(state.tiles[n].owner),
        ).length,
        border = enemyEdges > 0;
      let score = Math.random() * 4;
      if (building === 'farm') {
        const foodDifference = terrainFarmFood(state.tiles[i]) - BUILDINGS.farm.food;
        score += foodDifference >= 0 ? foodDifference * 14 : foodDifference * 9;
      }
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
      const enemies = movementNeighbors(i).filter(
          (n) => !['void', 'neutral', id].includes(state.tiles[n].owner),
        ),
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
function validGarrisonTile(id, i) {
  const tile = state.tiles[i];
  return !!(
    tile &&
    tile.owner === id &&
    !tile.occupation &&
    tile.supplyStatus !== 'cut' &&
    isConquerableTile(tile)
  );
}
function garrisonTileScore(id, i) {
  if (!validGarrisonTile(id, i)) return -Infinity;
  const tile = state.tiles[i],
    capital = state.tiles.findIndex((candidate) => candidate.owner === id && candidate.capital),
    adjacentEnemies = movementNeighbors(i).filter(
      (neighbor) => !['neutral', 'void', id].includes(state.tiles[neighbor].owner),
    ),
    borderingCountries = new Set(adjacentEnemies.map((neighbor) => state.tiles[neighbor].owner)),
    nearCapital = capital >= 0 && distance(i, capital) <= 2,
    enemyWithinTwo =
      (tile.capital || nearCapital) &&
      state.tiles.some(
        (candidate, index) =>
          !['neutral', 'void', id].includes(candidate.owner) && distance(i, index) <= 2,
      );
  let score =
    adjacentEnemies.length * 35 +
    borderingCountries.size * 25 +
    (adjacentEnemies.length ? supplyCutValue(i, id) * 18 : 0) +
    (tile.building === 'fort' ? 22 : 0) +
    (['bridge', 'ford'].includes(tile.terrain) ? 18 : 0);
  if (tile.capital) score += enemyWithinTwo ? 240 : 16;
  if (nearCapital) score += enemyWithinTwo ? 45 : 4;
  return score;
}
function bestGarrisonTile(id) {
  return (
    state.tiles
      .map((tile, i) => ({ i, score: garrisonTileScore(id, i) }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score || a.i - b.i)[0]?.i ?? -1
  );
}
function normalizeGarrison(id) {
  const current = state.garrisons?.[id];
  const tile = current == null ? null : state.tiles[current];
  if (current == null || (tile && tile.owner === id && !tile.occupation && isConquerableTile(tile)))
    return;
  delete state.garrisons[id];
  state.garrisonFormationYears ??= {};
  state.garrisonFormationYears[id] = state.year + 5;
  state.metrics.garrisonsLost = (state.metrics.garrisonsLost || 0) + 1;
}
function manageAiGarrison(id, turn) {
  if (!garrisonExperimentEnabled() || turn.garrisonConsidered) return false;
  turn.garrisonConsidered = true;
  state.garrisons ??= {};
  normalizeGarrison(id);
  const f = state.factions[id],
    current = garrisonLocation(id),
    target = bestGarrisonTile(id),
    formationCost = garrisonFormationCost();
  if (target < 0) return false;
  if (current < 0) {
    const canAffordSurplus =
      f.gold >= formationCost.gold + 20 &&
      f.food >= formationCost.food + 20 &&
      f.population >= formationCost.population + 8;
    if (!canAffordSurplus || state.year < (state.garrisonFormationYears?.[id] || 0)) return false;
    f.gold -= formationCost.gold;
    f.food -= formationCost.food;
    f.population -= formationCost.population;
    state.garrisons[id] = target;
    state.metrics.garrisonsFormed = (state.metrics.garrisonsFormed || 0) + 1;
    state.metrics.garrisonGoldSpent = (state.metrics.garrisonGoldSpent || 0) + formationCost.gold;
    state.metrics.garrisonFoodSpent = (state.metrics.garrisonFoodSpent || 0) + formationCost.food;
    turn.garrisonManaged = true;
    return true;
  }
  if (
    current !== target &&
    f.gold >= GARRISON_MOVE_COST.gold &&
    f.food >= GARRISON_MOVE_COST.food &&
    state.year >= (state.garrisonMoveYears?.[id] || 0) &&
    garrisonTileScore(id, target) >= garrisonTileScore(id, current) + 30
  ) {
    f.gold -= GARRISON_MOVE_COST.gold;
    f.food -= GARRISON_MOVE_COST.food;
    state.garrisons[id] = target;
    state.garrisonMoveYears ??= {};
    state.garrisonMoveYears[id] = state.year + 2;
    state.metrics.garrisonsMoved = (state.metrics.garrisonsMoved || 0) + 1;
    state.metrics.garrisonGoldSpent =
      (state.metrics.garrisonGoldSpent || 0) + GARRISON_MOVE_COST.gold;
    state.metrics.garrisonFoodSpent =
      (state.metrics.garrisonFoodSpent || 0) + GARRISON_MOVE_COST.food;
    turn.garrisonManaged = true;
    return true;
  }
  return false;
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
function ownedRouteDistance(id, start, goal) {
  const seen = new Set([start]),
    queue = [{ i: start, distance: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.i === goal) return current.distance;
    for (const n of movementNeighbors(current.i)) {
      const tile = state.tiles[n];
      if (tile.owner === id && !tile.occupation && !seen.has(n)) {
        seen.add(n);
        queue.push({ i: n, distance: current.distance + 1 });
      }
    }
  }
  return Infinity;
}
function aiBridgeSiteScore(id, i) {
  const status = bridgeSiteStatus(id, i);
  if (!status.ok || status.tiles[0] !== i) return -Infinity;
  const banks = status.banks,
    connected = capitalConnectedStableTiles(id);
  let score = -Infinity;
  for (let side = 0; side < 2; side++) {
    const source = banks[side],
      opposite = banks[1 - side],
      target = state.tiles[opposite];
    if (!connected.has(source) || state.tiles[source].occupation) continue;
    if (target.owner === 'neutral') {
      const alreadyReachable = movementNeighbors(opposite).some(
          (n) => state.tiles[n].owner === id && !state.tiles[n].occupation,
        ),
        onward = movementNeighbors(opposite).filter(
          (n) => !['void', id].includes(state.tiles[n].owner),
        ).length;
      score = Math.max(score, 38 + onward * 5 - (alreadyReachable ? 18 : 0));
    } else if (target.owner === id && !target.occupation) {
      const route = ownedRouteDistance(id, source, opposite);
      if (Number.isFinite(route)) score = Math.max(score, (route - 1) * 7);
    }
  }
  const extraCostPenalty =
    (status.cost.gold - BRIDGE_COST.gold) / 4 + (status.cost.food - BRIDGE_COST.food) / 3;
  return score - extraCostPenalty;
}
function chooseAiBridgeSite(id) {
  return (
    state.tiles
      .map((tile, i) => ({
        i,
        score: tile.terrain === 'river' ? aiBridgeSiteScore(id, i) : -Infinity,
      }))
      .filter((site) => site.score >= 28)
      .sort((a, b) => b.score - a.score + (Math.random() - 0.5))[0]?.i ?? -1
  );
}
function buildAiBridge(id) {
  const faction = state.factions[id],
    i = chooseAiBridgeSite(id),
    status = i >= 0 ? bridgeSiteStatus(id, i) : null;
  if (
    i < 0 ||
    !status?.ok ||
    faction.gold < status.cost.gold + AI_PROFILE[id].reserve ||
    faction.food < status.cost.food ||
    !constructBridge(id, i)
  )
    return false;
  addLog(`${META[id].name}が川に橋を架け、新たな進路を開いた。`, '', {
    participants: [id],
  });
  return true;
}
function settleAi(id, neutral) {
  const f = state.factions[id];
  if (!neutral.length || f.gold < 10 || f.food < 8 || f.population <= 2) return false;
  const i = neutral[rand(neutral.length)];
  state.tiles[i].owner = id;
  state.tiles[i].isolation = 0;
  state.tiles[i].supplyStatus = 'full';
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
  nationIds().forEach(advanceOccupations);
}
function aiInitiativeOrder(year = state.year) {
  const ids = aiNationIds(),
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
function aiBetrayalTarget(id) {
  const partner = ceasefirePartner(id),
    f = state.factions[id];
  if (!partner || isSanctioned(id) || !f?.alive) return null;
  const ownCapital = state.tiles.findIndex((tile) => tile.owner === id && tile.capital),
    otherEnemies = state.tiles.some(
      (tile, index) =>
        !['neutral', id, partner].includes(tile.owner) &&
        ownCapital >= 0 &&
        distance(index, ownCapital) <= 2,
    );
  if (otherEnemies) return null;
  const decisive = land(partner) <= 5 || land(id) >= Math.ceil(conquerableLand() * 0.6),
    reserve = Math.max(AI_PROFILE[id].reserve + 4, Math.ceil(land(id) / 4)),
    targets = borderTargets(id, (owner) => owner === partner)
      .map((i) => {
        const combat = combatCalculation(id, i, {
            surprise: true,
            attackRoll: 2,
            defenseRoll: 2,
          }),
          capital = state.tiles[i].capital;
        return {
          i,
          capital,
          viable:
            (capital || decisive) &&
            combat.attack / Math.max(1, combat.defense) >= 1.25 &&
            f.army - combat.victoryLoss >= reserve,
          score: (capital ? 1000 : 0) + targetScore(id, i),
        };
      })
      .filter((target) => target.viable)
      .sort((a, b) => b.score - a.score);
  return targets[0]?.i ?? null;
}
function aiAction(id, turn, action) {
  const f = state.factions[id];
  if (!f?.alive) return false;
  const profile = AI_PROFILE[id];
  if (!turn.betrayalConsidered) {
    turn.betrayalConsidered = true;
    const betrayal = aiBetrayalTarget(id);
    if (betrayal !== null) return invadeForAi(id, betrayal, turn, 'betrayal');
  }
  const neutral = borderTargets(id, (o) => o === 'neutral'),
    enemies = borderTargets(id, (o) => o !== id && o !== 'neutral').filter(
      (i) => !activeCeasefire(id, state.tiles[i].owner),
    );
  const leader = threatLeader(),
    level = threatLevel(),
    coalitionTargets = enemies.filter((i) => state.tiles[i].owner === leader && leader !== id);
  const capitalThreats = enemies.filter((i) => threatensOwnCapital(id, i));
  if (manageAiGarrison(id, turn)) return true;
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
  const preparedOffensiveTarget =
    id === 'ochre' && ochreOffensiveReady() && turn.attacks === 0 && !turn.attackFailed
      ? ochrePreparedOffensiveTarget(enemies)
      : null;
  if (preparedOffensiveTarget !== null)
    return invadeForAi(id, preparedOffensiveTarget, turn, 'prepared-offensive');
  if (needsAiEconomyBuild(id) && !turn.built && buildAi(id)) {
    turn.built = true;
    return true;
  }
  if (turn.attacks > 0 && state.year < 120 && !turn.built && buildAi(id)) {
    turn.built = true;
    return true;
  }
  const strategicTargets = enemies.filter(
      (i) => strategicTarget(id, i) || isSanctioned(state.tiles[i].owner),
    ),
    strategic = !turn.attackFailed ? chooseAiTarget(id, strategicTargets) : null;
  if (invadeForAi(id, strategic, turn)) return true;
  const coalitionTarget = !turn.attackFailed ? chooseAiTarget(id, coalitionTargets) : null;
  if (level === 1 && coalitionTarget !== null && Math.random() < 0.62)
    return invadeForAi(id, coalitionTarget, turn);
  if (canRecruitThisAction(id, turn) && shouldPrioritizeRecruit(id) && recruitAi(id)) {
    turn.recruits++;
    return true;
  }
  if (!turn.built && buildAiBridge(id)) {
    turn.built = true;
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
        garrisonManaged: false,
        garrisonConsidered: false,
        betrayalConsidered: false,
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
function runAiCeasefireDiplomacy() {
  for (const [pair] of Object.entries(state.ceasefires || {})) {
    const [a, b] = diplomacyPairCountries(pair);
    if (a === 'player' || b === 'player' || !ceasefireRenewalDue(a, b)) continue;
    if (ceasefireRenewalDecision(a, b).agreed) renewCeasefire(a, b);
  }
  const ids = aiNationIds(),
    pairs =
      ids.length < 3
        ? ids.slice(0, -1).map((id, index) => [id, ids[index + 1]])
        : ids.map((id, index) => [id, ids[(index + 1) % ids.length]]),
    pairCount = Math.max(1, pairs.length),
    offset = (state.year - 1 + (state.aiInitiativeOffset || 0)) % pairCount,
    ordered = pairs.slice(offset).concat(pairs.slice(0, offset));
  for (const [a, b] of ordered)
    if (
      ceasefireProposalStatus(a, b).ok &&
      ceasefireWillingness(a, b) >= 40 &&
      ceasefireWillingness(b, a) >= 40
    )
      beginCeasefire(a, b);
}
function aiCeasefireOfferToPlayer() {
  if (state.playerDefeated || state.gameOver) return null;
  return aiNationIds()
    .filter(
      (id) => ceasefireProposalStatus(id, 'player').ok && ceasefireWillingness(id, 'player') >= 55,
    )
    .map((id) => ({ id, score: ceasefireWillingness(id, 'player') }))
    .sort((a, b) => b.score - a.score)[0]?.id;
}
function aiInvade(id, i, reason = '') {
  const f = state.factions[id],
    t = state.tiles[i],
    loser = t.owner,
    betrayal = reason === 'betrayal' && activeCeasefire(id, loser),
    combat = rollCombat(id, i, { surprise: betrayal });
  if (activeCeasefire(id, loser) && !betrayal) return false;
  if (betrayal) breakCeasefire(id, loser);
  if (combat.victory) {
    const loss = combat.victoryLoss,
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
  const loss = combat.failureLoss;
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
  for (const id of nationIds()) {
    const capital = state.tiles.findIndex((t) => t.owner === id && t.capital),
      supplyCost = new Map();
    if (capital >= 0) {
      const queue = [capital];
      supplyCost.set(capital, 0);
      while (queue.length) {
        const current = queue.shift();
        const currentCost = supplyCost.get(current);
        for (const n of movementNeighbors(current)) {
          if (state.tiles[n].owner !== id || (supplyCost.get(n) ?? Infinity) <= currentCost)
            continue;
          supplyCost.set(n, currentCost);
          queue.unshift(n);
        }
        for (const n of limitedSupplyNeighborsIn(state.tiles, current)) {
          const nextCost = currentCost + 1;
          if (state.tiles[n].owner !== id || (supplyCost.get(n) ?? Infinity) <= nextCost) continue;
          supplyCost.set(n, nextCost);
          queue.push(n);
        }
      }
    }
    state.tiles.forEach((t, i) => {
      if (t.owner === id) {
        const cost = supplyCost.get(i);
        if (cost === 0) {
          t.isolation = 0;
          t.supplyStatus = 'full';
        } else if (Number.isFinite(cost)) {
          t.isolation = 1;
          t.supplyStatus = 'limited';
        } else {
          t.isolation = t.supplyStatus === 'cut' ? (t.isolation || 0) + 2 : 2;
          t.supplyStatus = 'cut';
        }
      } else if (t.owner === 'neutral') {
        t.isolation = 0;
        t.supplyStatus = 'full';
      }
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
