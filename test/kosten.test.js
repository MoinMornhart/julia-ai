'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Kosten, kostenFuer, preis } = require('../src/main/kosten');
const { pruefen, STANDARD } = require('../src/main/config');

const nah = (a, b) => Math.abs(a - b) < 1e-9;

test('Preise: bekannte Modelle, datierte Varianten, Unbekanntes vorsichtig teuer', () => {
  assert.deepEqual(preis('claude-opus-5'), [5, 25]);
  assert.deepEqual(preis('claude-sonnet-5'), [2, 10]);
  assert.deepEqual(preis('claude-fable-5-1'), [10, 50]);
  assert.deepEqual(preis('claude-fable-5'), [10, 50]);
  assert.deepEqual(preis('claude-haiku-4-5-20251001'), [1, 5]);
  assert.deepEqual(preis('irgendein-modell'), [10, 50]);
});

test('Kosten: Eingabe, Ausgabe, Cache lesen und schreiben, Websuche', () => {
  // Opus 5: 1 Mio. Eingabe = 5 $, 1 Mio. Ausgabe = 25 $
  assert.ok(nah(kostenFuer('claude-opus-5', { input_tokens: 1_000_000 }), 5));
  assert.ok(nah(kostenFuer('claude-opus-5', { output_tokens: 1_000_000 }), 25));
  assert.ok(nah(kostenFuer('claude-opus-5', { cache_read_input_tokens: 1_000_000 }), 0.5));
  assert.ok(nah(kostenFuer('claude-opus-5', { cache_creation_input_tokens: 1_000_000 }), 6.25));
  assert.ok(nah(kostenFuer('claude-opus-5', { server_tool_use: { web_search_requests: 3 } }), 0.03));
  assert.equal(kostenFuer('claude-opus-5', null), 0);
});

test('Tagessumme wächst, ein neuer Tag beginnt bei null', () => {
  let jetzt = new Date(2026, 8, 14, 23, 50).getTime();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-kosten-'));
  const k = new Kosten(dir, { jetzt: () => jetzt });
  k.erfassen('claude-opus-5', { input_tokens: 200_000, output_tokens: 20_000 });
  const h = k.erfassen('claude-opus-5', { input_tokens: 200_000, output_tokens: 20_000 });
  assert.ok(nah(h.usd, 3));
  assert.equal(h.anfragen, 2);
  jetzt += 20 * 60 * 1000;
  assert.equal(k.heute().usd, 0, 'nach Mitternacht');
  const k2 = new Kosten(dir, { jetzt: () => jetzt - 20 * 60 * 1000 });
  assert.ok(nah(k2.heute().usd, 3), 'übersteht einen Neustart');
});

test('Alte Tage werden aufgeräumt', () => {
  let jetzt = new Date(2026, 0, 1, 12).getTime();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-kosten-'));
  const k = new Kosten(dir, { jetzt: () => jetzt });
  for (let i = 0; i < 70; i++) {
    k.erfassen('claude-opus-5', { input_tokens: 10 });
    jetzt += 86400000;
  }
  const tage = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'kosten.json'), 'utf8')).tage);
  assert.equal(tage.length, 62);
});

test('Tageslimit: Standard 10 $, 0 schaltet ab, Grenzen geprüft', () => {
  assert.equal(STANDARD.kosten.tageslimit_usd, 10);
  assert.equal(pruefen('kosten.tageslimit_usd', 0), 0);
  assert.equal(pruefen('kosten.tageslimit_usd', '1.234'), 1.23, 'auf Cent gerundet');
  assert.equal(pruefen('kosten.tageslimit_usd', '7.5'), 7.5);
  assert.throws(() => pruefen('kosten.tageslimit_usd', -1), /zwischen 0 und 1000/);
  assert.throws(() => pruefen('kosten.tageslimit_usd', 5000), /zwischen 0 und 1000/);
});
