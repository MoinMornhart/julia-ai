'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const crypto = require('crypto');
const zertifikat = require('../src/main/handy/zertifikat');
const { HandyServer, privateAdresse, hostErlaubt, geraetName, qrMatrix, lanAdressen, unterwegsAdressen } = require('../src/main/handy/server');

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

async function aufbau() {
  const nachrichten = [];
  const protokoll = [];
  const s = new HandyServer({
    tresor: tresor(),
    texte: () => ({ sprachcode: 'de', name: 'Julia', akzent: '#FF7A1A', texte: { 'mobil.ja': 'Ja' } }),
    beiNachricht: async (text) => { nachrichten.push(text); return { ok: true }; },
    protokoll: (e) => protokoll.push(e),
    adressen: () => ['127.0.0.1'],
    unterwegs: () => [],
  });
  await s.starten(0);
  return { s, nachrichten, protokoll };
}

function anfrage(s, pfad, { methode = 'GET', schluessel, daten, host, origin } = {}) {
  return new Promise((resolve, reject) => {
    const body = daten === undefined ? null : JSON.stringify(daten);
    const req = https.request({
      host: '127.0.0.1',
      port: s.port,
      path: pfad,
      method: methode,
      agent: false,
      rejectUnauthorized: false,
      headers: {
        Host: host || `127.0.0.1:${s.port}`,
        ...(origin ? { Origin: origin } : {}),
        ...(schluessel ? { Authorization: `Bearer ${schluessel}` } : {}),
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      const teile = [];
      res.on('data', (t) => teile.push(t));
      res.on('end', () => {
        const text = Buffer.concat(teile).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* HTML */ }
        resolve({ code: res.statusCode, kopf: res.headers, text, json, zert: res.socket && res.socket.getPeerCertificate && res.socket.getPeerCertificate() });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function koppeln(s) {
  const { url } = s.koppelnStarten();
  const code = url.split('#k=')[1];
  const r = await anfrage(s, '/api/koppeln', { methode: 'POST', daten: { code } });
  return { r, code };
}

test('Zertifikat: selbst signiert, nur Server, mit IP im Namen, unter 825 Tagen', () => {
  const { zertifikat: pem, schluessel } = zertifikat.erzeugen({ adressen: ['192.168.178.20'] });
  const x = new crypto.X509Certificate(pem);
  assert.match(x.subject, /CN=Julia AI/);
  assert.match(x.subjectAltName, /IP Address:192\.168\.178\.20/);
  assert.match(x.subjectAltName, /DNS:localhost/);
  assert.equal(x.ca, false);
  assert.ok(x.verify(x.publicKey), 'mit dem eigenen Schlüssel signiert');
  assert.ok(x.checkPrivateKey(crypto.createPrivateKey(schluessel)));
  const tage = (new Date(x.validTo) - Date.now()) / 86400000;
  assert.ok(tage > 790 && tage < 825, `${tage} Tage`);
});

test('Nur Heimnetz und nur Aufrufe über eine IP-Adresse', () => {
  for (const ip of ['192.168.1.5', '10.0.0.2', '172.20.1.1', '127.0.0.1', '::1', '::ffff:192.168.0.9', 'fe80::1', 'fd12::3', '100.64.0.1', '100.101.102.103']) assert.equal(privateAdresse(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.63.255.1', '100.128.0.1', '2001:db8::1', '', 'abc']) assert.equal(privateAdresse(ip), false, ip);
  for (const h of ['192.168.1.5:8765', '[fe80::1]:8765', 'localhost:8765', '10.0.0.2']) assert.equal(hostErlaubt(h), true, h);
  for (const h of ['angreifer.example', 'angreifer.example:8765', '192.168.1.5.nip.io', '', 'julia.local']) assert.equal(hostErlaubt(h), false, h);
});

test('Gerätename ohne Sonderzeichen, QR-Code quadratisch', () => {
  assert.equal(geraetName('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/139.0 Mobile Safari/537.36'), 'Android · Chrome');
  assert.equal(geraetName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  const m = qrMatrix('https://192.168.178.20:8765/#k=' + 'a'.repeat(43));
  assert.ok(m.length >= 21 && m.every((z) => z.length === m.length && /^[01]+$/.test(z)));
});

test('Koppeln: Einmal-Code aus dem QR, danach nur mit Geräteschlüssel', async () => {
  const { s, nachrichten, protokoll } = await aufbau();
  try {
    const seite = await anfrage(s, '/');
    assert.equal(seite.code, 200);
    assert.match(seite.kopf['content-security-policy'], /default-src 'none'/);
    assert.equal(seite.zert.fingerprint256, s.status().fingerabdruck, 'Fingerabdruck in den Einstellungen passt zum Server');

    assert.equal((await anfrage(s, '/api/stand')).code, 401);
    assert.equal((await anfrage(s, '/api/koppeln', { methode: 'POST', daten: { code: 'x'.repeat(43) } })).code, 401);

    const { r, code } = await koppeln(s);
    assert.equal(r.code, 200);
    const schluessel = r.json.schluessel;
    assert.match(schluessel, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(s.status().gekoppelt, true);
    assert.equal(s.status().koppelnBis, null, 'Code ist verbraucht');
    assert.equal((await anfrage(s, '/api/koppeln', { methode: 'POST', daten: { code } })).code, 401, 'Code gilt nur einmal');
    assert.ok(protokoll.some((p) => p.ergebnis === 'gekoppelt'));

    const stand = await anfrage(s, '/api/stand', { schluessel });
    assert.equal(stand.code, 200);
    assert.deepEqual(stand.json.verlauf, []);

    const senden = await anfrage(s, '/api/senden', { methode: 'POST', schluessel, daten: { text: 'Wie voll ist die Platte?' } });
    assert.equal(senden.code, 200);
    assert.deepEqual(nachrichten, ['Wie voll ist die Platte?']);

    s.trennen();
    assert.equal((await anfrage(s, '/api/stand', { schluessel })).code, 401, 'nach dem Trennen ist der Schlüssel wertlos');
  } finally {
    s.stoppen();
  }
});

test('Fremde Hosts, fremde Herkunft und falsche Formate werden abgewiesen', async () => {
  const { s } = await aufbau();
  try {
    const { r } = await koppeln(s);
    const schluessel = r.json.schluessel;
    assert.equal((await anfrage(s, '/api/stand', { schluessel, host: 'angreifer.example' })).code, 421);
    assert.equal((await anfrage(s, '/api/senden', { methode: 'POST', schluessel, daten: { text: 'x' }, origin: 'https://angreifer.example' })).code, 403);
    assert.equal((await anfrage(s, '/api/senden', { methode: 'POST', schluessel, daten: { text: 'x'.repeat(4001) } })).code, 400);
    assert.equal((await anfrage(s, '/api/freigabe', { methode: 'POST', schluessel, daten: { id: '1', ja: 'ja' } })).code, 400);
    assert.equal((await anfrage(s, '/../../konten.json')).code, 404);
  } finally {
    s.stoppen();
  }
});

test('Nach zehn Fehlversuchen ist die Adresse gesperrt', async () => {
  const { s, protokoll } = await aufbau();
  try {
    for (let i = 0; i < 10; i++) await anfrage(s, '/api/stand', { schluessel: 'y'.repeat(43) });
    const { r } = await koppeln(s);
    assert.equal(r.code, 429, 'auch der richtige Code hilft während der Sperre nicht');
    assert.ok(protokoll.some((p) => p.stufe === 'ROT' && p.ergebnis === 'gesperrt'));
  } finally {
    s.stoppen();
  }
});

test('Gesprächsstand: lange Anfrage kommt zurück, sobald sich etwas tut; Freigabe vom Handy', async () => {
  const { s } = await aufbau();
  try {
    const { r } = await koppeln(s);
    const schluessel = r.json.schluessel;
    const erst = await anfrage(s, '/api/stand', { schluessel });
    const warten = anfrage(s, `/api/stand?ab=${erst.json.seq}&warten=1`, { schluessel });
    setTimeout(() => {
      s.ereignis('nutzer', { text: 'Räum den Desktop auf', handy: true });
      s.ereignis('start');
      s.ereignis('text', { text: 'Ich schaue ' });
      s.ereignis('text', { text: 'nach.' });
      s.ereignis('freigabe', { id: 7, art: 'einzeln', beschreibung: 'Verschieben: 12 Dateien', grund: 'außerhalb der Arbeitsordner' });
    }, 50);
    const neu = await warten;
    assert.equal(neu.code, 200);
    assert.equal(neu.json.beschaeftigt, true);
    const typen = neu.json.verlauf.map((e) => e.typ);
    assert.deepEqual(typen, ['nutzer', 'julia', 'freigabe']);
    assert.equal(neu.json.verlauf[1].text, 'Ich schaue nach.', 'Textstücke werden zusammengefügt');

    const freigaben = [];
    s.on('freigabe', (f) => freigaben.push(f));
    const ja = await anfrage(s, '/api/freigabe', { methode: 'POST', schluessel, daten: { id: 7, ja: true } });
    assert.equal(ja.code, 200);
    assert.deepEqual(freigaben, [{ id: 7, ja: true }]);
    s.ereignis('freigabeErledigt', { id: 7, ja: true });
    s.ereignis('fertig');
    const ende = await anfrage(s, '/api/stand', { schluessel });
    assert.equal(ende.json.verlauf[2].offen, false);
    assert.equal(ende.json.beschaeftigt, false);
  } finally {
    s.stoppen();
  }
});

test('Handy: unterwegs über VPN – Heimnetz- und VPN-Adressen getrennt', () => {
  const karten = {
    WLAN: [{ family: 'IPv4', address: '192.168.178.20', internal: false }],
    Tailscale: [{ family: 'IPv4', address: '100.101.102.103', internal: false }],
    Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  };
  assert.deepEqual(lanAdressen(karten), ['192.168.178.20']);
  assert.deepEqual(unterwegsAdressen(karten), ['100.101.102.103']);
  assert.deepEqual(unterwegsAdressen({ WLAN: karten.WLAN }), []);
});

test('Handy: mit VPN wird über die VPN-Adresse gekoppelt, sonst über das Heimnetz', () => {
  const mit = new HandyServer({ tresor: tresor(), texte: () => ({}), beiNachricht: async () => ({ ok: true }), adressen: () => ['192.168.1.5'], unterwegs: () => ['100.100.1.1'] });
  mit.server = {};
  mit.port = 8765;
  assert.match(mit.koppelnStarten().url, /^https:\/\/100\.100\.1\.1:8765\/#k=/);
  assert.deepEqual(mit.status().unterwegs, ['100.100.1.1']);
  const ohne = new HandyServer({ tresor: tresor(), texte: () => ({}), beiNachricht: async () => ({ ok: true }), adressen: () => ['192.168.1.5'], unterwegs: () => [] });
  ohne.server = {};
  ohne.port = 8765;
  assert.match(ohne.koppelnStarten().url, /^https:\/\/192\.168\.1\.5:8765\/#k=/);
});

test('Handy: neue VPN-Adresse bekommt ein neues Zertifikat, sonst bleibt es', () => {
  const t = tresor();
  let vpn = [];
  const s = new HandyServer({ tresor: t, texte: () => ({}), beiNachricht: async () => ({ ok: true }), adressen: () => ['192.168.1.5'], unterwegs: () => vpn });
  const erst = s._zertifikat().cert;
  assert.equal(s._zertifikat().cert, erst, 'ohne VPN unverändert');
  vpn = ['100.100.1.1'];
  const zweit = s._zertifikat().cert;
  assert.notEqual(zweit, erst);
  assert.equal(s._zertifikat().cert, zweit, 'danach wieder stabil');
  assert.deepEqual(t.lesen('handy').zertifikat_adressen, ['192.168.1.5', '100.100.1.1']);
});
