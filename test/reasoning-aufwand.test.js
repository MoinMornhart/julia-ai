'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runde, fehlerAus } = require('../src/main/anbieter/openai');

// Eine einfache, nicht gestreamte JSON-Antwort nachbauen und den gesendeten
// Body mitschneiden, damit wir prüfen können, was an den Anbieter geht.
function holenMit(erfasst) {
  return async (url, opts) => {
    erfasst.body = JSON.parse(opts.body);
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ model: 'm', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    };
  };
}

test('Denkaufwand wird als reasoning_effort mitgeschickt (Issue #79)', async () => {
  const erfasst = {};
  await runde({ url: 'http://x', modell: 'm', system: 's', verlauf: [], optionen: { aufwand: 'medium' }, holen: holenMit(erfasst) });
  assert.equal(erfasst.body.reasoning_effort, 'medium');
});

test('xhigh/max werden auf high abgebildet (OpenAI kennt sie nicht)', async () => {
  const erfasst = {};
  await runde({ url: 'http://x', modell: 'm', system: 's', verlauf: [], optionen: { aufwand: 'max' }, holen: holenMit(erfasst) });
  assert.equal(erfasst.body.reasoning_effort, 'high');
});

test('ohne Denkaufwand geht kein reasoning_effort mit', async () => {
  const erfasst = {};
  await runde({ url: 'http://x', modell: 'm', system: 's', verlauf: [], optionen: {}, holen: holenMit(erfasst) });
  assert.equal('reasoning_effort' in erfasst.body, false);
});

test('fehlerAus markiert reasoningFehler bei abgelehntem Parameter', () => {
  const e = fehlerAus(400, JSON.stringify({ error: { message: "Unknown parameter: 'reasoning_effort'." } }));
  assert.equal(e.reasoningFehler, true);
});

test('fehlerAus setzt reasoningFehler NICHT bei einem Vision-Fehler', () => {
  const e = fehlerAus(400, JSON.stringify({ error: { message: "Vision is disabled for model 'x'." } }));
  assert.equal(e.reasoningFehler, false);
  assert.equal(e.bildFehler, true);
});
