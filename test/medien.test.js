'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const win = require('../src/main/win/win');
const { finden } = require('../src/main/werkzeuge');
const { GRUEN, GELB } = require('../src/main/ampel');

test('Medien: die Medientasten sind als VK-Codes bekannt', () => {
  assert.deepEqual(win.vkCodes('lauter'), [0xAF]);
  assert.deepEqual(win.vkCodes('leiser'), [0xAE]);
  assert.deepEqual(win.vkCodes('stumm'), [0xAD]);
  assert.deepEqual(win.vkCodes('medien_playpause'), [0xB3]);
});

test('Medien: das Werkzeug ist GRÜN und kennt die Aktionen', () => {
  const w = finden('medien', {});
  assert.equal(w.einstufen({ aktion: 'playpause' }).stufe, GRUEN);
  const aktionen = w.input_schema.properties.aktion.enum;
  assert.deepEqual(aktionen, ['playpause', 'weiter', 'zurueck', 'stopp', 'lauter', 'leiser', 'stumm']);
});

test('Programm schließen ist GELB (kann ungespeicherte Arbeit betreffen)', () => {
  const w = finden('programm_schliessen', {});
  const e = w.einstufen({ name: 'notepad' });
  assert.equal(e.stufe, GELB);
  assert.equal(e.kategorie, 'system');
  assert.match(e.beschreibung, /notepad/);
});

test('Fenster anordnen: Werkzeug ist GRÜN und kennt die Seiten', () => {
  const w = finden('fenster_anordnen', {});
  assert.equal(w.einstufen({ id: 1, seite: 'links' }).stufe, GRUEN);
  const seiten = w.input_schema.properties.seite.enum;
  for (const s of ['links', 'rechts', 'maximieren', 'oben_links', 'mitte', 'wiederherstellen']) assert.ok(seiten.includes(s), s);
});

test('Fenster anordnen: unbekannte Seite wird abgelehnt', async () => {
  await assert.rejects(win.fensterAnordnen(1, 'quatsch'), /Unbekannte Anordnung/);
});
