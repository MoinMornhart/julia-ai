'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ErfahrungsLerner, MAX_AKTIONEN, MAX_LAGEN } = require('../src/main/erfahrung');

test('schlägt die bewährteste Aktion in einer Lage vor', () => {
  const l = new ErfahrungsLerner();
  l.beobachten('wasser-vor-mir', 'schwimmen', 1);
  l.beobachten('wasser-vor-mir', 'schwimmen', 1);
  l.beobachten('wasser-vor-mir', 'graben', 0);
  assert.equal(l.vorschlag('wasser-vor-mir'), 'schwimmen');
});

test('lernt aus Misserfolg (negative Belohnung senkt den Schnitt)', () => {
  const l = new ErfahrungsLerner();
  l.beobachten('kante', 'springen', 1);
  l.beobachten('kante', 'springen', -1);
  l.beobachten('kante', 'warten', 1);
  assert.equal(l.vorschlag('kante'), 'warten');
  const b = l.bewertung('kante', 'springen');
  assert.equal(b.schnitt, 0);
  assert.equal(b.versuche, 2);
});

test('unbekannte Lage: erster Kandidat oder null', () => {
  const l = new ErfahrungsLerner();
  assert.equal(l.vorschlag('neu', ['a', 'b']), 'a');
  assert.equal(l.vorschlag('neu'), null);
});

test('beschränkt den Vorschlag auf erlaubte Kandidaten', () => {
  const l = new ErfahrungsLerner();
  l.beobachten('lage', 'verboten', 5);
  l.beobachten('lage', 'erlaubt', 1);
  assert.equal(l.vorschlag('lage', ['erlaubt']), 'erlaubt');
});

test('ungültige Belohnung wird zu 0, kein Absturz', () => {
  const l = new ErfahrungsLerner();
  l.beobachten('x', 'y', NaN);
  assert.equal(l.bewertung('x', 'y').schnitt, 0);
  assert.equal(l.bewertung('x', 'y').versuche, 1);
});

test('speichern und wiederherstellen bewahrt die Erfahrung', () => {
  const l = new ErfahrungsLerner();
  l.beobachten('lage', 'gut', 1);
  l.beobachten('lage', 'gut', 1);
  const roh = JSON.parse(JSON.stringify(l.alsJson()));
  const l2 = ErfahrungsLerner.ausJson(roh);
  assert.equal(l2.vorschlag('lage'), 'gut');
  assert.equal(l2.bewertung('lage', 'gut').versuche, 2);
});

test('ausJson verkraftet Müll ohne zu werfen', () => {
  assert.doesNotThrow(() => ErfahrungsLerner.ausJson(null));
  assert.doesNotThrow(() => ErfahrungsLerner.ausJson({ lagen: { a: 5 } }));
  assert.equal(ErfahrungsLerner.ausJson('quatsch').lagen.size, 0);
});

test('hält die Zahl der Aktionen je Lage begrenzt (KB statt GB)', () => {
  const l = new ErfahrungsLerner();
  for (let i = 0; i < MAX_AKTIONEN + 20; i++) l.beobachten('lage', 'a' + i, 0);
  const aktionen = l.lagen.get('lage');
  assert.ok(aktionen.size <= MAX_AKTIONEN);
});

test('hält die Zahl der Lagen begrenzt', () => {
  const l = new ErfahrungsLerner();
  for (let i = 0; i < MAX_LAGEN + 30; i++) l.beobachten('lage' + i, 'a', 1);
  assert.ok(l.lagen.size <= MAX_LAGEN);
});

test('erkunden=1 wählt eine erlaubte, selten versuchte Aktion', () => {
  const l = new ErfahrungsLerner();
  l.beobachten('lage', 'oft', 1);
  l.beobachten('lage', 'oft', 1);
  l.beobachten('lage', 'oft', 1);
  l.beobachten('lage', 'selten', 0);
  // Bei voller Erkundung muss die seltener versuchte Aktion herauskommen.
  assert.equal(l.vorschlag('lage', ['oft', 'selten'], 1), 'selten');
});
