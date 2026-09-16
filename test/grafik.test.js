'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/main/grafik');

test('Leiter-Reihenfolge und Gültigkeit', () => {
  assert.deepEqual(g.MODI, ['normal', 'd3d9', 'gl', 'swiftshader', 'software']);
  assert.equal(g.gueltig('swiftshader'), true);
  assert.equal(g.gueltig('quatsch'), false);
});

test('naechster geht die Leiter hoch und bleibt oben stehen', () => {
  assert.equal(g.naechster('normal'), 'd3d9');
  assert.equal(g.naechster('d3d9'), 'gl');
  assert.equal(g.naechster('gl'), 'swiftshader');
  assert.equal(g.naechster('swiftshader'), 'software');
  assert.equal(g.naechster('software'), 'software'); // letzte Stufe bleibt
  assert.equal(g.naechster('unbekannt'), 'd3d9'); // von unbekannt auf erste Fallback-Stufe
});

test('letzte erkennt die unterste (verträglichste) Stufe', () => {
  assert.equal(g.letzte('software'), true);
  assert.equal(g.letzte('normal'), false);
  assert.equal(g.letzte('swiftshader'), false);
});

test('flaggenFuer liefert die richtigen ANGLE/SwiftShader-Schalter', () => {
  assert.deepEqual(g.flaggenFuer('normal'), []);
  assert.deepEqual(g.flaggenFuer('software'), []); // läuft über disableHardwareAcceleration
  assert.deepEqual(g.flaggenFuer('d3d9'), [['use-angle', 'd3d9']]);
  assert.deepEqual(g.flaggenFuer('gl'), [['use-angle', 'gl']]);
  const sw = g.flaggenFuer('swiftshader');
  assert.ok(sw.some(([n, v]) => n === 'use-angle' && v === 'swiftshader'));
});

test('hardwareAus nur bei der vollen Software-Stufe', () => {
  assert.equal(g.hardwareAus('software'), true);
  assert.equal(g.hardwareAus('d3d9'), false);
  assert.equal(g.hardwareAus('normal'), false);
});
