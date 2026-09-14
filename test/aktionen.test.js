'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/main/ampel');
const { WERKZEUGE } = require('../src/main/werkzeuge');

const aktionen = WERKZEUGE.find((x) => x.name === 'aktionen');

test('aktionen: die strengste Stufe eines Schritts gilt für alle', () => {
  const ok = [{ art: 'klick', x: 1, y: 2 }, { art: 'tippen', text: 'hallo' }, { art: 'taste', kombination: 'enter' }];
  assert.equal(aktionen.einstufen({ schritte: ok }).stufe, a.GRUEN);
  assert.equal(aktionen.einstufen({ schritte: [{ art: 'klick', x: 1, y: 2 }, { art: 'taste', kombination: 'win+r' }] }).stufe, a.GELB);
  assert.equal(aktionen.einstufen({ schritte: [{ art: 'taste', kombination: 'win+r' }, { art: 'tippen', text: '4111 1111 1111 1111' }] }).stufe, a.ROT);
});

test('aktionen: Freigaben zeigen den vollständigen Text', () => {
  const lang = 'x'.repeat(400);
  const b = aktionen.einstufen({ schritte: [{ art: 'tippen', text: `Hallo Welt ${lang}` }] }).beschreibung;
  assert.ok(b.includes(`Hallo Welt ${lang}`));
});

test('aktionen: zu viele oder keine Schritte werden abgelehnt', async () => {
  await assert.rejects(aktionen.ausfuehren({ schritte: [] }), /Keine Schritte/);
  await assert.rejects(aktionen.ausfuehren({ schritte: Array.from({ length: 13 }, () => ({ art: 'warten', ms: 1 })) }), /Höchstens 12/);
});
