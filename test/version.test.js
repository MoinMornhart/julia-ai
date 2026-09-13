'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/main/version');

test('Korrektur zählt die letzte Stelle hoch und springt nach 9 um', () => {
  assert.equal(v.naechste('0.0.1', 'korrektur'), '0.0.2');
  assert.equal(v.naechste('0.0.9', 'korrektur'), '0.1.0');
  assert.equal(v.naechste('0.1.9', 'korrektur'), '0.2.0');
  assert.equal(v.naechste('0.9.9', 'korrektur'), '1.0.0');
  assert.equal(v.naechste('1.9.9', 'korrektur'), '2.0.0');
});

test('Neue Funktion zählt die mittlere Stelle hoch, letzte auf 0', () => {
  assert.equal(v.naechste('0.0.7', 'funktion'), '0.1.0');
  assert.equal(v.naechste('0.3.4', 'funktion'), '0.4.0');
  assert.equal(v.naechste('0.9.4', 'funktion'), '1.0.0');
});

test('Bruch zählt die erste Stelle hoch, Rest auf 0', () => {
  assert.equal(v.naechste('0.4.2', 'bruch'), '1.0.0');
  assert.equal(v.naechste('3.9.9', 'bruch'), '4.0.0');
});

test('Es gibt keine 0.0.10 und keine 0.10.0', () => {
  assert.equal(v.gueltig('0.0.10'), false);
  assert.equal(v.gueltig('0.10.0'), false);
  assert.equal(v.gueltig('0.9.9'), true);
  assert.equal(v.gueltig('12.0.0'), true);
});

test('Vergleich sortiert richtig, Vorabversion vor fertiger Version', () => {
  assert.ok(v.vergleichen('0.1.0', '0.0.9') > 0);
  assert.ok(v.vergleichen('v1.0.0', '0.9.9') > 0);
  assert.ok(v.vergleichen('0.2.0-test.1', '0.2.0') < 0);
  assert.equal(v.vergleichen('v0.3.1', '0.3.1'), 0);
});

test('Unbekannte Art wird abgelehnt', () => {
  assert.throws(() => v.naechste('0.0.1', 'feature'));
});
