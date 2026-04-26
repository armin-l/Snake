(() => {
function sumFx(playerPerks, perkMap, key) {
  let total = 0;
  for (const [id, count] of Object.entries(playerPerks)) {
    const fx = perkMap[id].effects[key];
    if (typeof fx === 'number') total += fx * count;
  }
  return total;
}

function xpReqProduct(playerPerks, perkMap) {
  let product = 1;
  for (const [id, count] of Object.entries(playerPerks)) {
    const fx = perkMap[id].effects.xpReqMult;
    if (fx != null) product *= Math.pow(fx, count);
  }
  return product;
}

function xpForLevel(level, playerPerks, perkMap) {
  const base = Math.ceil(5 * Math.pow(1.2, level - 1));
  return Math.max(1, Math.round(base * xpReqProduct(playerPerks, perkMap)));
}

function occupiedSet(snake, foods) {
  const occupied = new Set(snake.map(part => part[0] + ',' + part[1]));
  foods.forEach(food => occupied.add(food[0] + ',' + food[1]));
  return occupied;
}

function resolveWallCollision(params) {
  const {
    head,
    cols,
    rows,
    ghostWalls,
    selfHitsLeft,
    lastEatTime,
    wallDamage,
    comboNoReset,
  } = params;

  const result = {
    alive: true,
    head: [head[0], head[1]],
    ghostWalls,
    selfHitsLeft,
    lastEatTime,
    hitWall: false,
    wrapped: false,
    damaged: false,
  };

  if (head[0] >= 0 && head[0] < cols && head[1] >= 0 && head[1] < rows) return result;

  result.hitWall = true;
  if (ghostWalls <= 0) {
    result.alive = false;
    return result;
  }

  result.wrapped = true;
  result.head = [
    (head[0] + cols) % cols,
    (head[1] + rows) % rows,
  ];
  result.ghostWalls--;

  if (wallDamage > 0) {
    result.damaged = true;
    result.selfHitsLeft -= wallDamage;
    if (result.selfHitsLeft <= 0) {
      result.selfHitsLeft = 0;
      result.alive = false;
    }
  }

  if (comboNoReset) result.lastEatTime = lastEatTime;
  return result;
}

function resolveSelfCollision(params) {
  const { head, snake, selfHitsLeft } = params;
  const hitSelf = snake.some(part => part[0] === head[0] && part[1] === head[1]);
  if (!hitSelf) {
    return { alive: true, hitSelf: false, shieldUsed: false, selfHitsLeft };
  }
  if (selfHitsLeft <= 0) {
    return { alive: false, hitSelf: true, shieldUsed: false, selfHitsLeft: 0 };
  }
  return {
    alive: true,
    hitSelf: true,
    shieldUsed: true,
    selfHitsLeft: selfHitsLeft - 1,
  };
}

function calculateFoodScore(params) {
  const {
    now,
    lastEatTime,
    combo,
    speedActive,
    forcedBurst,
    burstScoreMult,
    bonusScore,
    doubleScoreChance,
    tripleScoreChance,
    comboWindow,
    comboMaxBonus,
    random = Math.random,
  } = params;

  const maxCombo = 4 + comboMaxBonus;
  const nextCombo = (now - lastEatTime < comboWindow) ? Math.min(combo + 1, maxCombo) : 1;
  const isBurst = speedActive || forcedBurst;
  let points = nextCombo * (isBurst ? burstScoreMult : 1) + bonusScore;

  if (random() < tripleScoreChance) points *= 3;
  else if (random() < doubleScoreChance) points *= 2;

  return {
    combo: nextCombo,
    lastEatTime: now,
    points: Math.round(points),
  };
}

function applyGrowthOnEat(snake, levelsGained, extraGrowth) {
  const nextSnake = snake.map(part => [...part]);
  if (levelsGained <= 0) {
    nextSnake.pop();
    return nextSnake;
  }

  const totalGrowth = levelsGained * (1 + extraGrowth);
  for (let i = 1; i < totalGrowth; i++) {
    nextSnake.push([...nextSnake[nextSnake.length - 1]]);
  }
  return nextSnake;
}

function snapshotHiScoreDetails(level, playerPerks) {
  const perks = Object.entries(playerPerks || {})
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([id, count]) => ({ id, count: Math.max(1, Math.floor(count)) }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));

  return {
    level: Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1,
    perks,
  };
}

function normalizeHiScorePerks(perks, perkMap) {
  if (!Array.isArray(perks)) return [];

  return perks.map(perk => {
    if (!perk || typeof perk !== 'object') return null;

    const id = typeof perk.id === 'string' ? perk.id : '';
    const count = Number.isFinite(perk.count) ? Math.max(1, Math.floor(perk.count)) : 1;
    const perkData = perkMap[id];

    return {
      id: id || 'unknown',
      count,
      name: perkData?.name || (typeof perk.name === 'string' && perk.name ? perk.name : id || 'Unknown perk'),
      icon: perkData?.icon || (typeof perk.icon === 'string' && perk.icon ? perk.icon : '*'),
      tier: perkData?.tier || (typeof perk.tier === 'string' && perk.tier ? perk.tier : 'common'),
    };
  }).filter(Boolean);
}

function normalizeHiScoreEntry(entry, perkMap) {
  const score = Number.isFinite(entry?.score) ? Math.max(0, Math.floor(entry.score)) : 0;
  const rawName = typeof entry?.name === 'string' ? entry.name.trim().toUpperCase() : '';
  const level = Number.isFinite(entry?.level) ? Math.max(1, Math.floor(entry.level)) : null;
  const perks = normalizeHiScorePerks(entry?.perks, perkMap);

  return {
    name: rawName || '???',
    score,
    level,
    perks,
    hasDetails: level != null || perks.length > 0,
    fresh: !!entry?.fresh,
  };
}

function normalizeHiScores(hiScores, maxEntries, perkMap) {
  if (!Array.isArray(hiScores)) return [];

  return hiScores
    .map(entry => normalizeHiScoreEntry(entry, perkMap))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxEntries);
}

window.SnakeLogic = {
  sumFx,
  xpReqProduct,
  xpForLevel,
  occupiedSet,
  resolveWallCollision,
  resolveSelfCollision,
  calculateFoodScore,
  applyGrowthOnEat,
  snapshotHiScoreDetails,
  normalizeHiScoreEntry,
  normalizeHiScores,
};
})();