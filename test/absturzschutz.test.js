'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { signatur, textVon, entscheiden, installieren, MAX_GLEICHE } = require('../src/main/absturzschutz');

function fakeLog() {
  const zeilen = [];
  return { zeilen, schreiben: (stufe, text, daten) => zeilen.push({ stufe, text, daten }) };
}

test('signatur ist stabil und kurz (erste Stack-Zeilen)', () => {
  const e = new Error('Kaputt');
  assert.equal(signatur(e).startsWith('Error: Kaputt'), true);
  assert.ok(signatur(e).length <= 200);
});

test('textVon versteht Error, String und Objekt', () => {
  assert.match(textVon(new Error('X')), /Error: X/);
  assert.equal(textVon('nur Text'), 'nur Text');
  assert.match(textVon({ a: 1 }), /"a":1/);
  assert.equal(textVon(null), 'Unbekannter Fehler');
});

test('entscheiden: beim Start immer tödlich', () => {
  assert.equal(entscheiden({ imStart: true, gesehen: 1 }), 'toedlich');
  assert.equal(entscheiden({ imStart: true, gesehen: 99 }), 'toedlich');
});

test('entscheiden: nach dem Start weiterlaufen, dann Schleifenschutz', () => {
  assert.equal(entscheiden({ imStart: false, gesehen: 1 }), 'weiterlaufen');
  assert.equal(entscheiden({ imStart: false, gesehen: MAX_GLEICHE }), 'weiterlaufen');
  assert.equal(entscheiden({ imStart: false, gesehen: MAX_GLEICHE + 1 }), 'ignorieren');
});

test('installieren: Fehler beim Start ist tödlich und wird gemeldet', () => {
  const prozess = new EventEmitter();
  const logbuch = fakeLog();
  let fatalText = null;
  let gemeldet = 0;
  installieren({ prozess, logbuch, imStart: () => true, fatal: (t) => { fatalText = t; }, melden: () => { gemeldet++; } });
  prozess.emit('uncaughtException', new Error('Startfehler'));
  assert.match(fatalText, /Startfehler/);
  assert.equal(gemeldet, 0);
  assert.equal(logbuch.zeilen[0].stufe, 'FATAL');
});

test('installieren: Fehler nach dem Start lässt Julia weiterlaufen (kein fatal)', () => {
  const prozess = new EventEmitter();
  const logbuch = fakeLog();
  let fatalAufgerufen = false;
  let gemeldet = 0;
  installieren({ prozess, logbuch, imStart: () => false, fatal: () => { fatalAufgerufen = true; }, melden: () => { gemeldet++; } });
  prozess.emit('unhandledRejection', new Error('Hintergrundfehler'));
  assert.equal(fatalAufgerufen, false);
  assert.equal(gemeldet, 1);
  assert.equal(logbuch.zeilen[0].stufe, 'CRASH');
});

test('installieren: derselbe Fehler meldet nicht endlos (Schleifenschutz)', () => {
  const prozess = new EventEmitter();
  const logbuch = fakeLog();
  let gemeldet = 0;
  installieren({ prozess, logbuch, imStart: () => false, melden: () => { gemeldet++; }, maxGleiche: 3 });
  const e = new Error('immer derselbe');
  for (let i = 0; i < 10; i++) prozess.emit('uncaughtException', e);
  assert.equal(gemeldet, 3); // nur bis zur Schwelle gemeldet …
  assert.equal(logbuch.zeilen.length, 10); // … aber jeder Fall wird geloggt
});

test('installieren: der Absturzschutz stürzt selbst nicht ab, wenn fatal wirft', () => {
  const prozess = new EventEmitter();
  const logbuch = fakeLog();
  installieren({ prozess, logbuch, imStart: () => true, fatal: () => { throw new Error('Dialog kaputt'); } });
  assert.doesNotThrow(() => prozess.emit('uncaughtException', new Error('x')));
});
