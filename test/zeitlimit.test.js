'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mitZeitlimit } = require('../src/renderer/zeitlimit');

test('löst mit dem Wert auf, wenn rechtzeitig geantwortet wird', async () => {
  const wert = await mitZeitlimit(Promise.resolve('da'), 1000, 'Test');
  assert.equal(wert, 'da');
});

test('lehnt mit klarer Meldung ab, wenn das Zeitlimit abläuft', async () => {
  const nieFertig = new Promise(() => {}); // antwortet nie – wie ein hängender IPC
  await assert.rejects(
    () => mitZeitlimit(nieFertig, 20, 'Texte'),
    (e) => /Zeitüberschreitung beim Laden \(Texte\)/.test(e.message),
  );
});

test('reicht eine echte Ablehnung durch (kein Verschlucken)', async () => {
  await assert.rejects(
    () => mitZeitlimit(Promise.reject(new Error('kaputt')), 1000, 'Status'),
    /kaputt/,
  );
});

test('räumt den Wecker auf, sodass der Test nicht hängen bleibt', async () => {
  // Wäre der Timer (5 s) nicht aufgeräumt, hinge der Testlauf – dass er sofort
  // durchläuft, belegt das clearTimeout im finally.
  const wert = await mitZeitlimit(Promise.resolve(42), 5000, 'Test');
  assert.equal(wert, 42);
});
