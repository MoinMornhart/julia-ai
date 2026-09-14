'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/main/mikrofon-recht');

test('Mikrofon-Sperre: reg-Ausgabe lesen', () => {
  const aus = '\r\nHKEY_CURRENT_USER\\SOFTWARE\\...\\microphone\\NonPackaged\r\n    Value    REG_SZ    Deny\r\n\r\n';
  assert.equal(m.regWert(aus, 'Value'), 'Deny');
  assert.equal(m.regWert('    LetAppsAccessMicrophone    REG_DWORD    0x2\r\n', 'LetAppsAccessMicrophone'), '0x2');
  assert.equal(m.regWert('', 'Value'), null);
});

test('Mikrofon-Sperre: der erste gesperrte Schalter zählt, fehlende heißen erlaubt', () => {
  assert.equal(m.sperreFinden({}), null);
  assert.equal(m.sperreFinden({ geraet: 'Allow', apps: 'Allow', desktop: 'Allow' }), null);
  assert.equal(m.sperreFinden({ geraet: 'Allow', apps: 'Allow', desktop: 'Deny' }), 'desktop');
  assert.equal(m.sperreFinden({ geraet: 'Allow', apps: 'Deny', desktop: 'Deny' }), 'apps');
  assert.equal(m.sperreFinden({ geraet: 'Deny', apps: 'Deny' }), 'geraet');
  assert.equal(m.sperreFinden({ richtlinie: '0x2', geraet: 'Allow' }), 'richtlinie');
  assert.equal(m.sperreFinden({ richtlinie: '0x1' }), null, '1 = Apps erlauben');
});

test('Mikrofon-Test: Auswertung nennt die passende Ursache', () => {
  const k = (d) => d.map((x) => x.k);
  const de = ['de-DE'];
  assert.deepEqual(k(m.diagnose({ erkenner: de, laeufe: [{ art: 'standard', pegel: 40, text: 'hallo' }] })), ['mikrotest.d_ok']);
  const besser = m.diagnose({ erkenner: de, laeufe: [{ art: 'gewaehlt', geraet: 'Headset', pegel: 0, text: '' }, { art: 'standard', pegel: 30, text: 'hallo' }] });
  assert.deepEqual(besser, [{ k: 'mikrotest.d_standard_besser', p: { geraet: 'Headset' } }]);
  assert.deepEqual(k(m.diagnose({ erkenner: de, laeufe: [{ art: 'standard', pegel: 0, text: '' }] })), ['mikrotest.d_kein_ton']);
  assert.deepEqual(m.diagnose({ erkenner: de, laeufe: [{ art: 'standard', pegel: 27.6, text: '' }] }), [{ k: 'mikrotest.d_nicht_verstanden', p: { pegel: 28 } }]);
  assert.deepEqual(k(m.diagnose({ sperre: 'desktop', erkenner: de, laeufe: [{ art: 'standard', pegel: 0, text: '' }] })), ['mikrotest.d_sperre', 'mikrotest.d_kein_ton']);
  const ohne = m.diagnose({ erkenner: ['en-US'], sprachcode: 'de', laeufe: [{ art: 'standard', pegel: 0, text: '', fehler: 'KEIN_ERKENNER' }] });
  assert.deepEqual(ohne, [{ k: 'mikrotest.d_kein_erkenner', p: { sprache: 'Deutsch' } }]);
  assert.deepEqual(k(m.diagnose({ erkenner: de, laeufe: [{ art: 'gewaehlt', geraet: 'X', pegel: 0, text: '', fehler: 'Audio-Hilfe: kaputt' }] })), ['mikrotest.d_fehler', 'mikrotest.d_kein_ton']);
  assert.deepEqual(k(m.diagnose({ erkenner: de, laeufe: [{ art: 'standard', pegel: 0, text: '', fehler: 'KEIN_MIKROFON' }] })), ['mikrotest.d_kein_mikrofon'], 'kein interner Fehlercode für den Nutzer');
});

test('Mikrofon-Sperre: liest alle vier Schalter', async () => {
  const gefragt = [];
  const k = await m.pruefen(async (pfad, name) => {
    gefragt.push(name);
    return pfad.endsWith('NonPackaged') ? 'Deny' : 'Allow';
  });
  assert.equal(k, 'desktop');
  assert.equal(gefragt.length, 4);
});
