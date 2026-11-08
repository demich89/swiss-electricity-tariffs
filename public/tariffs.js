export const ZONE = 'Europe/Zurich';
const dayFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function dayKey(time) {
  return dayFormatter.format(new Date(time));
}

export function nextDay(key) {
  return new Date(Date.parse(`${key}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

export function utcDays(now) {
  // Extra days on either side cover Zurich offsets and both DST transitions.
  const base = Date.parse(`${dayKey(now)}T12:00:00Z`);
  return [-1, 0, 1, 2].map(offset => new Date(base + offset * 86400000).toISOString());
}

const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;

/** True for an ISO 8601 UTC timestamp naming a real calendar instant (no 2026-02-30 roll-over). */
export function isUtcTimestamp(value) {
  if (typeof value !== 'string' || !utcPattern.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
}

export function validateData(data) {
  if (data?.version !== 1 || !isUtcTimestamp(data.fetchedAt) || !Array.isArray(data.intervals)) {
    throw Error('Invalid data file');
  }
  let previousEnd = -Infinity;
  for (const interval of data.intervals) {
    if (!interval || !Number.isSafeInteger(interval.start) || !Number.isSafeInteger(interval.end) ||
        interval.start < previousEnd || interval.end <= interval.start ||
        interval.end - interval.start > 900000 || !['low', 'high'].includes(interval.tariff)) {
      throw Error('Invalid interval');
    }
    previousEnd = interval.end;
  }
  return data;
}

export function tariffAt(intervals, time) {
  return intervals.find(interval => interval.start <= time && time < interval.end)?.tariff ?? 'unknown';
}

export function nextSwitch(intervals, time) {
  const current = tariffAt(intervals, time);
  if (current === 'unknown') return null;
  let cursor = time;
  for (const interval of intervals) {
    if (interval.end <= cursor) continue;
    if (interval.start > cursor) return null;
    if (interval.tariff !== current) return interval;
    cursor = interval.end;
  }
  return null;
}

export function dayBounds(key) {
  const center = Date.parse(`${key}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(center) || dayKey(center) !== key) {
    throw Error('Invalid calendar day');
  }
  let start = center - 18 * 3600000;
  while (dayKey(start) !== key) start += 60000;
  let end = start + 20 * 3600000;
  while (dayKey(end) === key) end += 60000;
  return [start, end];
}

/** Clip to the local day and merge adjacent equal tariffs for display only. */
export function segments(intervals, key) {
  const [start, end] = dayBounds(key);
  const result = [];
  let cursor = start;
  function add(from, to, tariff) {
    if (to <= from) return;
    const previous = result.at(-1);
    if (previous?.tariff === tariff && previous.end === from) previous.end = to;
    else result.push({start: from, end: to, tariff});
  }
  for (const interval of intervals) {
    if (interval.end <= start || interval.start >= end) continue;
    add(cursor, Math.max(cursor, interval.start), 'unknown');
    add(Math.max(start, interval.start), Math.min(end, interval.end), interval.tariff);
    cursor = Math.min(end, interval.end);
  }
  add(cursor, end, 'unknown');
  return result;
}
