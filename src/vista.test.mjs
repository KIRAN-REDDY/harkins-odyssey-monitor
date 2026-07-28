import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVistaSeats } from './vista.mjs';
import { parseRows } from './lib.mjs';

function captures(statuses) {
  const seats = Array.from({ length: 8 }, (_, index) => ({
    id: `seat-${index + 1}`,
    label: String(index + 1),
    rowLabel: 'G',
    type: 'Normal',
    position: { areaNumber: 1, rowNumber: 7, columnNumber: index + 1 },
  }));
  return [
    {
      url: 'https://example/ocapi/v1/seat-layouts/layout-1',
      json: { seatLayout: { areas: [{ rows: [{ label: 'G', seats }] }] } },
    },
    {
      url: 'https://example/ocapi/v1/showtimes/show-1/seat-availability',
      json: {
        seatAvailabilities: statuses.map((status, index) => ({ seatId: `seat-${index + 1}`, status })),
        isSoldOut: statuses.every((status) => status === 'Sold'),
      },
    },
  ];
}

test('uses only exact Vista Available statuses', () => {
  const result = extractVistaSeats(
    captures(['Sold', 'Sold', 'Available', 'Available', 'Available', 'House', 'Broken', 'Sold']),
    { allowedRows: parseRows('G') },
  );
  assert.equal(result.confidence, 'high');
  assert.deepEqual(
    result.seats.filter((seat) => seat.status === 'available').map((seat) => seat.number),
    [3, 4, 5],
  );
});

test('fails closed when availability is missing', () => {
  const result = extractVistaSeats(captures([]).slice(0, 1), { allowedRows: parseRows('G') });
  assert.equal(result.confidence, 'none');
  assert.equal(result.seats.length, 0);
});

test('fails closed for unknown statuses', () => {
  const result = extractVistaSeats(
    captures(['Open', 'Open', 'Open', 'Open', 'Open', 'Open', 'Open', 'Open']),
    { allowedRows: parseRows('G') },
  );
  assert.notEqual(result.confidence, 'high');
  assert.equal(result.seats.length, 0);
});

test('fails closed when layout and availability do not sufficiently match', () => {
  const data = captures(['Available', 'Available', 'Available']);
  const result = extractVistaSeats(data, { allowedRows: parseRows('G') });
  assert.notEqual(result.confidence, 'high');
  assert.equal(result.seats.length, 0);
});
