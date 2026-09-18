'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TEXTE } = require('../src/shared/texte');

// Diese Texte gehen per IPC (sendSync 'standard-texte') an das sandboxed Preload,
// das damit die Beschriftungen notfalls selbst füllt (Issue #3/#54). Wären sie
// leer, bliebe das Fenster leer – genau der Fehler, der lange gejagt wurde.
test('Standard-Texte sind vorhanden (de und en gefüllt)', () => {
  assert.ok(TEXTE && typeof TEXTE === 'object');
  assert.ok(Object.keys(TEXTE.de || {}).length > 50, 'de-Texte dürfen nicht (fast) leer sein');
  assert.ok(Object.keys(TEXTE.en || {}).length > 50, 'en-Texte dürfen nicht (fast) leer sein');
});

test('Wichtige Beschriftungs-Schlüssel sind da', () => {
  for (const k of ['chat.titel', 'chat.senden', 'nav.chat']) {
    assert.ok(typeof TEXTE.de[k] === 'string' && TEXTE.de[k], `de fehlt: ${k}`);
  }
});
