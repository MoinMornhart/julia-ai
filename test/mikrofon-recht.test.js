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

test('Mikrofon-Sperre: liest alle vier Schalter', async () => {
  const gefragt = [];
  const k = await m.pruefen(async (pfad, name) => {
    gefragt.push(name);
    return pfad.endsWith('NonPackaged') ? 'Deny' : 'Allow';
  });
  assert.equal(k, 'desktop');
  assert.equal(gefragt.length, 4);
});
