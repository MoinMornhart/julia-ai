'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { faellig, probleme } = require('../src/main/selbstpruefung');

test('Selbstprüfung: alle sieben Tage fällig', () => {
  const jetzt = 1000 * 24 * 3600 * 1000;
  assert.equal(faellig(0, jetzt), true, 'ohne letzte Prüfung sofort');
  assert.equal(faellig(jetzt - 6 * 24 * 3600 * 1000, jetzt), false, 'nach 6 Tagen noch nicht');
  assert.equal(faellig(jetzt - 7 * 24 * 3600 * 1000, jetzt), true, 'nach 7 Tagen wieder');
});

test('Selbstprüfung: ruhiges Logbuch meldet nichts', () => {
  const log = [
    '2026-09-15 10:00:00 [START] Julia startet',
    '2026-09-15 10:00:01 [GPU-INFO] Grafik erkannt {"renderer":"x"}',
    '2026-09-15 10:00:02 [INFO] alles gut',
  ].join('\n');
  assert.equal(probleme(log), null);
});

test('Selbstprüfung: Abstürze werden zusammengefasst', () => {
  const log = [
    '2026-09-15 10:00:00 [START] Julia startet',
    '2026-09-15 10:00:03 [CRASH] Kindprozess weg: GPU {"grund":"crashed"}',
    '2026-09-15 10:00:04 [GPU] GPU-Absturz beim Start',
    '2026-09-15 10:00:05 [FATAL] Start abgebrochen',
  ].join('\n');
  const p = probleme(log);
  assert.equal(p.anzahl, 3);
  assert.equal(p.arten.CRASH, 1);
  assert.equal(p.arten.GPU, 1);
  assert.equal(p.arten.FATAL, 1);
  assert.equal(p.letzte.length, 3);
});

test('Selbstprüfung: leere Oberfläche und degradierte GPU zählen als Problem (Issue #55)', () => {
  const log = [
    '2026-09-16 18:17 [START] Julia startet',
    '2026-09-16 18:17 [GPU-INFO] Grafik erkannt – KEINE Treiber-Infos (GPU evtl. degradiert) {"vendorId":4318}',
    '2026-09-16 18:18 [RENDERER-FEHLER] Oberfläche nach dem Laden leer – Beschriftungen leer – Start hing beim Laden',
    '2026-09-16 18:18 [RENDERER] Chat-Fenster fertig geladen',
  ].join('\n');
  const p = probleme(log);
  assert.ok(p, 'Problem erkannt');
  assert.equal(p.arten['GPU-DEGRADIERT'], 1);
  assert.equal(p.arten['RENDERER-FEHLER'], 1);
});

test('Selbstprüfung: normale GPU-INFO- und RENDERER-Zeilen sind kein Problem', () => {
  const log = [
    '2026-09-16 10:00 [GPU-INFO] Grafik erkannt {"renderer":"NVIDIA"}',
    '2026-09-16 10:00 [RENDERER] Chat-Fenster fertig geladen',
    '2026-09-16 10:00 [RENDERER] Chat-Fenster reagiert wieder',
  ].join('\n');
  assert.equal(probleme(log), null);
});
