import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toStoreQuantity, parseRequired, isBareCount, isBumpable, computeBuyAmount, scaleReceiptObservation,
} from '../storeQty.js';

test('toStoreQuantity maps recipe amounts to store units', () => {
  const cases = [
    ['garlic', '3 cloves', '1 head'],
    ['garlic', '10 cloves', '2 heads'],
    ['garlic powder', '1 tsp', '1 jar'],      // seasoning guard keeps it out of the head rule
    ['onion', '1 1/2', '2'],                  // countable produce rounds up
    ['onion powder', '1 tsp', '1 jar'],
    ['tomato paste', '2 tbsp', '2 tbsp'],     // processed form, no rule → keep qty
    ['lemon juice', '2 tbsp', '1 bottle'],
    ['eggs', '3', '1 dozen'],
    ['eggplant', '1', '1'],
    ['olive oil', '2 tbsp', '1 bottle'],
    ['flour tortillas', '8', '1 pack'],
    ['all-purpose flour', '2 cups', '1 bag'],
    ['peanut butter', '2 tbsp', '1 jar'],
    ['butter', '2 tbsp', '1 pack'],
    ['cream cheese', '4 oz', '1 container'],
    ['cheddar cheese', '1 cup', '1 block'],
    ['chicken broth', '2 cups', '1 carton'],
    ['black beans', '1 can', '1 can'],        // already a store unit
    ['saffron', '1 pinch', '1 pinch'],        // unknown → unchanged
    ['', '', ''],
  ];
  for (const [name, qty, want] of cases) {
    assert.equal(toStoreQuantity(name, qty), want, `${name} / ${qty}`);
  }
});

test('parseRequired converts to canonical bases', () => {
  assert.deepEqual(parseRequired('2 tbsp'), { base: 1, dim: 'volume' });
  assert.deepEqual(parseRequired('1 cup'), { base: 8, dim: 'volume' });
  assert.deepEqual(parseRequired('1 lb'), { base: 16, dim: 'weight' });
  assert.deepEqual(parseRequired('3 cloves'), { base: 3, dim: 'clove' });
  assert.deepEqual(parseRequired('1/2'), { base: 0.5, dim: 'count' });
  assert.deepEqual(parseRequired(''), { base: 0, dim: 'count' });
});

test('isBareCount only accepts a number with no unit word', () => {
  assert.equal(isBareCount('12'), true);
  assert.equal(isBareCount('1 1/2'), true);
  assert.equal(isBareCount('1 bag'), false);
  assert.equal(isBareCount('large'), false);
  assert.equal(isBareCount(null), false);
});

test('isBumpable and computeBuyAmount grow the buy amount with the required total', () => {
  assert.equal(isBumpable('olive oil', 'volume'), true);
  assert.equal(isBumpable('flour', 'volume'), false);   // bought by the bag
  assert.equal(isBumpable('anything', 'weight'), true);
  assert.equal(computeBuyAmount('olive oil', 20, 'volume', '2 tbsp'), '2 bottles');
  assert.equal(computeBuyAmount('garlic', 12, 'clove', '3 cloves'), '2 heads');
  assert.equal(computeBuyAmount('ground beef', 24, 'weight', '1.5 lb'), '1.5 lb');
  assert.equal(computeBuyAmount('ground beef', 2, 'weight', '2 oz'), '0.5 lb');
  assert.equal(computeBuyAmount('flour', 16, 'volume', '2 cups'), '1 bag');
});

test('scaleReceiptObservation scales matching dimensions and falls back otherwise', () => {
  const beef = { dim: 'weight', base_amount: 32, unit_price: 10 / 32, total_price: 10, qty_text: '2 lb' };
  assert.deepEqual(scaleReceiptObservation(beef, '1 lb'), { price: 5, qty_priced: null });
  assert.deepEqual(scaleReceiptObservation(beef, '2 lb'), { price: 10, qty_priced: null });
  // Dimension mismatch → whole observed price, labeled with the receipt qty.
  assert.deepEqual(scaleReceiptObservation(beef, '2 cups'), { price: 10, qty_priced: '2 lb' });

  const eggs = { dim: 'count', base_amount: 12, unit_price: 0.5, total_price: 6, qty_text: '12' };
  assert.deepEqual(scaleReceiptObservation(eggs, '6'), { price: 3, qty_priced: null });

  // A container word on either side is not a fixed size, so no scaling.
  const rice = { dim: 'count', base_amount: 1, unit_price: 4, total_price: 4, qty_text: '1 bag' };
  assert.deepEqual(scaleReceiptObservation(rice, '2 bags'), { price: 4, qty_priced: '1 bag' });
  assert.deepEqual(scaleReceiptObservation(eggs, '1 dozen'), { price: 6, qty_priced: '12' });

  // Unusable list qty → fallback.
  assert.deepEqual(scaleReceiptObservation(beef, ''), { price: 10, qty_priced: '2 lb' });
});
