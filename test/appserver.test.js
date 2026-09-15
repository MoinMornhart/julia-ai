'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { AppServer, codeNormal } = require('../src/main/appserver');

function tresor() {
  const daten = {};
  return {
    lesen: (d) => (daten[d] ? { ...daten[d] } : null),
    schreiben: (d, w) => {
      const e = { ...(daten[d] || {}) };
      for (const [k, v] of Object.entries(w)) { if (v === null) delete e[k]; else e[k] = v; }
      daten[d] = e;
    },
  };
}

function anfrage(port, methode, pfad, { token, daten } = {}) {
  return new Promise((ok, nein) => {
    const body = daten === undefined ? null : Buffer.from(JSON.stringify(daten));
    const req = http.request({
      host: '127.0.0.1', port, method: methode, path: pfad,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json', 'content-length': body.length } : {}) },
    }, (res) => {
      const t = [];
      res.on('data', (d) => t.push(d));
      res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(t).toString('utf8')); } catch { /* leer */ } ok({ code: res.statusCode, j }); });
    });
    req.on('error', nein);
    if (body) req.end(body); else req.end();
  });
}

test('AppServer: koppeln per Code, dann Chat nur mit Token; 127.0.0.1 ist erlaubt', async () => {
  const nachrichten = [];
  const s = new AppServer({
    tresor: tresor(),
    beiNachricht: async (text) => { nachrichten.push(text); return `Echo: ${text}`; },
    adressen: () => ['192.168.1.5'],
    unterwegs: () => [],
  });
  await s.starten(0);
  const port = s.port;
  try {
    // Ohne Token kein Chat.
    assert.equal((await anfrage(port, 'POST', '/api/chat', { daten: { text: 'hi' } })).code, 401);

    // Falscher Code wird abgelehnt.
    s.koppelnStarten();
    assert.equal((await anfrage(port, 'POST', '/api/koppeln', { daten: { code: 'FALS-CHXX' } })).code, 401);

    // Richtiger Code (auch mit anderer Schreibweise) liefert ein Token.
    const { code } = s.koppelnStarten();
    const k = await anfrage(port, 'POST', '/api/koppeln', { daten: { code: code.toLowerCase().replace('-', ' ') } });
    assert.equal(k.code, 200, JSON.stringify(k.j));
    assert.match(k.j.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(s.status().gekoppelt, true);

    // Mit Token geht Chat und läuft durch beiNachricht.
    const c = await anfrage(port, 'POST', '/api/chat', { token: k.j.token, daten: { text: 'Hallo PC' } });
    assert.equal(c.code, 200);
    assert.equal(c.j.antwort, 'Echo: Hallo PC');
    assert.deepEqual(nachrichten, ['Hallo PC']);

    // Falsches Token wird abgelehnt.
    assert.equal((await anfrage(port, 'POST', '/api/chat', { token: 'x'.repeat(43), daten: { text: 'hi' } })).code, 401);

    // Trennen macht das Token wertlos.
    s.trennen();
    assert.equal((await anfrage(port, 'POST', '/api/chat', { token: k.j.token, daten: { text: 'hi' } })).code, 401);
  } finally {
    s.stoppen();
  }
});

test('AppServer: codeNormal vereinheitlicht die Schreibweise', () => {
  assert.equal(codeNormal('abcd-1234'), 'ABCD1234');
  assert.equal(codeNormal(' a b c d 1 2 '), 'ABCD12');
});
