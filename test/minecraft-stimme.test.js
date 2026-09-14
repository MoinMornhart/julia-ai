'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('dgram');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const OpusScript = require('opusscript');
const v = require('../src/main/minecraft-stimme');
const { wavBauen, wavLesen, herunter48auf16 } = require('../src/main/sprache');

const int32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const long = (n) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(n)); return b; };
const double = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b; };
const float = (n) => { const b = Buffer.alloc(4); b.writeFloatBE(n); return b; };

// So schickt der Server das Secret über den Plugin-Kanal.
function secretBauen({ key, port, spielerId, host = '', keepAliveMs = 1000, mtu = 1024 }) {
  const h = Buffer.from(host, 'utf8');
  return Buffer.concat([key, int32(port), spielerId, Buffer.from([0]), int32(mtu), double(48), int32(keepAliveMs), Buffer.from([1]), v.varInt(h.length), h, Buffer.from([0])]);
}

function spielerTon(sender, opus, seq, kategorie = null) {
  const kat = kategorie ? Buffer.concat([v.varInt(kategorie.length), Buffer.from(kategorie)]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from([2]), crypto.randomBytes(16), sender, v.varInt(opus.length), opus, long(seq), float(3.5), Buffer.from([kategorie ? 2 : 0]), kat]);
}

function sinus(frame) {
  const b = Buffer.alloc(960 * 2);
  for (let i = 0; i < 960; i++) b.writeInt16LE(Math.round(8000 * Math.sin(((frame * 960 + i) / 48000) * 2 * Math.PI * 440)), i * 2);
  return b;
}

test('Voice-Chat: Secret, VarInt und Mikrofon-Paket nach dem Mod-Quelltext', () => {
  assert.deepEqual(v.varInt(300), Buffer.from([0xac, 0x02]));
  const key = crypto.randomBytes(16);
  const spielerId = crypto.randomBytes(16);
  const s = v.secretLesen(secretBauen({ key, port: 24454, spielerId, host: '192.168.1.20:24454' }));
  assert.equal(s.port, 24454);
  assert.ok(s.key.equals(key));
  assert.ok(s.spielerId.equals(spielerId));
  assert.equal(s.host, '192.168.1.20:24454');
  assert.throws(() => v.secretLesen(Buffer.alloc(10)), /zu_kurz|secret/);
  const mic = v.micPaket(Buffer.from([1, 2, 3]), 7);
  assert.deepEqual([...mic], [1, 3, 1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 7, 0]);
});

test('Voice-Chat: Verschlüsselung für 2.6 (GCM) und 2.5 (CBC) in beide Richtungen', () => {
  const key = crypto.randomBytes(16);
  const secret = { key, spielerId: crypto.randomBytes(16) };
  for (const version of [20, 18]) {
    const inhalt = Buffer.from([8, 1, 2, 3]);
    const hin = v.clientPaketLesen(v.clientPaket(inhalt, secret, version), key, version);
    assert.ok(hin.inhalt.equals(inhalt), `Bot → Server, ${version}`);
    assert.equal(hin.spielerId, secret.spielerId.toString('hex'));
    assert.ok(v.serverPaketLesen(v.serverPaket(inhalt, key, version), key, version).equals(inhalt), `Server → Bot, ${version}`);
    assert.throws(() => v.serverPaketLesen(v.serverPaket(inhalt, crypto.randomBytes(16), version), key, version));
  }
});

test('Voice-Chat: Spieler-, Gruppen- und Ort-Töne werden richtig gelesen', () => {
  const sender = crypto.randomBytes(16);
  const opus = Buffer.from([9, 9, 9]);
  const t = v.tonLesen(spielerTon(sender, opus, 42, 'musik'));
  assert.equal(t.typ, 2);
  assert.equal(t.sender, sender.toString('hex'));
  assert.ok(t.opus.equals(opus));
  assert.equal(t.seq, 42n);
  const gruppe = Buffer.concat([Buffer.from([3]), crypto.randomBytes(16), sender, v.varInt(3), opus, long(5), Buffer.from([0])]);
  assert.equal(v.tonLesen(gruppe).sender, sender.toString('hex'));
  const ort = Buffer.concat([Buffer.from([4]), crypto.randomBytes(16), sender, double(1), double(64), double(-3), v.varInt(3), opus, long(6), float(8), Buffer.from([0])]);
  assert.ok(v.tonLesen(ort).opus.equals(opus));
  assert.equal(v.tonLesen(Buffer.from([8])), null);
});

