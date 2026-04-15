(() => {
const { PERK_MAP } = window.SnakePerks;
const Logic = window.SnakeLogic;

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}

function sequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index++;
    return value;
  };
}

const tests = [
  {
    name: 'sumFx stacks repeated perk effects',
    run() {
      const playerPerks = { ap_c1: 2, ap_r1: 1, gt_c1: 1 };
      const total = Logic.sumFx(playerPerks, PERK_MAP, 'bonusScore');
      assertEqual(total, 4, 'bonusScore should include stacked common and rare perks');
    },
  },
  {
    name: 'xpReqProduct multiplies all XP discounts',
    run() {
      const playerPerks = { xr_r1: 2, sc_cu1: 1 };
      const product = Logic.xpReqProduct(playerPerks, PERK_MAP);
      assertEqual(product, 0.1215, 'XP discounts should multiply across perk stacks');
    },
  },
  {
    name: 'xpForLevel applies XP discounts and rounding',
    run() {
      const playerPerks = { xr_r1: 2 };
      const needed = Logic.xpForLevel(1, playerPerks, PERK_MAP);
      assertEqual(needed, 4, 'Level 1 should round 5 * 0.81 down to 4');
    },
  },
  {
    name: 'occupiedSet merges snake and food positions uniquely',
    run() {
      const occupied = Logic.occupiedSet([[1, 1], [2, 1], [2, 2]], [[2, 2], [3, 4]]);
      assertEqual(occupied.size, 4, 'occupied set should de-duplicate overlapping coordinates');
      assert(occupied.has('3,4'), 'food cell should be included in occupied set');
    },
  },
  {
    name: 'resolveWallCollision wraps and spends resources',
    run() {
      const result = Logic.resolveWallCollision({
        head: [-1, 4],
        cols: 20,
        rows: 20,
        ghostWalls: 2,
        selfHitsLeft: 5,
        lastEatTime: 900,
        wallDamage: 2,
        comboNoReset: true,
      });

      assertEqual(result.alive, true, 'wrap should survive while ghost walls remain');
      assertDeepEqual(result.head, [19, 4], 'head should wrap around the board edge');
      assertEqual(result.ghostWalls, 1, 'one wall pass should be consumed');
      assertEqual(result.selfHitsLeft, 3, 'wall damage should consume self-hit shields');
      assertEqual(result.lastEatTime, 900, 'comboNoReset should preserve last eat timestamp');
    },
  },
  {
    name: 'resolveWallCollision dies without ghost walls',
    run() {
      const result = Logic.resolveWallCollision({
        head: [20, 5],
        cols: 20,
        rows: 20,
        ghostWalls: 0,
        selfHitsLeft: 2,
        lastEatTime: 0,
        wallDamage: 0,
        comboNoReset: false,
      });

      assertEqual(result.alive, false, 'wall collision without charges should be fatal');
      assertEqual(result.wrapped, false, 'fatal wall hit should not wrap position');
    },
  },
  {
    name: 'resolveSelfCollision consumes a shield when available',
    run() {
      const result = Logic.resolveSelfCollision({
        head: [4, 4],
        snake: [[5, 4], [4, 4], [3, 4]],
        selfHitsLeft: 2,
      });

      assertEqual(result.alive, true, 'self collision should survive with spare shields');
      assertEqual(result.selfHitsLeft, 1, 'one self-hit shield should be consumed');
    },
  },
  {
    name: 'calculateFoodScore handles combo, burst and triple multiplier',
    run() {
      const result = Logic.calculateFoodScore({
        now: 1500,
        lastEatTime: 1000,
        combo: 1,
        speedActive: false,
        forcedBurst: true,
        burstScoreMult: 6,
        bonusScore: 25,
        doubleScoreChance: 0.2,
        tripleScoreChance: 0.5,
        comboWindow: 2500,
        comboMaxBonus: 0,
        random: sequenceRandom([0.1, 0.9]),
      });

      assertEqual(result.combo, 2, 'combo should advance when food is eaten within the combo window');
      assertEqual(result.points, 111, 'forced burst and triple score should stack deterministically');
    },
  },
  {
    name: 'calculateFoodScore resets combo outside the combo window',
    run() {
      const result = Logic.calculateFoodScore({
        now: 4000,
        lastEatTime: 1000,
        combo: 3,
        speedActive: false,
        forcedBurst: false,
        burstScoreMult: 1,
        bonusScore: 1,
        doubleScoreChance: 0,
        tripleScoreChance: 0,
        comboWindow: 500,
        comboMaxBonus: 0,
        random: sequenceRandom([0.8, 0.8]),
      });

      assertEqual(result.combo, 1, 'combo should reset when the combo window elapsed');
      assertEqual(result.points, 2, 'base score should fall back to combo 1 plus bonus');
    },
  },
  {
    name: 'applyGrowthOnEat adds cursed extra growth on level up',
    run() {
      const snake = [[6, 5], [5, 5], [4, 5], [3, 5]];
      const grown = Logic.applyGrowthOnEat(snake, 1, PERK_MAP.sc_cu1.effects.extraGrowth);
      assertEqual(grown.length, 9, 'Soul Crusher should turn one level-up into six total growth segments');
      assertDeepEqual(grown[grown.length - 1], [3, 5], 'growth should duplicate the tail segment');
    },
  },
  {
    name: 'applyGrowthOnEat trims tail when no level up occurs',
    run() {
      const snake = [[6, 5], [5, 5], [4, 5], [3, 5]];
      const next = Logic.applyGrowthOnEat(snake, 0, 5);
      assertDeepEqual(next, [[6, 5], [5, 5], [4, 5]], 'no level-up should behave like a normal move and remove the tail');
    },
  },
];

function render(results) {
  const total = results.length;
  const passed = results.filter(result => result.pass).length;
  const failed = total - passed;

  document.getElementById('total-count').textContent = String(total);
  document.getElementById('pass-count').textContent = String(passed);
  document.getElementById('fail-count').textContent = String(failed);

  const root = document.getElementById('results');
  root.innerHTML = '';

  results.forEach(result => {
    const row = document.createElement('article');
    row.className = `test-row ${result.pass ? 'pass' : 'fail'}`;
    row.innerHTML =
      `<div class="test-head">` +
        `<span class="test-name">${result.name}</span>` +
        `<span class="test-status">${result.pass ? 'PASS' : 'FAIL'}</span>` +
      `</div>` +
      `<div class="test-message">${result.message}</div>`;
    root.appendChild(row);
  });
}

const results = tests.map(test => {
  try {
    test.run();
    return { name: test.name, pass: true, message: 'OK' };
  } catch (error) {
    return { name: test.name, pass: false, message: error.message };
  }
});

render(results);
})();