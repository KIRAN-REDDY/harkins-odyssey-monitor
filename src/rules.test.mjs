import test from 'node:test';
import assert from 'node:assert/strict';
import { findTicketPlan, showtimeIsAllowed } from './lib.mjs';

function row(rowName, availableNumbers = [], count = 16, y = 100) {
  const available = new Set(availableNumbers);
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      row: rowName,
      number,
      x: number * 30,
      y,
      width: 20,
      height: 20,
      status: available.has(number) ? 'available' : 'unavailable',
      evidence: [],
    };
  });
}

function patternFor(seats) {
  return findTicketPlan(seats, 6, 2, 50)?.pattern;
}

test('accepts six adjacent middle seats', () => {
  assert.deepEqual(patternFor(row('G', [6, 7, 8, 9, 10, 11])), [6]);
});

test('accepts four plus two adjacent seats', () => {
  const seats = [
    ...row('G', [6, 7, 8, 9]),
    ...row('H', [7, 8], 16, 140),
  ];
  assert.deepEqual(patternFor(seats), [4, 2]);
});

test('accepts three plus three adjacent seats', () => {
  const seats = [
    ...row('J', [6, 7, 8]),
    ...row('K', [9, 10, 11], 16, 140),
  ];
  assert.deepEqual(patternFor(seats), [3, 3]);
});

test('accepts two plus two plus two adjacent seats', () => {
  const seats = [
    ...row('G', [6, 7]),
    ...row('H', [8, 9], 16, 140),
    ...row('M', [10, 11], 16, 180),
  ];
  assert.deepEqual(patternFor(seats), [2, 2, 2]);
});

test('can take four from a five-seat run plus a pair', () => {
  const seats = [
    ...row('G', [5, 6, 7, 8, 9]),
    ...row('H', [10, 11], 16, 140),
  ];
  assert.deepEqual(patternFor(seats), [4, 2]);
});

test('rejects fewer than six usable tickets', () => {
  const seats = [
    ...row('G', [6, 7, 8]),
    ...row('H', [9, 10], 16, 140),
  ];
  assert.equal(patternFor(seats), undefined);
});

test('rejects six tickets when any required seat is isolated', () => {
  const seats = [
    ...row('G', [6, 7, 8, 10, 12, 14]),
  ];
  assert.equal(patternFor(seats), undefined);
});

test('rejects qualifying-sized blocks outside the middle 50 percent', () => {
  const seats = [
    ...row('G', [1, 2, 3, 4, 5, 6]),
  ];
  assert.equal(patternFor(seats), undefined);
});

test('showtime must be after 2 PM and no later than 11 PM', () => {
  assert.equal(showtimeIsAllowed(14 * 60, 14 * 60, 23 * 60), false);
  assert.equal(showtimeIsAllowed(14 * 60 + 1, 14 * 60, 23 * 60), true);
  assert.equal(showtimeIsAllowed(23 * 60, 14 * 60, 23 * 60), true);
  assert.equal(showtimeIsAllowed(23 * 60 + 1, 14 * 60, 23 * 60), false);
});
