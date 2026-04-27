const { PERKS, PERK_MAP, TIER_ORDER } = window.SnakePerks;
const {
  sumFx: sumFxFromLogic,
  xpReqProduct: xpReqProductFromLogic,
  xpForLevel: xpForLevelFromLogic,
  occupiedSet: occupiedSetFromLogic,
  resolveWallCollision: resolveWallCollisionFromLogic,
  resolveSelfCollision: resolveSelfCollisionFromLogic,
  calculateFoodScore,
  applyGrowthOnEat: applyGrowthOnEatFromLogic,
  snapshotHiScoreDetails: snapshotHiScoreDetailsFromLogic,
  normalizeHiScores: normalizeHiScoresFromLogic,
} = window.SnakeLogic;

const BOARD_DEFAULTS = { cell: 28, cols: 20, rows: 20 };
const STORAGE_KEYS = { best: 'snakeBest', hiScores: 'snakeHiScores' };
const HS_MAX = 10;
const BLITZ_DURATION_BASE = 3000;
const BASE_COMBO_WINDOW = 2500;

const COLORS = {
  snakeHead: '#4ecca3',
  snakeBody: '#38b28a',
  food: '#e94560',
  grid: '#ffffff08',
  background: '#0f0f23',
};

const TIER_COLORS = {
  common: '#4ecca388',
  rare: '#4d9fff88',
  epic: '#cc44ff88',
  cursed: '#ff446688',
  legendary: '#ffd70088',
};

const TIER_CLASSES = {
  common: 'tier-common',
  rare: 'tier-rare',
  epic: 'tier-epic',
  cursed: 'tier-cursed',
  legendary: 'tier-legendary',
};

const DIR = { UP:[0,-1], DOWN:[0,1], LEFT:[-1,0], RIGHT:[1,0] };
const OPPOSITE = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };
const KEY_MAP = {
  ArrowUp:'UP', w:'UP', W:'UP',
  ArrowDown:'DOWN', s:'DOWN', S:'DOWN',
  ArrowLeft:'LEFT', a:'LEFT', A:'LEFT',
  ArrowRight:'RIGHT', d:'RIGHT', D:'RIGHT',
};

function getElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}

const DOM = {
  canvas: getElement('c'),
  overlay: getElement('overlay'),
  overlayTitle: getElement('overlay-title'),
  overlayMsg: getElement('overlay-msg'),
  startBtn: getElement('start-btn'),
  score: getElement('score'),
  best: getElement('best'),
  level: getElement('level-el'),
  effectsBar: getElement('effects-bar'),
  xpFill: getElement('xp-fill'),
  xpNums: getElement('xp-nums'),
  levelupOverlay: getElement('levelup-overlay'),
  perkCards: getElement('perk-cards'),
  luLevel: getElement('lu-level'),
  activePerks: getElement('active-perks'),
  hsList: getElement('hs-list'),
  devOverlay: getElement('dev-overlay'),
  devList: getElement('dev-perk-list'),
  devSearch: getElement('dev-search'),
  devPerkBtn: getElement('dev-perk-btn'),
  devClose: getElement('dev-close'),
  btnUp: getElement('btn-up'),
  btnDown: getElement('btn-down'),
  btnLeft: getElement('btn-left'),
  btnRight: getElement('btn-right'),
  btnPause: getElement('btn-pause'),
  nameEntryOverlay: getElement('name-entry-overlay'),
  neRank: getElement('ne-rank'),
  nc0: getElement('nc0'),
  nc1: getElement('nc1'),
  nc2: getElement('nc2'),
  nameConfirmBtn: getElement('name-confirm-btn'),
  mobileInfoBtn: getElement('mobile-info-btn'),
  infoDrawer: getElement('info-drawer'),
  infoDrawerClose: getElement('info-drawer-close'),
};

const ctx = DOM.canvas.getContext('2d');
const nameChars = [DOM.nc0, DOM.nc1, DOM.nc2];

function readStoredHiScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.hiScores) || '[]');
    return normalizeHiScoresFromLogic(raw, HS_MAX, PERK_MAP);
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

function serializeHiScoreEntry(entry) {
  return {
    name: entry.name,
    score: entry.score,
    level: entry.level,
    perks: entry.perks.map(perk => ({ id: perk.id, count: perk.count })),
  };
}

