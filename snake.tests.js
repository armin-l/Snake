(async () => {
const { PERK_MAP } = window.SnakePerks;
const Logic = window.SnakeLogic;
const Api = window.SnakeApi;

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
    name: 'xpForLevel never drops below one XP',
    run() {
      const playerPerks = { sc_cu1: 1, xs_e1: 1, xr_r1: 2 };
      const needed = Logic.xpForLevel(1, playerPerks, PERK_MAP);
      assertEqual(needed, 1, 'extreme XP discounts should still clamp to at least one XP');
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
    name: 'resolveWallCollision can wrap and still die from wall damage',
    run() {
      const result = Logic.resolveWallCollision({
        head: [7, -1],
        cols: 20,
        rows: 20,
        ghostWalls: 1,
        selfHitsLeft: 2,
        lastEatTime: 1250,
        wallDamage: 3,
        comboNoReset: false,
      });

      assertEqual(result.wrapped, true, 'wall pass should still wrap before damage is applied');
      assertEqual(result.alive, false, 'excess wall damage should still be fatal after wrapping');
      assertEqual(result.selfHitsLeft, 0, 'shield count should bottom out at zero');
      assertDeepEqual(result.head, [7, 19], 'head should wrap to the opposite edge before death is resolved');
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
    name: 'resolveSelfCollision is fatal without shields',
    run() {
      const result = Logic.resolveSelfCollision({
        head: [4, 4],
        snake: [[5, 4], [4, 4], [3, 4]],
        selfHitsLeft: 0,
      });

      assertEqual(result.hitSelf, true, 'collision should still be detected without shields');
      assertEqual(result.alive, false, 'self collision should be fatal when no shield remains');
      assertEqual(result.shieldUsed, false, 'fatal collision should not report a shield usage');
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
    name: 'snapshotHiScoreDetails stores level and positive perk stacks',
    run() {
      const snapshot = Logic.snapshotHiScoreDetails(7, { ap_c1: 2, ww_r1: 1, bad: 0 });

      assertEqual(snapshot.level, 7, 'snapshot should keep the reached level');
      assertDeepEqual(snapshot.perks, [
        { id: 'ap_c1', count: 2 },
        { id: 'ww_r1', count: 1 },
      ], 'snapshot should only keep positive perk stacks');
    },
  },
  {
    name: 'normalizeHiScoreEntry hydrates perk metadata and legacy fallback',
    run() {
      const legacy = Logic.normalizeHiScoreEntry({ name: 'aaa', score: 12 }, PERK_MAP);
      const detailed = Logic.normalizeHiScoreEntry({
        name: 'bbb',
        score: 25,
        level: 4,
        perks: [{ id: 'ap_c1', count: 2 }],
      }, PERK_MAP);

      assertEqual(legacy.name, 'AAA', 'names should normalize to uppercase');
      assertEqual(legacy.hasDetails, false, 'legacy entries should be marked without details');
      assertEqual(detailed.hasDetails, true, 'detailed entries should advertise tooltip data');
      assertDeepEqual(detailed.perks[0], {
        id: 'ap_c1',
        count: 2,
        name: 'Appetite I',
        icon: '🍎',
        tier: 'common',
      }, 'perk metadata should be hydrated from the perk map');
    },
  },
  {
    name: 'normalizeHiScores sorts, caps and drops invalid scores',
    run() {
      const hiScores = Logic.normalizeHiScores([
        { name: 'aaa', score: 10 },
        { name: 'bbb', score: 50, level: 6, perks: [{ id: 'ww_r1', count: 1 }] },
        { name: 'ccc', score: 0, level: 2 },
        { name: 'ddd', score: 30 },
      ], 2, PERK_MAP);

      assertEqual(hiScores.length, 2, 'highscores should cap to the configured amount');
      assertEqual(hiScores[0].name, 'BBB', 'highest score should come first');
      assertEqual(hiScores[1].name, 'DDD', 'second highest score should remain after trimming');
    },
  },
  {
    name: 'calculateFoodScore applies double score when triple does not trigger',
    run() {
      const result = Logic.calculateFoodScore({
        now: 1800,
        lastEatTime: 1500,
        combo: 1,
        speedActive: true,
        forcedBurst: false,
        burstScoreMult: 3,
        bonusScore: 2,
        doubleScoreChance: 0.4,
        tripleScoreChance: 0.1,
        comboWindow: 1000,
        comboMaxBonus: 0,
        random: sequenceRandom([0.8, 0.2]),
      });

      assertEqual(result.combo, 2, 'combo should still progress inside the combo window');
      assertEqual(result.points, 16, 'double score should apply when triple misses and double hits');
    },
  },
  {
    name: 'calculateFoodScore respects the extended combo cap',
    run() {
      const result = Logic.calculateFoodScore({
        now: 2200,
        lastEatTime: 2000,
        combo: 7,
        speedActive: false,
        forcedBurst: false,
        burstScoreMult: 1,
        bonusScore: 0,
        doubleScoreChance: 0,
        tripleScoreChance: 0,
        comboWindow: 1000,
        comboMaxBonus: 2,
        random: sequenceRandom([0.9, 0.9]),
      });

      assertEqual(result.combo, 6, 'combo should clamp to base cap 4 plus the bonus cap');
      assertEqual(result.points, 6, 'points should reflect the capped combo value');
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
  {
    name: 'applyGrowthOnEat scales growth with multiple level-ups',
    run() {
      const snake = [[6, 5], [5, 5], [4, 5], [3, 5]];
      const grown = Logic.applyGrowthOnEat(snake, 2, 2);
      assertEqual(grown.length, 9, 'two level-ups with +2 extra growth should add five segments total');
      assertDeepEqual(grown.slice(-3), [[3, 5], [3, 5], [3, 5]], 'added growth should continue duplicating the tail');
    },
  },
  {
    name: 'xpForLevel uses base progression without XP perks',
    run() {
      const level1 = Logic.xpForLevel(1, {}, PERK_MAP);
      const level5 = Logic.xpForLevel(5, {}, PERK_MAP);

      assertEqual(level1, 5, 'level 1 should use the base XP requirement when no discounts are active');
      assertEqual(level5, 11, 'level 5 should follow base scaling and rounding');
    },
  },
  {
    name: 'resolveWallCollision leaves state unchanged inside bounds',
    run() {
      const result = Logic.resolveWallCollision({
        head: [10, 10],
        cols: 20,
        rows: 20,
        ghostWalls: 3,
        selfHitsLeft: 2,
        lastEatTime: 555,
        wallDamage: 5,
        comboNoReset: true,
      });

      assertEqual(result.hitWall, false, 'in-bounds movement should not be treated as a wall hit');
      assertEqual(result.wrapped, false, 'in-bounds movement should not wrap');
      assertEqual(result.damaged, false, 'in-bounds movement should not apply wall damage');
      assertEqual(result.ghostWalls, 3, 'wall-pass charges should remain unchanged in bounds');
      assertEqual(result.selfHitsLeft, 2, 'shield count should remain unchanged in bounds');
      assertDeepEqual(result.head, [10, 10], 'head position should stay unchanged in bounds');
    },
  },
  {
    name: 'resolveSelfCollision does nothing when head is clear',
    run() {
      const result = Logic.resolveSelfCollision({
        head: [6, 6],
        snake: [[5, 6], [4, 6], [3, 6]],
        selfHitsLeft: 4,
      });

      assertEqual(result.alive, true, 'clear movement should remain alive');
      assertEqual(result.hitSelf, false, 'clear movement should not register as self-collision');
      assertEqual(result.shieldUsed, false, 'clear movement should not consume shields');
      assertEqual(result.selfHitsLeft, 4, 'shield count should stay unchanged when no collision occurs');
    },
  },
  {
    name: 'normalizeHiScoreEntry sanitizes malformed perk details',
    run() {
      const entry = Logic.normalizeHiScoreEntry({
        name: 'mix',
        score: 20,
        level: 3.8,
        perks: [
          { id: 'ap_c1', count: 0 },
          { id: 'missing_perk', count: -7, icon: 'X', tier: 'epic', name: 'Legacy' },
          null,
        ],
      }, PERK_MAP);

      assertEqual(entry.level, 3, 'level should be floored to an integer');
      assertEqual(entry.perks.length, 2, 'invalid perk items should be filtered out');
      assertDeepEqual(entry.perks[0], {
        id: 'ap_c1',
        count: 1,
        name: 'Appetite I',
        icon: '🍎',
        tier: 'common',
      }, 'known perks should clamp count and hydrate from current metadata');
      assertDeepEqual(entry.perks[1], {
        id: 'missing_perk',
        count: 1,
        name: 'Legacy',
        icon: 'X',
        tier: 'epic',
      }, 'unknown perks should keep legacy display metadata while clamping count');
    },
  },

  // ── Global scoreboard (SnakeApi) ──────────────────────────────────────────

  {
    name: 'qualifiesForHiScore rejects zero and negative scores',
    run() {
      assertEqual(Api.qualifiesForHiScore([], 10, 0), false, 'zero score should not qualify');
      assertEqual(Api.qualifiesForHiScore([], 10, -5), false, 'negative score should not qualify');
    },
  },
  {
    name: 'qualifiesForHiScore allows entry when board is not full',
    run() {
      const board = [{ score: 100 }, { score: 50 }];
      assertEqual(Api.qualifiesForHiScore(board, 10, 1), true, 'any positive score qualifies when board has room');
    },
  },
  {
    name: 'qualifiesForHiScore rejects score that does not beat last place',
    run() {
      const board = Array.from({ length: 10 }, (_, i) => ({ score: (10 - i) * 10 }));
      assertEqual(Api.qualifiesForHiScore(board, 10, 10), false, 'score equal to last place should not qualify');
      assertEqual(Api.qualifiesForHiScore(board, 10, 5), false, 'score below last place should not qualify');
    },
  },
  {
    name: 'qualifiesForHiScore accepts score that beats last place on a full board',
    run() {
      const board = Array.from({ length: 10 }, (_, i) => ({ score: (10 - i) * 10 }));
      assertEqual(Api.qualifiesForHiScore(board, 10, 11), true, 'score above last place on a full board should qualify');
    },
  },
  {
    name: 'fetchGlobalScores returns normalized rows on a successful response',
    async run() {
      const rows = [
        { name: 'aaa', score: 80, level: 3 },
        { name: 'bbb', score: 50, level: 1 },
      ];
      const mockFetch = async () => ({
        ok: true,
        json: async () => rows,
      });
      const result = await Api.fetchGlobalScores(
        'https://test.supabase.co', 'key123', 10,
        Logic.normalizeHiScores, PERK_MAP, mockFetch
      );
      assertEqual(result.length, 2, 'both rows should be returned');
      assertEqual(result[0].name, 'AAA', 'names should be uppercased by normalization');
      assertEqual(result[0].score, 80, 'scores should be preserved');
    },
  },
  {
    name: 'fetchGlobalScores sends correct URL and auth headers',
    async run() {
      let capturedUrl, capturedHeaders;
      const mockFetch = async (url, opts) => {
        capturedUrl = url;
        capturedHeaders = opts.headers;
        return { ok: true, json: async () => [] };
      };
      await Api.fetchGlobalScores(
        'https://proj.supabase.co', 'anon-key', 5,
        Logic.normalizeHiScores, PERK_MAP, mockFetch
      );
      assert(capturedUrl.includes('/rest/v1/scores'), 'URL should target the scores endpoint');
      assert(capturedUrl.includes('limit=5'), 'URL should include the configured limit');
      assert(capturedUrl.includes('order=score.desc'), 'URL should request descending score order');
      assertEqual(capturedHeaders.apikey, 'anon-key', 'apikey header should be set');
      assertEqual(capturedHeaders.Authorization, 'Bearer anon-key', 'Authorization header should be set');
    },
  },
  {
    name: 'fetchGlobalScores returns empty array on non-ok HTTP response',
    async run() {
      const mockFetch = async () => ({ ok: false });
      const result = await Api.fetchGlobalScores(
        'https://test.supabase.co', 'key', 10,
        Logic.normalizeHiScores, PERK_MAP, mockFetch
      );
      assertDeepEqual(result, [], 'non-ok response should yield an empty array');
    },
  },
  {
    name: 'fetchGlobalScores returns empty array on network error',
    async run() {
      const mockFetch = async () => { throw new Error('Network failure'); };
      const result = await Api.fetchGlobalScores(
        'https://test.supabase.co', 'key', 10,
        Logic.normalizeHiScores, PERK_MAP, mockFetch
      );
      assertDeepEqual(result, [], 'network error should be swallowed and yield an empty array');
    },
  },
  {
    name: 'postGlobalScore sends correct JSON payload',
    async run() {
      let capturedBody, capturedMethod, capturedHeaders;
      const mockFetch = async (url, opts) => {
        capturedMethod = opts.method;
        capturedHeaders = opts.headers;
        capturedBody = JSON.parse(opts.body);
      };
      await Api.postGlobalScore('https://test.supabase.co', 'key', 'abc', 42, 5, mockFetch);
      assertEqual(capturedMethod, 'POST', 'method should be POST');
      assertEqual(capturedHeaders['Content-Type'], 'application/json', 'Content-Type header should be set');
      assertEqual(capturedHeaders['Prefer'], 'return=minimal', 'Prefer header should request no response body');
      assertEqual(capturedBody.name, 'ABC', 'name should be uppercased in the payload');
      assertEqual(capturedBody.score, 42, 'score should be in the payload');
      assertEqual(capturedBody.level, 5, 'level should be in the payload');
    },
  },
  {
    name: 'postGlobalScore truncates name to three characters',
    async run() {
      let capturedBody;
      const mockFetch = async (url, opts) => { capturedBody = JSON.parse(opts.body); };
      await Api.postGlobalScore('https://test.supabase.co', 'key', 'toolong', 10, 1, mockFetch);
      assertEqual(capturedBody.name, 'TOO', 'name longer than three chars should be truncated');
    },
  },
  {
    name: 'postGlobalScore swallows network errors silently',
    async run() {
      const mockFetch = async () => { throw new Error('Network failure'); };
      // should not throw
      await Api.postGlobalScore('https://test.supabase.co', 'key', 'xyz', 99, 2, mockFetch);
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

const results = await Promise.all(tests.map(async test => {
  try {
    await test.run();
    return { name: test.name, pass: true, message: 'OK' };
  } catch (error) {
    return { name: test.name, pass: false, message: error.message };
  }
}));

render(results);
})();