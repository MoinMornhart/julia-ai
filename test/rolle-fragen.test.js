'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WERKZEUGE, definitionen } = require('../src/main/werkzeuge');
const { GRUEN } = require('../src/main/ampel');

const werkzeug = WERKZEUGE.find((w) => w.name === 'rolle_fragen');

function ctxMit({ an = true, rollen = [], unter = async () => 'ANTWORT' } = {}) {
  return {
    agentenAn: () => an,
    config: { get: (k) => (k === 'rollen' ? rollen : undefined) },
    unterAgent: unter,
  };
}

test('rolle_fragen existiert und ist GRÜN (nur Nachdenken, kein PC-Zugriff)', () => {
  assert.ok(werkzeug);
  assert.equal(werkzeug.einstufen().stufe, GRUEN);
});

test('nur angeboten, wenn BETA-Agenten an ist', () => {
  const aus = definitionen(ctxMit({ an: false })).map((w) => w.name);
  const an = definitionen(ctxMit({ an: true })).map((w) => w.name);
  assert.equal(aus.includes('rolle_fragen'), false);
  assert.equal(an.includes('rolle_fragen'), true);
});

test('Fehler, wenn Agenten aus sind', async () => {
  await assert.rejects(() => werkzeug.ausfuehren({ rolle: 'Coder', aufgabe: 'x' }, ctxMit({ an: false })), /aus/i);
});

test('Fehler bei unbekannter Rolle, mit Liste der vorhandenen', async () => {
  const ctx = ctxMit({ rollen: [{ name: 'Coder', anweisung: 'y' }] });
  await assert.rejects(() => werkzeug.ausfuehren({ rolle: 'Gibtsnicht', aufgabe: 'x' }, ctx), /keine Rolle.*Coder/s);
});

test('delegiert an die Rolle (case-insensitiv) und gibt die Antwort zurück', async () => {
  let gefragt = null;
  const unter = async (rolle, aufgabe) => { gefragt = { rolle, aufgabe }; return 'Die Rolle sagt: fertig.'; };
  const ctx = ctxMit({ rollen: [{ name: 'Kritiker', anweisung: 'Sei streng.' }], unter });
  const antwort = await werkzeug.ausfuehren({ rolle: 'kritiker', aufgabe: 'Prüfe X' }, ctx);
  assert.equal(gefragt.rolle.name, 'Kritiker');
  assert.equal(gefragt.aufgabe, 'Prüfe X');
  assert.match(antwort, /Die Rolle sagt: fertig\./);
});
