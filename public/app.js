import {initLanguage, t, locale} from './i18n.js';
import {ZONE, dayKey, nextDay, tariffAt, nextSwitch, segments, validateData} from './tariffs.js';
import {validateCatalog, validateSnapshotMetadata} from './providers.js';
import {dayOffsets, offsetAt, remaining, timeline} from './view.js';

const el = id => document.getElementById(id);
const clockTime = value => new Intl.DateTimeFormat(locale(), {
  timeZone: ZONE, hour: '2-digit', minute: '2-digit',
}).format(value);
// The offset is shown once per day; DST days keep it on every time because 02:30 can occur twice.
const time = (value, withOffset = dayOffsets(dayKey(value)).length > 1) =>
  withOffset ? `${clockTime(value)} ${offsetAt(value)}` : clockTime(value);
const fill = (key, values) => t(key).replace(/\{(\w+)\}/g, (_, name) => values[name]);
const duration = (from, to) => {
  const {hours, minutes} = remaining(from, to);
  return hours ? fill('durationHours', {hours, minutes}) : fill('durationMinutes', {minutes});
};
const date = value => new Intl.DateTimeFormat(locale(), {
  timeZone: ZONE, day: 'numeric', month: 'long', year: 'numeric',
}).format(value);
let data = null;
let catalog = null;
// A shared link keeps its provider; unknown IDs fall back to the catalog default.
let selectedId = globalThis.location ? new URLSearchParams(location.search).get('provider') : null;
let failed = false;
let requestId = 0;

function render() {
  const now = Date.now();
  const intervals = data?.intervals ?? [];
  const current = tariffAt(intervals, now);
  const provider = catalog?.providers.find(item => item.id === selectedId);
  el('provider-name').textContent = provider ? [provider.fullName, provider.product].filter(Boolean).join(' · ') : 'Swiss electricity';
  // Providers can sell several products; say which one this schedule belongs to.
  el('product-note').hidden = !provider?.product;
  el('product-note').textContent = provider?.product ? fill('productNote', {product: provider.product}) : '';
  el('source').hidden = !provider;
  if (provider) {
    el('source').textContent = `${provider.name} ↗`;
    el('source').href = provider.source;
  }
  el('current').className = `current ${current}`;
  el('tariff').textContent = t(current);
  el('clock').textContent = `${date(now)} · ${time(now, true)}`;
  const next = nextSwitch(intervals, now);
  el('until').textContent = next ? fill('until', {time: time(next.start), duration: duration(now, next.start)}) : '';
  el('next').textContent = next ? time(next.start) : t('nextUnknown');
  const otherDay = next && dayKey(next.start) !== dayKey(now) ? `${date(next.start)} · ` : '';
  el('next-detail').textContent = next
    ? `${otherDay}${fill('inDuration', {duration: duration(now, next.start)})} · ${t(next.tariff)}` : t('noSwitch');
  const fetchedAt = data ? Date.parse(data.fetchedAt) : null;
  const stale = data && (now > Date.parse(data.staleAfter) || fetchedAt > now + 300000);
  // A stale catalog entry means the server-side refresh failed, not this page's request.
  const reused = provider?.status === 'stale' && data;
  el('warning').hidden = !(failed || reused || stale || current === 'unknown');
  el('warning').textContent = failed ? t('fetchError')
    : reused ? fill('providerStale', {time: `${date(fetchedAt)} · ${time(fetchedAt, true)}`})
    : stale ? t('stale') : current === 'unknown' ? t('missing') : '';
  el('fetched').textContent = data
    ? `${t('fetched')}: ${date(fetchedAt)} · ${time(fetchedAt, true)}` : t('notFetched');
  el('days').replaceChildren();
  const today = dayKey(now);
  for (const [index, key] of [today, nextDay(today)].entries()) {
    const article = document.createElement('article');
    article.className = 'day';
    const title = document.createElement('h3');
    const offsets = dayOffsets(key);
    title.textContent = `${t(index ? 'tomorrow' : 'today')} · ${date(Date.parse(`${key}T12:00:00Z`))} · ${offsets.join(' → ')}`;
    article.append(title);
    const daySegments = segments(intervals, key);
    article.append(timelineBar(daySegments, key, now));
    const blocks = document.createElement('div');
    blocks.className = 'blocks';
    for (const block of daySegments) {
      const active = block.start <= now && now < block.end;
      const item = document.createElement('div');
      item.className = `block ${block.tariff}${active ? ' active' : ''}`;
      const label = document.createElement('strong');
      label.textContent = t(block.tariff);
      const range = document.createElement('span');
      range.textContent = `${time(block.start)} – ${time(block.end)}`;
      item.append(label, range);
      if (active) {
        const badge = document.createElement('small');
        badge.textContent = `● ${t('now')}`;
        item.append(badge);
      }
      blocks.append(item);
    }
    article.append(blocks);
    el('days').append(article);
  }
}

