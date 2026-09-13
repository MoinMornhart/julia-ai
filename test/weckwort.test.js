'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { phrasen } = require('../src/main/weckwort');
const { STANDARD, pruefen } = require('../src/main/config');

test('Aktivierungswort folgt dem eigenen Namen und der Sprache', () => {
  assert.deepEqual(phrasen('Julia', 'de'), ['Hey Julia', 'Hallo Julia', 'Okay Julia']);
  assert.deepEqual(phrasen('Rainer', 'de'), ['Hey Rainer', 'Hallo Rainer', 'Okay Rainer']);
  assert.deepEqual(phrasen('Rainer', 'en'), ['Hey Rainer', 'Hi Rainer', 'OK Rainer']);
});

test('Aktivierungswort: kaputte Namen fallen auf Julia zurück, Sonderzeichen fliegen raus', () => {
  assert.deepEqual(phrasen('', 'de')[0], 'Hey Julia');
  assert.deepEqual(phrasen('Rai{n}er\n', 'de')[0], 'Hey Rainer');
});

test('Aktivierungswort ist standardmäßig aus, Schwelle geprüft', () => {
  assert.deepEqual(STANDARD.weckwort, { an: false, schwelle: 0.8 });
  assert.equal(pruefen('weckwort.an', true), true);
  assert.equal(pruefen('weckwort.schwelle', '0.9'), 0.9);
  assert.throws(() => pruefen('weckwort.schwelle', 0.2), /zwischen 0.5 und 0.95/);
  assert.throws(() => pruefen('weckwort.schwelle', 1), /zwischen 0.5 und 0.95/);
});
