'use strict';

const SAVE_KEY = 'hundred-tile-unification-v1';
const INVALID_SAVE_KEY = `${SAVE_KEY}-invalid`;
const COLORS = {
  player: '#357a5d',
  red: '#a64f46',
  blue: '#466d9b',
  ochre: '#ae8437',
  neutral: '#8d8875',
  void: '#355f72',
};
const META = {
  player: { name: 'アルデン王国', short: '自国', trait: '均衡' },
  red: { name: 'ヴァルドール帝国', short: '赤鷲', trait: '軍事' },
  blue: { name: 'セレノア連邦', short: '蒼波', trait: '商業' },
  ochre: { name: 'ローデン公国', short: '金鹿', trait: '農業' },
  neutral: { name: '中立地帯', short: '中立', trait: '—' },
  void: { name: '通行不能地形', short: '地形', trait: '—' },
};
const TERRAIN = {
  plain: {
    name: '平原',
    icon: '·',
    defense: 0,
    farmFood: 8,
    invasionLoss: 0,
    effect: '特別な効果なし',
  },
  forest: { name: '森林', icon: '♣', defense: 1, farmFood: 8, invasionLoss: 0, effect: '守備+1' },
  hill: { name: '丘陵', icon: '▲', defense: 2, farmFood: 8, invasionLoss: 0, effect: '守備+2' },
  fertile: {
    name: '肥沃地',
    icon: '✦',
    defense: 0,
    farmFood: 10,
    invasionLoss: 0,
    effect: '農場の食料+10',
  },
  marsh: {
    name: '湿地',
    icon: '≋',
    defense: 0,
    farmFood: 6,
    invasionLoss: 1,
    effect: '農場の食料+6・侵攻側損失+1',
  },
  mountain: { name: '山岳', icon: '◆', blocked: true, crossing: false, effect: '通行・所有不可' },
  pass: { name: '峠', icon: '△', defense: 3, farmFood: 8, invasionLoss: 0, effect: '守備+3' },
  water: { name: '海・湖', icon: '≈', blocked: true, crossing: false, effect: '通行・所有不可' },
  river: {
    name: '河川',
    icon: '≋',
    blocked: true,
    crossing: false,
    effect: '通行・所有不可／条件を満たせば橋を建設可能',
  },
  ford: {
    name: '浅瀬',
    icon: '⋰',
    blocked: true,
    crossing: true,
    crossingDefense: 2,
    effect: '渡河可能・攻撃側は守備+2相当の不利',
  },
  bridge: {
    name: '橋',
    icon: '═',
    blocked: true,
    crossing: true,
    crossingDefense: 0,
    effect: '渡河可能',
  },
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
const GENERATION_LIMITS = {
  singleExitSpread: 6,
  exitSpread: 9,
  maxVulnerability: 14,
  defenseSpread: 16,
  fertileSpread: 4,
  marshSpread: 4,
  gateDistanceSpread: 11,
  pressureSpread: 1,
  bridgeSiteSpread: 4,
};
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
const isConquerableTile = (tile) => !!tile && !TERRAIN[tile.terrain]?.blocked;
const conquerableLand = (tiles = state.tiles) => tiles.filter(isConquerableTile).length;
const terrainDefinition = (tileOrTerrain) =>
  TERRAIN[typeof tileOrTerrain === 'string' ? tileOrTerrain : tileOrTerrain?.terrain] ||
  TERRAIN.plain;
const terrainDefense = (tileOrTerrain) => terrainDefinition(tileOrTerrain).defense || 0;
const terrainFarmFood = (tileOrTerrain) =>
  terrainDefinition(tileOrTerrain).farmFood ?? BUILDINGS.farm.food;
const terrainInvasionLoss = (tileOrTerrain) => terrainDefinition(tileOrTerrain).invasionLoss || 0;
const terrainEffectText = (tileOrTerrain) =>
  terrainDefinition(tileOrTerrain).effect || '特別な効果なし';
function terrainHelpSummary() {
  return [
    'forest',
    'hill',
    'pass',
    'fertile',
    'marsh',
    'mountain',
    'water',
    'river',
    'ford',
    'bridge',
  ]
    .map((terrain) => `${TERRAIN[terrain].name}：${TERRAIN[terrain].effect}`)
    .join('。');
}

function axisBanks(i, axis) {
  const row = Math.floor(i / 10),
    col = i % 10;
  if (axis === 'vertical') return col > 0 && col < 9 ? [i - 1, i + 1] : [];
  if (axis === 'horizontal') return row > 0 && row < 9 ? [i - 10, i + 10] : [];
  return [];
}
function crossingBanks(i, tiles = state.tiles) {
  const tile = tiles[i];
  return TERRAIN[tile?.terrain]?.crossing ? axisBanks(i, tile.riverAxis) : [];
}
function movementNeighborsIn(tiles, i) {
  if (!isConquerableTile(tiles[i])) return [];
  const out = new Set(neighbors(i).filter((n) => isConquerableTile(tiles[n])));
  for (const crossing of neighbors(i)) {
    const banks = crossingBanks(crossing, tiles);
    if (!banks.includes(i)) continue;
    const opposite = banks.find((bank) => bank !== i);
    if (isConquerableTile(tiles[opposite])) out.add(opposite);
  }
  return [...out];
}
const movementNeighbors = (i) => movementNeighborsIn(state.tiles, i);
function crossingBetween(a, b, tiles = state.tiles) {
  for (const i of neighbors(a)) {
    const banks = crossingBanks(i, tiles);
    if (banks.includes(a) && banks.includes(b)) return i;
  }
  return -1;
}
function attackCrossing(owner, target) {
  if (neighbors(target).some((i) => state.tiles[i].owner === owner && !state.tiles[i].occupation))
    return null;
  for (const source of movementNeighbors(target))
    if (state.tiles[source].owner === owner && !state.tiles[source].occupation) {
      const crossing = crossingBetween(source, target);
      if (crossing >= 0) return state.tiles[crossing].terrain;
    }
  return null;
}

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
function makeTile(variant) {
  const r = Math.random();
  return {
    owner: 'neutral',
    terrain: r < variant.forest ? 'forest' : r < variant.forest + variant.hill ? 'hill' : 'plain',
    riverAxis: null,
    bridgeBuilder: null,
    building: null,
    capital: false,
    isolation: 0,
    occupation: 0,
    fortIdle: 0,
    captureYears: [],
  };
}
function markBlockedTile(tile, terrain, riverAxis = null) {
  tile.owner = 'void';
  tile.terrain = terrain;
  tile.riverAxis = riverAxis;
  tile.bridgeBuilder = null;
  tile.building = null;
  tile.capital = false;
}
function barrierIndex(vertical, major, minor) {
  return vertical ? major * 10 + minor : minor * 10 + major;
}
function meanderingBarrierPath(vertical, startMinor = 2 + rand(6)) {
  const path = [],
    forcedTurn = 2 + rand(6);
  let minor = startMinor;
  for (let major = 0; major < 10; major++) {
    path.push(barrierIndex(vertical, major, minor));
    if (major < 1 || major > 8 || (major !== forcedTurn && Math.random() >= 0.38)) continue;
    const directions = shuffle([-1, 1]).filter((direction) => {
      const next = minor + direction;
      return next >= 1 && next <= 8;
    });
    if (!directions.length) continue;
    minor += directions[0];
    path.push(barrierIndex(vertical, major, minor));
  }
  return [...new Set(path)];
}
function placeRiver(tiles) {
  const vertical = Math.random() < 0.5,
    mainAxis = vertical ? 'vertical' : 'horizontal',
    branchAxis = vertical ? 'horizontal' : 'vertical',
    main = meanderingBarrierPath(vertical);
  main.forEach((i) => markBlockedTile(tiles[i], 'river', mainAxis));

  const branchCount = rand(3);
  for (let branch = 0; branch < branchCount; branch++) {
    const source = main[2 + rand(Math.max(1, main.length - 4))],
      sourceMajor = vertical ? Math.floor(source / 10) : source % 10,
      sourceMinor = vertical ? source % 10 : Math.floor(source / 10),
      direction = sourceMinor <= 4 ? -1 : 1,
      length = 2 + rand(3);
    for (let step = 1; step <= length; step++) {
      const minor = sourceMinor + direction * step;
      if (minor < 0 || minor > 9) break;
      const i = barrierIndex(vertical, sourceMajor, minor);
      if (TERRAIN[tiles[i].terrain].blocked) continue;
      markBlockedTile(tiles[i], 'river', branchAxis);
    }
  }

  const crossingCandidates = shuffle(
      main.filter((i) => {
        const [a, b] = axisBanks(i, mainAxis);
        return isConquerableTile(tiles[a]) && isConquerableTile(tiles[b]);
      }),
    ),
    crossingCount = Math.min(crossingCandidates.length, 2 + rand(2));
  crossingCandidates.slice(0, crossingCount).forEach((i, index) => {
    markBlockedTile(tiles[i], index === 0 ? 'ford' : 'bridge', mainAxis);
  });
}
function placeMountainRidge(tiles) {
  const vertical = Math.random() < 0.5,
    ridge = meanderingBarrierPath(vertical),
    available = ridge.filter((i) => !TERRAIN[tiles[i].terrain].blocked),
    passes = new Set(shuffle([...available]).slice(0, 2));
  for (const i of available) {
    if (passes.has(i)) {
      tiles[i].terrain = 'pass';
      tiles[i].riverAxis = null;
    } else markBlockedTile(tiles[i], 'mountain');
  }
}
function generateGeography(tiles) {
  if (Math.random() < 0.68) placeRiver(tiles);
  if (Math.random() < 0.78) placeMountainRidge(tiles);

  if (Math.random() < 0.5) {
    const lakeCenter = rand(100),
      lakeCandidates = [
        lakeCenter,
        ...neighbors(lakeCenter),
        ...neighbors(lakeCenter + (rand(2) ? 1 : -1)),
      ].filter((i) => i >= 0 && i < 100 && isConquerableTile(tiles[i]));
    shuffle([...new Set(lakeCandidates)])
      .slice(0, 3)
      .forEach((i) => markBlockedTile(tiles[i], 'water'));
  }

  const open = shuffle(
    tiles.map((tile, i) => (tile.terrain === 'plain' ? i : -1)).filter((i) => i >= 0),
  );
  open.slice(0, 6).forEach((i) => (tiles[i].terrain = 'fertile'));
  open.slice(6, 12).forEach((i) => (tiles[i].terrain = 'marsh'));
}
function geographyConnected(tiles) {
  const first = tiles.findIndex(isConquerableTile);
  if (first < 0) return false;
  const seen = new Set([first]),
    queue = [first];
  while (queue.length)
    for (const n of movementNeighborsIn(tiles, queue.shift()))
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  return seen.size === conquerableLand(tiles);
}
function resolveRealmSeeds(tiles, preferred) {
  const selected = [];
  for (const desired of preferred) {
    const candidates = tiles
      .map((tile, i) => (isConquerableTile(tile) ? i : -1))
      .filter((i) => i >= 0 && !selected.includes(i))
      .filter((i) => selected.every((other) => distanceOnGrid(i, other) >= 5))
      .sort((a, b) => distanceOnGrid(a, desired) - distanceOnGrid(b, desired));
    if (!candidates.length) return null;
    selected.push(candidates[0]);
  }
  return selected;
}
function distanceOnGrid(a, b) {
  return Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) + Math.abs((a % 10) - (b % 10));
}
function createState() {
  const variants = WORLD_VARIANTS.filter((variant) => capitalZonesSeparated(variant.seeds)),
    variant = variants[rand(variants.length)],
    development = DEVELOPMENTS[rand(DEVELOPMENTS.length)];
  let tiles,
    generated = false;
  for (let attempt = 0; attempt < 60 && !generated; attempt++) {
    const candidate = Array.from({ length: 100 }, () => makeTile(variant));
    generateGeography(candidate);
    const seeds =
      geographyConnected(candidate) && conquerableLand(candidate) >= 78
        ? resolveRealmSeeds(candidate, variant.seeds)
        : null;
    if (seeds && generateRealms(candidate, seeds) && generationFairEnough(candidate)) {
      tiles = candidate;
      generated = true;
    }
  }
  if (!generated) {
    tiles = Array.from({ length: 100 }, () => makeTile(variant));
    generateRealms(tiles, variant.seeds);
  }
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
    version: 22,
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
    metrics: {
      captures: 0,
      rapidRecaptures: 0,
      repeatedRecaptures: 0,
      ceasefires: 0,
      betrayals: 0,
      betrayalsByNation: Object.fromEntries(IDS.map((id) => [id, 0])),
    },
    warFatigue: emptyWarFatigue(),
    warLastBattle: {},
    ceasefires: {},
    ceasefireCooldowns: {},
    sanctions: {},
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
  const desiredSize = Math.min(18, Math.floor((conquerableLand(tiles) - 8) / 4)),
    growthSize = desiredSize;
  for (let attempt = 0; attempt < 20; attempt++) {
    tiles.forEach((t) => {
      t.owner = isConquerableTile(t) ? 'neutral' : 'void';
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
    while (IDS.some((id) => tiles.filter((t) => t.owner === id).length < growthSize)) {
      const options = IDS.map((id) => ({ id, size: tiles.filter((t) => t.owner === id).length }))
        .filter((x) => x.size < growthSize)
        .sort((a, b) => a.size - b.size + (Math.random() - 0.5));
      let grown = false;
      for (const { id } of options) {
        const frontier = [
          ...new Set(
            tiles
              .flatMap((t, i) => (t.owner === id ? movementNeighborsIn(tiles, i) : []))
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
    if (
      !failed &&
      IDS.every(
        (id) =>
          tiles.filter((t) => t.owner === id).length === desiredSize &&
          tiles.some(
            (tile, i) =>
              tile.owner === id &&
              movementNeighborsIn(tiles, i).some((n) => tiles[n].owner === 'neutral'),
          ),
      )
    )
      return true;
  }
  return false;
}
function valueSpread(values) {
  return Math.max(...values) - Math.min(...values);
}
function disconnectedByRemovalIn(tiles, owner, skip) {
  const own = tiles
      .map((tile, index) => (tile.owner === owner && index !== skip ? index : -1))
      .filter((index) => index >= 0),
    capital = own.find((index) => tiles[index].capital);
  if (capital == null) return own.length;
  const seen = new Set([capital]),
    queue = [capital];
  while (queue.length)
    for (const next of movementNeighborsIn(tiles, queue.shift()))
      if (next !== skip && tiles[next].owner === owner && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  return own.length - seen.size;
}
function capitalConnectedTilesIn(tiles, owner) {
  const capital = tiles.findIndex((tile) => tile.owner === owner && tile.capital);
  if (capital < 0) return new Set();
  const seen = new Set([capital]),
    queue = [capital];
  while (queue.length)
    for (const next of movementNeighborsIn(tiles, queue.shift()))
      if (tiles[next].owner === owner && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  return seen;
}
function potentialBridgeSitesIn(tiles, owner) {
  const connected = capitalConnectedTilesIn(tiles, owner);
  return tiles.filter((tile, index) => {
    if (tile.terrain !== 'river') return false;
    const banks = axisBanks(index, tile.riverAxis);
    if (banks.length !== 2 || banks.some((bank) => !isConquerableTile(tiles[bank]))) return false;
    if (
      tiles.some(
        (other, otherIndex) =>
          ['ford', 'bridge'].includes(other.terrain) && distanceOnGrid(index, otherIndex) <= 2,
      )
    )
      return false;
    return banks.some(
      (bank, side) =>
        connected.has(bank) && ['neutral', owner].includes(tiles[banks[1 - side]].owner),
    );
  }).length;
}
function generationBalanceMetrics(tiles) {
  const gates = tiles
      .map((tile, index) => (['pass', 'ford', 'bridge'].includes(tile.terrain) ? index : -1))
      .filter((index) => index >= 0),
    nations = IDS.map((id) => {
      const own = tiles
          .map((tile, index) => (tile.owner === id ? index : -1))
          .filter((index) => index >= 0),
        capital = own.find((index) => tiles[index].capital),
        exits = new Set(
          own.flatMap((index) =>
            movementNeighborsIn(tiles, index).filter((next) => tiles[next].owner === 'neutral'),
          ),
        );
      return {
        exits: exits.size,
        vulnerability: Math.max(
          0,
          ...own
            .filter((index) => !tiles[index].capital)
            .map((index) => disconnectedByRemovalIn(tiles, id, index)),
        ),
        defense: own.reduce((total, index) => total + terrainDefense(tiles[index]), 0),
        fertile: own.filter((index) => tiles[index].terrain === 'fertile').length,
        marsh: own.filter((index) => tiles[index].terrain === 'marsh').length,
        gateDistance: gates.length
          ? Math.min(...gates.map((gate) => distanceOnGrid(capital, gate)))
          : 0,
        enemyPressure: IDS.filter((other) => {
          if (other === id) return false;
          const enemyCapital = tiles.findIndex((tile) => tile.owner === other && tile.capital);
          return enemyCapital >= 0 && distanceOnGrid(capital, enemyCapital) <= 6;
        }).length,
        bridgeSites: potentialBridgeSitesIn(tiles, id),
      };
    }),
    exits = nations.map((nation) => nation.exits),
    minExits = Math.min(...exits),
    exitSpread = valueSpread(exits);
  return {
    minExits,
    exitSpread,
    singleExitDisadvantage:
      minExits === 1 && exitSpread >= GENERATION_LIMITS.singleExitSpread ? 1 : 0,
    maxVulnerability: Math.max(...nations.map((nation) => nation.vulnerability)),
    defenseSpread: valueSpread(nations.map((nation) => nation.defense)),
    fertileSpread: valueSpread(nations.map((nation) => nation.fertile)),
    marshSpread: valueSpread(nations.map((nation) => nation.marsh)),
    gateDistanceSpread: valueSpread(nations.map((nation) => nation.gateDistance)),
    pressureSpread: valueSpread(nations.map((nation) => nation.enemyPressure)),
    bridgeSiteSpread: valueSpread(nations.map((nation) => nation.bridgeSites)),
  };
}
function generationFairEnough(tiles) {
  const metrics = generationBalanceMetrics(tiles);
  return (
    metrics.singleExitDisadvantage === 0 &&
    metrics.exitSpread <= GENERATION_LIMITS.exitSpread &&
    metrics.maxVulnerability <= GENERATION_LIMITS.maxVulnerability &&
    metrics.defenseSpread <= GENERATION_LIMITS.defenseSpread &&
    metrics.fertileSpread <= GENERATION_LIMITS.fertileSpread &&
    metrics.marshSpread <= GENERATION_LIMITS.marshSpread &&
    metrics.gateDistanceSpread <= GENERATION_LIMITS.gateDistanceSpread &&
    metrics.pressureSpread <= GENERATION_LIMITS.pressureSpread &&
    metrics.bridgeSiteSpread <= GENERATION_LIMITS.bridgeSiteSpread
  );
}
function growthScore(tiles, i, id, capital) {
  const same = movementNeighborsIn(tiles, i).filter((n) => tiles[n].owner === id).length,
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
    for (const n of movementNeighborsIn(tiles, queue.shift()))
      if (n !== skip && tiles[n].owner === id && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return seen.size === tiles.filter((t, i) => t.owner === id && i !== skip).length;
}
function neutralScore(tiles, i, id) {
  return (
    movementNeighborsIn(tiles, i).filter((n) => tiles[n].owner !== id).length * 3 +
    Math.random() * 2
  );
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
      ['void', 'neutral', ...IDS].includes(tile.owner) &&
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
    text.includes('全土を統一') ||
    text.includes('一つの王冠')
  );
}
function legacyChronicleInvolvesPlayer(text = '', index = -1, log = []) {
  if (text.includes(META.player.name)) return true;
  if (text.includes('が中立地帯を開拓')) return false;
  if (text.includes('で食料不足が起こり')) return false;
  if (text.includes('列国がその拡大を警戒')) return false;
  if (text.includes('新たな大陸の覇者')) return false;
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
      (e) => e.text.includes('一つの王冠の下に統一') || e.text.includes('新たな大陸の覇者'),
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
  s.metrics.ceasefires = safeInteger(s.metrics.ceasefires, 0);
  s.metrics.betrayals = safeInteger(s.metrics.betrayals, 0);
  s.metrics.betrayalsByNation = Object.fromEntries(
    IDS.map((id) => [id, safeInteger(s.metrics.betrayalsByNation?.[id], 0)]),
  );
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
  const validDiplomacyPair = (pair) => {
    const countries = pair.split(':');
    return (
      countries.length === 2 &&
      countries[0] !== countries[1] &&
      countries.every((id) => IDS.includes(id))
    );
  };
  s.ceasefires = Object.fromEntries(
    Object.entries(isRecord(s.ceasefires) ? s.ceasefires : {})
      .filter(
        ([pair, value]) =>
          validDiplomacyPair(pair) &&
          isRecord(value) &&
          Number.isFinite(value.endYear) &&
          value.endYear > s.year,
      )
      .map(([pair, value]) => [
        pair,
        {
          startYear: safeInteger(value.startYear, s.year, 1),
          endYear: safeInteger(value.endYear, s.year + 1, s.year + 1),
        },
      ]),
  );
  s.ceasefireCooldowns = Object.fromEntries(
    Object.entries(isRecord(s.ceasefireCooldowns) ? s.ceasefireCooldowns : {})
      .filter(([pair, year]) => validDiplomacyPair(pair) && Number.isFinite(year) && year > s.year)
      .map(([pair, year]) => [pair, safeInteger(year, s.year + 1, s.year + 1)]),
  );
  s.sanctions = Object.fromEntries(
    Object.entries(isRecord(s.sanctions) ? s.sanctions : {})
      .filter(([id, year]) => IDS.includes(id) && Number.isFinite(year) && year > s.year)
      .map(([id, year]) => [id, safeInteger(year, s.year + 1, s.year + 1)]),
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
    t.riverAxis = ['vertical', 'horizontal'].includes(t.riverAxis) ? t.riverAxis : null;
    t.bridgeBuilder =
      t.terrain === 'bridge' && IDS.includes(t.bridgeBuilder) ? t.bridgeBuilder : null;
    if (TERRAIN[t.terrain]?.blocked) {
      t.owner = 'void';
      t.building = null;
      t.capital = false;
    } else if (t.owner === 'void') t.owner = 'neutral';
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
  s.version = 22;
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
    farmFood = state.tiles
      .filter((tile) => tile.owner === id && !tile.occupation && tile.building === 'farm')
      .reduce((total, tile) => total + terrainFarmFood(tile), 0),
    gold = s.productiveLand + s.towns * 5 - Math.ceil(s.army / 5),
    food = farmFood - Math.ceil(s.pop / 2) - Math.ceil(s.army / 3);
  return { gold, food, capacity: s.capacity };
}
function populationGrowth(id) {
  const s = stats(id),
    room = Math.max(0, s.capacity - s.pop);
  const yearlyGrowth = 1 + Math.ceil(Math.max(0, s.towns - 5) / 10);
  return Math.min(room, yearlyGrowth);
}
