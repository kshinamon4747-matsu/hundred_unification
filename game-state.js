'use strict';

const SAVE_KEY = 'hundred-tile-unification-v1';
const INVALID_SAVE_KEY = `${SAVE_KEY}-invalid`;
const COLORS = {
  player: '#357a5d',
  red: '#a64f46',
  blue: '#466d9b',
  ochre: '#ae8437',
  neutral: '#8d8875',
};
const META = {
  player: { name: 'アルデン王国', short: '自国', trait: '均衡' },
  red: { name: 'ヴァルドール帝国', short: '赤鷲', trait: '軍事' },
  blue: { name: 'セレノア連邦', short: '蒼波', trait: '商業' },
  ochre: { name: 'ローデン公国', short: '金鹿', trait: '農業' },
  neutral: { name: '中立地帯', short: '中立', trait: '—' },
};
const TERRAIN = {
  plain: { name: '平原', icon: '·' },
  forest: { name: '森林', icon: '♣' },
  hill: { name: '丘陵', icon: '▲' },
};
const BUILDINGS = {
  farm: {
    name: '農場',
    icon: '<svg class="field-symbol" viewBox="0 0 28 22" aria-hidden="true"><path d="M10 2l4 6 4-6M2 12l4 6 4-6M18 12l4 6 4-6"/></svg>',
    cost: 14,
    food: 8,
    gold: 0,
    def: 0,
    cap: 0,
    effect: '食料+8',
  },
  town: {
    name: '町',
    icon: '⌂',
    cost: 20,
    food: 0,
    gold: 5,
    def: 0,
    cap: 6,
    effect: '金貨+5・人口上限+6',
  },
  barracks: {
    name: '兵舎',
    icon: '⚔',
    cost: 28,
    food: 0,
    gold: 0,
    def: 3,
    cap: 0,
    effect: '守備+3・隣接侵攻+3',
  },
  fort: { name: '砦', icon: '♜', cost: 36, food: 0, gold: 0, def: 9, cap: 0, effect: '守備+9' },
};
const IDS = ['player', 'red', 'blue', 'ochre'];
const WORLD_VARIANTS = [
  { name: '四王分立', seeds: [22, 27, 72, 77], forest: 0.22, hill: 0.14 },
  { name: '辺境諸侯', seeds: [11, 18, 81, 88], forest: 0.18, hill: 0.22 },
  { name: '十字街道', seeds: [4, 49, 95, 50], forest: 0.14, hill: 0.14 },
  { name: '深森の国境', seeds: [2, 39, 60, 97], forest: 0.38, hill: 0.1 },
  { name: '高地争覇', seeds: [10, 39, 60, 89], forest: 0.2, hill: 0.26 },
];
const DEVELOPMENTS = [
  { name: '均衡領', buildings: ['farm', 'farm', 'town', 'barracks'] },
  { name: '穀倉領', buildings: ['farm', 'farm', 'farm', 'town'] },
  { name: '都市領', buildings: ['farm', 'town', 'town', 'barracks'] },
  { name: '城塞領', buildings: ['farm', 'town', 'barracks', 'fort'] },
];
let state,
  selectedAction = 'settle',
  selectedTile = null,
  toastTimer,
  chronicleTimeline = false,
  mobileBuildOpen = false,
  autoSettlementTimer,
  autoSettlementOfferShown = false,
  autoSettlementIdleYears = 0,
  playerUndoStack = [],
  playerRedoEntry = null;
const $ = (id) => document.getElementById(id),
  rand = (n) => Math.floor(Math.random() * n),
  clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mobileMedia =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width:720px)')
    : { matches: false, addEventListener() {} };
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const neighbors = (i) =>
  [i - 10, i + 10, i % 10 ? i - 1 : -1, i % 10 < 9 ? i + 1 : -1].filter((x) => x >= 0 && x < 100);
const land = (id) => state.tiles.filter((t) => t.owner === id).length;

function emptyWarFatigue() {
  return Object.fromEntries(
    IDS.map((id) => [
      id,
      Object.fromEntries(
        IDS.filter((opponent) => opponent !== id).map((opponent) => [opponent, 0]),
      ),
    ]),
  );
}

