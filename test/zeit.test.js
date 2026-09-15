'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stoppuhr, zeitFormat } = require('../src/main/zeit');

test('Stoppuhr: läuft, hält, misst Runden und setzt zurück', () => {
  let t = 1000;
  const u = new Stoppuhr(() => t);
  assert.equal(u.status().ms, 0);
  u.start();
  t = 4000; // 3 s
  assert.equal(u.verstrichen(), 3000);
  u.runde();
  t = 6000; // insgesamt 5 s
  u.stopp();
  assert.equal(u.laeuft, false);
  assert.equal(u.status().ms, 5000);
  assert.deepEqual(u.status().runden, [3000]);
  // Stoppen friert die Zeit ein.
  t = 9000;
  assert.equal(u.status().ms, 5000);
  // Weiterlaufen addiert.
  u.start();
  t = 10000;
  assert.equal(u.verstrichen(), 6000);
  u.zuruecksetzen();
  assert.deepEqual(u.status(), { laeuft: false, ms: 0, runden: [] });
});

test('Stoppuhr: doppeltes Start ändert die Startzeit nicht', () => {
  let t = 0;
  const u = new Stoppuhr(() => t);
  u.start();
  t = 2000;
  u.start(); // darf nicht neu starten
  t = 5000;
  assert.equal(u.verstrichen(), 5000);
});

test('Zeit: Format unter und über einer Stunde', () => {
  assert.equal(zeitFormat(0), '0:00,0');
  assert.equal(zeitFormat(5300), '0:05,3');
  assert.equal(zeitFormat(65000), '1:05,0');
  assert.equal(zeitFormat(3_661_000), '1:01:01');
});

test('Stoppuhr: das Werkzeug meldet Stand und Runden', async () => {
  const { finden } = require('../src/main/werkzeuge');
  const w = finden('stoppuhr', {});
  let t = 0;
  const ctx = { stoppuhr: new Stoppuhr(() => t) };
  assert.equal(w.einstufen().stufe, require('../src/main/ampel').GRUEN);
  await w.ausfuehren({ aktion: 'start' }, ctx);
  t = 12300;
  const s = await w.ausfuehren({ aktion: 'status' }, ctx);
  assert.match(s, /läuft bei 0:12,3/);
  assert.equal(await w.ausfuehren({ aktion: 'zuruecksetzen' }, ctx), 'Stoppuhr zurückgesetzt.');
});
