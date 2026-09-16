'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WERKZEUGE } = require('../src/main/werkzeuge');
const { GRUEN } = require('../src/main/ampel');

const werkzeug = WERKZEUGE.find((w) => w.name === 'geheimnis_anfordern');

test('geheimnis_anfordern gibt es und ist GRÜN (die Box selbst ist die Entscheidung)', () => {
  assert.ok(werkzeug, 'Werkzeug vorhanden');
  assert.equal(werkzeug.einstufen({ name: 'GitHub Token' }).stufe, GRUEN);
});

test('die KI bekommt nur eine Bestätigung, NIE den Wert', async () => {
  let gefragt = null;
  const ctx = {
    // Simuliert die Box: der Nutzer tippt „supergeheim123" – aber der Wert wird
    // hier verarbeitet, nicht an die KI zurückgegeben.
    geheimnisAnfordern: async (name, zweck) => { gefragt = { name, zweck }; return { ok: true, name }; },
  };
  const antwort = await werkzeug.ausfuehren({ name: 'GitHub Token', zweck: 'für die Repo-Suche' }, ctx);
  assert.deepEqual(gefragt, { name: 'GitHub Token', zweck: 'für die Repo-Suche' });
  assert.match(antwort, /hinterlegt/);
  assert.doesNotMatch(antwort, /supergeheim/); // der Wert taucht nie auf
  assert.doesNotMatch(antwort, /Wert:/);
});

test('Abbruch wird als „kein Wert" gemeldet', async () => {
  const ctx = { geheimnisAnfordern: async () => ({ ok: false }) };
  const antwort = await werkzeug.ausfuehren({ name: 'GitHub Token' }, ctx);
  assert.match(antwort, /abgebrochen|Kein Wert/i);
});

test('ohne Bezeichnung wird nicht nach einem Wert gefragt', async () => {
  let gefragt = false;
  const ctx = { geheimnisAnfordern: async () => { gefragt = true; return { ok: true }; } };
  await assert.rejects(() => werkzeug.ausfuehren({ name: '   ' }, ctx), /Bezeichnung/);
  assert.equal(gefragt, false);
});
