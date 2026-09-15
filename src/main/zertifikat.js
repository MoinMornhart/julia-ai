'use strict';

const crypto = require('crypto');
const net = require('net');

// Selbst signiertes Zertifikat (ECDSA P-256, SHA-256) für die Handy-Seite im
// WLAN – ohne Fremdpaket, direkt in DER kodiert. Beim ersten Öffnen stimmst du
// im Handy-Browser einmal zu; den Fingerabdruck zum Vergleichen zeigt Julia in
// den Einstellungen.

const GUELTIG_TAGE = 800; // Apple lehnt Serverzertifikate über 825 Tage ab

function laenge(n) {
  if (n < 0x80) return Buffer.from([n]);
  const b = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) b.unshift(x & 0xff);
  return Buffer.from([0x80 | b.length, ...b]);
}

const tlv = (tag, inhalt) => Buffer.concat([Buffer.from([tag]), laenge(inhalt.length), inhalt]);
const folge = (...teile) => tlv(0x30, Buffer.concat(teile));
const menge = (...teile) => tlv(0x31, Buffer.concat(teile));

function oid(text) {
  const t = text.split('.').map(Number);
  const bytes = [40 * t[0] + t[1]];
  for (const n of t.slice(2)) {
    const teil = [n & 0x7f];
    for (let x = Math.floor(n / 128); x > 0; x = Math.floor(x / 128)) teil.unshift((x & 0x7f) | 0x80);
    bytes.push(...teil);
  }
  return tlv(0x06, Buffer.from(bytes));
}

// Positive Ganzzahl in DER (führende Nullen weg, Vorzeichenbit freihalten).
function ganzzahl(buf) {
  let b = buf;
  while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function zeit(d) {
  const p = (n) => String(n).padStart(2, '0');
  const rest = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const jahr = d.getUTCFullYear();
  return jahr < 2050
    ? tlv(0x17, Buffer.from(p(jahr % 100) + rest, 'ascii'))
    : tlv(0x18, Buffer.from(String(jahr) + rest, 'ascii'));
}

const name = (cn) => folge(menge(folge(oid('2.5.4.3'), tlv(0x0c, Buffer.from(cn, 'utf8')))));

function erweiterung(kennung, wert, kritisch = false) {
  return folge(oid(kennung), ...(kritisch ? [tlv(0x01, Buffer.from([0xff]))] : []), tlv(0x04, wert));
}

function altNamen(adressen) {
  const teile = [tlv(0x82, Buffer.from('localhost', 'ascii'))];
  for (const a of adressen) {
    if (net.isIPv4(a)) teile.push(tlv(0x87, Buffer.from(a.split('.').map(Number))));
  }
  return folge(...teile);
}

function erzeugen({ adressen = [], jetzt = new Date() } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const von = new Date(jetzt.getTime() - 24 * 3600 * 1000);
  const bis = new Date(jetzt.getTime() + GUELTIG_TAGE * 24 * 3600 * 1000);
  const serie = crypto.randomBytes(16);
  serie[0] &= 0x7f;
  const algorithmus = folge(oid('1.2.840.10045.4.3.2')); // ecdsa-with-SHA256
  const inhaber = name('Julia AI');
  const tbs = folge(
    tlv(0xa0, ganzzahl(Buffer.from([2]))), // X.509 v3
    ganzzahl(serie),
    algorithmus,
    inhaber,
    folge(zeit(von), zeit(bis)),
    inhaber,
    publicKey.export({ type: 'spki', format: 'der' }),
    tlv(0xa3, folge(
      erweiterung('2.5.29.19', folge(), true), // keine Zertifizierungsstelle
      erweiterung('2.5.29.15', tlv(0x03, Buffer.from([0x07, 0x80])), true), // nur digitalSignature
      erweiterung('2.5.29.37', folge(oid('1.3.6.1.5.5.7.3.1'))), // nur Server
      erweiterung('2.5.29.17', altNamen(adressen)),
    )),
  );
  const signatur = crypto.sign('sha256', tbs, privateKey);
  const der = folge(tbs, algorithmus, tlv(0x03, Buffer.concat([Buffer.from([0]), signatur])));
  const zeilen = der.toString('base64').match(/.{1,64}/g).join('\n');
  return {
    zertifikat: `-----BEGIN CERTIFICATE-----\n${zeilen}\n-----END CERTIFICATE-----\n`,
    schluessel: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function info(pem) {
  const x = new crypto.X509Certificate(pem);
  return { fingerabdruck: x.fingerprint256, gueltigBis: new Date(x.validTo) };
}

module.exports = { erzeugen, info, GUELTIG_TAGE };
