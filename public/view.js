import {ZONE, dayBounds} from './tariffs.js';

// Display-only helpers for the website. Interval rules stay in tariffs.js.
const offsetFormatter = new Intl.DateTimeFormat('en-GB', {timeZone: ZONE, timeZoneName: 'shortOffset'});

/** Zurich UTC offset label at an instant, e.g. GMT+1 or GMT+2. */
export function offsetAt(time) {
  return offsetFormatter.formatToParts(time).find(part => part.type === 'timeZoneName').value;
}

/** Offsets in force during a local day; DST days return two, and then times need explicit offsets. */
export function dayOffsets(key) {
  const [start, end] = dayBounds(key);
  return [...new Set([offsetAt(start), offsetAt(end - 1)])];
}

/** Whole minutes from now until a later instant, split into hours and minutes. */
export function remaining(from, to) {
  const minutes = Math.max(0, Math.ceil((to - from) / 60000));
  return {hours: Math.floor(minutes / 60), minutes: minutes % 60};
}

/** Proportional timeline parts for one day's display segments, in percent of the real day length. */
export function timeline(segments, key, now) {
  const [start, end] = dayBounds(key);
  const span = end - start;
  const percent = time => ((time - start) / span) * 100;
  return {
    parts: segments.map(segment => ({...segment, width: percent(segment.end) - percent(segment.start)})),
    // Ticks every six elapsed hours; on DST days their local labels shift, which is accurate.
    ticks: [6, 12, 18].map(hours => ({time: start + hours * 3600000, position: (hours * 3600000 / span) * 100})),
    now: now >= start && now < end ? percent(now) : null,
  };
}
