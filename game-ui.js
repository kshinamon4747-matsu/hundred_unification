'use strict';

function render() {
  const inc = income('player'),
    s = stats('player');
  $('year').textContent = state.year;
  $('worldName').textContent = `エルデン大陸・${state.worldName}`;
  $('gold').textContent = state.gold;
  $('food').textContent = state.food;
  $('population').textContent = state.population;
  $('army').textContent = state.army;
  $('orders').textContent = state.orders;
  const totalLand = conquerableLand();
  $('unity').textContent = Math.round((s.land / totalLand) * 100);
  $('landCount').textContent = `${s.land}／${totalLand}領`;
  $('goldDelta').textContent = `来年 ${signed(inc.gold)}`;
  $('goldDelta').title =
    `統治済み領土 ${s.productiveLand} + 町 ${s.towns * 5} − 軍維持 ${Math.ceil(state.army / 5)}`;
  $('foodDelta').textContent = `来年 ${signed(inc.food)}`;
  $('popDelta').textContent = `来年 最大+${populationGrowth('player')}／上限 ${inc.capacity}`;
  $('armyDelta').textContent = `維持 金${Math.ceil(state.army / 5)} 食${Math.ceil(state.army / 3)}`;
  renderNations();
  renderThreat();
  renderMap();
  renderCommands();
  renderSelection();
  renderLog();
  save();
}
const signed = (n) => (n >= 0 ? '+' : '') + n;
function nationIntent(id, alive = true) {
  if (id === 'player' || !alive) return null;
  if (isSanctioned(id)) return { text: '列国の制裁下', tone: 'danger' };
  const partner = ceasefirePartner(id);
  if (partner) return { text: `${META[partner].short}と停戦中`, tone: 'peace' };
  const f = state.factions[id],
    s = stats(id),
    inc = income(id),
    enemies = borderTargets(id, (o) => o !== id && o !== 'neutral').filter(
      (i) => !activeCeasefire(id, state.tiles[i].owner),
    ),
    neutral = borderTargets(id, (o) => o === 'neutral');
  if (enemies.some((i) => threatensOwnCapital(id, i))) return { text: '首都防衛', tone: 'danger' };
  const level = threatLevel(),
    leader = threatLeader();
  if (level === 1 && leader !== id) return { text: `${META[leader].short}を警戒`, tone: 'watch' };
  if (inc.food < 0) return { text: '食料確保', tone: 'build' };
  if (s.pop >= s.capacity - 2) return { text: '町を整備', tone: 'build' };
  if (f.army < Math.ceil(aiArmyGoal(id) * 0.75) && canAiRecruit(id))
    return { text: '兵力増強', tone: 'war' };
  if (ochreOffensiveReady(id) && enemies.length)
    return { text: '蓄えを投入する好機待ち', tone: 'war' };
  if (enemies.some((i) => state.tiles[i].capital)) return { text: '敵首都を攻略', tone: 'war' };
  if (id === 'red' && enemies.length) return { text: '前線突破を準備', tone: 'war' };
  if (id === 'blue' && enemies.length) return { text: '勝機へ国力を蓄積', tone: 'build' };
  if (id === 'ochre' && (neutral.length || enemies.length))
    return { text: '長期戦の兵站を整備', tone: 'expand' };
  if (neutral.length) return { text: '中立地を開拓', tone: 'expand' };
  if (enemies.length) return { text: '侵攻機会を模索', tone: 'watch' };
  return null;
}
function nationDiplomacyText(id) {
  if (isSanctioned(id)) return `条約破り・制裁残り${sanctionRemaining(id)}年`;
  const partner = ceasefirePartner(id);
  if (partner) {
    const agreement = state.ceasefires[diplomacyPairKey(id, partner)],
      extension = agreement?.renewals ? `・延長${agreement.renewals}回` : '';
    return `${META[partner].name}と停戦中・残り${ceasefireRemaining(id, partner)}年${extension}`;
  }
  if (id !== 'player') {
    const cooldown = ceasefireCooldownRemaining('player', id);
    if (cooldown) return `アルデンとの再交渉まで${cooldown}年`;
  }
  return '';
}
function renderNations() {
  $('nations').innerHTML = nationIds()
    .map((id) => {
      const alive = id === 'player' ? !state.playerDefeated : state.factions[id].alive,
        s = stats(id),
        intent = nationIntent(id, alive),
        fatigue = id !== 'player' && alive ? warFatigueStatus(id, 'player') : null,
        diplomacy = alive ? nationDiplomacyText(id) : '',
        proposal =
          id !== 'player' && alive && !state.playerDefeated
            ? ceasefireProposalStatus('player', id)
            : null,
        canShowProposal = proposal && !activeCeasefire('player', id);
      return `<article class="nation ${id} ${alive ? '' : 'dead'}"><div class="nation-head"><i class="nation-color" style="background:${COLORS[id]}"></i><strong>${META[id].name}</strong>${id === 'player' ? '<b class="you-badge">あなた</b>' : ''}<small>${alive ? META[id].trait : '滅亡'}</small></div>${intent ? `<div class="nation-intent ${intent.tone}"><span>◆</span>${intent.text}</div>` : ''}${fatigue ? `<div class="nation-fatigue ${fatigue.tone}">対アルデン：<strong>${fatigue.text}</strong></div>` : ''}${diplomacy ? `<div class="nation-diplomacy">${diplomacy}</div>` : ''}<div class="nation-stats"><span>領土 ${s.land}</span><span>兵力 ${s.army}</span><span>${s.towns + s.farms + s.barracks + s.forts}施設</span><span>駐屯 ${garrisonLocation(id) >= 0 ? '配備' : 'なし'}</span></div>${canShowProposal ? `<button class="ceasefire-button" data-ceasefire="${id}" ${proposal.ok ? '' : 'disabled'} title="${proposal.reason}">停戦を提案${proposal.ok ? `・見込み${ceasefireLikelihood(id, 'player')}` : ''}</button>` : ''}</article>`;
    })
    .join('');
  document
    .querySelectorAll('[data-ceasefire]')
    .forEach((button) =>
      button.addEventListener('click', () => proposePlayerCeasefire(button.dataset.ceasefire)),
    );
}
function threatRanking() {
  return nationIds()
    .filter((id) => land(id) > 0)
    .sort((a, b) => land(b) - land(a));
}
function threatLeader() {
  return threatRanking()[0] || 'player';
}
function threatLevel() {
  if (globalThis.__THREAT_MODE__ === 'none') return 0;
  const ranked = threatRanking(),
    territory = ranked.length ? land(ranked[0]) : 0,
    gap = ranked.length > 1 ? territory - land(ranked[1]) : territory;
  if (gap < 5) return 0;
  return territory >= Math.ceil(conquerableLand() * 0.35) ? 1 : 0;
}
function yearlyOrders() {
  const lateOrderYear =
    globalThis.__LATE_ORDER_YEAR__ === undefined
      ? 200
      : Number(globalThis.__LATE_ORDER_YEAR__) || 0;
  return lateOrderYear > 0 && state.year >= lateOrderYear ? 3 : 2;
}
function renderThreat() {
  const level = threatLevel(),
    leader = threatLeader(),
    name = META[leader].name,
    card = $('threatStatus');
  card.className = `rules-note threat-note ${level === 1 ? 'caution' : ''}`;
  card.innerHTML =
    level === 1
      ? `<strong>${name}への警戒</strong><p>${name}が全領土の35%以上かつ2位に5領差をつけ、他国は同国への攻撃を優先します。</p>`
      : '<strong>列国情勢</strong><p>最大国が全領土の35%以上かつ2位に5領差をつけると、列国の警戒対象になります。</p>';
}
function isBoundary(i, side) {
  const row = Math.floor(i / 10),
    col = i % 10,
    j = side === 'top' ? i - 10 : side === 'right' ? i + 1 : side === 'bottom' ? i + 10 : i - 1;
  if (
    (side === 'top' && row === 0) ||
    (side === 'bottom' && row === 9) ||
    (side === 'left' && col === 0) ||
    (side === 'right' && col === 9)
  )
    return true;
  return state.tiles[j].owner !== state.tiles[i].owner;
}
function validTarget(i) {
  return playerActionTargetValid(selectedAction, i);
}
function renderMap() {
  $('map').innerHTML = state.tiles
    .map((t, i) => {
      const color = COLORS[t.owner],
        border = t.owner === 'player' ? '#e4c15b' : color,
        b = t.capital ? { icon: '♛', name: '首都' } : BUILDINGS[t.building],
        style = `--owner:${color};border-top-color:${isBoundary(i, 'top') ? border : 'transparent'};border-right-color:${isBoundary(i, 'right') ? border : 'transparent'};border-bottom-color:${isBoundary(i, 'bottom') ? border : 'transparent'};border-left-color:${isBoundary(i, 'left') ? border : 'transparent'}`;
      const def = isConquerableTile(t) ? tileDefense(i) : null;
      const supplyClass =
        t.supplyStatus === 'limited'
          ? 'limited-supply'
          : t.supplyStatus === 'cut'
            ? 'isolated'
            : '';
      const supplyLabel =
        t.supplyStatus === 'limited' ? '、限定補給' : t.supplyStatus === 'cut' ? '、補給切れ' : '';
      const stationed = garrisonLocation(t.owner) === i;
      return `<button class="tile owner-${t.owner} ${t.terrain} ${t.riverAxis ? `river-${t.riverAxis}` : ''} ${supplyClass} ${t.occupation ? 'occupied' : ''} ${t.occupation === 2 ? 'protected' : ''} ${stationed ? 'has-garrison-unit' : ''} ${selectedTile === i ? 'selected' : ''} ${!isMobile() && validTarget(i) ? 'valid' : ''}" style="${style}" data-index="${i}" role="gridcell" aria-label="${META[t.owner].name}、${TERRAIN[t.terrain].name}${b ? '、' + b.name : ''}${stationed ? '、駐屯兵団配備' : ''}${t.occupation === 2 ? '、占領保護中' : t.occupation === 1 ? '、安定化中' : ''}${supplyLabel}"><span class="flag">${['neutral', 'void'].includes(t.owner) ? '' : t.owner === 'player' ? '♛' : META[t.owner].short.slice(0, 1)}</span>${b ? `<span class="structure">${b.icon}</span>` : `<span class="terrain">${TERRAIN[t.terrain].icon}</span>`}${t.occupation ? `<span class="occupation-mark">${t.occupation === 2 ? '保' : '安'}</span>` : ''}${stationed ? '<span class="garrison-unit">駐</span>' : ''}${def === null ? '' : `<span class="garrison">${def}</span>`}</button>`;
    })
    .join('');
  document
    .querySelectorAll('.tile')
    .forEach((el) => el.addEventListener('click', () => handleTile(+el.dataset.index)));
}
function renderCommands() {
  document.querySelectorAll('[data-action]').forEach((b) => {
    b.classList.toggle('active', selectedAction === b.dataset.action);
    b.disabled =
      state.gameOver ||
      state.playerDefeated ||
      state.autoSettlement ||
      state.orders < 1 ||
      (b.dataset.action === 'bridge' &&
        (builtBridgeCount('player') >= 1 ||
          state.gold < BRIDGE_COST.gold ||
          state.food < BRIDGE_COST.food));
  });
  const townCount = state.tiles.filter((t) => t.owner === 'player' && t.building === 'town').length;
  $('buildings').innerHTML = Object.entries(BUILDINGS)
    .map(
      ([k, b]) =>
        `<button data-build="${k}" class="${selectedAction === k ? 'active' : ''}" ${state.gameOver || state.playerDefeated || state.autoSettlement || state.orders < 1 || state.gold < b.cost ? 'disabled' : ''}><strong>${b.icon} ${b.name}${k === 'town' ? ` <span class="building-count">現在 ${townCount}</span>` : ''}</strong><small>金${b.cost}・${b.effect}</small></button>`,
    )
    .join('');
  document.querySelectorAll('[data-build]').forEach((b) =>
    b.addEventListener('click', () => {
      selectedAction = b.dataset.build;
      render();
    }),
  );
  $('recruitBtn').disabled = !playerRecruitStatus().ok;
  const garrison = garrisonLocation('player'),
    garrisonWait =
      garrison < 0
        ? Math.max(0, (state.garrisonFormationYears?.player || 0) - state.year)
        : Math.max(0, (state.garrisonMoveYears?.player || 0) - state.year);
  $('garrisonBtn').querySelector('small').textContent = garrisonWait
    ? `${garrison < 0 ? '再編成' : '再移動'}まで${garrisonWait}年`
    : garrison < 0
      ? '金20・食15・民1'
      : '移動 金5・食5';
  $('undoBtn').disabled = !canUndoPlayerAction();
  $('undoBtn').querySelector('small').textContent = playerUndoDescription();
  $('endTurnBtn').disabled = state.gameOver || state.autoSettlement;
  $('endTurnBtn').querySelector('span').textContent = state.autoSettlement
    ? '自動開拓中'
    : state.playerDefeated
      ? '次の年を観戦'
      : '年を進める';
  $('endTurnBtn').querySelector('small').textContent = state.autoSettlement
    ? '年ごとに資源と民を計算しています'
    : state.playerDefeated
      ? '残る国家が行動します'
      : '各国が行動します';
  renderMobileActions();
}
function isMobile() {
  return mobileMedia.matches;
}
function targetAllows(i, action) {
  return playerActionTargetValid(action, i);
}
function renderMobileActions() {
  const box = $('mobileActions');
  if (!box) return;
  if (state.autoSettlement) {
    box.innerHTML = '<div class="mobile-empty">王国が中立地を自動開拓しています</div>';
    return;
  }
  if (state.gameOver || state.playerDefeated) {
    box.innerHTML = '<div class="mobile-empty">命令を出せる王国はありません</div>';
    return;
  }
  const recruitButton = `<button data-mobile-recruit ${playerRecruitStatus().ok ? '' : 'disabled'}><strong>♟ 徴兵</strong><small>民3・金15・食8</small></button>`,
    undoButton = `<button data-mobile-undo ${canUndoPlayerAction() ? '' : 'disabled'}><strong>↶ 1手戻す</strong><small>${playerUndoDescription()}</small></button>`;
  if (selectedTile === null) {
    box.innerHTML = `<div class="mobile-empty">先に地図のマスを選択してください</div><div class="mobile-action-grid">${recruitButton}${undoButton}</div>`;
    box.querySelector('[data-mobile-recruit]')?.addEventListener('click', recruit);
    box.querySelector('[data-mobile-undo]')?.addEventListener('click', undoLastPlayerAction);
    return;
  }
  const t = state.tiles[selectedTile],
    actions = [];
  if (targetAllows(selectedTile, 'settle'))
    actions.push(
      `<button data-mobile-action="settle" ${canPlayerAction('settle', selectedTile) ? '' : 'disabled'}><strong>⚑ 開拓</strong><small>金10・食8・民1</small></button>`,
    );
  if (targetAllows(selectedTile, 'invade'))
    actions.push(
      `<button data-mobile-action="invade" ${canPlayerAction('invade', selectedTile) ? '' : 'disabled'}><strong>⚔ ${activeCeasefire('player', t.owner) ? '停戦破棄・奇襲' : '侵攻'}</strong><small>${activeCeasefire('player', t.owner) ? '奇襲+2・制裁8年' : '兵力5以上・命令1'}</small></button>`,
    );
  if (targetAllows(selectedTile, 'demolish'))
    actions.push(
      `<button data-mobile-action="demolish" ${canPlayerAction('demolish', selectedTile) ? '' : 'disabled'}><strong>⌫ 施設撤去</strong><small>払い戻しなし・命令1</small></button>`,
    );
  if (targetAllows(selectedTile, 'bridge'))
    actions.push(
      (() => {
        const bridge = bridgeSiteStatus('player', selectedTile),
          cost = bridge.cost || BRIDGE_COST;
        return `<button data-mobile-action="bridge" ${canPlayerAction('bridge', selectedTile) ? '' : 'disabled'}><strong>═ 橋を建設</strong><small>金${cost.gold}・食${cost.food}・命令1</small></button>`;
      })(),
    );
  if (targetAllows(selectedTile, 'garrison')) {
    const current = garrisonLocation('player'),
      status = playerActionStatus('garrison', selectedTile),
      cost = current < 0 ? garrisonFormationCost() : GARRISON_MOVE_COST;
    actions.push(
      `<button data-mobile-action="garrison" ${status.ok ? '' : 'disabled'}><strong>▣ 駐屯兵団を${current < 0 ? '編成' : '移動'}</strong><small>${status.ok ? `金${cost.gold}・食${cost.food}${current < 0 ? '・民1' : ''}・命令1` : status.reason}</small></button>`,
    );
  }
  if (t.owner === 'player' && !t.building && t.occupation !== 2)
    actions.push(
      '<button class="mobile-build-toggle" data-mobile-build-toggle><strong>♜ 建設</strong><small>施設を選択</small></button>',
    );
  actions.push(recruitButton);
  actions.push(undoButton);
  const townCount = state.tiles.filter(
      (tile) => tile.owner === 'player' && tile.building === 'town',
    ).length,
    buildings =
      mobileBuildOpen && t.owner === 'player' && !t.building && t.occupation !== 2
        ? `<div class="mobile-building-grid">${Object.entries(BUILDINGS)
            .map(
              ([k, b]) =>
                `<button data-mobile-action="${k}" ${canPlayerAction(k, selectedTile) ? '' : 'disabled'}><strong>${b.icon} ${b.name}${k === 'town' ? ` <span class="building-count">現在 ${townCount}</span>` : ''}</strong><small>金${b.cost}・${b.effect}</small></button>`,
            )
            .join('')}</div>`
        : '';
  box.innerHTML = `<p class="mobile-action-hint">この土地で行う命令を選んでください</p><div class="mobile-action-grid">${actions.join('')}</div>${buildings}`;
  box.querySelectorAll('[data-mobile-action]').forEach((button) =>
    button.addEventListener('click', () => {
      selectedAction = button.dataset.mobileAction;
      mobileBuildOpen = false;
      handleTile(selectedTile, true);
    }),
  );
  box.querySelector('[data-mobile-build-toggle]')?.addEventListener('click', () => {
    mobileBuildOpen = !mobileBuildOpen;
    render();
  });
  box.querySelector('[data-mobile-recruit]')?.addEventListener('click', recruit);
  box.querySelector('[data-mobile-undo]')?.addEventListener('click', undoLastPlayerAction);
}
function renderSelection() {
  if (selectedTile === null) {
    $('selection').innerHTML =
      '<small>選択中</small><strong>領地を選択してください</strong><p>地形や所有国を表示します</p>';
    return;
  }
  const t = state.tiles[selectedTile],
    b = t.capital
      ? '首都'
      : TERRAIN[t.terrain].blocked
        ? '地形'
        : BUILDINGS[t.building]?.name || '未開発',
    relocation =
      t.capital && t.owner !== 'neutral'
        ? `／遷都成功率 ${formatChance(relocationChance(t.owner))}`
        : '',
    occupation =
      t.occupation === 2
        ? '／占領保護中（再攻撃不可・収入なし・拠点利用不可）'
        : t.occupation === 1
          ? '／安定化中（施設建設・撤去可・奪還可能・収入なし・施設効果なし・拠点利用不可）'
          : '',
    diplomacy = activeCeasefire('player', t.owner) ? '／停戦中（侵攻すると制裁8年）' : '',
    stationed = garrisonLocation(t.owner) === selectedTile ? '／駐屯兵団（守備+5）' : '',
    farmOutput = t.building === 'farm' ? `／農場の食料 +${farmFoodAt(selectedTile)}` : '';
  const terrainNote = TERRAIN[t.terrain].blocked
    ? terrainEffectText(t)
    : `${terrainEffectText(t)}／現在の守備 ${tileDefense(selectedTile)}`;
  const supply =
    t.supplyStatus === 'limited'
      ? '／限定補給（守備−1）'
      : t.supplyStatus === 'cut'
        ? `／補給切れ −${t.isolation}`
        : '';
  $('selection').innerHTML =
    `<small>${META[t.owner].name}</small><strong>${TERRAIN[t.terrain].name}・${b}</strong><p>${terrainNote}${farmOutput}${stationed}${occupation}${supply}${relocation}${diplomacy}</p>`;
}
function renderLog() {
  const wrap = document.querySelector('.chronicle-wrap'),
    chronicle = $('chronicle');
  wrap.classList.toggle('timeline-view', chronicleTimeline);
  if (!chronicleTimeline) {
    chronicle.innerHTML = [...state.log]
      .reverse()
      .map(
        (e) =>
          `<article class="entry ${e.kind || ''}"><time>統一暦 ${e.year}年</time><p>${e.text}</p></article>`,
      )
      .join('');
    return;
  }
  const years = new Map();
  state.log.forEach((e) => {
    if (!years.has(e.year)) years.set(e.year, []);
    years.get(e.year).push(e);
  });
  chronicle.innerHTML = [...years.entries()]
    .map(
      ([year, events]) =>
        `<section class="timeline-year"><time>統一暦<br><strong>${year}年</strong></time><div class="timeline-events">${events.map((e) => `<article class="entry ${e.kind || ''}"><p>${e.text}</p></article>`).join('')}</div></section>`,
    )
    .join('');
}
