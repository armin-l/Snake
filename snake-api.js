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
      const res = await f(
        `${url}/rest/v1/scores?select=name,score,level&order=score.desc&limit=${max}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) return [];
      return normalizeFn(await res.json(), max, perkMap);
    } catch {
      return [];
    }
  }

  // Posts one score row to Supabase.
  // `fetchFn` defaults to globalThis.fetch; pass a replacement in tests.
  async function postGlobalScore(url, key, name, score, level, fetchFn) {
    const f = fetchFn || globalThis.fetch;
    try {
      await f(`${url}/rest/v1/scores`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ name: name.toUpperCase().slice(0, 3), score, level }),
      });
    } catch {
      // network failure — caller proceeds silently
    }
  }

  window.SnakeApi = { qualifiesForHiScore, fetchGlobalScores, postGlobalScore };
})();
