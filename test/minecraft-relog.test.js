'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { haengerErkannt } = require('../src/main/minecraft');

test('ohne bisherigen Tick kein Hänger (frisch verbunden)', () => {
  assert.equal(haengerErkannt(0, 100000, 30000), false);
  assert.equal(haengerErkannt(null, 100000, 30000), false);
});

test('kürzlich noch ein Tick → kein Hänger', () => {
  const jetzt = 100000;
  assert.equal(haengerErkannt(jetzt - 5000, jetzt, 30000), false); // erst 5 s still
});

test('lange kein Tick mehr → Hänger erkannt', () => {
  const jetzt = 100000;
  assert.equal(haengerErkannt(jetzt - 31000, jetzt, 30000), true); // 31 s still
});

test('genau an der Grenze zählt als Hänger', () => {
  const jetzt = 100000;
  assert.equal(haengerErkannt(jetzt - 30000, jetzt, 30000), true);
});
