import test from 'node:test';
import assert from 'node:assert/strict';
import {dayOffsets, offsetAt, remaining, timeline} from '../public/view.js';
import {dayBounds, segments} from '../public/tariffs.js';

test('offsets are shown once per day, and both offsets on DST days', () => {
  assert.equal(offsetAt(Date.parse('2026-11-07T12:00:00Z')), 'GMT+1');
  assert.equal(offsetAt(Date.parse('2026-07-01T12:00:00Z')), 'GMT+2');
  assert.deepEqual(dayOffsets('2026-11-07'), ['GMT+1']);
  assert.deepEqual(dayOffsets('2026-03-29'), ['GMT+1', 'GMT+2']);
  assert.deepEqual(dayOffsets('2026-10-25'), ['GMT+2', 'GMT+1']);
});

test('remaining time rounds up to whole minutes and never goes negative', () => {
  assert.deepEqual(remaining(0, 1), {hours: 0, minutes: 1});
  assert.deepEqual(remaining(0, 9 * 3600000 + 16 * 60000), {hours: 9, minutes: 16});
  assert.deepEqual(remaining(10, 0), {hours: 0, minutes: 0});
});

test('timeline widths follow the real day length, including 23- and 25-hour days', () => {
  for (const key of ['2026-11-07', '2026-03-29', '2026-10-25']) {
    const [start, end] = dayBounds(key);
    const middle = start + Math.floor((end - start) / 2 / 900000) * 900000;
    const intervals = [{start: middle, end: middle + 900000, tariff: 'high'}];
    const {parts, ticks, now} = timeline(segments(intervals, key), key, middle);
    assert.ok(Math.abs(parts.reduce((sum, part) => sum + part.width, 0) - 100) < 1e-9);
    assert.deepEqual(parts.map(part => part.tariff), ['unknown', 'high', 'unknown']);
    assert.ok(Math.abs(parts[1].width - 900000 / (end - start) * 100) < 1e-9);
    assert.ok(now > 0 && now < 100);
    assert.equal(ticks.length, 3);
    assert.equal(timeline([], key, end).now, null);
  }
});
