'use strict';

const crypto = require('crypto');

// Passkeys (WebAuthn) prüfen – ohne fremde Bibliotheken, nur mit Node-Krypto.
// Unterstützt ES256, EdDSA (Ed25519) und RS256. Eine Hersteller-Bescheinigung
// wird nicht ausgewertet (wie bei Passkeys üblich): Wir merken uns nur den
// öffentlichen Schlüssel. Die Nutzerprüfung (PIN, Fingerabdruck, Gesicht) ist Pflicht.

const b64u = (b) => Buffer.from(b).toString('base64url');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

function vonB64u(s, was = 'Wert') {
  if (typeof s !== 'string' || !s || s.length > 16384 || !/^[A-Za-z0-9_-]+={0,2}$/.test(s)) throw new Error(`${was} ist kein base64url.`);
  return Buffer.from(s, 'base64url');
}

function gleich(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Kleiner CBOR-Leser: genug für attestationObject und COSE-Schlüssel.
function cborLesen(buf, start = 0, tiefe = 0) {
  if (tiefe > 8) throw new Error('CBOR zu tief verschachtelt.');
  let pos = start;
  if (pos >= buf.length) throw new Error('CBOR zu kurz.');
  const erstes = buf[pos++];
  const art = erstes >> 5;
  const info = erstes & 31;
  const zahl = () => {
    if (info < 24) return info;
    if (info === 24) { const v = buf.readUInt8(pos); pos += 1; return v; }
    if (info === 25) { const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (info === 26) { const v = buf.readUInt32BE(pos); pos += 4; return v; }
    if (info === 27) {
      const v = buf.readBigUInt64BE(pos);
      pos += 8;
      if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CBOR-Zahl zu groß.');
      return Number(v);
    }
    throw new Error('CBOR: unbestimmte Längen werden nicht unterstützt.');
  };
  const stueck = (n) => {
    if (pos + n > buf.length) throw new Error('CBOR zu kurz.');
    const b = buf.subarray(pos, pos + n);
    pos += n;
    return b;
  };
  switch (art) {
    case 0: return { wert: zahl(), pos };
    case 1: { const n = zahl(); return { wert: -1 - n, pos }; }
    case 2: { const n = zahl(); return { wert: Buffer.from(stueck(n)), pos }; }
    case 3: { const n = zahl(); return { wert: stueck(n).toString('utf8'), pos }; }
    case 4: {
      const n = zahl();
      if (n > 256) throw new Error('CBOR-Liste zu lang.');
      const liste = [];
      for (let i = 0; i < n; i++) {
        const r = cborLesen(buf, pos, tiefe + 1);
        liste.push(r.wert);
        pos = r.pos;
      }
      return { wert: liste, pos };
    }
    case 5: {
      const n = zahl();
      if (n > 256) throw new Error('CBOR-Tabelle zu lang.');
      const m = new Map();
      for (let i = 0; i < n; i++) {
        const k = cborLesen(buf, pos, tiefe + 1);
        const v = cborLesen(buf, k.pos, tiefe + 1);
        m.set(k.wert, v.wert);
        pos = v.pos;
      }
      return { wert: m, pos };
    }
    case 7:
      if (info === 20) return { wert: false, pos };
      if (info === 21) return { wert: true, pos };
      if (info === 22) return { wert: null, pos };
      throw new Error('CBOR-Wert wird nicht unterstützt.');
    default:
      throw new Error('CBOR-Typ wird nicht unterstützt.');
  }
}

// authenticatorData: rpIdHash (32) · Flags (1) · Zähler (4) · [Schlüsseldaten]
function authDaten(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 37) throw new Error('authenticatorData zu kurz.');
  const flags = buf[32];
  const a = { rpIdHash: buf.subarray(0, 32), up: !!(flags & 0x01), uv: !!(flags & 0x04), at: !!(flags & 0x40), zaehler: buf.readUInt32BE(33) };
  if (a.at) {
    if (buf.length < 55) throw new Error('authenticatorData zu kurz.');
    const idLaenge = buf.readUInt16BE(53);
    if (idLaenge < 1 || idLaenge > 1023 || 55 + idLaenge > buf.length) throw new Error('Kennung des Passkeys ungültig.');
    a.kennung = buf.subarray(55, 55 + idLaenge);
    a.cose = cborLesen(buf, 55 + idLaenge).wert;
  }
  return a;
}

// COSE-Schlüssel → öffentlicher Schlüssel (PEM) samt Verfahren.
function coseSchluessel(cose) {
  if (!(cose instanceof Map)) throw new Error('Öffentlicher Schlüssel fehlt.');
  const kty = cose.get(1);
  const alg = cose.get(3);
  const bytes = (k, laenge) => {
    const b = cose.get(k);
    if (!Buffer.isBuffer(b) || (laenge && b.length !== laenge)) throw new Error('Öffentlicher Schlüssel ungültig.');
    return b64u(b);
  };
  let jwk;
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) jwk = { kty: 'EC', crv: 'P-256', x: bytes(-2, 32), y: bytes(-3, 32) };
  else if (kty === 1 && alg === -8 && cose.get(-1) === 6) jwk = { kty: 'OKP', crv: 'Ed25519', x: bytes(-2, 32) };
  else if (kty === 3 && alg === -257) jwk = { kty: 'RSA', n: bytes(-1), e: bytes(-2) };
  else throw new Error('Dieses Schlüsselverfahren wird nicht unterstützt.');
  let schluessel;
  try { schluessel = crypto.createPublicKey({ key: jwk, format: 'jwk' }); } catch { throw new Error('Öffentlicher Schlüssel ungültig.'); }
  if (jwk.kty === 'RSA' && schluessel.asymmetricKeyDetails.modulusLength < 2048) throw new Error('RSA-Schlüssel zu kurz.');
  return { alg, pem: schluessel.export({ type: 'spki', format: 'pem' }) };
}

