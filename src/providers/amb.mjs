import {ZONE, isUtcTimestamp, utcDays} from '../../public/tariffs.js';
import {pointsToIntervals} from '../lib/intervals.mjs';

// Official source: https://www.amb.ch/privati/elettricita/tariffe-fornitori-energia-elettrica-bellinzona/
// The chart API returns timestamp/color pairs for a requested day. Labels carry a +00:00
// suffix but hold Zurich wall-clock time: amb.ch shows them with getUTCHours().
// These are dynamic tariff bands, not monetary prices or the standard Casa schedule.
const colors = new Map([['#05DA3A', 'low'], ['#E3051B', 'high']]);
const wallFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/**
 * Convert a label's wall-clock digits to the Zurich instant. A repeated autumn hour maps to
 * its first (summer-time) occurrence; a skipped spring time returns null.
 */
export function zurichWallTime(label) {
  const wall = Date.parse(`${label.slice(0, 19)}Z`);
  const target = new Date(wall).toISOString().slice(0, 19).replace('T', ' ');
  return [2, 1].map(hours => wall - hours * 3600000)
    .find(time => wallFormatter.format(time) === target) ?? null;
}

export function normalize(responses) {
  const points = [];
  for (const response of responses) {
    if (!Array.isArray(response?.labels) || !Array.isArray(response.bgColors) ||
        response.labels.length !== response.bgColors.length) {
      throw Error('Missing or mismatched arrays');
    }
    response.labels.forEach((label, index) => {
      if (!isUtcTimestamp(label)) throw Error('Invalid UTC timestamp');
      const time = zurichWallTime(label);
      const tariff = colors.get(response.bgColors[index]);
      if (!tariff) throw Error('Unknown tariff color');
      if (time !== null) points.push({time, tariff});
    });
  }
  return pointsToIntervals(points);
}

export const amb = {
  id: 'amb',
  name: 'AMB',
  fullName: 'Azienda Multiservizi Bellinzona',
  // AMB also sells a standard tariff with fixed windows; this schedule only applies to the dynamic product.
  product: 'Tariffa dinamica',
  source: 'https://www.amb.ch/',
  timezone: 'Europe/Zurich',
  scheduleType: 'high-low',
  maxAgeSeconds: 21600,
  async collect({now, request}) {
    const responses = [];
    for (const date of utcDays(now)) {
      responses.push(await request('https://www.amb.ch/Umbraco/Api/HivePower/GetChartData/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({date}),
      }));
    }
    const intervals = normalize(responses);
    if (!intervals.length) throw Error('AMB returned no intervals');
    return intervals;
  },
};
