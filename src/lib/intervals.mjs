const maxInterval = 900000;

/**
 * Turn source readings into API intervals. Each point is {time, tariff} with time in UTC
 * milliseconds. Identical duplicates merge, conflicting duplicates throw, and an interval
 * ends at the next reading or after 15 minutes, whichever comes first.
 */
export function pointsToIntervals(points) {
  const tariffs = new Map();
  for (const {time, tariff} of points) {
    if (!Number.isSafeInteger(time)) throw Error('Invalid reading time');
    if (tariff !== 'low' && tariff !== 'high') throw Error('Invalid reading tariff');
    if (tariffs.has(time) && tariffs.get(time) !== tariff) {
      throw Error('Conflicting duplicate timestamp');
    }
    tariffs.set(time, tariff);
  }
  const sorted = [...tariffs].sort((left, right) => left[0] - right[0]);
  return sorted.map(([start, tariff], index) => ({
    start,
    end: Math.min(start + maxInterval, sorted[index + 1]?.[0] ?? Infinity),
    tariff,
  }));
}
