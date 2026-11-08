import {isUtcTimestamp, utcDays} from '../../public/tariffs.js';
import {pointsToIntervals} from '../lib/intervals.mjs';

// Official source: https://www.amb.ch/privati/elettricita/tariffe-fornitori-energia-elettrica-bellinzona/
// The chart API returns UTC timestamp/color pairs for a requested UTC day.
// These are dynamic tariff bands, not monetary prices or the standard Casa schedule.
const colors = new Map([['#05DA3A', 'low'], ['#E3051B', 'high']]);

export function normalize(responses) {
  const points = [];
  for (const response of responses) {
    if (!Array.isArray(response?.labels) || !Array.isArray(response.bgColors) ||
        response.labels.length !== response.bgColors.length) {
      throw Error('Missing or mismatched arrays');
    }
    response.labels.forEach((label, index) => {
      if (!isUtcTimestamp(label)) throw Error('Invalid UTC timestamp');
      const time = Date.parse(label);
      const tariff = colors.get(response.bgColors[index]);
      if (!tariff) throw Error('Unknown tariff color');
      points.push({time, tariff});
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
