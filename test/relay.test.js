'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const WS = require('ws');
const { relayErstellen, einrichtungsLink } = require('../relay/server');
const wa = require('../relay/webauthn');
const { RelayKlient, adressePruefen } = require('../src/main/relay');
const { HandyServer } = require('../src/main/handy/server');

// Von vorn bis hinten: Relay-Server, Passkey anlegen, Julia koppelt sich per
// Code, die Handy-Seite läuft über das Relay bis zu Julias Handy-Server.

const DOMAIN = 'relay.test';
const ORIGIN = `https://${DOMAIN}`;
const sha = (b) => crypto.createHash('sha256').update(b).digest();

// Kleiner CBOR-Schreiber und ein nachgebauter Passkey.
function cbor(x) {
  const kopf = (art, n) => (n < 24 ? Buffer.from([(art << 5) | n]) : n < 256 ? Buffer.from([(art << 5) | 24, n]) : Buffer.from([(art << 5) | 25, n >> 8, n & 255]));
  if (Buffer.isBuffer(x)) return Buffer.concat([kopf(2, x.length), x]);
  if (typeof x === 'string') return Buffer.concat([kopf(3, Buffer.byteLength(x)), Buffer.from(x)]);
  if (typeof x === 'number') return x >= 0 ? kopf(0, x) : kopf(1, -1 - x);
  return Buffer.concat([kopf(5, x.size), ...[...x].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
}

function passkey() {
  const paar = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = paar.publicKey.export({ format: 'jwk' });
  const kennung = crypto.randomBytes(16);
  const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  const auth = (mitSchluessel) => {
    const k = Buffer.alloc(37);
    sha(DOMAIN).copy(k);
    k[32] = 0x05 | (mitSchluessel ? 0x40 : 0);
    if (!mitSchluessel) return k;
    return Buffer.concat([k, Buffer.alloc(16), Buffer.from([0, kennung.length]), kennung, cbor(cose)]);
  };
  const cd = (typ, challenge) => Buffer.from(JSON.stringify({ type: typ, challenge, origin: ORIGIN }));
  return {
    erstellen: (challenge) => ({
      id: wa.b64u(kennung),
      clientDataJSON: wa.b64u(cd('webauthn.create', challenge)),
      attestationObject: wa.b64u(cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', auth(true)]]))),
    }),
    anmelden: (challenge) => {
      const ad = auth(false);
      const c = cd('webauthn.get', challenge);
      return { id: wa.b64u(kennung), clientDataJSON: wa.b64u(c), authenticatorData: wa.b64u(ad), signature: wa.b64u(crypto.sign('sha256', Buffer.concat([ad, sha(c)]), paar.privateKey)) };
    },
  };
}

function anfrage(port, methode, pfad, { daten, cookie } = {}) {
  return new Promise((ok, nein) => {
    const body = daten === undefined ? null : Buffer.from(JSON.stringify(daten));
    const req = http.request({
      host: '127.0.0.1', port, method: methode, path: pfad,
      headers: {
        Host: DOMAIN, Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}),
      },
    }, (res) => {
      const teile = [];
      res.on('data', (d) => teile.push(d));
      res.on('end', () => {
        const text = Buffer.concat(teile).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* HTML */ }
        ok({ code: res.statusCode, kopf: res.headers, text, json });
      });
    });
    req.on('error', nein);
    if (body) req.end(body);
    else req.end();
  });
}

const warten = (bedingung, ms = 5000) => new Promise((ok, nein) => {
  const bis = Date.now() + ms;
  const t = setInterval(() => {
    if (bedingung()) { clearInterval(t); ok(); } else if (Date.now() > bis) { clearInterval(t); nein(new Error('Zeitüberschreitung')); }
  }, 20);
});

test('Relay: Adresse wird geprüft', () => {
  assert.equal(adressePruefen('https://Julia.Example.org/'), 'julia.example.org');
  assert.equal(adressePruefen(''), '');
  assert.throws(() => adressePruefen('nicht gültig'), /gültige Adresse/);
  assert.throws(() => adressePruefen('localhost'), /gültige Adresse/);
});

