import test from 'node:test';
import assert from 'node:assert/strict';
import { findAdjacentGroups, parseClockMinutes } from './lib.mjs';

test('parses 12-hour times', () => {
  assert.equal(parseClockMinutes('2:15 PM'), 14 * 60 + 15);
  assert.equal(parseClockMinutes('12:00 AM'), 0);
  assert.equal(parseClockMinutes('12:00 PM'), 12 * 60);
});

test('finds three physically adjacent seats', () => {
  const seats = [1, 2, 3, 4, 5].map((number) => ({
    row: 'G', number, x: number * 30, y: 100, width: 20, height: 20,
    status: [2, 3, 4].includes(number) ? 'available' : 'unavailable', evidence: [],
  }));
  assert.deepEqual(findAdjacentGroups(seats, 3)[0].seats, ['G2', 'G3', 'G4']);
});

test('does not bridge a large aisle', () => {
  const xs = [30, 60, 90, 200, 230, 260];
  const seats = xs.map((x, index) => ({
    row: 'M', number: index + 1, x, y: 100, width: 20, height: 20,
    status: [3, 4, 5].includes(index + 1) ? 'available' : 'unavailable', evidence: [],
  }));
  assert.equal(findAdjacentGroups(seats, 3).length, 0);
});

test('ignores adjacent seats in the outer quarter of a row', () => {
  const seats = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    return {
      row: 'H', number, x: number * 30, y: 100, width: 20, height: 20,
      status: [1, 2, 3].includes(number) ? 'available' : 'unavailable', evidence: [],
    };
  });
  assert.equal(findAdjacentGroups(seats, 3, 50).length, 0);
});

test('finds adjacent seats entirely inside the middle 50 percent', () => {
  const seats = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    return {
      row: 'J', number, x: number * 30, y: 100, width: 20, height: 20,
      status: [4, 5, 6].includes(number) ? 'available' : 'unavailable', evidence: [],
    };
  });
  assert.deepEqual(findAdjacentGroups(seats, 3, 50)[0].seats, ['J4', 'J5', 'J6']);
});

test('does not alert when a group crosses the middle-50-percent boundary', () => {
  const seats = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    return {
      row: 'K', number, x: number * 30, y: 100, width: 20, height: 20,
      status: [2, 3, 4].includes(number) ? 'available' : 'unavailable', evidence: [],
    };
  });
  assert.equal(findAdjacentGroups(seats, 3, 50).length, 0);
});
