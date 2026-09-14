'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const w = require('../relay/webauthn');

// Ein nachgebauter Authenticator (Passkey) für die Tests.
function cbor(x) {
  const kopf = (art, n) => {
    if (n < 24) return Buffer.from([(art << 5) | n]);
    if (n < 256) return Buffer.from([(art << 5) | 24, n]);
    if (n < 65536) { const b = Buffer.alloc(3); b[0] = (art << 5) | 25; b.writeUInt16BE(n, 1); return b; }
    const b = Buffer.alloc(5); b[0] = (art << 5) | 26; b.writeUInt32BE(n, 1); return b;
  };
  if (Buffer.isBuffer(x)) return Buffer.concat([kopf(2, x.length), x]);
  if (typeof x === 'string') { const b = Buffer.from(x); return Buffer.concat([kopf(3, b.length), b]); }
  if (typeof x === 'number') return x >= 0 ? kopf(0, x) : kopf(1, -1 - x);
  if (x instanceof Map) return Buffer.concat([kopf(5, x.size), ...[...x].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
  throw new Error('nicht unterstützt');
}

const RP = 'relay.example.org';
const ORIGIN = `https://${RP}`;
const sha = (b) => crypto.createHash('sha256').update(b).digest();

function authenticator({ art = 'ec' } = {}) {
  const paar = art === 'ed' ? crypto.generateKeyPairSync('ed25519') : crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = paar.publicKey.export({ format: 'jwk' });
  const cose = art === 'ed'
    ? new Map([[1, 1], [3, -8], [-1, 6], [-2, Buffer.from(jwk.x, 'base64url')]])
    : new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  const kennung = crypto.randomBytes(16);
  let zaehler = 0;
  const auth = ({ flags = 0x05, rp = RP, mitSchluessel = false, z = zaehler }) => {
    const kopf = Buffer.alloc(37);
    sha(rp).copy(kopf, 0);
    kopf[32] = flags | (mitSchluessel ? 0x40 : 0);
    kopf.writeUInt32BE(z, 33);
    if (!mitSchluessel) return kopf;
    const laenge = Buffer.alloc(2);
    laenge.writeUInt16BE(kennung.length);
    return Buffer.concat([kopf, Buffer.alloc(16), laenge, kennung, cbor(cose)]);
  };
  const cd = (typ, challenge, origin = ORIGIN) => Buffer.from(JSON.stringify({ type: typ, challenge, origin, crossOrigin: false }));
  return {
    zaehlen(n) { zaehler = n; },
    erstellen({ challenge, origin, flags, rp } = {}) {
      const att = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', auth({ flags, rp, mitSchluessel: true })]]));
      return { id: w.b64u(kennung), clientDataJSON: w.b64u(cd('webauthn.create', challenge, origin)), attestationObject: w.b64u(att) };
    },
    anmelden({ challenge, origin, flags, rp, faelschen = false } = {}) {
      const ad = auth({ flags, rp });
      const c = cd('webauthn.get', challenge, origin);
      const daten = Buffer.concat([ad, sha(c)]);
      let sig = art === 'ed' ? crypto.sign(null, daten, paar.privateKey) : crypto.sign('sha256', daten, paar.privateKey);
      if (faelschen) sig = Buffer.from(sig.map((x, i) => (i === 10 ? x ^ 1 : x)));
      return { id: w.b64u(kennung), clientDataJSON: w.b64u(c), authenticatorData: w.b64u(ad), signature: w.b64u(sig) };
    },
  };
}

const ch = () => crypto.randomBytes(32).toString('base64url');

test('WebAuthn: Passkey anlegen und damit anmelden (ES256 und Ed25519)', () => {
  for (const art of ['ec', 'ed']) {
    const a = authenticator({ art });
    const c1 = ch();
    const pk = w.registrierungPruefen({ antwort: a.erstellen({ challenge: c1 }), challenge: c1, origin: ORIGIN, rpId: RP });
    assert.equal(pk.alg, art === 'ed' ? -8 : -7);
    assert.match(pk.pem, /BEGIN PUBLIC KEY/);
    const c2 = ch();
    assert.deepEqual(w.anmeldungPruefen({ antwort: a.anmelden({ challenge: c2 }), challenge: c2, origin: ORIGIN, rpId: RP, passkey: pk }), { zaehler: 0 });
  }
});

test('WebAuthn: falsche Herkunft, fremde Challenge oder andere Adresse werden abgelehnt', () => {
  const a = authenticator();
  const c = ch();
  assert.throws(() => w.registrierungPruefen({ antwort: a.erstellen({ challenge: c, origin: 'https://boese.example' }), challenge: c, origin: ORIGIN, rpId: RP }), /Herkunft/);
  assert.throws(() => w.registrierungPruefen({ antwort: a.erstellen({ challenge: ch() }), challenge: c, origin: ORIGIN, rpId: RP }), /abgelaufen/);
  assert.throws(() => w.registrierungPruefen({ antwort: a.erstellen({ challenge: c, rp: 'boese.example' }), challenge: c, origin: ORIGIN, rpId: RP }), /anderen Adresse/);
});

test('WebAuthn: ohne PIN oder Biometrie keine Anmeldung', () => {
  const a = authenticator();
  const c = ch();
  assert.throws(() => w.registrierungPruefen({ antwort: a.erstellen({ challenge: c, flags: 0x01 }), challenge: c, origin: ORIGIN, rpId: RP }), /PIN/);
  const pk = w.registrierungPruefen({ antwort: a.erstellen({ challenge: c }), challenge: c, origin: ORIGIN, rpId: RP });
  const c2 = ch();
  assert.throws(() => w.anmeldungPruefen({ antwort: a.anmelden({ challenge: c2, flags: 0x01 }), challenge: c2, origin: ORIGIN, rpId: RP, passkey: pk }), /PIN/);
});

test('WebAuthn: gefälschte Signatur, fremder Schlüssel und zurückgedrehter Zähler scheitern', () => {
  const a = authenticator();
  const c = ch();
  const pk = w.registrierungPruefen({ antwort: a.erstellen({ challenge: c }), challenge: c, origin: ORIGIN, rpId: RP });
  const c2 = ch();
  assert.throws(() => w.anmeldungPruefen({ antwort: a.anmelden({ challenge: c2, faelschen: true }), challenge: c2, origin: ORIGIN, rpId: RP, passkey: pk }), /Signatur/);
  const fremd = authenticator();
  assert.throws(() => w.anmeldungPruefen({ antwort: fremd.anmelden({ challenge: c2 }), challenge: c2, origin: ORIGIN, rpId: RP, passkey: pk }), /Signatur/);

  a.zaehlen(5);
  const mitZaehler = { ...pk, zaehler: 0 };
  const r = w.anmeldungPruefen({ antwort: a.anmelden({ challenge: c2 }), challenge: c2, origin: ORIGIN, rpId: RP, passkey: mitZaehler });
  assert.equal(r.zaehler, 5);
  a.zaehlen(3);
  assert.throws(() => w.anmeldungPruefen({ antwort: a.anmelden({ challenge: c2 }), challenge: c2, origin: ORIGIN, rpId: RP, passkey: { ...pk, zaehler: 5 } }), /Zähler/);
});

test('WebAuthn: kaputte Eingaben führen zu Fehlern, nie zum Absturz', () => {
  const c = ch();
  for (const antwort of [null, {}, { clientDataJSON: '!!', attestationObject: 'x' }, { id: 'a', clientDataJSON: w.b64u(Buffer.from('{}')), attestationObject: w.b64u(Buffer.from([0xbf])) }]) {
    assert.throws(() => w.registrierungPruefen({ antwort, challenge: c, origin: ORIGIN, rpId: RP }));
  }
  assert.throws(() => w.cborLesen(Buffer.from([0x5a, 0xff, 0xff, 0xff, 0xff])), /zu kurz/);
  assert.throws(() => w.cborLesen(Buffer.from([0x9f])), /unbestimmte/);
  let tief = Buffer.from([0x01]);
  for (let i = 0; i < 20; i++) tief = Buffer.concat([Buffer.from([0x81]), tief]);
  assert.throws(() => w.cborLesen(tief), /tief/);
});
