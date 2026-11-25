import { expect, test } from 'bun:test';

import { messageWhen } from './labels';

// 30/10/2026 15:00 local time.
const now = new Date(2026, 9, 30, 15, 0).getTime() / 1000;
const at = (...parts) => new Date(...parts).getTime() / 1000;

test('a message reads as minutes within the hour, then as its day and hour', () => {
  expect(messageWhen(now - 20, now)).toBe('just now');
  expect(messageWhen(now - 2 * 60, now)).toBe('2 min ago');
  expect(messageWhen(now - 59 * 60, now)).toBe('59 min ago');
  expect(messageWhen(at(2026, 9, 30, 9, 5), now)).toBe('today, 09:05');
  expect(messageWhen(at(2026, 9, 29, 22, 41), now)).toBe('yesterday, 22:41');
  expect(messageWhen(at(2026, 9, 28, 14, 32), now)).toBe('28 Oct, 14:32');
  expect(messageWhen(at(2025, 11, 31, 8, 0), now)).toBe('31 Dec 2025, 08:00');
  expect(messageWhen(null, now)).toBe('');
});
