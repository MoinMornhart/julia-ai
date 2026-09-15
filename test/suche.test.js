'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalisieren, passt } = require('../src/renderer/suche');

test('normalisieren macht klein und entfernt Umlaute/Akzente', () => {
  assert.equal(normalisieren('Überblick'), 'uberblick');
  assert.equal(normalisieren('Sprache & Größe'), 'sprache & große');
  assert.equal(normalisieren('Café'), 'cafe');
  assert.equal(normalisieren(null), '');
});

test('passt findet unabhängig von Groß/Klein und Umlauten', () => {
  assert.ok(passt('Sprache und Stimme', 'sprache'));
  assert.ok(passt('Überblick anzeigen', 'uberblick'));
  assert.ok(passt('Design', 'DESIGN'));
});

test('passt behandelt mehrere Wörter als UND-Suche', () => {
  assert.ok(passt('Blase am Bildschirmrand', 'blase rand'));
  assert.ok(!passt('Blase am Bildschirmrand', 'blase overlay'));
});

test('leere Suche passt immer (alles sichtbar)', () => {
  assert.ok(passt('irgendwas', ''));
  assert.ok(passt('irgendwas', '   '));
});

test('kein Treffer, wenn das Wort fehlt', () => {
  assert.ok(!passt('Konten verbinden', 'minecraft'));
});
