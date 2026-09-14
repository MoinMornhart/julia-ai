'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { saetzeAbtrennen, fuerSprache } = require('../src/main/sprache');

// Julia liest satzweise vor, während die Antwort noch entsteht.

test('Vorlesen: fertige Sätze früh abtrennen, den Rest behalten', () => {
  const r = saetzeAbtrennen('Hallo Morni! Ich schaue gleich nach. Dein PC hat', 10);
  assert.deepEqual(r.saetze, ['Hallo Morni!', 'Ich schaue gleich nach.']);
  assert.equal(r.rest, ' Dein PC hat');
});

test('Vorlesen: kurze Sätze werden gebündelt, Abkürzungen und Zahlen trennen nicht', () => {
  assert.deepEqual(saetzeAbtrennen('Ja. Gut. Das ist ein längerer Satz hier. Und', 20).saetze, ['Ja. Gut. Das ist ein längerer Satz hier.']);
  assert.deepEqual(saetzeAbtrennen('Das geht z. B. mit PowerShell. Weiter', 5).saetze, ['Das geht z. B. mit PowerShell.']);
  assert.deepEqual(saetzeAbtrennen('Die Datei hat 3.5 GB und mehr', 5).saetze, [], 'kein Satzende in 3.5');
});

test('Vorlesen: Code-Blöcke bleiben zusammen – offene warten auf ihr Ende', () => {
  const r = saetzeAbtrennen('Mach das so:\n```js\nconst a = 1;\nconst b = 2;\n```\nFertig. Und', 5);
  assert.equal(r.saetze[0], 'Mach das so:');
  assert.match(r.saetze[1], /^```js[\s\S]*```$/);
  assert.equal(fuerSprache(r.saetze[1]), '(Code steht im Chat)');
  assert.equal(r.saetze[2], 'Fertig.');
  const offen = saetzeAbtrennen('Hier:\n```js\nconst a = 1;\n', 3);
  assert.deepEqual(offen.saetze, ['Hier:']);
  assert.equal(offen.rest, '```js\nconst a = 1;\n');
});
