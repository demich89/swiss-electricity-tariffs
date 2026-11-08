import {validateData} from '../../public/tariffs.js';

/** Public v1 snapshot; interval timestamps are Unix milliseconds in UTC. */
export function createApiSnapshot(data, provider) {
  validateData(data);
  return {
    version: 1,
    provider: provider.name,
    providerId: provider.id,
    ...(provider.product && {product: provider.product}),
    source: provider.source,
    independent: true,
    timezone: provider.timezone,
    fetchedAt: data.fetchedAt,
    staleAfter: new Date(Date.parse(data.fetchedAt) + provider.maxAgeSeconds * 1000).toISOString(),
    maxIntervalSeconds: 900,
    timestampUnit: 'milliseconds',
    tariffs: {
      low: {label: 'Low tariff', color: '#05DA3A'},
      high: {label: 'High tariff', color: '#E3051B'},
    },
    intervals: data.intervals.map(({start, end, tariff}) => ({start, end, tariff})),
  };
}