function persistHiScores() {
  localStorage.setItem(
    STORAGE_KEYS.hiScores,
    JSON.stringify(hiScores.map(serializeHiScoreEntry))
  );
}

function buildCurrentHiScoreSnapshot() {
  return snapshotHiScoreDetailsFromLogic(playerLevel, playerPerks);
}

function getHiScoreTierClass(tier) {
  return TIER_ORDER.includes(tier) ? tier : 'common';
}

function renderHiScoreTooltip(entry) {
  const levelMarkup = entry.level != null
    ? `<div class="hs-tooltip-line"><span class="hs-tooltip-label">LEVEL</span><strong class="hs-tooltip-value">${entry.level}</strong></div>`
    : '<div class="hs-tooltip-empty">Legacy score</div>';

  const perksMarkup = entry.perks.length > 0
    ? `<div class="hs-tooltip-label hs-tooltip-section">PERKS</div><div class="hs-tooltip-perks">${entry.perks.map(perk => {
      const tierClass = getHiScoreTierClass(perk.tier);
      const countMarkup = perk.count > 1 ? `<span class="hs-tooltip-count">x${perk.count}</span>` : '';
      return `<span class="hs-tooltip-perk hs-tooltip-tier-${tierClass}">` +
        `<span class="hs-tooltip-icon">${escapeHtml(perk.icon)}</span>` +
        `<span class="hs-tooltip-name">${escapeHtml(perk.name)}</span>` +
        countMarkup +
        `</span>`;
    }).join('')}</div>`
    : `<div class="hs-tooltip-empty">${entry.level != null ? 'No perks collected' : 'No run details saved'}</div>`;

  return `<span class="hs-detail-pill" aria-hidden="true">i</span>` +
    `<span class="hs-tooltip" role="tooltip">${levelMarkup}${perksMarkup}</span>`;
}

let CELL = BOARD_DEFAULTS.cell;
let COLS = BOARD_DEFAULTS.cols;
let ROWS = BOARD_DEFAULTS.rows;

let snake;
let dir;
let dirQueue;
let foods;
let maxFoods;
let score;
let best;
let running;
let paused;
let particles;
let speedActive;
let speedEnd;
let burstScoreMult;
let ghostWalls;
let maxGhostWalls;
let combo;
let lastEatTime;
let xp;
let xpNeeded;
let playerLevel;
let playerPerks;
let selfHitsLeft;
let pendingLevelUps;
let hiScores = readStoredHiScores();
let lastTime = 0;
let accumulated = 0;
let touchStartX = 0;
let touchStartY = 0;

best = parseInt(localStorage.getItem(STORAGE_KEYS.best) || '0', 10);
DOM.best.textContent = best;

function recomputeCell() {
  const isMobile = window.innerWidth <= 700;
  const availW = window.innerWidth - (isMobile ? 20 : 228);
  const availH = window.innerHeight - (isMobile ? 260 : 360);
  CELL = Math.max(8, Math.min(BOARD_DEFAULTS.cell, Math.floor(availW / COLS), Math.floor(availH / ROWS)));
  DOM.canvas.width = COLS * CELL;
  DOM.canvas.height = ROWS * CELL;
}

function rnd(n) {
  return Math.floor(Math.random() * n);
}

function sumFx(key) {
  return sumFxFromLogic(playerPerks, PERK_MAP, key);
}

function xpReqProduct() {
  return xpReqProductFromLogic(playerPerks, PERK_MAP);
}

function hasFx(key) {
  return Object.keys(playerPerks).some(id => PERK_MAP[id].effects[key]);
}

function xpForLevel(level) {
  return xpForLevelFromLogic(level, playerPerks, PERK_MAP);
}

function occupiedSet() {
  return occupiedSetFromLogic(snake, foods);
}

function spawnFoods() {
  while (foods.length < maxFoods) {
    const occupied = occupiedSet();
    const free = COLS * ROWS - snake.length - foods.length;
    if (free <= 0) break;
    let food;
    do {
      food = [rnd(COLS), rnd(ROWS)];
    } while (occupied.has(food[0] + ',' + food[1]));
    foods.push(food);
  }
}

