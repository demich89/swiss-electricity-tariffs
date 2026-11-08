export async function requestJson(url, options = {}, {
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(url, {...options, signal: AbortSignal.timeout(30000)});
      if (!response.ok) throw Error(`Upstream HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}
