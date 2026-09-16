'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { haengerStatus } = require('../src/main/minecraft');

test('erster Aufruf merkt sich nur den Anker', () => {
  const s = haengerStatus(null, { x: 10, z: 20 }, 100);
  assert.deepEqual(s.neu, { x: 10, z: 20, t: 100 });
  assert.ok(!s.springen);
});

test('kommt sie voran, wird der Anker versetzt und nicht gesprungen', () => {
  const anker = { x: 0, z: 0, t: 100 };
  const s = haengerStatus(anker, { x: 1, z: 0 }, 106); // 1 Block weiter
  assert.ok(!s.springen);
  assert.deepEqual(s.neu, { x: 1, z: 0, t: 106 });
});

test('kaum bewegt und lange genug festgehangen → Sprung-Impuls', () => {
  const anker = { x: 0, z: 0, t: 100 };
  const s = haengerStatus(anker, { x: 0.1, z: 0.05 }, 100 + 12); // <0,35 Block, 12 Ticks
  assert.equal(s.springen, true);
  assert.deepEqual(s.neu, { x: 0.1, z: 0.05, t: 112 });
});

test('kaum bewegt, aber noch nicht lange genug → abwarten', () => {
  const anker = { x: 0, z: 0, t: 100 };
  const s = haengerStatus(anker, { x: 0.1, z: 0 }, 105); // erst 5 Ticks
  assert.ok(!s.springen);
  assert.ok(!s.neu);
});

test('Schwellen sind einstellbar', () => {
  const anker = { x: 0, z: 0, t: 0 };
  // minWeit 1.0: 0,5 Block gilt als „steht" → nach minTicks Sprung
  assert.equal(haengerStatus(anker, { x: 0.5, z: 0 }, 20, { minWeit: 1, minTicks: 20 }).springen, true);
  // minWeit 0.2: 0,5 Block gilt als vorangekommen → kein Sprung
  assert.ok(!haengerStatus(anker, { x: 0.5, z: 0 }, 20, { minWeit: 0.2, minTicks: 20 }).springen);
});
