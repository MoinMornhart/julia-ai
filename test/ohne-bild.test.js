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

// Mehrere Screenshot-Runden hintereinander, jede mit eigenem Bild.
function verlaufMitVielenBildern(anzahl) {
  const v = [];
  for (let i = 0; i < anzahl; i++) {
    v.push({ role: 'assistant', content: [{ type: 'tool_use', id: `t${i}`, name: 'screenshot', input: {} }] });
    v.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: [
      { type: 'text', text: `Monitor ${i}` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: `BILD${i}` } },
    ] }] });
  }
  return v;
}

test('nur die letzten N Screenshots werden mitgeschickt (Token sparen, Issue #16)', () => {
  const out = verlaufUmwandeln('sys', verlaufMitVielenBildern(6), { bildBehalten: 2 });
  const txt = JSON.stringify(out);
  // Genau 2 Bilder sind als image_url enthalten.
  assert.equal((txt.match(/"type":"image_url"/g) || []).length, 2);
  // Die neuesten Bilder (BILD4, BILD5) sind dabei, die alten (BILD0) nicht.
  assert.equal(txt.includes('BILD5'), true);
  assert.equal(txt.includes('BILD4'), true);
  assert.equal(txt.includes('BILD0'), false);
  // Die Werkzeug-Ergebnisse (Text) bleiben aber alle erhalten – Tool-Paarung intakt.
  assert.equal(txt.includes('Monitor 0'), true);
  assert.equal((txt.match(/"role":"tool"/g) || []).length, 6);
});

test('bildBehalten=0 behält alle Bilder', () => {
  const out = verlaufUmwandeln('sys', verlaufMitVielenBildern(4), { bildBehalten: 0 });
  assert.equal((JSON.stringify(out).match(/"type":"image_url"/g) || []).length, 4);
});

test('direkte Screenshots (image-Blöcke) werden ebenfalls begrenzt', () => {
  const v = [];
  for (let i = 0; i < 4; i++) {
    v.push({ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: `DIR${i}` } }] });
  }
  const out = verlaufUmwandeln('sys', v, { bildBehalten: 1 });
  const txt = JSON.stringify(out);
  assert.equal((txt.match(/"type":"image_url"/g) || []).length, 1);
  assert.equal(txt.includes('DIR3'), true);
  assert.match(txt, /älterer Screenshot entfernt/);
});

test('fehlerAus erkennt Vision-Fehler und setzt bildFehler', () => {
  const e = fehlerAus(400, JSON.stringify({ error: { message: "Vision is disabled for model 'mimo-v2.5'." } }));
  assert.equal(e.bildFehler, true);
});
