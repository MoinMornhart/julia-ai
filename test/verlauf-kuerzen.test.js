'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verlaufKuerzen, istNutzerRunde } = require('../src/main/agent');

// Eine echte Nutzer-Runde inkl. Werkzeug-Kette: Nutzertext → Assistent ruft
// Werkzeug → Werkzeug-Ergebnis → Assistent-Antwort.
function runde(i) {
  return [
    { role: 'user', content: [{ type: 'text', text: `Frage ${i}` }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: `t${i}`, name: 'x', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: 'ok' }] },
    { role: 'assistant', content: [{ type: 'text', text: `Antwort ${i}` }] },
  ];
}
function verlaufMit(n) {
  const v = [];
  for (let i = 0; i < n; i++) v.push(...runde(i));
  return v;
}

test('istNutzerRunde unterscheidet echte Nachricht von Werkzeug-Ergebnis', () => {
  assert.equal(istNutzerRunde({ role: 'user', content: [{ type: 'text', text: 'hi' }] }), true);
  assert.equal(istNutzerRunde({ role: 'user', content: 'hi' }), true);
  assert.equal(istNutzerRunde({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] }), false);
  assert.equal(istNutzerRunde({ role: 'assistant', content: [{ type: 'text', text: 'x' }] }), false);
});

test('kurzer Verlauf wird nicht angetastet', () => {
  const v = verlaufMit(3);
  assert.equal(verlaufKuerzen(v, 40), v); // gleiche Referenz, unverändert
});

test('langer Verlauf wird auf die letzten N Runden gekürzt', () => {
  const v = verlaufMit(10);
  const k = verlaufKuerzen(v, 4);
  // Genau 4 echte Nutzer-Runden bleiben.
  assert.equal(k.filter(istNutzerRunde).length, 4);
  // Beginnt mit einer echten Nutzer-Nachricht (gültiger Verlauf, kein Orphan).
  assert.equal(istNutzerRunde(k[0]), true);
  assert.equal(k[0].content[0].text, 'Frage 6'); // Runden 6..9 bleiben
  // Die neueste Runde ist erhalten.
  assert.equal(k[k.length - 1].content[0].text, 'Antwort 9');
});

test('schneidet nie mitten in einer Werkzeug-Kette (kein verwaistes tool_result am Anfang)', () => {
  const k = verlaufKuerzen(verlaufMit(20), 5);
  const ersteBloecke = Array.isArray(k[0].content) ? k[0].content : [];
  assert.notEqual(ersteBloecke[0] && ersteBloecke[0].type, 'tool_result');
  assert.equal(istNutzerRunde(k[0]), true);
});

test('maxRunden 0 oder ungültige Eingabe: unverändert', () => {
  const v = verlaufMit(3);
  assert.equal(verlaufKuerzen(v, 0), v);
  assert.equal(verlaufKuerzen(null, 5), null);
});
