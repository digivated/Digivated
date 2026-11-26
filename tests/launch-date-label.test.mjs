import test from 'node:test';
import assert from 'node:assert/strict';
import { freeLaunchOptions } from '../src/lib/launch-calendar.mjs';
import { launchDateParts } from '../src/lib/launch-date-label.mjs';

test('launch chip and go-live sentence name the same Eastern Monday', () => {
  const options = freeLaunchOptions(Date.parse('2026-11-26T16:00:00Z'));
  const soonest = launchDateParts(options[0]);
  const later = launchDateParts(options[4]);
  assert.equal(options[0], '2026-11-30T14:00:00.000Z');
  assert.equal(soonest.day, '30');
  assert.equal(soonest.month, 'November');
  assert.equal(soonest.monthShort, 'Nov');
  assert.equal(soonest.weekday, 'Monday');
  assert.equal(soonest.sentence, 'Goes live Monday, November 30, 2026 at 9:00 AM Eastern.');
  assert.doesNotMatch(soonest.sentence, /December/);
  assert.match(later.sentence, /Monday, December 28, 2026/);
  assert.equal(later.day, '28');
  assert.equal(later.monthShort, 'Dec');
  for (const iso of options) {
    const parts = launchDateParts(iso);
    assert.equal(parts.monthShort, parts.month.slice(0, 3));
    assert.match(parts.sentence, new RegExp(`${parts.weekday}, ${parts.month} ${parts.day}, ${parts.year}`));
    assert.doesNotMatch(parts.sentence, /—/);
  }
});

test('daylight-saving Mondays stay on the Eastern calendar day', () => {
  const spring = launchDateParts('2027-03-15T13:00:00.000Z');
  assert.equal(spring.month, 'March');
  assert.equal(spring.day, '15');
  assert.match(spring.sentence, /Monday, March 15, 2027/);
  const fall = launchDateParts('2026-11-02T14:00:00.000Z');
  assert.equal(fall.month, 'November');
  assert.equal(fall.day, '2');
});