test('Relay: Passkey, Kopplung per Code und Handy-Seite bis zu Julia', async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-relay-'));
  const { server } = relayErstellen({ domain: DOMAIN, ordner });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;

  const tresorDaten = {};
  const tresor = { lesen: (k) => tresorDaten[k], schreiben: (k, v) => { tresorDaten[k] = { ...(tresorDaten[k] || {}), ...v }; } };
  const nachrichten = [];
  const handy = new HandyServer({
    tresor,
    texte: () => ({ sprachcode: 'de', name: 'Julia', akzent: '#FF7A1A', texte: {} }),
    beiNachricht: async (text) => { nachrichten.push(text); return { ok: true }; },
  });
  // Mit der Domain im Host-Kopf, wie hinter Caddy.
  class MitHost extends WS { constructor(u) { super(u, { headers: { Host: DOMAIN } }); } }
  const klient = new RelayKlient({ tresor, handy, name: 'Spiele-PC', WebSocketKlasse: MitHost, url: () => `ws://127.0.0.1:${port}/_relay/tunnel`, pause: () => 30 });

  try {
    // Ohne Anmeldung kommt niemand an Julia.
    assert.equal((await anfrage(port, 'GET', '/api/stand')).code, 401);
    assert.equal((await anfrage(port, 'GET', '/')).kopf.location, '/_relay/');

    // Ersten Passkey mit dem Einrichtungslink anlegen.
    const token = einrichtungsLink({ domain: DOMAIN, ordner }).split('#einrichten=')[1];
    const pk = passkey();
    assert.equal((await anfrage(port, 'POST', '/_relay/api/passkey/beginn', { daten: {} })).code, 403, 'ohne Link kein Passkey');
    const beginn = await anfrage(port, 'POST', '/_relay/api/passkey/beginn', { daten: { token } });
    assert.equal(beginn.code, 200);
    const fertig = await anfrage(port, 'POST', '/_relay/api/passkey/fertig', { daten: { token, antwort: pk.erstellen(beginn.json.challenge), name: 'Handy' } });
    assert.equal(fertig.code, 200, fertig.text);
    const cookie = String(fertig.kopf['set-cookie']).split(';')[0];
    assert.match(String(fertig.kopf['set-cookie']), /HttpOnly; SameSite=Strict/);
    assert.equal((await anfrage(port, 'POST', '/_relay/api/passkey/beginn', { daten: { token } })).code, 403, 'der Link gilt nur einmal');

    // Anmelden mit dem Passkey.
    const a1 = await anfrage(port, 'POST', '/_relay/api/anmelden/beginn', { daten: {} });
    const a2 = await anfrage(port, 'POST', '/_relay/api/anmelden/fertig', { daten: { antwort: pk.anmelden(a1.json.challenge) } });
    assert.equal(a2.code, 200, a2.text);

    // Julia zeigt einen Code, du gibst ihn am Relay ein.
    klient.anwenden({ an: true, adresse: DOMAIN });
    assert.equal(klient.status().zustand, 'nicht_gekoppelt');
    const { code } = klient.koppelnStarten();
    await warten(() => klient.status().zustand === 'wartet');
    assert.equal((await anfrage(port, 'POST', '/_relay/api/pc/koppeln', { cookie, daten: { code: 'AAAA-AAAA-AAAA' } })).code, 400, 'falscher Code');
    const k = await anfrage(port, 'POST', '/_relay/api/pc/koppeln', { cookie, daten: { code: code.toLowerCase().replace(/-/g, ' ') } });
    assert.equal(k.code, 200, k.text);
    assert.equal(k.json.name, 'Spiele-PC');
    await warten(() => klient.status().zustand === 'verbunden' && klient.status().gekoppelt);
    assert.match(tresorDaten.relay.token, /^[A-Za-z0-9_-]{43}$/, 'Schlüssel liegt im Tresor');

    // Die Handy-Seite über das Relay.
    const seite = await anfrage(port, 'GET', '/', { cookie });
    assert.equal(seite.code, 200);
    assert.match(seite.kopf['content-type'], /text\/html/);
    assert.match(seite.kopf['content-security-policy'], /default-src 'none'/);
    const texte = await anfrage(port, 'GET', '/api/texte', { cookie });
    assert.equal(texte.json.relay, true);
    const senden = await anfrage(port, 'POST', '/api/senden', { cookie, daten: { text: 'Hallo über Proxmox' } });
    assert.equal(senden.code, 200, senden.text);
    assert.deepEqual(nachrichten, ['Hallo über Proxmox']);
    assert.equal((await anfrage(port, 'POST', '/api/koppeln', { cookie, daten: { code: 'x' } })).code, 404, 'Koppeln geht nicht über das Relay');
    assert.equal((await anfrage(port, 'GET', '/api/geheim', { cookie })).code, 404, 'nur die Adressen der Handy-Seite');

    // Am Relay getrennt: Julia merkt es und wirft ihren Schlüssel weg.
    assert.equal((await anfrage(port, 'POST', '/_relay/api/pc/trennen', { cookie, daten: {} })).code, 200);
    await warten(() => klient.status().zustand === 'nicht_gekoppelt');
    assert.equal(klient.status().gekoppelt, false);
    assert.equal((await anfrage(port, 'GET', '/api/stand', { cookie })).code, 503, 'PC nicht verbunden');
  } finally {
    klient.anwenden({ an: false });
    server.close();
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});
