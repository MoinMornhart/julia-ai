'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Routinen, pruefen, nachricht, SYMBOLE } = require('../src/main/routinen');
const { TEXTE } = require('../src/shared/texte');

const ordner = () => fs.mkdtempSync(path.join(os.tmpdir(), 'julia-rt-'));

test('Erster Start: Beispiele in der eingestellten Sprache', () => {
  assert.deepEqual(new Routinen(ordner(), { sprachcode: () => 'de' }).alle().map((r) => r.name), ['Feierabend', 'Fokus', 'Zocken']);
  assert.deepEqual(new Routinen(ordner(), { sprachcode: () => 'en' }).alle().map((r) => r.name), ['End of day', 'Focus', 'Gaming']);
});

test('Anlegen, ändern, löschen – und alles bleibt nach einem Neustart', () => {
  const o = ordner();
  const r = new Routinen(o);
  const neu = r.speichern({ name: '  Morgen  ', symbol: '☕', schritte: 'Kaffee-Timer 4 Minuten\n\n  Mails zusammenfassen ' });
  assert.deepEqual(neu.schritte, ['Kaffee-Timer 4 Minuten', 'Mails zusammenfassen']);
  assert.equal(neu.name, 'Morgen');
  r.speichern({ id: neu.id, name: 'Guten Morgen', symbol: '🚀', schritte: ['Termine zeigen'] });
  const wieder = new Routinen(o);
  assert.equal(wieder.lesen(neu.id).name, 'Guten Morgen');
  assert.equal(wieder.lesen(neu.id).symbol, '🚀');
  assert.equal(wieder.loeschen(neu.id), true);
  assert.equal(wieder.lesen(neu.id), null);
  assert.throws(() => wieder.speichern({ id: 'gibtsnicht', name: 'x', schritte: ['y'] }), (e) => e.schluessel === 'rt.fehlt');
});

test('Prüfung: Name, Schritte, Längen, nur bekannte Symbole', () => {
  assert.throws(() => pruefen({ name: '', schritte: ['a'] }), (e) => e.schluessel === 'rt.fehler_name');
  assert.throws(() => pruefen({ name: 'x'.repeat(41), schritte: ['a'] }), (e) => e.schluessel === 'rt.fehler_name');
  assert.throws(() => pruefen({ name: 'X', schritte: ' \n ' }), (e) => e.schluessel === 'rt.fehler_schritte');
  assert.throws(() => pruefen({ name: 'X', schritte: Array(13).fill('a') }), (e) => e.schluessel === 'rt.fehler_lang');
  assert.throws(() => pruefen({ name: 'X', schritte: ['a'.repeat(301)] }), (e) => e.schluessel === 'rt.fehler_lang');
  assert.equal(pruefen({ name: 'X', schritte: ['a'], symbol: '<img src=x>' }).symbol, SYMBOLE[0]);
});

test('Auftrag an Julia: Freigabe für den ganzen Ablauf, Schritte nummeriert', () => {
  for (const sc of ['de', 'en']) {
    const text = nachricht({ name: 'Zocken', schritte: ['Öffne Steam', 'Öffne Discord'] }, TEXTE[sc]['rt.nachricht']);
    assert.match(text, /auftrag_vorlegen/);
    assert.match(text, /Zocken/);
    assert.match(text, /1\. Öffne Steam\n2\. Öffne Discord/);
  }
});
