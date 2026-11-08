/** Examples use discovery so provider identity and collection health stay visible. */
export function buildExamples(catalogUrl, providerId) {
  const json = JSON.stringify;
  return {
    javascript: `const catalogUrl = ${json(catalogUrl)};
const providerId = ${json(providerId)};
async function getJson(url) {
  const response = await fetch(url, {
    cache: 'no-store', signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}
const catalog = await getJson(catalogUrl);
if (catalog.version !== 1 || !Array.isArray(catalog.providers)) {
  throw new Error('Invalid provider catalog');
}
const provider = catalog.providers.find(item => item.id === providerId);
if (!provider) throw new Error('Provider unavailable');
const data = await getJson(new URL(provider.tariffsUrl, catalogUrl));
const utcTimestamp = value => typeof value === 'string' &&
  /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|\\+00:00)$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
if (data.version !== 1 || data.providerId !== providerId ||
    !Array.isArray(data.intervals) ||
    !utcTimestamp(data.fetchedAt) || !utcTimestamp(data.staleAfter) ||
    Date.parse(data.staleAfter) < Date.parse(data.fetchedAt)) {
  throw new Error('Invalid provider snapshot');
}
let previousEnd = -Infinity;
for (const interval of data.intervals) {
  if (!interval || !Number.isSafeInteger(interval.start) ||
      !Number.isSafeInteger(interval.end) ||
      interval.start < previousEnd || interval.end <= interval.start ||
      interval.end - interval.start > 900000 ||
      !['low', 'high'].includes(interval.tariff)) {
    throw new Error('Invalid tariff interval');
  }
  previousEnd = interval.end;
}
const now = Date.now();
const stale = provider.status === 'stale' ||
  now > Date.parse(data.staleAfter) ||
  Date.parse(data.fetchedAt) > now + 300000;
const current = data.intervals.find(i => i.start <= now && now < i.end);
console.log({tariff: current?.tariff ?? 'unknown', stale});`,
  };
}