function pruneOutOfBoundsFoods() {
  foods = foods.filter(food => food[0] < COLS && food[1] < ROWS);
  spawnFoods();
}

function expandBoard(dx, dy) {
  COLS += dx;
  ROWS += dy;
  recomputeCell();
  pruneOutOfBoundsFoods();
}

function spawnParticles(cx, cy, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x: cx * CELL + CELL / 2,
      y: cy * CELL + CELL / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 2 + Math.random() * 3,
      alpha: 1,
      color,
      decay: 0.035 + Math.random() * 0.04,
    });
  }
}

function init() {
  COLS = BOARD_DEFAULTS.cols;
  ROWS = BOARD_DEFAULTS.rows;
  recomputeCell();

  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  snake = [[cx, cy], [cx - 1, cy], [cx - 2, cy]];
  dir = DIR.RIGHT;
  dirQueue = [];
  foods = [];
  maxFoods = 1;
  score = 0;
  xp = 0;
  playerLevel = 1;
  playerPerks = {};
  selfHitsLeft = 0;
  pendingLevelUps = 0;
  running = false;
  paused = false;
  particles = [];
  speedActive = false;
  speedEnd = 0;
  burstScoreMult = 1;
  ghostWalls = 0;
  maxGhostWalls = 0;
  combo = 0;
  lastEatTime = 0;
  xpNeeded = xpForLevel(1);

  DOM.score.textContent = '0';
  DOM.level.textContent = '1';
  DOM.effectsBar.innerHTML = '';
  DOM.levelupOverlay.style.display = 'none';
  spawnFoods();
  refreshXPBar();
  refreshPerks();
  hiScores.forEach(entry => delete entry.fresh);
  renderHiScores();
}

function refreshXPBar() {
  const pct = Math.min(100, (xp / xpNeeded) * 100);
  DOM.xpFill.style.width = pct + '%';
  DOM.xpNums.textContent = xp + ' / ' + xpNeeded;
}

function gainXP(amount) {
  let levelsGained = 0;
  xp += amount;
  while (xp >= xpNeeded) {
    xp -= xpNeeded;
    playerLevel++;
    DOM.level.textContent = playerLevel;
    xpNeeded = xpForLevel(playerLevel);
    pendingLevelUps++;
    levelsGained++;
  }
  refreshXPBar();
  return levelsGained;
}

function getShownLevelUpValue() {
  if (pendingLevelUps <= 0) return playerLevel;
  return playerLevel - pendingLevelUps + 1;
}

function pickTier() {
  let weights;
  if (playerLevel <= 3) weights = [80, 18, 2, 0, 0];
  else if (playerLevel <= 8) weights = [60, 35, 4, 0, 1];
  else if (playerLevel <= 15) weights = [40, 43, 14, 2, 1];
  else if (playerLevel <= 25) weights = [25, 38, 24, 10, 3];
  else weights = [15, 28, 28, 22, 7];

  const total = weights.reduce((sum, value) => sum + value, 0);
  const roll = Math.random() * total;
  if (roll < weights[0]) return 'common';
  if (roll < weights[0] + weights[1]) return 'rare';
  if (roll < weights[0] + weights[1] + weights[2]) return 'epic';
  if (roll < weights[0] + weights[1] + weights[2] + weights[3]) return 'cursed';
  return 'legendary';
}

function pickPerkOfTier(tier, excluded) {
  const pool = PERKS.filter(perk => perk.tier === tier && !excluded.has(perk.id));
  if (pool.length === 0) return null;
  return pool[rnd(pool.length)];
}

function renderPerkCard(perk, index) {
  const isOwned = !!playerPerks[perk.id];
  const card = document.createElement('div');
  card.className = 'perk-card';
  card.style.setProperty('--perk-color', perk.color);
  card.style.setProperty('--perk-shadow', perk.shadow + '99');
  card.innerHTML =
    `<div class="perk-shortcut">${index + 1}</div>` +
    `<div class="perk-tier tier-${perk.tier}">${perk.tier.toUpperCase()}</div>` +
    `<div class="perk-icon">${perk.icon}</div>` +
    `<div class="perk-name">${perk.name}</div>` +
    `<div class="perk-rank">${isOwned ? 'STACK ×' + (playerPerks[perk.id] + 1) : (perk.tier === 'cursed' ? '⚠ CURSED!' : perk.tier === 'legendary' ? '★ LEGENDARY!' : 'NEW!')}</div>` +
    `<div class="perk-desc">${perk.desc}</div>`;
  card.addEventListener('click', () => selectPerk(perk.id));
  return card;
}