/** Proportional overview of one day; decorative because the block list carries the same data. */
function timelineBar(daySegments, key, now) {
  const {parts, ticks, now: nowPosition} = timeline(daySegments, key, now);
  const wrapper = document.createElement('div');
  wrapper.className = 'timeline';
  wrapper.setAttribute('aria-hidden', 'true');
  const bar = document.createElement('div');
  bar.className = 'timeline-bar';
  for (const part of parts) {
    const span = document.createElement('span');
    span.className = part.tariff;
    span.style.width = `${part.width}%`;
    bar.append(span);
  }
  if (nowPosition !== null) {
    const marker = document.createElement('i');
    marker.className = 'timeline-now';
    marker.style.left = `${nowPosition}%`;
    bar.append(marker);
  }
  const scale = document.createElement('div');
  scale.className = 'timeline-scale';
  for (const tick of ticks) {
    const label = document.createElement('span');
    label.textContent = clockTime(tick.time);
    label.style.left = `${tick.position}%`;
    scale.append(label);
  }
  wrapper.append(bar, scale);
  return wrapper;
}

/** Keep the selected provider in the address bar so links and reloads reopen it. */
function rememberProvider() {
  if (!globalThis.location || !globalThis.history) return;
  const url = new URL(location.href);
  if (selectedId === catalog?.defaultProviderId) url.searchParams.delete('provider');
  else url.searchParams.set('provider', selectedId);
  if (url.href !== location.href) history.replaceState(null, '', url);
}

async function getJson(path) {
  const response = await fetch(path, {cache: 'no-store', signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}

async function refresh() {
  const currentRequest = ++requestId;
  try {
    const updatedCatalog = validateCatalog(await getJson('./api/v1/providers.json'));
    if (currentRequest !== requestId) return;
    catalog = updatedCatalog;
    if (!catalog.providers.some(item => item.id === selectedId)) {
      selectedId = catalog.defaultProviderId;
      data = null;
    }
    rememberProvider();
    const select = el('provider');
    // Rebuilding an open dropdown closes it, so only rebuild when the providers change.
    const options = catalog.providers.map(({id, name, product}) => `${id}\n${name}\n${product ?? ''}`).join('\n');
    if (select.dataset.options !== options) {
      select.dataset.options = options;
      select.replaceChildren();
      for (const provider of catalog.providers) {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = [provider.name, provider.product].filter(Boolean).join(' · ');
        select.append(option);
      }
    }
    select.value = selectedId;
    select.disabled = false;
    const snapshot = validateData(await getJson(`./api/v1/providers/${selectedId}/tariffs.json`));
    if (currentRequest !== requestId) return;
    validateSnapshotMetadata(snapshot, selectedId);
    data = snapshot;
    failed = false;
  } catch {
    if (currentRequest !== requestId) return;
    failed = true;
  }
  render();
}

el('provider').addEventListener('change', () => {
  selectedId = el('provider').value;
  rememberProvider();
  data = null;
  failed = false;
  render();
  refresh();
});
initLanguage(render);
refresh();
// Background tabs skip work; returning to the tab (or waking the device) updates at once.
const visible = () => document.visibilityState !== 'hidden';
setInterval(() => visible() && render(), 30000);
setInterval(() => visible() && refresh(), 300000);
document.addEventListener('visibilitychange', () => {
  if (visible()) {
    render();
    refresh();
  }
});
