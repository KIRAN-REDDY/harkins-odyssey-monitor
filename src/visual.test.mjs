import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from './visual.mjs';

test('classifies a red rocker icon as available', () => {
  assert.equal(_test.classifySeat({ red: 0.42, gray: 0.01, blue: 0.02, bright: 0.20 }), 'available');
});

test('classifies the pale Odyssey unavailable icon as unavailable', () => {
  assert.equal(_test.classifySeat({ red: 0.06, gray: 0.24, blue: 0.05, bright: 0.31 }), 'unavailable');
});

test('classifies blue accessibility icons as accessible', () => {
  assert.equal(_test.classifySeat({ red: 0.00, gray: 0.03, blue: 0.48, bright: 0.22 }), 'accessible');
});

test('fails closed for an ambiguous icon', () => {
  assert.equal(_test.classifySeat({ red: 0.10, gray: 0.08, blue: 0.05, bright: 0.10 }), 'unknown');
});

test('validates the expected live legend signatures', () => {
  assert.equal(_test.legendLooksValid({
    rocker: { red: 0.50, gray: 0.00 },
    unavailable: { gray: 0.20 },
    wheelchair: { blue: 0.55 },
    companion: { blue: 0.58 },
  }), true);
});