function showLevelUp() {
  paused = true;
  DOM.luLevel.textContent = getShownLevelUpValue();
  const excluded = new Set();
  const chosen = [];

  for (let i = 0; i < 3; i++) {
    let perk = pickPerkOfTier(pickTier(), excluded);
    if (!perk) {
      for (const fallbackTier of TIER_ORDER) {
        perk = pickPerkOfTier(fallbackTier, excluded);
        if (perk) break;
      }
    }
    if (!perk) break;
    excluded.add(perk.id);
    chosen.push(perk);
  }

  DOM.perkCards.innerHTML = '';
  chosen.forEach((perk, index) => DOM.perkCards.appendChild(renderPerkCard(perk, index)));
  DOM.levelupOverlay._perkIds = chosen.map(perk => perk.id);
  DOM.levelupOverlay.style.display = 'flex';
}

function selectPerk(id) {
  applyPerk(id);
  pendingLevelUps = Math.max(0, pendingLevelUps - 1);
  if (pendingLevelUps > 0) {
    showLevelUp();
    return;
  }
  DOM.levelupOverlay.style.display = 'none';
  paused = false;
}

function applyPerk(id) {
  playerPerks[id] = (playerPerks[id] || 0) + 1;
  const fx = PERK_MAP[id].effects;

  if (fx.shrink) {
    const cut = Math.min(fx.shrink, snake.length - 3);
    if (cut > 0) snake.splice(snake.length - cut, cut);
  }
  if (fx.selfHits) selfHitsLeft += fx.selfHits;
  if (fx.wallPasses) {
    maxGhostWalls += fx.wallPasses;
    ghostWalls += fx.wallPasses;
  }
  if (fx.extraFood) {
    maxFoods += fx.extraFood;
    spawnFoods();
  }
  if (fx.boardExpand) expandBoard(fx.boardExpand.dx, fx.boardExpand.dy);

  xpNeeded = xpForLevel(playerLevel);
  burstScoreMult = 1 + sumFx('burstScoreMult');
  refreshXPBar();
  refreshPerks();
  refreshEffects();
}

function refreshPerks() {
  const entries = Object.entries(playerPerks);
  if (entries.length === 0) {
    DOM.activePerks.innerHTML = '<span style="color:#445">—</span>';
    return;
  }

  DOM.activePerks.innerHTML = entries.map(([id, count]) => {
    const perk = PERK_MAP[id];
    const stack = count > 1 ? ` <span style="color:#445">×${count}</span>` : '';
    return `<span class="ap-${perk.tier}">${perk.icon} ${perk.name}${stack}</span>`;
  }).join('<br>');
}

function badge(cls, label, pct) {
  return `<span class="effect-badge ${cls}">` +
    `<span class="badge-label">${label}</span>` +
    `<span class="badge-bar-track"><span class="badge-bar-fill" style="width:${pct}%"></span></span>` +
    `</span>`;
}

function refreshEffects() {
  const now = Date.now();
  const totalBurst = BLITZ_DURATION_BASE + sumFx('burstDuration');
  const badges = [];

  if (hasFx('forcedBurst')) {
    badges.push(badge('badge-speed', '💀 CURSED', 100));
  } else if (speedActive) {
    badges.push(badge('badge-speed', '⚡ BLITZ', Math.max(0, (speedEnd - now) / totalBurst * 100)));
  }
  if (ghostWalls > 0) badges.push(`<span class="effect-badge badge-ghost">👻 ×${ghostWalls} WALL</span>`);
  if (combo >= 2) {
    const comboWindow = BASE_COMBO_WINDOW + sumFx('comboWindow');
    const comboPct = Math.max(0, (1 - (now - lastEatTime) / comboWindow) * 100);
    badges.push(badge('badge-combo', '×' + combo + ' COMBO', comboPct));
  }
  if (selfHitsLeft > 0) badges.push(`<span class="effect-badge badge-resilience">🛡️ ×${selfHitsLeft} SHIELD</span>`);

  DOM.effectsBar.innerHTML = badges.join('');
}

