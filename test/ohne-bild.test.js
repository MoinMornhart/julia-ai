'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verlaufUmwandeln, fehlerAus } = require('../src/main/anbieter/openai');

// Ein Verlauf mit einem Screenshot-Ergebnis (Werkzeug-Ergebnis mit Bild).
function verlaufMitBild() {
  return [
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'screenshot', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [
      { type: 'text', text: 'Monitor 0' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
    ] }] },
  ];
}

test('normal: das Bild wird als image_url mitgeschickt', () => {
  const out = verlaufUmwandeln('sys', verlaufMitBild(), {});
  const hatBild = JSON.stringify(out).includes('image_url');
  assert.equal(hatBild, true);
});

test('ohneBild: kein image_url, stattdessen ein Hinweis', () => {
  const out = verlaufUmwandeln('sys', verlaufMitBild(), { ohneBild: true });
  const txt = JSON.stringify(out);
  assert.equal(txt.includes('image_url'), false);
  assert.match(txt, /screenshot omitted/);
});

test('ohneBild lässt reine Textnachrichten unangetastet', () => {
  const out = verlaufUmwandeln('sys', [{ role: 'user', content: 'Hallo' }], { ohneBild: true });
  assert.equal(out[out.length - 1].content, 'Hallo');
});

test('fehlerAus erkennt Vision-Fehler und setzt bildFehler', () => {
  const e = fehlerAus(400, JSON.stringify({ error: { message: "Vision is disabled for model 'mimo-v2.5'." } }));
  assert.equal(e.bildFehler, true);
});
