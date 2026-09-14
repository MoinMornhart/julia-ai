'use strict';

const net = require('net');
const dns = require('dns');
const dgram = require('dgram');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { intern } = require('./webseite');

// Simple Voice Chat (Mod/Plugin von henkelmax) für Julias Spielfigur: im
// Näherungs-Voice-Chat zuhören und mit Stimme antworten.
//
// Protokoll nach dem Quelltext des Mods – 2.5.x (Kompatibilität 18, AES-CBC)
// und 2.6.x (20, AES-GCM) –, gegengeprüft mit mcload (MIT). Handschlag über
// Plugin-Kanäle im Minecraft-Protokoll, danach verschlüsselte UDP-Pakete mit
// Opus-Audio (48 kHz, mono, 20 ms je Paket).
//
// Gehört wird nur, wer als Besitzer eingetragen ist. Die Stimmen anderer
// Spieler werden verworfen, bevor sie zu Audio werden – nichts wird gespeichert.

const TYP = { mic: 1, spieler: 2, gruppe: 3, ort: 4, anmelden: 5, anmeldenOk: 6, ping: 7, keepAlive: 8, pruefen: 9, pruefenOk: 10 };
const KANAELE = ['voicechat:secret', 'voicechat:request_secret', 'voicechat:update_state'];
const RATE = 48000;
const FRAME = 960; // 20 ms bei 48 kHz
const FRAME_BYTES = FRAME * 2;
const MAX_PAKET = 4096;
const MAX_OPUS = 1275;
const ENDE_MS = 700; // so lange nichts mehr kommt = fertig gesprochen
const MIN_REDE_BYTES = (RATE * 2 * 300) / 1000; // kürzer als 0,3 s: Rauschen
const MAX_REDE_BYTES = RATE * 2 * 20; // höchstens 20 s am Stück
const VERBINDEN_MS = 10000;

function varInt(n) {
  const out = [];
  let v = n >>> 0;
  do {
    let b = v & 127;
    v >>>= 7;
    if (v) b |= 128;
    out.push(b);
  } while (v);
  return Buffer.from(out);
}

class Leser {
  constructor(b) { this.b = b; this.o = 0; }
  bytes(n) {
    if (n < 0 || this.o + n > this.b.length) throw new Error('zu_kurz');
    const v = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return v;
  }
  byte() { return this.bytes(1)[0]; }
  int() { return this.bytes(4).readInt32BE(); }
  long() { return this.bytes(8).readBigInt64BE(); }
  double() { return this.bytes(8).readDoubleBE(); }
  bool() {
    const v = this.byte();
    if (v > 1) throw new Error('bool');
    return v === 1;
  }
  varInt() {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const x = this.byte();
      v += (x & 127) * 2 ** (7 * i);
      if (!(x & 128)) return v;
    }
    throw new Error('varint');
  }
  feld(max) {
    const n = this.varInt();
    if (n > max) throw new Error('zu_lang');
    return this.bytes(n);
  }
  uuid() { return this.bytes(16).toString('hex'); }
}

const uuidHex = (s) => String(s || '').replace(/-/g, '').toLowerCase();

// Antwort des Servers auf voicechat:request_secret.
function secretLesen(daten) {
  if (!Buffer.isBuffer(daten) || daten.length > MAX_PAKET) throw new Error('secret');
  const r = new Leser(daten);
  const key = Buffer.from(r.bytes(16));
  const port = r.int();
  const spielerId = Buffer.from(r.bytes(16));
  const codec = r.byte();
  const mtu = r.int();
  const distanz = r.double();
  const keepAliveMs = r.int();
  r.bool(); // Gruppen an
  const host = r.feld(1024).toString('utf8');
  r.bool(); // Aufnahmen erlaubt
  if (port < 1 || port > 65535 || codec > 2 || mtu < 256 || mtu > MAX_PAKET || !(distanz >= 0) || keepAliveMs < 100 || keepAliveMs > 60000) {
    throw new Error('secret');
  }
  return { key, port, spielerId, mtu, keepAliveMs, host };
}

function verschluesseln(daten, key, version) {
  if (version === 20) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-128-gcm', key, iv);
    return Buffer.concat([iv, c.update(daten), c.final(), c.getAuthTag()]);
  }
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([iv, c.update(daten), c.final()]);
}

function entschluesseln(daten, key, version) {
  if (version === 20) {
    if (daten.length < 29) throw new Error('zu_kurz');
    const d = crypto.createDecipheriv('aes-128-gcm', key, daten.subarray(0, 12));
    d.setAuthTag(daten.subarray(-16));
    return Buffer.concat([d.update(daten.subarray(12, -16)), d.final()]);
  }
  if (daten.length < 32 || daten.length % 16) throw new Error('cbc');
  const d = crypto.createDecipheriv('aes-128-cbc', key, daten.subarray(0, 16));
  return Buffer.concat([d.update(daten.subarray(16)), d.final()]);
}

