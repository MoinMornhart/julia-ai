'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { saetzeAbtrennen, fuerSprache, Sprache } = require('../src/main/sprache');

// stumm() muss einen hängengebliebenen Vorleser-Zähler zurücksetzen: sonst gilt
// Julia dauerhaft als „spricht gerade" und Mikro-Hotkey UND Weckwort („Hey
// Julia") gehen nicht mehr (zufällig wirkender Fehler nach abgebrochenem Vorlesen).
test('stumm() räumt einen hängengebliebenen Vorleser-Zähler weg', () => {
  const s = new Sprache({});
  s.vorleserAktiv = 1; // simuliert Vorlesen, dessen fertig() nie lief (Abbruch/Fehler)
  assert.equal(s.sprichtGerade, true);
  let frei = null;
  s.on('lautsprecher', (v) => { frei = v; });
  s.stumm();
  assert.equal(s.vorleserAktiv, 0);
  assert.equal(s.sprichtGerade, false); // Mikro/Weckwort wieder scharfstellbar
  assert.equal(frei, false); // Oberfläche erfährt: Lautsprecher frei
});

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
