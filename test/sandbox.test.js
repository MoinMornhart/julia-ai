'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const a = require('../src/main/ampel');
const { WERKZEUGE } = require('../src/main/werkzeuge');

const W = Object.fromEntries(WERKZEUGE.map((x) => [x.name, x]));

// Fake-ctx: gibt die Sandbox-Einstellung und ein paar Ordner zurück.
function ctxMit({ an = false, ordner = '', arbeits = [] } = {}) {
  const sandbox = { an, ordner: ordner ? path.resolve(ordner) : '' };
  return {
    config: { get: (k) => ({ sandbox, arbeitsverzeichnisse: arbeits.map((p) => path.resolve(p)) }[k]) },
    arbeitsordner: () => sandbox.ordner || arbeits[0] || process.cwd(),
    datenOrdner: path.resolve('C:/Julia/daten'),
    appOrdner: path.resolve('C:/Julia/app'),
  };
}

const PROJEKT = path.resolve('C:/Projekt');
const drin = path.join(PROJEKT, 'unter', 'datei.txt');
const draussen = path.resolve('C:/Woanders/geheim.txt');

test('Sandbox aus: Schreiben außerhalb bleibt GELB (wie bisher), nicht ROT', () => {
  const ctx = ctxMit({ an: false, arbeits: ['C:/Projekt'] });
  const s = W.datei_schreiben.einstufen({ pfad: draussen, inhalt: 'x' }, ctx);
  assert.equal(s.stufe, a.GELB);
  assert.equal(s.kategorie, 'dateien_extern');
});

test('Sandbox an: Schreiben im erlaubten Ordner ist GRÜN', () => {
  const ctx = ctxMit({ an: true, ordner: 'C:/Projekt' });
  const s = W.datei_schreiben.einstufen({ pfad: drin, inhalt: 'x' }, ctx);
  assert.equal(s.stufe, a.GRUEN);
});

test('Sandbox an: Schreiben außerhalb ist ROT (gesperrt)', () => {
  const ctx = ctxMit({ an: true, ordner: 'C:/Projekt' });
  const s = W.datei_schreiben.einstufen({ pfad: draussen, inhalt: 'x' }, ctx);
  assert.equal(s.stufe, a.ROT);
  assert.match(s.grund, /Sandbox/);
});

test('Sandbox an: Verschieben aus dem Ordner heraus ist ROT', () => {
  const ctx = ctxMit({ an: true, ordner: 'C:/Projekt' });
  const s = W.datei_verschieben.einstufen({ von: drin, nach: draussen }, ctx);
  assert.equal(s.stufe, a.ROT);
});

test('Sandbox an: Verschieben innerhalb des Ordners ist GRÜN', () => {
  const ctx = ctxMit({ an: true, ordner: 'C:/Projekt' });
  const s = W.datei_verschieben.einstufen({ von: drin, nach: path.join(PROJEKT, 'ziel.txt') }, ctx);
  assert.equal(s.stufe, a.GRUEN);
});

test('Sandbox an: Lesen außerhalb ist ROT, innerhalb GRÜN', () => {
  const ctx = ctxMit({ an: true, ordner: 'C:/Projekt' });
  assert.equal(W.datei_lesen.einstufen({ pfad: draussen }, ctx).stufe, a.ROT);
  assert.equal(W.datei_lesen.einstufen({ pfad: drin }, ctx).stufe, a.GRUEN);
  assert.equal(W.ordner_auflisten.einstufen({ pfad: draussen }, ctx).stufe, a.ROT);
  assert.equal(W.ordner_auflisten.einstufen({ pfad: PROJEKT }, ctx).stufe, a.GRUEN);
});

test('Sandbox an, aber kein Ordner gesetzt: keine Wirkung (wie aus)', () => {
  const ctx = ctxMit({ an: true, ordner: '', arbeits: ['C:/Projekt'] });
  const s = W.datei_schreiben.einstufen({ pfad: draussen, inhalt: 'x' }, ctx);
  assert.equal(s.stufe, a.GELB); // fällt auf das normale Verhalten zurück
});

test('Ein Ordner mit gleichem Präfix zählt nicht als drinnen', () => {
  const ctx = ctxMit({ an: true, ordner: 'C:/Projekt' });
  const nachbar = path.resolve('C:/Projekt2/datei.txt');
  assert.equal(W.datei_schreiben.einstufen({ pfad: nachbar, inhalt: 'x' }, ctx).stufe, a.ROT);
});
