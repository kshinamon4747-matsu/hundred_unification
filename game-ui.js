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
  $('unity').textContent = s.land;
  $('landCount').textContent = `${s.land}領`;
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
  const f = state.factions[id],
    s = stats(id),
    inc = income(id),
    enemies = borderTargets(id, (o) => o !== id && o !== 'neutral'),
    neutral = borderTargets(id, (o) => o === 'neutral');
  if (enemies.some((i) => threatensOwnCapital(id, i))) return { text: '首都防衛', tone: 'danger' };
  const level = threatLevel(),
    leader = threatLeader();
  if (level === 1 && leader !== id) return { text: `${META[leader].short}を警戒`, tone: 'watch' };
  if (inc.food < 0) return { text: '食料確保', tone: 'build' };
  if (s.pop >= s.capacity - 2) return { text: '町を整備', tone: 'build' };
  if (f.army < Math.ceil(aiArmyGoal(id) * 0.75) && canAiRecruit(id))
    return { text: '兵力増強', tone: 'war' };
  if (enemies.some((i) => state.tiles[i].capital)) return { text: '敵首都を攻略', tone: 'war' };
  if (id === 'red' && enemies.length) return { text: '前線突破を準備', tone: 'war' };
  if (id === 'blue' && enemies.length) return { text: '勝機へ国力を蓄積', tone: 'build' };
  if (id === 'ochre' && (neutral.length || enemies.length))
    return { text: '長期戦の兵站を整備', tone: 'expand' };
  if (neutral.length) return { text: '中立地を開拓', tone: 'expand' };
  if (enemies.length) return { text: '侵攻機会を模索', tone: 'watch' };
  return null;
}
function renderNations() {
  $('nations').innerHTML = IDS.map((id) => {
    const alive = id === 'player' ? !state.playerDefeated : state.factions[id].alive,
      s = stats(id),
      intent = nationIntent(id, alive);
    return `<article class="nation ${id} ${alive ? '' : 'dead'}"><div class="nation-head"><i class="nation-color" style="background:${COLORS[id]}"></i><strong>${META[id].name}</strong>${id === 'player' ? '<b class="you-badge">あなた</b>' : ''}<small>${alive ? META[id].trait : '滅亡'}</small></div>${intent ? `<div class="nation-intent ${intent.tone}"><span>◆</span>${intent.text}</div>` : ''}<div class="nation-stats"><span>領土 ${s.land}</span><span>兵力 ${s.army}</span><span>${s.towns + s.farms + s.barracks + s.forts}施設</span></div></article>`;
  }).join('');
}
function threatRanking() {
  return IDS.filter((id) => land(id) > 0).sort((a, b) => land(b) - land(a));
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
  return territory >= 35 ? 1 : 0;
}
function yearlyOrders() {
  return 2;
}
function renderThreat() {
  const level = threatLevel(),
    leader = threatLeader(),
    name = META[leader].name,
    card = $('threatStatus');
  card.className = `rules-note threat-note ${level === 1 ? 'caution' : ''}`;
  card.innerHTML =
    level === 1
      ? `<strong>${name}への警戒</strong><p>${name}が35領以上かつ2位に5領差をつけ、他国は同国への攻撃を優先します。</p>`
      : '<strong>列国情勢</strong><p>最大国が35領以上かつ2位に5領差をつけると、列国の警戒対象になります。</p>';
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
      const def = tileDefense(i);
      return `<button class="tile owner-${t.owner} ${t.terrain} ${t.isolation ? 'isolated' : ''} ${t.occupation ? 'occupied' : ''} ${t.occupation === 2 ? 'protected' : ''} ${selectedTile === i ? 'selected' : ''} ${!isMobile() && validTarget(i) ? 'valid' : ''}" style="${style}" data-index="${i}" role="gridcell" aria-label="${META[t.owner].name}、${TERRAIN[t.terrain].name}${b ? '、' + b.name : ''}${t.occupation === 2 ? '、占領保護中' : t.occupation === 1 ? '、安定化中' : ''}${t.isolation ? '、補給切れ' : ''}"><span class="flag">${t.owner === 'neutral' ? '' : t.owner === 'player' ? '♛' : META[t.owner].short.slice(0, 1)}</span>${b ? `<span class="structure">${b.icon}</span>` : `<span class="terrain">${TERRAIN[t.terrain].icon}</span>`}${t.occupation ? `<span class="occupation-mark">${t.occupation === 2 ? '保' : '安'}</span>` : ''}<span class="garrison">${def}</span></button>`;
    })
    .join('');
  document
    .querySelectorAll('.tile')
    .forEach((el) => el.addEventListener('click', () => handleTile(+el.dataset.index)));
}
function renderCommands() {
  document.querySelectorAll('[data-action]').forEach((b) => {
    b.classList.toggle('active', selectedAction === b.dataset.action);
    b.disabled = state.gameOver || state.playerDefeated || state.autoSettlement || state.orders < 1;
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
  const recruitButton = `<button data-mobile-recruit ${playerRecruitStatus().ok ? '' : 'disabled'}><strong>♟ 徴兵</strong><small>民3・金15・食8</small></button>`;
  if (selectedTile === null) {
    box.innerHTML = `<div class="mobile-empty">先に地図のマスを選択してください</div><div class="mobile-action-grid">${recruitButton}</div>`;
    box.querySelector('[data-mobile-recruit]')?.addEventListener('click', recruit);
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
      `<button data-mobile-action="invade" ${canPlayerAction('invade', selectedTile) ? '' : 'disabled'}><strong>⚔ 侵攻</strong><small>兵力5以上・命令1</small></button>`,
    );
  if (targetAllows(selectedTile, 'demolish'))
    actions.push(
      `<button data-mobile-action="demolish" ${canPlayerAction('demolish', selectedTile) ? '' : 'disabled'}><strong>⌫ 施設撤去</strong><small>払い戻しなし・命令1</small></button>`,
    );
  if (t.owner === 'player' && !t.building && t.occupation !== 2)
    actions.push(
      '<button class="mobile-build-toggle" data-mobile-build-toggle><strong>♜ 建設</strong><small>施設を選択</small></button>',
    );
  actions.push(recruitButton);
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
}
function renderSelection() {
  if (selectedTile === null) {
    $('selection').innerHTML =
      '<small>選択中</small><strong>領地を選択してください</strong><p>地形や所有国を表示します</p>';
    return;
  }
  const t = state.tiles[selectedTile],
    b = t.capital ? '首都' : BUILDINGS[t.building]?.name || '未開発',
    relocation =
      t.capital && t.owner !== 'neutral'
        ? `／遷都成功率 ${formatChance(relocationChance(t.owner))}`
        : '',
    occupation =
      t.occupation === 2
        ? '／占領保護中（再攻撃不可・収入なし・拠点利用不可）'
        : t.occupation === 1
          ? '／安定化中（施設建設・撤去可・奪還可能・収入なし・施設効果なし・拠点利用不可）'
          : '';
  $('selection').innerHTML =
    `<small>${META[t.owner].name}</small><strong>${TERRAIN[t.terrain].name}・${b}</strong><p>守備 ${tileDefense(selectedTile)}${occupation}${t.isolation ? `／補給切れ −${t.isolation}` : ''}${relocation}</p>`;
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