test('Voice-Chat: Gruppen lesen (2.6 und 2.5), beitreten mit und ohne Passwort', () => {
  const id = '0123456789abcdef0123456789abcdef';
  const name = Buffer.from('Freunde');
  const kopf = Buffer.concat([Buffer.from(id, 'hex'), v.varInt(name.length), name]);
  // 2.6: Passwort, dauerhaft, versteckt, Art (short)
  assert.deepEqual(v.gruppeLesen(Buffer.concat([kopf, Buffer.from([1, 1, 0, 0, 1])])), { id, name: 'Freunde', passwort: true, dauerhaft: true, versteckt: false, art: 'offen' });
  // 2.5: ohne "versteckt"
  assert.deepEqual(v.gruppeLesen(Buffer.concat([kopf, Buffer.from([0, 1, 0, 2])])), { id, name: 'Freunde', passwort: false, dauerhaft: true, versteckt: false, art: 'isoliert' });
  assert.throws(() => v.gruppeLesen(Buffer.from([1, 2, 3])));

  const mitPw = v.beitretenPaket(id, 'geheim');
  assert.equal(mitPw.subarray(0, 16).toString('hex'), id);
  assert.deepEqual([...mitPw.subarray(16)], [1, 6, ...Buffer.from('geheim')]);
  assert.deepEqual([...v.beitretenPaket(id, null).subarray(16)], [0], 'ohne Passwort: nur "nein"');
  assert.throws(() => v.beitretenPaket('kaputt', null), /Gruppe/);

  assert.deepEqual(v.beigetretenLesen(Buffer.concat([Buffer.from([1]), Buffer.from(id, 'hex'), Buffer.from([0])])), { gruppe: id, falschesPasswort: false });
  assert.deepEqual(v.beigetretenLesen(Buffer.from([0, 1])), { gruppe: null, falschesPasswort: true });
});

test('Voice-Chat: gemerkte Gruppe wird von selbst betreten, falsches Passwort gemeldet', () => {
  const { EventEmitter } = require('events');
  const client = new EventEmitter();
  const gesendet = [];
  client.write = (art, p) => gesendet.push(p);
  const s = new v.Stimme({ client, host: '127.0.0.1', gruppe: { name: 'freunde', passwort: 'geheim' } });
  const id = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';
  const name = Buffer.from('Freunde');
  const gruppe = (versteckt) => Buffer.concat([Buffer.from(id, 'hex'), v.varInt(name.length), name, Buffer.from([1, 0, versteckt ? 1 : 0, 0, 0])]);
  s._gruppenPaket({ channel: 'voicechat:add_group', data: gruppe(false) });
  const beitritt = gesendet.find((p) => p.channel === 'voicechat:set_group');
  assert.ok(beitritt, 'von selbst beigetreten');
  assert.deepEqual(beitritt.data, v.beitretenPaket(id, 'geheim'));
  assert.deepEqual(s.status().gruppen, [{ id, name: 'Freunde', passwort: true, art: 'normal' }]);

  s._gruppenPaket({ channel: 'voicechat:joined_group', data: Buffer.from([0, 1]) });
  assert.equal(s.status().gruppeFehler, 'passwort');
  assert.equal(s.status().gruppe, null);
  s._gruppenPaket({ channel: 'voicechat:joined_group', data: Buffer.concat([Buffer.from([1]), Buffer.from(id, 'hex'), Buffer.from([0])]) });
  assert.equal(s.status().gruppe, id);
  assert.equal(s.status().gruppeFehler, null);

  s._gruppenPaket({ channel: 'voicechat:remove_group', data: Buffer.from(id, 'hex') });
  assert.deepEqual(s.status().gruppen, []);
  assert.equal(s.status().gruppe, null);
  s._gruppenPaket({ channel: 'voicechat:add_group', data: gruppe(true) });
  assert.deepEqual(s.status().gruppen, [], 'versteckte Gruppen erscheinen nicht');
  assert.throws(() => s.gruppeBeitreten(id, 'x'), /nicht mehr/);
});

test('Voice-Chat: nur mit Anrede ist es eine Frage an Julia', () => {
  const phrasen = ['Hey Julia', 'Hallo Julia', 'Okay Julia', 'Julia'];
  assert.equal(v.anredeEntfernen('Hey Julia, folge mir', phrasen), 'folge mir');
  assert.equal(v.anredeEntfernen('hey julia komm her', phrasen), 'komm her');
  assert.equal(v.anredeEntfernen('Julia wo finde ich Eisen', phrasen), 'wo finde ich Eisen');
  assert.equal(v.anredeEntfernen('Juliane komm mal', phrasen), null);
  assert.equal(v.anredeEntfernen('wir gehen minen', phrasen), null);
  assert.equal(v.anredeEntfernen('Hey Julia', phrasen), null);
  // So hat die Windows-Erkennung "Hey Julia, folge mir bitte" wirklich gehört:
  assert.equal(v.anredeEntfernen('Eine Julia folge mir bitte', phrasen), 'folge mir bitte');
  assert.equal(v.anredeEntfernen('ich finde Julia toll', phrasen), null, 'über Julia reden ist keine Anrede');
});

