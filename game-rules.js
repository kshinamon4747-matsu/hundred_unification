'use strict';

function tileDefense(i) {
  const t = state.tiles[i];
  let d = 2 + (t.terrain === 'hill' ? 2 : 0);
  if (t.capital) d += 14;
  else if (!t.occupation && BUILDINGS[t.building]) d += BUILDINGS[t.building].def;
  const f = t.owner === 'player' ? state.army : state.factions[t.owner]?.army || 0;
  return Math.max(0, d + Math.floor(f / 5) - (t.isolation || 0));
}
function useOrder() {
  state.orders = Math.max(0, state.orders - 1);
}
function warPairKey(a, b) {
  return [a, b].sort().join(':');
}
function warFatigueValue(id, opponent) {
  return state.warFatigue?.[id]?.[opponent] || 0;
}
function warFatigueStatus(id, opponent) {
  const value = warFatigueValue(id, opponent);
  if (value >= 80) return { text: '厭戦', tone: 'weary', value };
  if (value >= 60) return { text: '消耗', tone: 'spent', value };
  if (value >= 30) return { text: '長期戦', tone: 'prolonged', value };
  return { text: '平静', tone: 'calm', value };
}
function addWarFatigue(id, opponent, losses) {
  if (!IDS.includes(id) || !IDS.includes(opponent) || id === opponent) return;
  state.warFatigue ??= emptyWarFatigue();
  state.warFatigue[id] ??= {};
  const increase = Math.min(10, 2 + Math.max(0, losses));
  state.warFatigue[id][opponent] = clamp(warFatigueValue(id, opponent) + increase, 0, 100);
}
function recordWarBattle(attacker, defender, attackerLosses, defenderLosses) {
  addWarFatigue(attacker, defender, attackerLosses);
  addWarFatigue(defender, attacker, defenderLosses);
  state.warLastBattle ??= {};
  state.warLastBattle[warPairKey(attacker, defender)] = state.year;
}
function advanceWarFatigue() {
  state.warFatigue ??= emptyWarFatigue();
  state.warLastBattle ??= {};
  for (let a = 0; a < IDS.length; a++)
    for (let b = a + 1; b < IDS.length; b++) {
      const first = IDS[a],
        second = IDS[b];
      if (state.warLastBattle[warPairKey(first, second)] === state.year) continue;
      state.warFatigue[first][second] = Math.max(0, warFatigueValue(first, second) - 8);
      state.warFatigue[second][first] = Math.max(0, warFatigueValue(second, first) - 8);
    }
}
function clearWarFatigueFor(id) {
  if (!state.warFatigue) return;
  for (const opponent of IDS)
    if (opponent !== id) {
      if (state.warFatigue[id]) state.warFatigue[id][opponent] = 0;
      if (state.warFatigue[opponent]) state.warFatigue[opponent][id] = 0;
      if (state.warLastBattle) delete state.warLastBattle[warPairKey(id, opponent)];
    }
}
function playerActionTargetValid(action, i) {
  const t = state.tiles[i];
  if (!t) return false;
  const adjacent = neighbors(i).some(
    (n) => state.tiles[n].owner === 'player' && !state.tiles[n].occupation,
  );
  if (action === 'settle') return t.owner === 'neutral' && adjacent;
  if (action === 'invade')
    return !['neutral', 'player'].includes(t.owner) && adjacent && t.occupation !== 2;
  if (action === 'demolish')
    return t.owner === 'player' && !!t.building && !t.capital && t.occupation !== 2;
  if (BUILDINGS[action]) return t.owner === 'player' && !t.building && t.occupation !== 2;
  return false;
}
function playerActionStatus(action, i) {
  if (state.gameOver || state.playerDefeated || state.autoSettlement)
    return { ok: false, reason: '現在は命令を実行できません' };
  if (!playerActionTargetValid(action, i)) return { ok: false, reason: '' };
  if (state.orders < 1) return { ok: false, reason: '今年の命令を使い切りました' };
  if (action === 'settle' && (state.gold < 10 || state.food < 8 || state.population < 2))
    return { ok: false, reason: '開拓に必要な物資または民が足りません' };
  if (action === 'invade' && state.army < 5)
    return { ok: false, reason: '侵攻には兵力5以上が必要です' };
  if (BUILDINGS[action] && state.gold < BUILDINGS[action].cost)
    return { ok: false, reason: '建設に必要な金貨が足りません' };
  return { ok: true, reason: '' };
}
function canPlayerAction(action, i) {
  return playerActionStatus(action, i).ok;
}
function clonePlayerState(value = state) {
  return JSON.parse(JSON.stringify(value));
}
function playerActionKey(action, i = '') {
  return `${action}:${i}`;
}
function playerActionLabel(action, i) {
  const tile = state.tiles[i];
  if (action === 'settle') return `${TERRAIN[tile.terrain].name}の開拓`;
  if (action === 'invade') return `${META[tile.owner].name}への侵攻`;
  if (action === 'demolish') return `${BUILDINGS[tile.building]?.name || '建物'}の撤去`;
  if (BUILDINGS[action]) return `${BUILDINGS[action].name}の建設`;
  return '直前の命令';
}
function matchingPlayerRedo(key) {
  if (!playerRedoEntry || playerRedoEntry.key !== key) {
    playerRedoEntry = null;
    return null;
  }
  const entry = playerRedoEntry;
  playerRedoEntry = null;
  return entry;
}
function recordPlayerUndo(before, key, label, result) {
  const entry = {
    before,
    after: clonePlayerState(),
    key,
    label,
    result: { ...result },
  };
  playerUndoStack.push(entry);
  playerUndoStack = playerUndoStack.slice(-2);
  return result;
}
function replayPlayerAction(entry) {
  const before = clonePlayerState();
  state = clonePlayerState(entry.after);
  if (canOfferAutoSettlement()) setTimeout(maybeOfferAutoSettlement, 0);
  return recordPlayerUndo(before, entry.key, entry.label, entry.result);
}
function canUndoPlayerAction() {
  return (
    playerUndoStack.length > 0 && !state.autoSettlement && !state.playerDefeated && !state.gameOver
  );
}
function playerUndoDescription() {
  return playerUndoStack.length
    ? `「${playerUndoStack.at(-1).label}」を取り消します`
    : '戻せる命令はありません';
}
function clearPlayerUndo() {
  playerUndoStack = [];
  playerRedoEntry = null;
}
function undoLastPlayerAction() {
  if (!canUndoPlayerAction()) return false;
  const entry = playerUndoStack.pop();
  playerRedoEntry = entry;
  state = clonePlayerState(entry.before);
  autoSettlementOfferShown = false;
  selectedTile = null;
  mobileBuildOpen = false;
  render();
  toast(`「${entry.label}」を取り消しました`);
  return true;
}
function performPlayerAction(action, i) {
  const status = playerActionStatus(action, i);
  if (!status.ok) return status;
  const key = playerActionKey(action, i),
    redo = matchingPlayerRedo(key);
  if (redo) return replayPlayerAction(redo);
  const before = clonePlayerState(),
    label = playerActionLabel(action, i);
  const t = state.tiles[i],
    building = BUILDINGS[action];
  if (action === 'settle') {
    state.gold -= 10;
    state.food -= 8;
    state.population--;
    t.owner = 'player';
    t.isolation = 0;
    t.occupation = 1;
    useOrder();
    addLog(`${TERRAIN[t.terrain].name}に開拓団が旗を立て、安定化を開始した。`, 'good');
    checkVictory();
    return recordPlayerUndo(before, key, label, {
      ok: true,
      message: '中立地の安定化を開始しました',
    });
  }
  if (action === 'invade') return recordPlayerUndo(before, key, label, playerInvade(i));
  if (action === 'demolish') {
    const old = BUILDINGS[t.building]?.name || '建物';
    t.building = null;
    t.fortIdle = 0;
    useOrder();
    addLog(
      `${old}を撤去し、土地を更地に戻した。${t.occupation === 1 ? '土地は引き続き安定化中である。' : ''}`,
    );
    checkVictory();
    return recordPlayerUndo(before, key, label, {
      ok: true,
      message: '建物を撤去しました',
    });
  }
  if (building) {
    state.gold -= building.cost;
    t.building = action;
    t.fortIdle = 0;
    useOrder();
    addLog(
      `${TERRAIN[t.terrain].name}に${building.name}を建設した。${t.occupation === 1 ? '施設効果は安定化完了後に有効となる。' : ''}`,
    );
    checkVictory();
    return recordPlayerUndo(before, key, label, { ok: true, message: '' });
  }
  return { ok: false, reason: '' };
}
function handleTile(i, execute = false) {
  if (selectedTile !== i) mobileBuildOpen = false;
  selectedTile = i;
  if (state.gameOver || state.playerDefeated || state.autoSettlement || (isMobile() && !execute))
    return render();
  if (!playerActionTargetValid(selectedAction, i)) return render();
  const result = performPlayerAction(selectedAction, i);
  if (!result.ok) {
    if (result.reason) toast(result.reason);
    return render();
  }
  if (result.message) toast(result.message);
  render();
}
function support(i, id) {
  return (
    neighbors(i).filter(
      (n) =>
        state.tiles[n].owner === id &&
        !state.tiles[n].occupation &&
        state.tiles[n].building === 'barracks',
    ).length * 3
  );
}
function playerInvade(i) {
  const t = state.tiles[i],
    enemy = t.owner,
    def = tileDefense(i) + rand(5),
    attack = Math.floor(state.army * 0.7) + support(i, 'player') + rand(5);
  useOrder();
  if (attack >= def) {
    const loss = Math.min(state.army, Math.max(1, Math.ceil(def / 5)));
    state.army -= loss;
    let defenderLoss = 0;
    if (state.factions[enemy]) {
      const before = state.factions[enemy].army;
      state.factions[enemy].army = Math.max(0, before - Math.ceil(loss / 2));
      defenderLoss = before - state.factions[enemy].army;
    }
    recordWarBattle('player', enemy, loss, defenderLoss);
    addLog(`${META[enemy].name}との戦いに勝利し、領土を獲得した。兵${loss}人を失った。`, 'good');
    capture(i, 'player');
    return { ok: true, message: '敵領を占領しました', outcome: 'victory' };
  } else {
    const loss = Math.min(state.army, Math.max(2, Math.ceil(def / 3)));
    state.army -= loss;
    recordWarBattle('player', enemy, loss, 0);
    addLog(`${META[enemy].name}への侵攻は失敗し、兵${loss}人を失った。`, 'war');
    checkVictory();
    return { ok: true, message: '侵攻に失敗しました', outcome: 'failure' };
  }
}
function relocationCount(id) {
  return id === 'player' ? state.relocations : state.factions[id]?.relocations || 0;
}
function relocationChance(id) {
  return 0.5 / Math.pow(2, relocationCount(id));
}
function formatChance(chance) {
  const pct = chance * 100;
  return `${pct >= 1 ? (Number.isInteger(pct) ? pct : pct.toFixed(1)) : '1未満'}%`;
}
function distanceToOwner(i, owner) {
  const targets = state.tiles.map((t, n) => (t.owner === owner ? n : -1)).filter((n) => n >= 0);
  return targets.length ? Math.min(...targets.map((n) => distance(i, n))) : 20;
}
function ownerComponents(owner) {
  const unseen = new Set(
      state.tiles.map((t, i) => (t.owner === owner ? i : -1)).filter((i) => i >= 0),
    ),
    groups = [];
  while (unseen.size) {
    const first = unseen.values().next().value,
      group = [],
      queue = [first];
    unseen.delete(first);
    while (queue.length) {
      const i = queue.shift();
      group.push(i);
      for (const n of neighbors(i))
        if (unseen.has(n)) {
          unseen.delete(n);
          queue.push(n);
        }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}
function annexRelocationLands(loser, winner, oldCapital, count) {
  let taken = 0;
  while (taken < count) {
    let candidates = state.tiles
      .map((t, i) =>
        t.owner === loser && neighbors(i).some((n) => state.tiles[n].owner === winner) ? i : -1,
      )
      .filter((i) => i >= 0);
    if (!candidates.length)
      candidates = state.tiles.map((t, i) => (t.owner === loser ? i : -1)).filter((i) => i >= 0);
    if (!candidates.length) break;
    candidates.sort(
      (a, b) =>
        distance(a, oldCapital) - distance(b, oldCapital) ||
        neighbors(b).filter((n) => state.tiles[n].owner === winner).length -
          neighbors(a).filter((n) => state.tiles[n].owner === winner).length,
    );
    const tile = state.tiles[candidates[0]];
    tile.owner = winner;
    tile.isolation = 0;
    tile.occupation = 2;
    tile.fortIdle = 0;
    tile.capital = false;
    taken++;
  }
  return taken;
}
function establishNewCapital(loser, winner) {
  const largest = ownerComponents(loser)[0] || [];
  if (!largest.length) return -1;
  let candidates = largest.filter((i) => state.tiles[i].building === 'town');
  if (!candidates.length) candidates = largest.filter((i) => state.tiles[i].building === 'fort');
  if (!candidates.length) candidates = [...largest];
  candidates.sort(
    (a, b) =>
      distanceToOwner(b, winner) - distanceToOwner(a, winner) || tileDefense(b) - tileDefense(a),
  );
  const i = candidates[0],
    tile = state.tiles[i];
  tile.capital = true;
  tile.building = 'capital';
  tile.isolation = 0;
  tile.occupation = 0;
  tile.fortIdle = 0;
  return i;
}
function tryRelocation(loser, winner, oldCapital, formerLand) {
  if (!state.tiles.some((t) => t.owner === loser)) return false;
  if (Math.random() >= relocationChance(loser)) return false;
  annexRelocationLands(loser, winner, oldCapital, Math.floor((formerLand - 1) / 2));
  const newCapital = establishNewCapital(loser, winner);
  if (newCapital < 0) return false;
  if (loser === 'player') state.relocations++;
  else {
    state.factions[loser].relocations++;
    state.factions[loser].alive = true;
  }
  addLog(
    `${META[loser].name}は${TERRAIN[state.tiles[newCapital].terrain].name}へ遷都し、国家の存続に成功した。`,
    'war',
    { participants: [loser, winner], important: true },
  );
  if (loser === 'player') toast('遷都に成功し、抗戦を継続します');
  return true;
}
function recentCaptureCount(tile, years = 6) {
  return (tile.captureYears || []).filter((year) => state.year - year <= years).length;
}
function recordCapture(tile) {
  const recent = (tile.captureYears || []).filter((year) => state.year - year <= 6);
  state.metrics ??= { captures: 0, rapidRecaptures: 0, repeatedRecaptures: 0 };
  state.metrics.captures++;
  if (recent.length) state.metrics.rapidRecaptures++;
  if (recent.length >= 2) state.metrics.repeatedRecaptures++;
  tile.captureYears = [...recent, state.year].slice(-8);
}
function capture(i, winner) {
  const t = state.tiles[i],
    loser = t.owner,
    capital = t.capital,
    formerLand = land(loser);
  recordCapture(t);
  t.owner = winner;
  t.isolation = 0;
  t.occupation = 2;
  t.fortIdle = 0;
  if (capital) {
    t.capital = false;
    t.building = 'town';
    if (tryRelocation(loser, winner, i, formerLand)) {
      checkVictory();
      return;
    }
    if (loser === 'player') {
      gameOver(`${META[winner].name}が王都を攻略し、アルデン王国は崩壊した。`);
      return;
    }
    defeatFaction(loser, winner);
  }
  checkVictory();
}
function defeatFaction(id, winner) {
  const f = state.factions[id];
  if (!f || !f.alive) return;
  f.alive = false;
  clearWarFatigueFor(id);
  state.tiles.forEach((t) => {
    if (t.owner === id) {
      t.owner = 'neutral';
      t.isolation = 0;
      t.occupation = 0;
      t.fortIdle = 0;
    }
  });
  addLog(
    `${META[winner].name}が${META[id].name}の首都を攻略。同国は崩壊し、残領は中立化した。`,
    'war',
    { participants: [id, winner], important: true },
  );
  if (winner === 'player') setTimeout(maybeOfferAutoSettlement, 0);
}

function canOfferAutoSettlement() {
  return (
    !state.gameOver &&
    !state.playerDefeated &&
    !state.autoSettlement &&
    !state.autoSettlementDeclined &&
    ['red', 'blue', 'ochre'].every((id) => !state.factions[id].alive) &&
    state.tiles.some((t) => t.owner === 'neutral')
  );
}
function maybeOfferAutoSettlement() {
  if (!canOfferAutoSettlement() || autoSettlementOfferShown) return;
  autoSettlementOfferShown = true;
  const neutral = land('neutral');
  showDialog(
    '残る中立地を開拓しますか？',
    `<p>最後の敵国が崩壊し、残る脅威はありません。中立地<strong>${neutral}領</strong>を、通常と同じく1領ごとに金貨10・食料8・民1・命令1を使って自動開拓できます。</p><p>金貨・食料・民の増減と安定化を1年ごとに計算し、100マス統一まで進めます。</p>`,
    '自動開拓する',
    startAutoSettlement,
    '戦後評議会',
    {
      label: '手動で続ける',
      handler: () => {
        state.autoSettlementDeclined = true;
        render();
        toast('手動で開拓を続けます');
      },
    },
  );
}
function startAutoSettlement() {
  if (!canOfferAutoSettlement()) return;
  clearPlayerUndo();
  state.autoSettlement = true;
  state.autoSettlementDeclined = false;
  autoSettlementIdleYears = 0;
  selectedTile = null;
  addLog('王国は残る中立地の自動開拓を開始した。', 'good');
  render();
  scheduleAutoSettlement();
}
function scheduleAutoSettlement(delay = 260) {
  clearTimeout(autoSettlementTimer);
  autoSettlementTimer = setTimeout(runAutoSettlementYear, delay);
}
function autoSettlementTargets() {
  return state.tiles
    .map((t, i) =>
      t.owner === 'neutral' &&
      neighbors(i).some((n) => state.tiles[n].owner === 'player' && !state.tiles[n].occupation)
        ? i
        : -1,
    )
    .filter((i) => i >= 0)
    .sort(
      (a, b) =>
        neighbors(b).filter((n) => state.tiles[n].owner === 'player' && !state.tiles[n].occupation)
          .length -
        neighbors(a).filter((n) => state.tiles[n].owner === 'player' && !state.tiles[n].occupation)
          .length,
    );
}
function runAutoSettlementYear() {
  autoSettlementTimer = null;
  if (!state.autoSettlement || state.gameOver || state.playerDefeated) return;
  let settled = 0;
  while (state.orders > 0 && state.gold >= 10 && state.food >= 8 && state.population >= 2) {
    const target = autoSettlementTargets()[0];
    if (target === undefined) break;
    const tile = state.tiles[target];
    state.gold -= 10;
    state.food -= 8;
    state.population--;
    tile.owner = 'player';
    tile.isolation = 0;
    tile.occupation = 1;
    useOrder();
    settled++;
  }
  if (settled) addLog(`戦後の開拓団が中立地${settled}領に旗を立てた。`, 'good');
  if (land('player') === 100) {
    state.autoSettlement = false;
    checkVictory();
    render();
    return;
  }
  autoSettlementIdleYears = settled ? 0 : autoSettlementIdleYears + 1;
  if (autoSettlementIdleYears >= 12) {
    state.autoSettlement = false;
    state.autoSettlementDeclined = true;
    addLog('物資または民の不足が長引き、自動開拓を停止した。', 'war');
    render();
    toast('自動開拓を停止しました');
    return;
  }
  produce('player');
  advanceOccupations('player');
  updateSupply();
  state.year++;
  advanceRoyalSuccession();
  state.orders = yearlyOrders('player');
  selectedTile = null;
  render();
  scheduleAutoSettlement();
}

function playerRecruitStatus() {
  if (state.gameOver || state.playerDefeated || state.autoSettlement)
    return { ok: false, reason: '現在は命令を実行できません' };
  if (state.orders < 1) return { ok: false, reason: '今年の命令を使い切りました' };
  if (state.population < 4 || state.gold < 15 || state.food < 8)
    return { ok: false, reason: '徴兵の条件を満たしていません' };
  return { ok: true, reason: '' };
}
function performPlayerRecruit() {
  const status = playerRecruitStatus();
  if (!status.ok) return status;
  const key = playerActionKey('recruit'),
    redo = matchingPlayerRedo(key);
  if (redo) return replayPlayerAction(redo);
  const before = clonePlayerState(),
    label = '徴兵';
  state.population -= 3;
  state.gold -= 15;
  state.food -= 8;
  state.army += 4;
  useOrder();
  addLog('民3人を招集し、兵力4を編成した。');
  checkVictory();
  return recordPlayerUndo(before, key, label, { ok: true, message: '' });
}
function recruit() {
  const result = performPlayerRecruit();
  if (!result.ok && result.reason) toast(result.reason);
  render();
  return result;
}
function addLog(text, kind = '', options = {}) {
  const participants = Array.isArray(options.participants) ? options.participants : ['player'];
  if (!participants.includes('player')) return false;
  state.log.push({
    year: state.year,
    text,
    kind,
    important: !!options.important,
    participants: [...new Set(participants)],
  });
  state.log = trimChronicle(state.log);
  return true;
}

function produce(id) {
  const inc = income(id),
    growth = populationGrowth(id);
  if (id === 'player') {
    state.gold = Math.max(0, state.gold + inc.gold);
    state.food += inc.food;
    if (state.food > state.population && growth > 0) state.population += growth;
    if (state.food < 0) {
      state.population = Math.max(1, state.population - Math.ceil(Math.abs(state.food) / 8));
      state.food = 0;
      addLog('食料不足により民が領土を離れた。', 'war');
    }
  } else {
    const f = state.factions[id];
    if (!f.alive) return;
    f.gold = Math.max(0, f.gold + inc.gold);
    f.food += inc.food;
    if (f.food > f.population && growth > 0) f.population += growth;
    if (f.food < 0) {
      f.population = Math.max(1, f.population - Math.ceil(Math.abs(f.food) / 8));
      f.food = 0;
      addLog(`${META[id].name}で食料不足が起こり、民が領土を離れた。`, 'war', {
        participants: [id],
      });
    }
  }
}
