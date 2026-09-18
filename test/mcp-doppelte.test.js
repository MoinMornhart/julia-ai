'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ohneDoppelte } = require('../src/main/mcp');

test('entfernt doppelte http-Server nach Adresse, erster bleibt (Issue #86)', () => {
  const liste = [
    { id: 'a', name: 'VibeWorks', art: 'http', url: 'https://vibeworks.app/mcp', an: true },
    { id: 'b', name: 'VibeWorks', art: 'http', url: 'https://vibeworks.app/mcp', an: false },
  ];
  const aus = ohneDoppelte(liste);
  assert.equal(aus.length, 1);
  assert.equal(aus[0].id, 'a'); // erster Treffer bleibt (mit seinem Zustand)
});

test('Adresse case-insensitiv als gleich erkannt', () => {
  const aus = ohneDoppelte([
    { id: 'a', url: 'https://X.example/MCP' },
    { id: 'b', url: 'https://x.example/mcp' },
  ]);
  assert.equal(aus.length, 1);
});

test('stdio-Server werden nach Befehl entdoppelt', () => {
  const aus = ohneDoppelte([
    { id: 'a', befehl: 'npx server' },
    { id: 'b', befehl: 'npx server' },
    { id: 'c', befehl: 'npx anderer' },
  ]);
  assert.equal(aus.length, 2);
});

test('verschiedene Server bleiben alle erhalten, Reihenfolge stabil', () => {
  const liste = [
    { id: 'a', url: 'https://eins/mcp' },
    { id: 'b', url: 'https://zwei/mcp' },
    { id: 'c', befehl: 'npx x' },
  ];
  const aus = ohneDoppelte(liste);
  assert.equal(aus.length, 3);
  assert.deepEqual(aus.map((s) => s.id), ['a', 'b', 'c']);
});

test('robust gegen Unsinn', () => {
  assert.deepEqual(ohneDoppelte(null), []);
  assert.deepEqual(ohneDoppelte([null, 5, { id: 'a', url: 'u' }]).map((s) => s.id), ['a']);
});