function tickEffectBars() {
  const now = Date.now();
  if (speedActive && !hasFx('forcedBurst')) {
    const el = DOM.effectsBar.querySelector('.badge-speed .badge-bar-fill');
    const totalBurst = BLITZ_DURATION_BASE + sumFx('burstDuration');
    if (el) el.style.width = Math.max(0, (speedEnd - now) / totalBurst * 100) + '%';
  }
  if (combo >= 2) {
    const el = DOM.effectsBar.querySelector('.badge-combo .badge-bar-fill');
    const comboWindow = BASE_COMBO_WINDOW + sumFx('comboWindow');
    if (el) el.style.width = Math.max(0, (1 - (now - lastEatTime) / comboWindow) * 100) + '%';
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawGrid() {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, DOM.canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(DOM.canvas.width, y * CELL);
    ctx.stroke();
  }
}

function drawFoods(now) {
  foods.forEach((food, index) => {
    const pulse = 0.85 + 0.15 * Math.sin(now / 200 + index * 1.3);
    const radius = (CELL / 2 - 3) * pulse;
    const fx = food[0] * CELL + CELL / 2;
    const fy = food[1] * CELL + CELL / 2;
    ctx.shadowBlur = 14;
    ctx.shadowColor = COLORS.food;
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(fx, fy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function drawSnake() {
  const hasWall = maxGhostWalls > 0;
  const headColor = hasWall ? '#bf7fff' : (speedActive ? '#00bfff' : COLORS.snakeHead);
  const bodyColor = hasWall ? '#9933cc' : (speedActive ? '#0077aa' : COLORS.snakeBody);

  snake.forEach(([x, y], index) => {
    const isHead = index === 0;
    const size = CELL - 4;
    const px = x * CELL + 2;
    const py = y * CELL + 2;

    ctx.shadowBlur = isHead ? 12 : 0;
    ctx.shadowColor = headColor;
    ctx.fillStyle = isHead ? headColor : bodyColor;
    if (hasWall) ctx.globalAlpha = 0.82;

    roundRect(px, py, size, size, isHead ? 7 : 5);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (isHead) {
      const [dx, dy] = dir;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1a1a2e';
      const e1x = px + size / 2 + dy * 5;
      const e1y = py + size / 2 + dx * 5;
      const e2x = px + size / 2 - dy * 5;
      const e2y = py + size / 2 - dx * 5;
      const offset = 4;
      ctx.beginPath();
      ctx.arc(e1x + dx * offset, e1y + dy * offset, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e2x + dx * offset, e2y + dy * offset, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.shadowBlur = 0;
}

function drawParticles() {
  particles.forEach(particle => {
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function draw() {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, DOM.canvas.width, DOM.canvas.height);

  drawGrid();
  const now = Date.now();
  drawFoods(now);
  drawSnake();
  drawParticles();
  tickEffectBars();
}

function qualifiesForHiScore(value) {
  if (value <= 0) return false;
  if (hiScores.length < HS_MAX) return true;
  return value > hiScores[hiScores.length - 1].score;
}

function saveHiScore(name, value) {
  const snapshot = buildCurrentHiScoreSnapshot();
  hiScores = normalizeHiScoresFromLogic([
    ...hiScores,
    { name: name.toUpperCase(), score: value, level: snapshot.level, perks: snapshot.perks, fresh: true },
  ], HS_MAX, PERK_MAP);
  persistHiScores();
}

function renderHiScores() {
  if (hiScores.length === 0) {
    DOM.hsList.innerHTML = '<div class="hs-row" style="justify-content:center;color:#334;font-size:0.6rem;letter-spacing:0.1em;padding:8px 0;">NO SCORES YET</div>';
    return;
  }

  DOM.hsList.innerHTML = hiScores.map((entry, index) => {
    let className = 'hs-row';
    if (index === 0) className += ' hs-first';
    else if (index === 1) className += ' hs-second';
    else if (index === 2) className += ' hs-third';
    if (entry.fresh) className += ' hs-new';

    return `<div class="${className}" tabindex="0">` +
      `<span class="hs-rank">${index + 1}.</span>` +
      `<span class="hs-name">${entry.name || '???'}</span>` +
      `<span class="hs-detail">${renderHiScoreTooltip(entry)}</span>` +
      `<span class="hs-score">${entry.score}</span>` +
      `</div>`;
  }).join('');
}

function endGame() {
  running = false;
  if (qualifiesForHiScore(score)) {
    const rank = hiScores.filter(entry => entry.score > score).length + 1;
    showNameEntry(rank);
    return;
  }
  DOM.overlayTitle.textContent = 'GAME OVER';
  DOM.overlayMsg.textContent = `Score: ${score}  ·  Level: ${playerLevel}`;
  DOM.startBtn.textContent = 'PLAY AGAIN';
  DOM.overlay.style.display = 'flex';
}

function resolveWallCollision(head) {
  const result = resolveWallCollisionFromLogic({
    head,
    cols: COLS,
    rows: ROWS,
    ghostWalls,
    selfHitsLeft,
    lastEatTime,
    wallDamage: sumFx('wallDamage'),
    comboNoReset: hasFx('comboNoReset'),
  });

  if (!result.alive && !result.wrapped) {
    endGame();
    return false;
  }

  head[0] = result.head[0];
  head[1] = result.head[1];
  ghostWalls = result.ghostWalls;
  selfHitsLeft = result.selfHitsLeft;
  lastEatTime = result.lastEatTime;

  if (result.damaged) spawnParticles(head[0], head[1], '#ff4466', 10);
  if (!result.alive) {
    endGame();
    return false;
  }
  if (result.wrapped) refreshEffects();
  return true;
}

function resolveSelfCollision(head) {
  const result = resolveSelfCollisionFromLogic({ head, snake, selfHitsLeft });
  if (!result.hitSelf) return true;
  if (!result.alive) {
    endGame();
    return false;
  }

  selfHitsLeft = result.selfHitsLeft;
  spawnParticles(head[0], head[1], '#ff4444', 8);
  refreshEffects();
  return true;
}

function scoreFood(now) {
  const result = calculateFoodScore({
    now,
    lastEatTime,
    combo,
    speedActive,
    forcedBurst: hasFx('forcedBurst'),
    burstScoreMult,
    bonusScore: sumFx('bonusScore'),
    doubleScoreChance: sumFx('doubleScoreChance') / 100,
    tripleScoreChance: sumFx('tripleScoreChance') / 100,
    comboWindow: BASE_COMBO_WINDOW + sumFx('comboWindow'),
    comboMaxBonus: sumFx('comboMax'),
  });

  combo = result.combo;
  lastEatTime = result.lastEatTime;
  score += result.points;
  DOM.score.textContent = score;
  if (score > best) {
    best = score;
    DOM.best.textContent = best;
    localStorage.setItem(STORAGE_KEYS.best, String(best));
  }
}

function maybeTriggerBurst(now) {
  const totalBurstChance = sumFx('burstChance');
  if (speedActive || totalBurstChance <= 0 || Math.random() >= totalBurstChance) return;
  speedActive = true;
  speedEnd = now + BLITZ_DURATION_BASE + sumFx('burstDuration');
  burstScoreMult = 1 + sumFx('burstScoreMult');
}

function applyGrowthOnEat(levelsGained) {
  snake = applyGrowthOnEatFromLogic(snake, levelsGained, sumFx('extraGrowth'));
}

function handleFoodCollision(head, foodIdx, now) {
  scoreFood(now);
  spawnParticles(foods[foodIdx][0], foods[foodIdx][1], COLORS.food, 12);
  foods.splice(foodIdx, 1);
  spawnFoods();
  maybeTriggerBurst(now);
  const levelsGained = gainXP(1 + sumFx('bonusXP'));
  refreshEffects();
  applyGrowthOnEat(levelsGained);
}

function step() {
  if (dirQueue.length > 0) dir = dirQueue.shift();
  const head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
  const now = Date.now();

  if (!resolveWallCollision(head)) return;
  if (!resolveSelfCollision(head)) return;

  snake.unshift(head);

  const foodIdx = foods.findIndex(food => food[0] === head[0] && food[1] === head[1]);
  if (foodIdx !== -1) {
    handleFoodCollision(head, foodIdx, now);
  } else {
    snake.pop();
  }

  if (pendingLevelUps > 0) {
    showLevelUp();
  }
}

function getDelay() {
  let base;
  if (score < 5) base = 220;
  else if (score < 50) base = 180;
  else if (score < 100) base = 150;
  else if (score < 150) base = 120;
  else base = 100;
  return Math.max(40, (speedActive || hasFx('forcedBurst')) ? Math.round(base * 0.55) : base);
}

function updateParticles() {
  particles = particles.filter(particle => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.09;
    particle.alpha -= particle.decay;
    particle.r *= 0.97;
    return particle.alpha > 0;
  });
}

function gameFrame(ts) {
  if (!running) return;
  if (paused) {
    lastTime = ts;
    accumulated = 0;
    requestAnimationFrame(gameFrame);
    return;
  }

  const now = Date.now();
  const delta = ts - lastTime;
  lastTime = ts;
  accumulated += delta;

  if (speedActive && now >= speedEnd) {
    speedActive = false;
    refreshEffects();
  }

  updateParticles();

  const delay = getDelay();
  while (accumulated >= delay) {
    accumulated -= delay;
    step();
    if (paused) break;
  }

  draw();
  requestAnimationFrame(gameFrame);
}

function startGame() {
  init();
  draw();
  DOM.overlay.style.display = 'none';
  DOM.btnPause.textContent = '\u23F8';
  running = true;
  lastTime = performance.now();
  accumulated = 0;
  requestAnimationFrame(gameFrame);
}

function enqueueDir(directionName) {
  const lastDir = dirQueue.length > 0 ? dirQueue[dirQueue.length - 1] : dir;
  const lastName = Object.keys(DIR).find(key => DIR[key] === lastDir);
  if (directionName === OPPOSITE[lastName] || directionName === lastName) return;
  if (dirQueue.length < 3) dirQueue.push(DIR[directionName]);
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  DOM.btnPause.textContent = paused ? '\u23F5' : '\u23F8';
}

function tryDir(directionName) {
  if (!running) return;
  enqueueDir(directionName);
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function renderDevList(filter = '') {
  const normalizedFilter = filter.toLowerCase();
  DOM.devList.innerHTML = '';

  TIER_ORDER.forEach(tier => {
    const pool = PERKS.filter(perk => perk.tier === tier && (!normalizedFilter || perk.name.toLowerCase().includes(normalizedFilter) || perk.desc.toLowerCase().includes(normalizedFilter)));
    if (pool.length === 0) return;

    const header = document.createElement('div');
    header.style.cssText = `font-size:0.62rem;letter-spacing:0.18em;color:${TIER_COLORS[tier]};padding:6px 10px 2px;text-transform:uppercase;`;
    header.textContent = tier;
    DOM.devList.appendChild(header);

    pool.forEach(perk => {
      const row = document.createElement('div');
      const count = playerPerks[perk.id] || 0;
      row.className = 'dev-perk-row';
      row.innerHTML =
        `<span class="dp-icon">${perk.icon}</span>` +
        `<span class="dp-tier ${TIER_CLASSES[perk.tier]}">${perk.tier.toUpperCase()}</span>` +
        `<span class="dp-name" style="color:${perk.color}">${perk.name}</span>` +
        `<span class="dp-desc">${perk.desc}</span>` +
        `<span class="dp-count">${count > 0 ? '×' + count : ''}</span>`;
      row.addEventListener('click', () => {
        applyPerk(perk.id);
        renderDevList(DOM.devSearch.value);
      });
      DOM.devList.appendChild(row);
    });
  });
}

function showNameEntry(rank) {
  DOM.neRank.textContent = rank;
  nameChars.forEach(input => { input.value = ''; });
  DOM.nameEntryOverlay.style.display = 'flex';
  setTimeout(() => nameChars[0].focus(), 50);
}

function submitName() {
  const name = nameChars.map(input => (input.value || '_').toUpperCase()[0]).join('');
  saveHiScore(name, score);
  renderHiScores();
  DOM.nameEntryOverlay.style.display = 'none';
  DOM.overlayTitle.textContent = 'GAME OVER';
  DOM.overlayMsg.textContent = `Score: ${score}  ·  Level: ${playerLevel}`;
  DOM.startBtn.textContent = 'PLAY AGAIN';
  DOM.overlay.style.display = 'flex';
}

function onKeyDown(event) {
  if (isTypingTarget(event.target)) return;

  if (DOM.levelupOverlay.style.display !== 'none') {
    const ids = DOM.levelupOverlay._perkIds || [];
    if (event.key === '1' && ids[0]) { selectPerk(ids[0]); return; }
    if (event.key === '2' && ids[1]) { selectPerk(ids[1]); return; }
    if (event.key === '3' && ids[2]) { selectPerk(ids[2]); return; }
    return;
  }

  if (event.key === ' ' && !running) {
    event.preventDefault();
    startGame();
    return;
  }
  if (event.key === 'p' || event.key === 'P') {
    togglePause();
    return;
  }

  const directionName = KEY_MAP[event.key];
  if (!directionName) return;
  event.preventDefault();
  if (!running) return;
  enqueueDir(directionName);
}

function onTouchStart(event) {
  if (event.target.closest('.ctrl-btn')) return;
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  const levelupOpen = DOM.levelupOverlay.style.display !== 'none';
  if (running && !DOM.infoDrawer.classList.contains('open') && !levelupOpen) event.preventDefault();
}

function onTouchEnd(event) {
  if (DOM.infoDrawer.classList.contains('open')) return;
  if (DOM.levelupOverlay.style.display !== 'none') return;
  if (event.target.closest('.ctrl-btn')) return;
  const dx = event.changedTouches[0].clientX - touchStartX;
  const dy = event.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
  if (Math.abs(dx) > Math.abs(dy)) tryDir(dx > 0 ? 'RIGHT' : 'LEFT');
  else tryDir(dy > 0 ? 'DOWN' : 'UP');
  if (running) event.preventDefault();
}

function wireNameInputs() {
  nameChars.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase();
      if (input.value && index < 2) nameChars[index + 1].focus();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !input.value && index > 0) {
        nameChars[index - 1].focus();
        nameChars[index - 1].value = '';
      }
      if (event.key === 'Enter') submitName();
    });
  });
}

function wireEvents() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keydown', event => {
    if (DOM.devOverlay.style.display !== 'none' && event.key === 'Escape') {
      DOM.devOverlay.style.display = 'none';
    }
  });

  DOM.btnUp.addEventListener('click', () => tryDir('UP'));
  DOM.btnDown.addEventListener('click', () => tryDir('DOWN'));
  DOM.btnLeft.addEventListener('click', () => tryDir('LEFT'));
  DOM.btnRight.addEventListener('click', () => tryDir('RIGHT'));
  [
    [DOM.btnUp, () => tryDir('UP')],
    [DOM.btnDown, () => tryDir('DOWN')],
    [DOM.btnLeft, () => tryDir('LEFT')],
    [DOM.btnRight, () => tryDir('RIGHT')],
    [DOM.btnPause, () => togglePause()],
  ].forEach(([btn, handler]) => {
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); }, { passive: false });
  });
  DOM.btnPause.addEventListener('click', togglePause);
  DOM.startBtn.addEventListener('click', startGame);

  DOM.devPerkBtn.addEventListener('click', () => {
    if (!running) return;
    renderDevList('');
    DOM.devSearch.value = '';
    DOM.devOverlay.style.display = 'flex';
    DOM.devSearch.focus();
  });
  DOM.devSearch.addEventListener('input', () => renderDevList(DOM.devSearch.value));
  DOM.devClose.addEventListener('click', () => { DOM.devOverlay.style.display = 'none'; });
  DOM.devOverlay.addEventListener('click', event => {
    if (event.target === DOM.devOverlay) DOM.devOverlay.style.display = 'none';
  });

  window.addEventListener('resize', () => {
    recomputeCell();
    draw();
  });

  document.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: false });

  DOM.mobileInfoBtn.addEventListener('click', () => {
    DOM.infoDrawer.classList.add('open');
  });
  DOM.infoDrawerClose.addEventListener('click', () => {
    DOM.infoDrawer.classList.remove('open');
  });
  DOM.infoDrawer.addEventListener('click', event => {
    if (event.target === DOM.infoDrawer) DOM.infoDrawer.classList.remove('open');
  });
  DOM.nameConfirmBtn.addEventListener('click', submitName);
  wireNameInputs();
}

recomputeCell();
wireEvents();
init();
draw();
