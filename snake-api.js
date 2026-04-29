(() => {
  // Pure helper — no DOM or module deps required.
  function qualifiesForHiScore(hiScores, max, value) {
    if (value <= 0) return false;
    if (hiScores.length < max) return true;
    return value > hiScores[hiScores.length - 1].score;
  }

  // Fetches the top `max` scores from Supabase.
  // `fetchFn` defaults to globalThis.fetch; pass a replacement in tests.
  async function fetchGlobalScores(url, key, max, normalizeFn, perkMap, fetchFn) {
    const f = fetchFn || globalThis.fetch;
    try {
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const withPerks = `${url}/rest/v1/scores?select=name,score,level,perks&order=score.desc&limit=${max}`;
      const legacy = `${url}/rest/v1/scores?select=name,score,level&order=score.desc&limit=${max}`;

      let res = await f(withPerks, { headers });
      // Backward-compat: old tables may not have a `perks` column yet.
      if (!res.ok) res = await f(legacy, { headers });
      if (!res.ok) return [];
      return normalizeFn(await res.json(), max, perkMap);
    } catch {
      return [];
    }
  }

  // Posts one score row to Supabase.
  // `fetchFn` defaults to globalThis.fetch; pass a replacement in tests.
  async function postGlobalScore(url, key, name, score, level, perks, fetchFn) {
    const f = fetchFn || globalThis.fetch;
    try {
      const endpoint = `${url}/rest/v1/scores`;
      const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      };
      const safeName = name.toUpperCase().slice(0, 3);
      const baseBody = { name: safeName, score, level };

      const res = await f(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...baseBody, perks: Array.isArray(perks) ? perks : [] }),
      });

      if (res && res.ok === false) {
        const errText = typeof res.text === 'function' ? (await res.text()) : '';
        const missingPerksColumn = /perks|column/i.test(errText);
        if (!missingPerksColumn) return;

        // Retry without perks for older schemas.
        await f(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(baseBody),
        });
      }
    } catch {
      // network failure — caller proceeds silently
    }
  }

  window.SnakeApi = { qualifiesForHiScore, fetchGlobalScores, postGlobalScore };
})();