test('Sprache: WAV hin und zurück, 48 kHz auf 16 kHz', () => {
  const pcm = Buffer.alloc(960 * 2);
  for (let i = 0; i < 960; i++) pcm.writeInt16LE(i, i * 2);
  const w = wavLesen(wavBauen(pcm, 48000));
  assert.equal(w.rate, 48000);
  assert.equal(w.kanaele, 1);
  assert.equal(w.bits, 16);
  assert.ok(w.pcm.equals(pcm));
  const klein = herunter48auf16(pcm);
  assert.equal(klein.length, pcm.length / 3);
  assert.equal(klein.readInt16LE(2), 4); // Mittel aus 3, 4, 5
});

test('Voice-Chat: Handschlag, nur die Stimme des Besitzers kommt an, Julia spricht zurück', async () => {
  const key = crypto.randomBytes(16);
  const spielerId = crypto.randomBytes(16);
  const chef = crypto.randomBytes(16);
  const fremd = crypto.randomBytes(16);

  // Ein nachgebauter Voice-Chat-Server.
  const server = dgram.createSocket('udp4');
  await new Promise((r) => server.bind(0, '127.0.0.1', r));
  const mics = [];
  let bot = null;
  const antworten = (inhalt) => server.send(v.serverPaket(inhalt, key, 20), bot.port, bot.address);
  server.on('message', (d, rinfo) => {
    bot = rinfo;
    const { inhalt, spielerId: id } = v.clientPaketLesen(d, key, 20);
    assert.equal(id, spielerId.toString('hex'));
    if (inhalt[0] === 5) antworten(Buffer.from([6]));
    else if (inhalt[0] === 9) antworten(Buffer.from([10]));
    else if (inhalt[0] === 1) mics.push(inhalt);
  });

  const mc = new EventEmitter();
  const geschrieben = [];
  mc.write = (_name, d) => geschrieben.push(d);
  const s = new v.Stimme({ client: mc, host: '127.0.0.1', besitzerUuid: () => chef.toString('hex'), versionen: [20] });
  const enc = new OpusScript(48000, 1, OpusScript.Application.VOIP);
  try {
    s.starten();
    assert.equal(geschrieben[0].channel, 'minecraft:register');
    assert.equal(geschrieben[1].channel, 'voicechat:request_secret');
    assert.equal(geschrieben[1].data.readInt32BE(), 20);

    const verbunden = new Promise((r) => s.on('status', (st) => { if (st.zustand === 'verbunden') r(); }));
    mc.emit('custom_payload', { channel: 'voicechat:secret', data: secretBauen({ key, port: server.address().port, spielerId }) });
    await verbunden;
    assert.equal(s.status().version, '2.6');

    const gehoert = new Promise((r) => s.once('sprache', r));
    const reden = (sender, frames) => {
      for (let i = 0; i < frames; i++) antworten(spielerTon(sender, Buffer.from(enc.encode(sinus(i), 960)), i));
      antworten(spielerTon(sender, Buffer.alloc(0), frames));
    };
    reden(fremd, 20); // wird verworfen
    reden(chef, 25); // 0,5 s
    const { pcm } = await gehoert;
    assert.equal(pcm.length, 25 * 1920);

    await s.sprechen(Buffer.alloc(1920 * 3));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(mics.length, 4, 'drei Töne und das Ende-Zeichen');
    assert.equal(mics[3].length, 11, 'leeres Paket = fertig gesprochen');
    assert.deepEqual(mics.map((m) => m.readBigInt64BE(m.length - 9)), [0n, 1n, 2n, 3n]);
  } finally {
    s.stoppen();
    enc.delete();
    server.close();
  }
});

test('Voice-Chat: ohne Mod meldet sich niemand – dann "nicht gefunden"', async () => {
  const mc = new EventEmitter();
  mc.write = () => {};
  const s = new v.Stimme({ client: mc, host: '127.0.0.1', versionen: [20, 18], wechselMs: 20 });
  const ende = new Promise((r) => s.on('status', (st) => { if (st.zustand === 'kein_mod') r(); }));
  s.starten();
  await ende;
  s.stoppen();
});