function clientDataPruefen(roh, { typ, challenge, origin }) {
  let c;
  try { c = JSON.parse(roh.toString('utf8')); } catch { throw new Error('clientDataJSON ist kaputt.'); }
  if (!c || c.type !== typ) throw new Error('Falscher Vorgang.');
  if (typeof c.challenge !== 'string' || !gleich(c.challenge, challenge)) throw new Error('Die Anfrage ist abgelaufen oder gehört nicht hierher.');
  if (c.origin !== origin) throw new Error('Falsche Herkunft.');
  if (c.crossOrigin === true) throw new Error('Falsche Herkunft.');
}

function flagsPruefen(a, rpId) {
  if (!gleich(a.rpIdHash.toString('hex'), sha256(rpId).toString('hex'))) throw new Error('Der Passkey gehört zu einer anderen Adresse.');
  if (!a.up) throw new Error('Keine Bestätigung am Gerät.');
  if (!a.uv) throw new Error('Ohne PIN, Fingerabdruck oder Gesicht geht es nicht.');
}

// Neuer Passkey. antwort: { id, clientDataJSON, attestationObject } (base64url)
function registrierungPruefen({ antwort, challenge, origin, rpId }) {
  if (!antwort || typeof antwort !== 'object') throw new Error('Antwort fehlt.');
  clientDataPruefen(vonB64u(antwort.clientDataJSON, 'clientDataJSON'), { typ: 'webauthn.create', challenge, origin });
  const att = cborLesen(vonB64u(antwort.attestationObject, 'attestationObject')).wert;
  if (!(att instanceof Map) || typeof att.get('fmt') !== 'string' || !Buffer.isBuffer(att.get('authData'))) throw new Error('attestationObject ist ungültig.');
  const a = authDaten(att.get('authData'));
  flagsPruefen(a, rpId);
  if (!a.at || !a.kennung) throw new Error('Der Passkey hat keinen Schlüssel mitgeschickt.');
  if (antwort.id !== b64u(a.kennung)) throw new Error('Die Kennung des Passkeys passt nicht.');
  const k = coseSchluessel(a.cose);
  return { id: b64u(a.kennung), pem: k.pem, alg: k.alg, zaehler: a.zaehler };
}

// Anmeldung. antwort: { id, clientDataJSON, authenticatorData, signature }
// passkey: gespeichert { pem, alg, zaehler }
function anmeldungPruefen({ antwort, challenge, origin, rpId, passkey }) {
  if (!antwort || typeof antwort !== 'object' || !passkey) throw new Error('Antwort fehlt.');
  const cd = vonB64u(antwort.clientDataJSON, 'clientDataJSON');
  clientDataPruefen(cd, { typ: 'webauthn.get', challenge, origin });
  const ad = vonB64u(antwort.authenticatorData, 'authenticatorData');
  const a = authDaten(ad);
  flagsPruefen(a, rpId);
  const daten = Buffer.concat([ad, sha256(cd)]);
  const sig = vonB64u(antwort.signature, 'signature');
  const schluessel = crypto.createPublicKey(passkey.pem);
  let ok = false;
  if (passkey.alg === -7) ok = crypto.verify('sha256', daten, { key: schluessel, dsaEncoding: 'der' }, sig);
  else if (passkey.alg === -257) ok = crypto.verify('sha256', daten, schluessel, sig);
  else if (passkey.alg === -8) ok = crypto.verify(null, daten, schluessel, sig);
  if (!ok) throw new Error('Die Signatur stimmt nicht.');
  // Zählt der Passkey mit, muss der Zähler wachsen – sonst wurde er kopiert.
  if ((a.zaehler !== 0 || passkey.zaehler !== 0) && a.zaehler <= passkey.zaehler) throw new Error('Der Passkey-Zähler ist zurückgegangen – Anmeldung gesperrt.');
  return { zaehler: a.zaehler };
}

module.exports = { registrierungPruefen, anmeldungPruefen, cborLesen, authDaten, coseSchluessel, b64u, vonB64u, gleich };