function capitalZonesSeparated(seeds) {
  return seeds.every((a, i) =>
    seeds
      .slice(i + 1)
      .every(
        (b) =>
          Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) + Math.abs((a % 10) - (b % 10)) >= 5,
      ),
  );
}
function royalSeedFor(tiles, worldName, developmentName) {
  let hash = 2166136261;
  const source = `${worldName}:${developmentName}:${tiles
    .map((tile) => `${tile.owner[0]}${tile.terrain[0]}${tile.building?.[0] || '-'}`)
    .join('')}`;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function royalReignLength(seed, generation) {
  let value = (seed + Math.imul(generation, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  const minimum = generation === 1 ? 5 : 15;
  return minimum + (value % 11);
}
function createState() {
  const variants = WORLD_VARIANTS.filter((variant) => capitalZonesSeparated(variant.seeds)),
    variant = variants[rand(variants.length)],
    development = DEVELOPMENTS[rand(DEVELOPMENTS.length)];
  const tiles = Array.from({ length: 100 }, () => {
    const r = Math.random();
    return {
      owner: 'neutral',
      terrain: r < variant.forest ? 'forest' : r < variant.forest + variant.hill ? 'hill' : 'plain',
      building: null,
      capital: false,
      isolation: 0,
      occupation: 0,
      fortIdle: 0,
      captureYears: [],
    };
  });
  generateRealms(tiles, variant.seeds);
  for (const id of IDS) {
    const own = shuffle(
      tiles.map((t, i) => (t.owner === id && !t.capital ? i : -1)).filter((i) => i >= 0),
    );
    development.buildings.forEach((building, n) => {
      if (own[n] !== undefined) tiles[own[n]].building = building;
    });
  }
  const royalSeed = royalSeedFor(tiles, variant.name, development.name);
  return {
    version: 18,
    worldName: variant.name,
    developmentName: development.name,
    year: 1,
    gold: 90,
    food: 80,
    population: 18,
    army: 14,
    orders: 2,
    relocations: 0,
    kingGeneration: 1,
    royalSeed,
    nextSuccessionYear: 1 + royalReignLength(royalSeed, 1),
    aiInitiativeOffset: rand(3),
    threatNotices: { leader: null, level: 0 },
    metrics: { captures: 0, rapidRecaptures: 0, repeatedRecaptures: 0 },
    warFatigue: emptyWarFatigue(),
    warLastBattle: {},
    autoSettlement: false,
    autoSettlementDeclined: false,
    tiles,
    factions: {
      red: { alive: true, gold: 82, food: 76, population: 18, army: 14, relocations: 0 },
      blue: { alive: true, gold: 82, food: 76, population: 18, army: 14, relocations: 0 },
      ochre: { alive: true, gold: 82, food: 76, population: 18, army: 14, relocations: 0 },
    },
    log: [
      {
        year: 1,
        text: `${variant.name}の地で、四つの${development.name}が大陸の覇権を争い始めた。`,
        kind: '',
        important: true,
        participants: ['player'],
      },
    ],
    gameOver: false,
    playerDefeated: false,
    victory: false,
  };
}
function generateRealms(tiles, seeds) {
  for (let attempt = 0; attempt < 80; attempt++) {
    tiles.forEach((t) => {
      t.owner = 'neutral';
      t.capital = false;
      t.building = null;
    });
    const ids = shuffle([...IDS]),
      capitals = {};
    ids.forEach((id, n) => {
      const i = seeds[n];
      tiles[i].owner = id;
      tiles[i].capital = true;
      tiles[i].building = 'capital';
      capitals[id] = i;
    });
    let failed = false;
    while (IDS.some((id) => tiles.filter((t) => t.owner === id).length < 25)) {
      const options = IDS.map((id) => ({ id, size: tiles.filter((t) => t.owner === id).length }))
        .filter((x) => x.size < 25)
        .sort((a, b) => a.size - b.size + (Math.random() - 0.5));
      let grown = false;
      for (const { id } of options) {
        const frontier = [
          ...new Set(
            tiles
              .flatMap((t, i) => (t.owner === id ? neighbors(i) : []))
              .filter((i) => tiles[i].owner === 'neutral'),
          ),
        ];
        if (!frontier.length) continue;
        frontier.sort(
          (a, b) =>
            growthScore(tiles, b, id, capitals[id]) - growthScore(tiles, a, id, capitals[id]),
        );
        tiles[frontier[rand(Math.min(3, frontier.length))]].owner = id;
        grown = true;
        break;
      }
      if (!grown) {
        failed = true;
        break;
      }
    }
    if (failed) continue;
    for (const id of IDS) {
      for (let n = 0; n < 5; n++) {
        const removable = tiles
          .map((t, i) => (t.owner === id && !t.capital && connectedWithout(tiles, id, i) ? i : -1))
          .filter((i) => i >= 0);
        if (!removable.length) {
          failed = true;
          break;
        }
        removable.sort((a, b) => neutralScore(tiles, b, id) - neutralScore(tiles, a, id));
        tiles[removable[rand(Math.min(4, removable.length))]].owner = 'neutral';
      }
      if (failed) break;
    }
    if (!failed && IDS.every((id) => tiles.filter((t) => t.owner === id).length === 20)) return;
  }
  fallbackRealms(tiles);
}
function growthScore(tiles, i, id, capital) {
  const same = neighbors(i).filter((n) => tiles[n].owner === id).length,
    row = Math.floor(i / 10),
    col = i % 10,
    cr = Math.floor(capital / 10),
    cc = capital % 10;
  return same * 4 - (Math.abs(row - cr) + Math.abs(col - cc)) * 0.12 + Math.random();
}
function connectedWithout(tiles, id, skip) {
  const capital = tiles.findIndex((t) => t.owner === id && t.capital);
  if (capital < 0 || capital === skip) return false;
  const seen = new Set([capital]),
    queue = [capital];
  while (queue.length) {
    for (const n of neighbors(queue.shift()))
      if (n !== skip && tiles[n].owner === id && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return seen.size === tiles.filter((t, i) => t.owner === id && i !== skip).length;
}
function neutralScore(tiles, i, id) {
  return neighbors(i).filter((n) => tiles[n].owner !== id).length * 3 + Math.random() * 2;
}
function fallbackRealms(tiles) {
  const realms = [
    ['red', 0, 4, 0, 4, 22],
    ['blue', 0, 4, 5, 9, 27],
    ['player', 5, 9, 0, 4, 72],
    ['ochre', 5, 9, 5, 9, 77],
  ];
  realms.forEach(([id, r0, r1, c0, c1, capital]) => {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const i = r * 10 + c;
        tiles[i].owner = id;
        tiles[i].capital = i === capital;
        tiles[i].building = i === capital ? 'capital' : null;
      }
  });
  for (const id of IDS)
    for (let n = 0; n < 5; n++) {
      const removable = tiles
        .map((t, i) => (t.owner === id && !t.capital && connectedWithout(tiles, id, i) ? i : -1))
        .filter((i) => i >= 0)
        .sort((a, b) => neutralScore(tiles, b, id) - neutralScore(tiles, a, id));
      tiles[removable[0]].owner = 'neutral';
    }
}
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isValidSaveShape(value) {
  if (
    !isRecord(value) ||
    !Array.isArray(value.tiles) ||
    value.tiles.length !== 100 ||
    !isRecord(value.factions)
  )
    return false;
  if (!['red', 'blue', 'ochre'].every((id) => isRecord(value.factions[id]))) return false;
  return value.tiles.every(
    (tile) =>
      isRecord(tile) &&
      ['neutral', ...IDS].includes(tile.owner) &&
      Object.hasOwn(TERRAIN, tile.terrain) &&
      (tile.building === null ||
        tile.building === 'capital' ||
        Object.hasOwn(BUILDINGS, tile.building)),
  );
}
function backupInvalidSave(raw) {
  try {
    if (raw) localStorage.setItem(INVALID_SAVE_KEY, raw);
  } catch {}
}
function load() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isValidSaveShape(parsed)) {
      backupInvalidSave(raw);
      return null;
    }
    return migrate(parsed);
  } catch {
    backupInvalidSave(raw);
    return null;
  }
}
function importantChronicleText(text = '') {
  return (
    text.includes('覇権を争い始めた') ||
    text.includes('遷都し') ||
    text.includes('国家の存続に成功') ||
    text.includes('代国王が即位') ||
    text.includes('崩壊') ||
    text.includes('滅亡') ||
    text.includes('100マス') ||
    text.includes('全土が一つの王冠')
  );
}
function legacyChronicleInvolvesPlayer(text = '', index = -1, log = []) {
  if (text.includes(META.player.name)) return true;
  if (text.includes('が中立地帯を開拓')) return false;
  if (text.includes('で食料不足が起こり')) return false;
  if (text.includes('列国がその拡大を警戒')) return false;
  if (text.includes('100マス全土を統一し、新たな大陸の覇者')) return false;
  const enemyMentions = ['red', 'blue', 'ochre'].filter((id) =>
    text.includes(META[id].name),
  ).length;
  if ((text.includes('遷都') || text.includes('国家の存続')) && !text.includes(META.player.name)) {
    const previous = log[index - 1];
    if (!previous || previous.year !== log[index]?.year) return false;
    const previousEnemyMentions = ['red', 'blue', 'ochre'].filter((id) =>
      (previous.text || '').includes(META[id].name),
    ).length;
    return previousEnemyMentions === 1;
  }
  return enemyMentions < 2;
}
function chronicleInvolvesPlayer(entry, index, log) {
  if (Array.isArray(entry.participants)) return entry.participants.includes('player');
  return legacyChronicleInvolvesPlayer(entry.text || '', index, log);
}
function trimChronicle(log = [], ordinaryLimit = 500) {
  let ordinaryToDrop = Math.max(0, log.filter((entry) => !entry.important).length - ordinaryLimit);
  return log.filter((entry) => {
    if (entry.important) return true;
    if (ordinaryToDrop > 0) {
      ordinaryToDrop--;
      return false;
    }
    return true;
  });
}
function cleanChronicle(log = []) {
  const cleaned = log.filter(chronicleInvolvesPlayer).flatMap((entry) => {
      const text = entry.text || '',
        capitalDefense = text.includes('首都防衛の反撃') || text.includes('首都防衛反撃');
      if (capitalDefense && !text.includes(META.player.name)) return [];
      if (
        text.includes('遷都先となる残存領土がなく') ||
        text.includes('遷都判定に失敗') ||
        text.includes('遷都抽選に成功')
      )
        return [];
      if (text.includes('遷都判定に成功')) {
        const nation = text.split('は遷都判定に成功')[0],
          destination = text.match(/、([^、。]+)へ遷都した/)?.[1];
        return [
          {
            ...entry,
            text: destination
              ? `${nation}は${destination}へ遷都し、国家の存続に成功した。`
              : `${nation}は遷都し、国家の存続に成功した。`,
            important: true,
            participants: ['player'],
          },
        ];
      }
      if (text.includes('王都を陥落させ、遷都にも失敗した'))
        return [
          {
            ...entry,
            text: text.replace(
              '王都を陥落させ、遷都にも失敗した。',
              '王都を攻略し、アルデン王国は崩壊した。',
            ),
            important: true,
            participants: ['player'],
          },
        ];
      return [
        {
          ...entry,
          important: !!entry.important || importantChronicleText(text),
          participants: Array.isArray(entry.participants) ? entry.participants : ['player'],
        },
      ];
    }),
    unification = cleaned.filter(
      (e) =>
        e.text.includes('100マスの全土が一つの王冠の下に統一') ||
        e.text.includes('100マス全土を統一'),
    );
  return trimChronicle(cleaned.filter((e) => !unification.includes(e)).concat(unification));
}
function safeInteger(value, fallback = 0, min = 0) {
  return Number.isFinite(value) ? Math.max(min, Math.floor(value)) : fallback;
}
function migrate(s) {
  if (!isValidSaveShape(s)) throw new Error('Invalid save data');
  const oldVersion = safeInteger(s.version, 0);
  s.worldName = typeof s.worldName === 'string' ? s.worldName : '四王分立';
  s.developmentName = typeof s.developmentName === 'string' ? s.developmentName : '均衡領';
  s.year = safeInteger(s.year, 1, 1);
  s.gold = safeInteger(s.gold, 90);
  s.food = safeInteger(s.food, 80);
  s.population = safeInteger(s.population, 18, 1);
  s.army = safeInteger(s.army, 14);
  s.orders = safeInteger(s.orders, 2);
  s.relocations = safeInteger(s.relocations, 0);
  s.kingGeneration = safeInteger(s.kingGeneration, 1, 1);
  s.royalSeed = Number.isFinite(s.royalSeed)
    ? safeInteger(s.royalSeed, 0)
    : royalSeedFor(s.tiles, s.worldName, s.developmentName);
  if (oldVersion < 17 || !Number.isFinite(s.nextSuccessionYear) || s.nextSuccessionYear <= s.year)
    s.nextSuccessionYear = s.year + royalReignLength(s.royalSeed, s.kingGeneration);
  else s.nextSuccessionYear = safeInteger(s.nextSuccessionYear, s.year + 5, s.year + 1);
  if (!isRecord(s.metrics)) s.metrics = {};
  s.metrics.captures = safeInteger(s.metrics.captures, 0);
  s.metrics.rapidRecaptures = safeInteger(s.metrics.rapidRecaptures, 0);
  s.metrics.repeatedRecaptures = safeInteger(s.metrics.repeatedRecaptures, 0);
  const fatigue = emptyWarFatigue();
  if (isRecord(s.warFatigue))
    for (const id of IDS)
      for (const opponent of IDS)
        if (id !== opponent)
          fatigue[id][opponent] = Math.min(100, safeInteger(s.warFatigue[id]?.[opponent], 0));
  s.warFatigue = fatigue;
  if (!isRecord(s.warLastBattle)) s.warLastBattle = {};
  s.warLastBattle = Object.fromEntries(
    Object.entries(s.warLastBattle)
      .filter(([, year]) => Number.isFinite(year))
      .map(([pair, year]) => [pair, safeInteger(year, 0)]),
  );
  s.aiInitiativeOffset = Number.isFinite(s.aiInitiativeOffset)
    ? safeInteger(s.aiInitiativeOffset) % 3
    : rand(3);
  if (oldVersion < 9 || !isRecord(s.threatNotices) || !Number.isFinite(s.threatNotices.level))
    s.threatNotices = { leader: null, level: 0 };
  if (oldVersion < 10) {
    s.playerDefeated = !!(s.gameOver && !s.victory);
    if (s.playerDefeated) {
      s.gameOver = false;
      s.orders = 0;
      s.tiles.forEach((t) => {
        if (t.owner === 'player') {
          t.owner = 'neutral';
          t.isolation = 0;
          t.occupation = 0;
        }
      });
    }
  }
  s.playerDefeated = !!s.playerDefeated;
  s.gameOver = !!s.gameOver;
  s.victory = !!s.victory;
  s.autoSettlement = !!s.autoSettlement;
  s.autoSettlementDeclined = !!s.autoSettlementDeclined;
  if (s.gameOver || s.playerDefeated) s.autoSettlement = false;
  for (const id of ['red', 'blue', 'ochre']) {
    const f = s.factions[id];
    f.alive = f.alive !== false;
    f.gold = safeInteger(f.gold, 82);
    f.food = safeInteger(f.food, 76);
    f.population = safeInteger(f.population, 18, 1);
    f.army = safeInteger(f.army, 16);
    f.relocations = safeInteger(f.relocations, 0);
  }
  delete s.factions.red.consolidating;
  delete s.factions.red.consolidated;
  s.tiles.forEach((t) => {
    t.capital = !!t.capital;
    t.isolation = safeInteger(t.isolation, 0);
    t.fortIdle = safeInteger(t.fortIdle, 0);
    t.captureYears = (Array.isArray(t.captureYears) ? t.captureYears : [])
      .filter(Number.isFinite)
      .map((year) => safeInteger(year, 0))
      .slice(-8);
    t.occupation =
      oldVersion < 7 ? (t.occupation ? 2 : 0) : Math.min(2, safeInteger(t.occupation, 0));
    if (oldVersion < 8 && t.owner !== 'neutral' && !t.occupation && (t.unrest || 0) > 0)
      t.occupation = 1;
    delete t.unrest;
  });
  s.log = cleanChronicle(Array.isArray(s.log) ? s.log : []);
  s.version = 18;
  return s;
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {}
}
function stats(id) {
  const tiles = state.tiles.filter((t) => t.owner === id),
    productive = tiles.filter((t) => !t.occupation),
    count = (k) => productive.filter((t) => t.building === k).length;
  const pop = id === 'player' ? state.population : state.factions[id]?.population || 0,
    army = id === 'player' ? state.army : state.factions[id]?.army || 0;
  return {
    land: tiles.length,
    productiveLand: productive.length,
    farms: count('farm'),
    towns: count('town'),
    barracks: count('barracks'),
    forts: count('fort'),
    pop,
    army,
    capacity: 12 + count('town') * 6,
  };
}
function income(id) {
  const s = stats(id),
    gold = s.productiveLand + s.towns * 5 - Math.ceil(s.army / 5),
    food = s.farms * 8 - Math.ceil(s.pop / 2) - Math.ceil(s.army / 3);
  return { gold, food, capacity: s.capacity };
}
function populationGrowth(id) {
  const s = stats(id),
    room = Math.max(0, s.capacity - s.pop);
  const yearlyGrowth = 1 + Math.ceil(Math.max(0, s.towns - 5) / 10);
  return Math.min(room, yearlyGrowth);
}