// Bot → Server: 0xFF, eigene Spieler-ID, Länge, verschlüsselter Inhalt.
function clientPaket(inhalt, secret, version) {
  const e = verschluesseln(inhalt, secret.key, version);
  return Buffer.concat([Buffer.from([0xff]), secret.spielerId, varInt(e.length), e]);
}

// Server → Bot: 0xFF, Länge, verschlüsselter Inhalt.
function serverPaketLesen(daten, key, version) {
  if (daten.length > MAX_PAKET) throw new Error('zu_gross');
  const r = new Leser(daten);
  if (r.byte() !== 0xff) throw new Error('magic');
  return entschluesseln(r.feld(MAX_PAKET), key, version);
}

// Die Gegenrichtung – für Tests (so baut bzw. liest der Server).
function serverPaket(inhalt, key, version) {
  const e = verschluesseln(inhalt, key, version);
  return Buffer.concat([Buffer.from([0xff]), varInt(e.length), e]);
}

function clientPaketLesen(daten, key, version) {
  const r = new Leser(daten);
  if (r.byte() !== 0xff) throw new Error('magic');
  const spielerId = r.uuid();
  return { spielerId, inhalt: entschluesseln(r.feld(MAX_PAKET), key, version) };
}

function micPaket(opus, seq, fluestern = false) {
  const hinten = Buffer.alloc(9);
  hinten.writeBigInt64BE(BigInt(seq));
  hinten[8] = fluestern ? 1 : 0;
  return Buffer.concat([Buffer.from([TYP.mic]), varInt(opus.length), opus, hinten]);
}

// Spieler-, Gruppen- und Ort-Töne: Kanal, Absender, Opus-Daten, Sequenz.
function tonLesen(inhalt) {
  const r = new Leser(inhalt);
  const typ = r.byte();
  if (typ < TYP.spieler || typ > TYP.ort) return null;
  const kanal = r.uuid();
  const sender = r.uuid();
  if (typ === TYP.ort) { r.double(); r.double(); r.double(); }
  const opus = Buffer.from(r.feld(MAX_OPUS));
  const seq = r.long();
  return { typ, kanal, sender, opus, seq };
}

// "Hey Julia, folge mir" → "folge mir". Ohne Anrede: null – im Voice-Chat
// reden die Leute auch miteinander.
function anredeEntfernen(text, phrasen) {
  const t = String(text || '').trim();
  const klein = t.toLowerCase();
  const liste = [...(phrasen || [])].map((p) => String(p).toLowerCase()).filter(Boolean).sort((a, b) => b.length - a.length);
  const rest = (ab) => t.slice(ab).replace(/^[\s,.:;!?]+/, '').trim() || null;
  for (const p of liste) {
    if (klein.startsWith(p) && !/[\p{L}\p{N}]/u.test(klein[p.length] || '')) return rest(p.length);
  }
  // Die Erkennung verhört sich beim "Hey" gern ("Eine Julia, folge mir").
  // Deshalb reicht der Name unter den ersten zwei Wörtern – später im Satz
  // ("ich finde Julia toll") ist er keine Anrede.
  const namen = liste.filter((p) => !/\s/.test(p));
  const woerter = [...t.matchAll(/[\p{L}\p{N}'’-]+/gu)].slice(0, 2);
  for (const w of woerter) {
    if (namen.includes(w[0].toLowerCase())) return rest(w.index + w[0].length);
  }
  return null;
}

class Stimme extends EventEmitter {
  // client: das minecraft-protocol-Objekt des Bots (bot._client)
  // host: Adresse des Minecraft-Servers (Rückfall für den Voice-Server)
  // besitzerUuid(): UUID des Spielers, auf den Julia hört
  constructor({ client, host, besitzerUuid = () => null, opus = () => require('opusscript'), versionen = [20, 18], wechselMs = 3000 }) {
    super();
    this.client = client;
    this.rueckfall = host;
    this.besitzerUuid = besitzerUuid;
    this.opusLaden = opus;
    this.versionen = versionen;
    this.wechselMs = wechselMs;
    this.zustand = 'aus';
    this.grund = null;
    this.version = null;
    this.secret = null;
    this.socket = null;
    this.phase = null;
    this.timer = null;
    this.wechselTimer = null;
    this.seq = 0n;
    this.hoerer = null;
    this.encoder = null;
    this.auftrag = null;
    this._payload = (p) => this._secret(p);
  }

  get verbunden() { return this.zustand === 'verbunden'; }
  get sprichtGerade() { return !!this.auftrag; }

  status() {
    return { zustand: this.zustand, version: this.version === 20 ? '2.6' : this.version === 18 ? '2.5' : null, grund: this.grund };
  }

  _setzen(z) {
    if (this.zustand === z) return;
    this.zustand = z;
    this.emit('status', this.status());
  }

  starten() {
    if (this.zustand !== 'aus') return;
    this.client.on('custom_payload', this._payload);
    try {
      this.client.write('custom_payload', { channel: 'minecraft:register', data: Buffer.from(KANAELE.join('\0')) });
    } catch (e) {
      this._fehler('registrieren');
      return;
    }
    this._setzen('sucht');
    this.versuch = 0;
    this._anfragen();
  }

  // Erst nach 2.6 fragen, dann nach 2.5 – ohne Antwort hat der Server den Mod nicht.
  _anfragen() {
    if (this.zustand !== 'sucht') return;
    if (this.versuch >= this.versionen.length) { this._aufraeumen(); this._setzen('kein_mod'); return; }
    this.angefragt = this.versionen[this.versuch++];
    const b = Buffer.alloc(4);
    b.writeInt32BE(this.angefragt);
    try { this.client.write('custom_payload', { channel: 'voicechat:request_secret', data: b }); } catch { this._fehler('anfrage'); return; }
    this.wechselTimer = setTimeout(() => this._anfragen(), this.wechselMs);
  }

  _ziel(s) {
    let host = this.rueckfall;
    let port = s.port;
    const h = String(s.host || '').trim();
    if (/^\d{1,5}$/.test(h)) {
      port = Number(h);
    } else if (h) {
      const m = /^\[?([0-9a-fA-F:.]+?|[^:\]]+)\]?(?::(\d{1,5}))?$/.exec(h);
      if (m) {
        // Nur dieselbe Adresse wie der Minecraft-Server oder eine im Heimnetz –
        // der Server soll Julia nicht an beliebige Stellen im Internet schicken.
        if (net.isIP(m[1]) && (m[1] === this.rueckfall || intern(m[1]))) host = m[1];
        if (m[2]) port = Number(m[2]);
      }
    }
    return { host, port };
  }

  _secret(p) {
    if (!p || p.channel !== 'voicechat:secret' || !Buffer.isBuffer(p.data) || this.zustand !== 'sucht') return;
    let s;
    try { s = secretLesen(p.data); } catch { this._fehler('secret'); return; }
    clearTimeout(this.wechselTimer);
    this.secret = s;
    this.version = this.angefragt;
    this.verbindenSeit = Date.now();
    this._setzen('verbindet');
    const ziel = this._ziel(s);
    dns.lookup(ziel.host, (err, adresse, familie) => {
      if (this.zustand !== 'verbindet') return;
      if (err) { this._fehler('adresse'); return; }
      const sock = dgram.createSocket(familie === 6 ? 'udp6' : 'udp4');
      this.socket = sock;
      sock.on('error', () => { if (this.socket === sock) this._fehler('udp'); });
      sock.on('message', (d) => { if (this.socket === sock) this._empfangen(d); });
      sock.connect(ziel.port, adresse, () => {
        if (this.socket !== sock) return;
        this.phase = 'anmelden';
        this._handschlag();
        this.timer = setInterval(() => this._takt(), 250);
      });
    });
  }

  _handschlag() {
    this.letzterVersuch = Date.now();
    if (this.phase === 'anmelden') this._senden(Buffer.concat([Buffer.from([TYP.anmelden]), this.secret.spielerId, this.secret.key]));
    else if (this.phase === 'pruefen') this._senden(Buffer.from([TYP.pruefen]));
  }

  _takt() {
    const jetzt = Date.now();
    if (this.zustand === 'verbindet') {
      if (jetzt - this.verbindenSeit > VERBINDEN_MS) this._fehler('keine_antwort');
      else if (jetzt - this.letzterVersuch >= 1000) this._handschlag();
    } else if (this.zustand === 'verbunden' && jetzt - this.letzteKeepAlive > this.secret.keepAliveMs * 10) {
      this._fehler('getrennt');
    }
  }

  _empfangen(d) {
    let p;
    try { p = serverPaketLesen(d, this.secret.key, this.version); } catch { return; } // kaputt oder fremd
    const typ = p[0];
    if (typ === TYP.anmeldenOk && this.phase === 'anmelden') {
      this.phase = 'pruefen';
      this._handschlag();
    } else if (typ === TYP.pruefenOk && this.phase === 'pruefen') {
      this.phase = 'fertig';
      this.letzteKeepAlive = Date.now();
      this._setzen('verbunden');
      try { this.client.write('custom_payload', { channel: 'voicechat:update_state', data: Buffer.from([0]) }); } catch { /* egal */ }
    } else if (this.zustand === 'verbunden') {
      if (typ === TYP.keepAlive) {
        this.letzteKeepAlive = Date.now();
        this._senden(Buffer.from([TYP.keepAlive]));
      } else if (typ === TYP.ping && p.length >= 25) {
        this._senden(p.subarray(0, 25));
      } else if (typ >= TYP.spieler && typ <= TYP.ort) {
        this._ton(p);
      }
    }
  }

  _ton(p) {
    let t;
    try { t = tonLesen(p); } catch { return; }
    const chef = uuidHex(this.besitzerUuid());
    if (!t || !chef || t.sender !== chef) return; // andere Stimmen: sofort verworfen
    if (!t.opus.length) { this._redeEnde(); return; }
    if (!this.hoerer) {
      const Opus = this.opusLaden();
      this.hoerer = { decoder: new Opus(RATE, 1, Opus.Application.VOIP), teile: [], laenge: 0, timer: null };
    }
    const h = this.hoerer;
    try {
      const pcm = h.decoder.decode(t.opus);
      h.teile.push(Buffer.from(pcm));
      h.laenge += pcm.length;
    } catch { return; }
    clearTimeout(h.timer);
    if (h.laenge >= MAX_REDE_BYTES) { this._redeEnde(); return; }
    h.timer = setTimeout(() => this._redeEnde(), ENDE_MS);
  }

  _redeEnde() {
    const h = this.hoerer;
    if (!h || !h.laenge) return;
    clearTimeout(h.timer);
    const pcm = Buffer.concat(h.teile);
    h.teile = [];
    h.laenge = 0;
    if (pcm.length >= MIN_REDE_BYTES) this.emit('sprache', { pcm });
  }

  // PCM (48 kHz, mono, 16 Bit) als Stimme der Spielfigur – im 20-ms-Takt.
  sprechen(pcm) {
    if (!this.verbunden) return Promise.reject(new Error('Der Voice-Chat ist nicht verbunden.'));
    this.stumm();
    if (!this.encoder) {
      const Opus = this.opusLaden();
      this.encoder = new Opus(RATE, 1, Opus.Application.VOIP);
    }
    const auftrag = { abbruch: false };
    this.auftrag = auftrag;
    return new Promise((ok) => {
      const start = Date.now();
      let i = 0;
      const schritt = () => {
        const fertig = auftrag.abbruch || !this.verbunden || i * FRAME_BYTES >= pcm.length;
        if (fertig) {
          this._senden(micPaket(Buffer.alloc(0), this.seq++)); // "fertig gesprochen"
          if (this.auftrag === auftrag) this.auftrag = null;
          ok();
          return;
        }
        let stueck = pcm.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);
        if (stueck.length < FRAME_BYTES) stueck = Buffer.concat([stueck, Buffer.alloc(FRAME_BYTES - stueck.length)]);
        try { this._senden(micPaket(Buffer.from(this.encoder.encode(stueck, FRAME)), this.seq++)); } catch { /* ein Paket verloren */ }
        i++;
        setTimeout(schritt, Math.max(0, start + i * 20 - Date.now()));
      };
      schritt();
    });
  }

  stumm() {
    if (this.auftrag) this.auftrag.abbruch = true;
    this.auftrag = null;
  }

  _senden(inhalt) {
    if (!this.socket || !this.secret) return;
    const b = clientPaket(inhalt, this.secret, this.version);
    if (b.length > this.secret.mtu) return;
    try { this.socket.send(b); } catch { /* Socket noch nicht verbunden */ }
  }

  _aufraeumen() {
    clearTimeout(this.wechselTimer);
    clearInterval(this.timer);
    this.timer = null;
    this.stumm();
    if (this.hoerer) {
      clearTimeout(this.hoerer.timer);
      try { this.hoerer.decoder.delete(); } catch { /* egal */ }
      this.hoerer = null;
    }
    if (this.encoder) {
      try { this.encoder.delete(); } catch { /* egal */ }
      this.encoder = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch { /* schon zu */ }
      this.socket = null;
    }
    if (this.secret) { this.secret.key.fill(0); this.secret = null; }
    this.phase = null;
  }

  _fehler(grund) {
    this.grund = grund;
    this._aufraeumen();
    this._setzen('fehler');
  }

  stoppen() {
    this.client.removeListener('custom_payload', this._payload);
    this._aufraeumen();
    this._setzen('aus');
  }
}

module.exports = {
  Stimme, TYP, RATE, FRAME,
  varInt, secretLesen, clientPaket, serverPaketLesen, serverPaket, clientPaketLesen, micPaket, tonLesen, anredeEntfernen,
};
