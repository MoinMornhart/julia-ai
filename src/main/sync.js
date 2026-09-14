'use strict';

const os = require('os');
const fs = require('fs');
const net = require('net');
const path = require('path');
const https = require('https');
const dgram = require('dgram');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const zertifikat = require('./handy/zertifikat');
const { privateAdresse, hostErlaubt, lanAdressen, unterwegsAdressen } = require('./handy/server');

// Geräte synchronisieren: Gespräche, Gedächtnis, Routinen und Erinnerungen
// direkt von PC zu PC – im Heimnetz oder über das eigene VPN, ohne Cloud.
//
// Gekoppelt wird einmal per Code (fünf Minuten gültig, nur einmal). Beide
// Seiten beweisen sich dabei mit dem Code, dass sie wirklich miteinander
// reden: Der Beweis enthält die Zertifikate beider Seiten, ein Dritter in der
// Mitte fällt so auf. Danach hält jede Seite das Zertifikat der anderen fest,
// und jede Anfrage trägt einen eigenen Zufallsschlüssel, von dem die andere
// Seite nur den Hash kennt. API-Schlüssel und Konten wandern nie mit.
//
// Abgleich: Jeder Eintrag hat einen Fingerabdruck und eine Version. Ändert er
// sich lokal, gibt es eine neue Version; fehlt er, wird ein Grabstein daraus.
// Jedes Gerät holt sich von den anderen, was dort neuer ist.

const SAMMLUNGEN = ['gespraeche', 'gedaechtnis', 'routinen', 'erinnerungen'];
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: ohne I, L, O, U
const STANDARD_PORT = 8766;
const SUCH_PORT = 8767;
const KOPPELN_MS = 5 * 60 * 1000;
const TAKT_MS = 30 * 1000;
const MAX_KOERPER = 64 * 1024;
const MAX_ANTWORT = 64 * 1024 * 1024;
const MAX_HOLEN = 20;
const SPERRE_NACH = 10;
const SPERRE_MS = 10 * 60 * 1000;
const GRABSTEIN_MS = 90 * 86400000;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const zufall = () => crypto.randomBytes(32).toString('base64url');
const ipNormal = (ip) => String(ip || '').replace(/^::ffff:/i, '');
const geraetName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || 'PC';

function gleich(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function sicher(fn, ersatz) {
  try { return fn(); } catch { return ersatz; }
}

// --- Code ---

function codeErzeugen() {
  const b = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[b[i] & 31];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

// Tippfehler verzeihen: klein, mit Leerzeichen, O statt 0, I oder L statt 1.
function codeNormal(roh) {
  const s = String(roh || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

const kennung = (code) => sha(`julia-sync-kennung|${code}`).slice(0, 16);
const beweis = (code, ...teile) => crypto.createHmac('sha256', `julia-sync|${code}`).update(teile.join('|')).digest('base64url');

function adresseTeilen(roh, port) {
  const s = String(roh || '').trim();
  let m = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(s);
  if (m) return { adresse: m[1], port: Number(m[2]) || port || STANDARD_PORT };
  m = /^([^:]+):(\d{1,5})$/.exec(s);
  if (m) return { adresse: m[1], port: Number(m[2]) };
  return { adresse: s, port: port || STANDARD_PORT };
}

function broadcastAdressen(karten = os.networkInterfaces()) {
  const out = new Set(['255.255.255.255']);
  for (const e of Object.values(karten).flat()) {
    if (!e || e.family !== 'IPv4' || e.internal || !e.netmask) continue;
    const a = e.address.split('.').map(Number);
    const m = e.netmask.split('.').map(Number);
    out.add(a.map((x, i) => (x & m[i]) | (~m[i] & 255)).join('.'));
  }
  return [...out];
}

// --- Verbindung zu einem anderen Gerät ---

// Die Anfrage geht erst raus, wenn der TLS-Handshake fertig ist und das
// Zertifikat stimmt. Vorher verlässt kein Byte davon den PC – der Schlüssel
// geht nie an ein fremdes Gerät.
function anfrage({ adresse, port, fp, token, geraet, methode = 'GET', pfad, daten }) {
  return new Promise((ok, nein) => {
    const body = daten === undefined ? null : JSON.stringify(daten);
    let echt = null;
    let erledigt = false;
    const fehlschlag = (text) => {
      if (erledigt) return;
      erledigt = true;
      nein(new Error(text));
    };
    const req = https.request({
      host: adresse,
      port,
      method: methode,
      path: pfad,
      agent: false,
      rejectUnauthorized: false, // selbst signiert – geprüft wird der festgehaltene Fingerabdruck
      headers: {
        Host: net.isIPv6(adresse) ? `[${adresse}]:${port}` : `${adresse}:${port}`,
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Julia-Geraet': geraet } : {}),
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      const teile = [];
      let n = 0;
      res.on('data', (t) => {
        n += t.length;
        if (n > MAX_ANTWORT) { fehlschlag('zu_gross'); req.destroy(); return; }
        teile.push(t);
      });
      res.on('end', () => {
        if (erledigt) return;
        erledigt = true;
        let json = null;
        try { json = JSON.parse(Buffer.concat(teile).toString('utf8')); } catch { /* keine JSON-Antwort */ }
        ok({ status: res.statusCode, json, fp: echt });
      });
    });
    req.setTimeout(30000, () => { fehlschlag('offline'); req.destroy(); });
    req.on('error', () => fehlschlag('offline'));
    req.on('socket', (s) => {
      s.once('secureConnect', () => {
        const c = s.getPeerCertificate();
        echt = (c && c.fingerprint256) || null;
        if (fp && echt !== fp) { fehlschlag('fremdes_zertifikat'); req.destroy(); return; }
        if (body) req.write(body);
        req.end();
      });
    });
  });
}

function fehler(status, text) {
  const e = new Error(text);
  e.status = status;
  return e;
}

async function koerper(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw fehler(415, 'json_erwartet');
  const teile = [];
  let n = 0;
  for await (const t of req) {
    n += t.length;
    if (n > MAX_KOERPER) throw fehler(413, 'zu_gross');
    teile.push(t);
  }
  let d;
  try { d = JSON.parse(Buffer.concat(teile).toString('utf8') || '{}'); } catch { throw fehler(400, 'json_kaputt'); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw fehler(400, 'json_kaputt');
  return d;
}

// --- Was abgeglichen wird ---

function sammlungen({ gespraeche, gedaechtnis, routinen, erinnerungen }) {
  return {
    gespraeche: {
      // Nur Dateien mit Änderungszeit – entschlüsselt wird nur, was sich geändert hat.
      liste: () => gespraeche.dateiListe().map((d) => ({ id: d.id, m: d.zeit })),
      holen: (id) => gespraeche.lesen(id),
      uebernehmen: (id, daten) => gespraeche.uebernehmen({ ...daten, id }),
      loeschen: (id) => gespraeche.loeschen(id),
      zeit: (id) => gespraeche.dateiZeit(id),
    },
    gedaechtnis: {
      liste: () => Object.entries(gedaechtnis.alle()).map(([id, daten]) => ({ id, daten })),
      holen: (id) => sicher(() => gedaechtnis.alle(), {})[id] || null,
      uebernehmen: (id, daten) => gedaechtnis.uebernehmen(id, daten),
      loeschen: (id) => gedaechtnis.loeschen(id),
    },
    routinen: {
      liste: () => routinen.alle().map((r) => ({ id: r.id, daten: r })),
      holen: (id) => routinen.lesen(id),
      uebernehmen: (id, daten) => routinen.uebernehmen({ ...daten, id }),
      loeschen: (id) => routinen.loeschen(id),
    },
    erinnerungen: {
      liste: () => erinnerungen.alle().map((e) => ({ id: e.id, daten: e })),
      holen: (id) => sicher(() => erinnerungen.alle(), []).find((e) => e.id === id) || null,
      uebernehmen: (id, daten) => erinnerungen.uebernehmen({ ...daten, id }),
      loeschen: (id) => erinnerungen.loeschen(id),
    },
  };
}

function teilen(schluessel) {
  const i = String(schluessel).indexOf(':');
  if (i < 1) return null;
  const sammlung = schluessel.slice(0, i);
  return SAMMLUNGEN.includes(sammlung) ? { sammlung, id: schluessel.slice(i + 1) } : null;
}

// --- Das Gerät ---

class Sync extends EventEmitter {
  constructor({
    tresor, datenOrdner, module, name = os.hostname(), protokoll = () => {},
    adressen = () => [...lanAdressen(), ...unterwegsAdressen()], suchPort = SUCH_PORT, jetzt = () => Date.now(),
  }) {
    super();
    this.tresor = tresor;
    this.standDatei = path.join(datenOrdner, 'sync-stand.json');
    this.s = sammlungen(module);
    this.name = geraetName(name);
    this.protokoll = protokoll;
    this.adressenFinden = adressen;
    this.suchPort = suchPort;
    this.jetzt = jetzt;
    this.server = null;
    this.udp = null;
    this.port = null;
    this.timer = null;
    this.kopplung = null;
    this.fehler = null;
    this.stand = null;
    this.zustand = {};
    this.abgelehnt = new Set();
    this.fehlversuche = new Map();
    this.laeuftAbgleich = null;
    const d = this.tresor.lesen('sync') || {};
    this.id = d.geraet_id || crypto.randomBytes(8).toString('hex');
    if (!d.geraet_id) this.tresor.schreiben('sync', { geraet_id: this.id });
  }

  get laeuft() { return !!this.server; }

  get fingerabdruck() {
    const d = this.tresor.lesen('sync') || {};
    return d.zertifikat ? zertifikat.info(d.zertifikat).fingerabdruck : null;
  }

  geraete() {
    const d = this.tresor.lesen('sync') || {};
    return (d.geraete || [])
      .map((id) => ({ id, ...(this.tresor.lesen(`sync_geraet_${id}`) || {}) }))
      .filter((g) => g.fp && g.token && g.token_hash);
  }

  status() {
    const k = this.kopplung && this.kopplung.bis > this.jetzt() ? this.kopplung : null;
    return {
      laeuft: this.laeuft,
      port: this.port,
      name: this.name,
      adressen: this.laeuft ? this.adressenFinden().map((a) => `${a}:${this.port}`) : [],
      code: k ? { code: k.code, bis: k.bis } : null,
      geraete: this.geraete().map((g) => {
        const z = this.zustand[g.id] || {};
        return { id: g.id, name: g.name, adresse: g.adresse, zuletzt: z.zuletzt || null, fehler: z.fehler || null };
      }),
      fehler: this.fehler,
    };
  }

  // --- Start und Stopp ---

  _zertifikat() {
    const d = this.tresor.lesen('sync') || {};
    if (d.zertifikat && d.privat_schluessel) {
      try {
        if (zertifikat.info(d.zertifikat).gueltigBis.getTime() - Date.now() > 14 * 86400000) return { cert: d.zertifikat, key: d.privat_schluessel };
      } catch { /* neu erzeugen */ }
    }
    const neu = zertifikat.erzeugen({ adressen: this.adressenFinden() });
    this.tresor.schreiben('sync', { zertifikat: neu.zertifikat, privat_schluessel: neu.schluessel });
    return { cert: neu.zertifikat, key: neu.schluessel };
  }

  async starten(port, { takt = true } = {}) {
    if (this.server && this.port === port) return this.status();
    this.stoppen();
    this.fehler = null;
    const { cert, key } = this._zertifikat();
    const server = https.createServer({ cert, key, minVersion: 'TLSv1.2' }, (req, res) => {
      this._anfrage(req, res).catch((e) => {
        if (res.headersSent) { res.destroy(); return; }
        this._antwort(res, e.status || 500, { fehler: e.status ? e.message : 'intern' });
      });
    });
    server.headersTimeout = 10000;
    server.requestTimeout = 60000;
    server.maxConnections = 16;
    // Nur Heimnetz und VPN – schon vor TLS.
    server.on('connection', (s) => { if (!privateAdresse(s.remoteAddress)) s.destroy(); });
    server.on('tlsClientError', () => { /* abgebrochene Verbindungen */ });
    await new Promise((ok) => {
      server.once('error', (e) => { this.fehler = e.code === 'EADDRINUSE' ? 'port_belegt' : e.message; ok(); });
      server.listen(port, '0.0.0.0', () => {
        this.server = server;
        this.port = server.address().port;
        ok();
      });
    });
    if (this.server) {
      this._suchDienst();
      if (takt) {
        this.timer = setInterval(() => this.abgleichen().catch(() => {}), TAKT_MS);
        this.timer.unref();
        setTimeout(() => this.abgleichen().catch(() => {}), 3000).unref();
      }
    }
    this.emit('status');
    return this.status();
  }

  stoppen() {
    this.kopplung = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.udp) { try { this.udp.close(); } catch { /* schon zu */ } }
    this.udp = null;
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    s.close();
    if (s.closeAllConnections) s.closeAllConnections();
    this.emit('status');
  }

  // --- Im Heimnetz finden ---

  _suchDienst() {
    if (!this.suchPort) return;
    const u = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    u.on('error', () => { try { u.close(); } catch { /* egal */ } if (this.udp === u) this.udp = null; });
    u.on('message', (roh, rinfo) => {
      if (roh.length > 512 || !privateAdresse(rinfo.address)) return;
      let m;
      try { m = JSON.parse(roh.toString('utf8')); } catch { return; }
      if (!m || m.julia !== 'sync') return;
      const antwort = (x) => u.send(Buffer.from(JSON.stringify({ julia: 'sync', typ: 'hier', port: this.port, ...x })), rinfo.port, rinfo.address);
      const k = this.kopplung;
      if (m.typ === 'suche' && k && k.bis > this.jetzt() && m.kennung === kennung(k.code)) antwort({ kennung: m.kennung });
      else if (m.typ === 'wo' && m.geraet === this.id) antwort({ geraet: this.id });
    });
    u.bind(this.suchPort, () => { try { u.setBroadcast(true); } catch { /* egal */ } });
    this.udp = u;
  }

  _suchen(nachricht, passt, ms = 2500) {
    if (!this.suchPort) return Promise.resolve(null);
    return new Promise((ok) => {
      const u = dgram.createSocket('udp4');
      let timer = null;
      const fertig = (w) => {
        clearTimeout(timer);
        try { u.close(); } catch { /* egal */ }
        ok(w);
      };
      timer = setTimeout(() => fertig(null), ms);
      u.on('error', () => fertig(null));
      u.on('message', (roh, rinfo) => {
        let m;
        try { m = JSON.parse(roh.toString('utf8')); } catch { return; }
        if (m && m.julia === 'sync' && m.typ === 'hier' && Number.isInteger(m.port) && privateAdresse(rinfo.address) && passt(m)) {
          fertig({ adresse: ipNormal(rinfo.address), port: m.port });
        }
      });
      u.bind(0, () => {
        try { u.setBroadcast(true); } catch { /* egal */ }
        const b = Buffer.from(JSON.stringify({ julia: 'sync', ...nachricht }));
        for (const ziel of broadcastAdressen()) u.send(b, this.suchPort, ziel, () => {});
      });
    });
  }

  // --- Koppeln ---

  codeAnbieten() {
    if (!this.laeuft) throw new Error('aus');
    this.kopplung = { code: codeErzeugen(), bis: this.jetzt() + KOPPELN_MS, nonces: new Set() };
    this.emit('status');
    return { code: this.kopplung.code, bis: this.kopplung.bis, adressen: this.adressenFinden().map((a) => `${a}:${this.port}`) };
  }

  async beitreten({ code, adresse } = {}) {
    if (!this.laeuft) throw new Error('aus');
    const c = codeNormal(code);
    if (!c) throw new Error('code');
    let ziel;
    if (String(adresse || '').trim()) {
      ziel = adresseTeilen(adresse);
      if (!net.isIP(ziel.adresse) || !privateAdresse(ziel.adresse)) throw new Error('adresse');
    } else {
      ziel = await this._suchen({ typ: 'suche', kennung: kennung(c) }, (m) => m.kennung === kennung(c));
      if (!ziel) throw new Error('finden');
    }
    const hallo = await anfrage({ ...ziel, methode: 'GET', pfad: '/sync/hallo' });
    if (hallo.status === 429) throw new Error('gesperrt');
    if (hallo.status !== 200 || !hallo.json || typeof hallo.json.nonce !== 'string') throw new Error('code');
    const fpA = hallo.fp;
    const fpB = this.fingerabdruck;
    const nonceB = zufall();
    const tokenFuerMich = zufall(); // damit ruft das andere Gerät mich an
    const r = await anfrage({
      ...ziel,
      fp: fpA,
      methode: 'POST',
      pfad: '/sync/koppeln',
      daten: {
        geraet: this.id, name: this.name, fp: fpB, port: this.port, nonce: hallo.json.nonce, nonce_b: nonceB, token: tokenFuerMich,
        beweis: beweis(c, 'b', fpA, fpB, hallo.json.nonce, nonceB),
      },
    });
    if (r.status === 429) throw new Error('gesperrt');
    if (r.status !== 200 || !r.json) throw new Error('code');
    const j = r.json;
    // Erst gespeichert, wenn auch die andere Seite den Code bewiesen hat.
    if (!gleich(String(j.beweis || ''), beweis(c, 'a', fpA, fpB, hallo.json.nonce, nonceB))) throw new Error('fremd');
    if (!/^[a-f0-9]{16}$/.test(String(j.geraet)) || j.geraet !== hallo.json.geraet || !/^[A-Za-z0-9_-]{43}$/.test(String(j.token))) throw new Error('fremd');
    const name = geraetName(hallo.json.name);
    this._geraetMerken({ id: j.geraet, name, fp: fpA, adresse: ziel.adresse, port: ziel.port, token: j.token, token_hash: sha(tokenFuerMich), seit: new Date().toISOString() });
    this.protokoll({ stufe: 'GELB', ergebnis: 'gekoppelt', grund: `Gerät zum Abgleich gekoppelt: ${name} (${ziel.adresse})` });
    this.emit('status');
    this.abgleichen().catch(() => {});
    return { name };
  }

  _geraetMerken({ id, ...rest }) {
    this.tresor.schreiben(`sync_geraet_${id}`, rest);
    const d = this.tresor.lesen('sync') || {};
    this.tresor.schreiben('sync', { geraete: [...new Set([...(d.geraete || []), id])] });
  }

  entfernen(id) {
    const d = this.tresor.lesen('sync') || {};
    this.tresor.schreiben('sync', { geraete: (d.geraete || []).filter((x) => x !== id) });
    this.tresor.loeschen(`sync_geraet_${id}`);
    delete this.zustand[id];
    this.protokoll({ stufe: 'INFO', ergebnis: 'Gerät für den Abgleich entfernt' });
    this.emit('status');
  }

  // --- Server ---

  _antwort(res, code, daten) {
    const body = JSON.stringify(daten);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
    res.end(body);
  }

  _gesperrt(ip) {
    const f = this.fehlversuche.get(ip);
    return !!(f && f.bis > Date.now());
  }

  _fehlschlag(ip) {
    if (this.fehlversuche.size > 1000) this.fehlversuche.clear();
    const f = this.fehlversuche.get(ip) || { n: 0, bis: 0 };
    f.n++;
    if (f.n >= SPERRE_NACH) {
      f.n = 0;
      f.bis = Date.now() + SPERRE_MS;
      this.protokoll({ stufe: 'ROT', ergebnis: 'gesperrt', grund: `Abgleich: zu viele Fehlversuche von ${ip} – zehn Minuten gesperrt` });
    }
    this.fehlversuche.set(ip, f);
  }

  _angemeldet(req) {
    const id = String(req.headers['x-julia-geraet'] || '');
    const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
    if (!m || !/^[a-f0-9]{16}$/.test(id)) return null;
    const g = this.geraete().find((x) => x.id === id);
    return g && gleich(sha(m[1]), g.token_hash) ? g : null;
  }

  async _anfrage(req, res) {
    const ip = ipNormal(req.socket.remoteAddress);
    if (!privateAdresse(ip)) { req.socket.destroy(); return; }
    if (!hostErlaubt(req.headers.host)) { this._antwort(res, 421, { fehler: 'host' }); return; }
    if (this._gesperrt(ip)) { this._antwort(res, 429, { fehler: 'gesperrt' }); return; }
    const weg = `${req.method} ${new URL(req.url, 'https://julia.invalid').pathname}`;
    if (weg === 'GET /sync/hallo') { this._hallo(res); return; }
    if (weg === 'POST /sync/koppeln') { await this._koppeln(req, res, ip); return; }
    const g = this._angemeldet(req);
    if (!g) {
      this._fehlschlag(ip);
      this._antwort(res, 401, { fehler: 'nicht_gekoppelt' });
      return;
    }
    this.fehlversuche.delete(ip);
    if (g.adresse !== ip) this.tresor.schreiben(`sync_geraet_${g.id}`, { adresse: ip }); // neue IP merken
    if (weg === 'GET /sync/inventar') {
      this._scannen();
      this._antwort(res, 200, { geraet: this.id, inventar: this._inventar() });
      return;
    }
    if (weg === 'POST /sync/holen') {
      const d = await koerper(req);
      const liste = Array.isArray(d.schluessel) ? d.schluessel.slice(0, MAX_HOLEN) : [];
      this._antwort(res, 200, { eintraege: liste.map((k) => this._holen(String(k))).filter(Boolean) });
      return;
    }
    this._antwort(res, 404, { fehler: 'nicht_gefunden' });
  }

  _hallo(res) {
    const k = this.kopplung;
    if (!k || k.bis < this.jetzt()) { this._antwort(res, 404, { fehler: 'kein_code' }); return; }
    if (k.nonces.size >= 10) { this._antwort(res, 429, { fehler: 'gesperrt' }); return; }
    const nonce = zufall();
    k.nonces.add(nonce);
    this._antwort(res, 200, { geraet: this.id, name: this.name, nonce });
  }

  async _koppeln(req, res, ip) {
    const d = await koerper(req);
    const k = this.kopplung;
    const fpA = this.fingerabdruck;
    const ok = !!k && k.bis >= this.jetzt() && typeof d.nonce === 'string' && k.nonces.has(d.nonce)
      && /^[a-f0-9]{16}$/.test(String(d.geraet)) && d.geraet !== this.id
      && typeof d.fp === 'string' && d.fp.length < 200 && typeof d.nonce_b === 'string' && d.nonce_b.length < 100
      && /^[A-Za-z0-9_-]{43}$/.test(String(d.token))
      && gleich(String(d.beweis || ''), beweis(k.code, 'b', fpA, d.fp, d.nonce, d.nonce_b));
    if (!ok) {
      if (k && typeof d.nonce === 'string') k.nonces.delete(d.nonce);
      this._fehlschlag(ip);
      this._antwort(res, 401, { fehler: 'code' });
      return;
    }
    this.kopplung = null; // gilt nur einmal
    const tokenFuerDich = zufall();
    const port = Number.isInteger(d.port) && d.port > 0 && d.port < 65536 ? d.port : STANDARD_PORT;
    const name = geraetName(d.name);
    this._geraetMerken({ id: d.geraet, name, fp: d.fp, adresse: ip, port, token: d.token, token_hash: sha(tokenFuerDich), seit: new Date().toISOString() });
    this.fehlversuche.delete(ip);
    this.protokoll({ stufe: 'GELB', ergebnis: 'gekoppelt', grund: `Gerät zum Abgleich gekoppelt: ${name} (${ip})` });
    this.emit('status');
    this._antwort(res, 200, { geraet: this.id, beweis: beweis(k.code, 'a', fpA, d.fp, d.nonce, d.nonce_b), token: tokenFuerDich });
  }

  // --- Stand ---

  _standLaden() {
    if (this.stand) return this.stand;
    try { this.stand = JSON.parse(fs.readFileSync(this.standDatei, 'utf8')); } catch { this.stand = {}; }
    if (!this.stand || typeof this.stand !== 'object' || Array.isArray(this.stand)) this.stand = {};
    return this.stand;
  }

  _standSpeichern() {
    fs.mkdirSync(path.dirname(this.standDatei), { recursive: true });
    fs.writeFileSync(`${this.standDatei}.tmp`, JSON.stringify(this.stand || {}), 'utf8');
    fs.renameSync(`${this.standDatei}.tmp`, this.standDatei);
  }

  // Lokale Änderungen erkennen: neuer Fingerabdruck = neue Version,
  // verschwundener Eintrag = Grabstein.
  _scannen() {
    const st = this._standLaden();
    const jetzt = this.jetzt();
    const version = (alt) => Math.max(jetzt, alt && Number.isFinite(alt.v) ? alt.v + 1 : 0);
    const gesehen = new Set();
    const gelesen = new Set();
    let geaendert = false;
    for (const name of SAMMLUNGEN) {
      let liste;
      try { liste = this.s[name].liste(); } catch { continue; } // unlesbar: lieber nichts tun als alles "löschen"
      gelesen.add(name);
      for (const e of liste) {
        const key = `${name}:${e.id}`;
        gesehen.add(key);
        const alt = st[key];
        if (name === 'gespraeche') {
          if (alt && !alt.d && alt.m === e.m) continue; // Datei unverändert
          const daten = this.s.gespraeche.holen(e.id);
          if (!daten) continue;
          const h = sha(JSON.stringify(daten));
          if (alt && !alt.d && alt.h === h) { alt.m = e.m; geaendert = true; continue; }
          st[key] = { v: version(alt), h, m: e.m };
          geaendert = true;
        } else {
          const h = sha(JSON.stringify(e.daten));
          if (alt && !alt.d && alt.h === h) continue;
          st[key] = { v: version(alt), h };
          geaendert = true;
        }
      }
    }
    for (const [key, e] of Object.entries(st)) {
      const t = teilen(key);
      if (!t || !gelesen.has(t.sammlung) || gesehen.has(key)) continue;
      if (e.d) {
        if (jetzt - e.v > GRABSTEIN_MS) { delete st[key]; geaendert = true; }
        continue;
      }
      st[key] = { v: version(e), d: 1 };
      geaendert = true;
    }
    if (geaendert) this._standSpeichern();
  }

  _inventar() {
    const out = {};
    for (const [k, e] of Object.entries(this._standLaden())) out[k] = e.d ? { v: e.v, d: 1 } : { v: e.v, h: e.h };
    return out;
  }

  _holen(schluessel) {
    const t = teilen(schluessel);
    const e = this._standLaden()[schluessel];
    if (!t || !e || e.d) return null;
    const daten = sicher(() => this.s[t.sammlung].holen(t.id), null);
    return daten ? { schluessel, v: e.v, daten } : null;
  }

  _uebernehmen(schluessel, daten, v) {
    const t = teilen(schluessel);
    if (!t || !daten || typeof daten !== 'object' || Array.isArray(daten)) return false;
    const merk = `${schluessel}@${v}`;
    if (this.abgelehnt.has(merk)) return false;
    let ok = false;
    try { ok = this.s[t.sammlung].uebernehmen(t.id, daten) !== false; } catch { ok = false; }
    if (!ok) { this.abgelehnt.add(merk); return false; }
    // Fingerabdruck von dem, was jetzt wirklich hier liegt – sonst gälte es
    // beim nächsten Durchgang als eigene Änderung.
    const hier = sicher(() => this.s[t.sammlung].holen(t.id), null);
    if (!hier) return false;
    const e = { v, h: sha(JSON.stringify(hier)) };
    if (t.sammlung === 'gespraeche') e.m = this.s.gespraeche.zeit(t.id);
    this._standLaden()[schluessel] = e;
    return true;
  }

  _loeschen(schluessel) {
    const t = teilen(schluessel);
    if (t) sicher(() => this.s[t.sammlung].loeschen(t.id), false);
  }

  // --- Abgleich ---

  abgleichen() {
    if (!this.laeuft) return Promise.resolve({ ok: false });
    if (this.laeuftAbgleich) return this.laeuftAbgleich;
    this.laeuftAbgleich = (async () => {
      this._scannen();
      const betroffen = new Set();
      for (const g of this.geraete()) {
        try {
          await this._mit(g, betroffen);
          this.zustand[g.id] = { zuletzt: this.jetzt(), fehler: null };
        } catch (e) {
          this.zustand[g.id] = { ...(this.zustand[g.id] || {}), fehler: e.message };
        }
      }
      if (betroffen.size) this.emit('geaendert', [...betroffen]);
      this.emit('status');
      return { ok: true, betroffen: [...betroffen] };
    })().finally(() => { this.laeuftAbgleich = null; });
    return this.laeuftAbgleich;
  }

  async _mit(g, betroffen) {
    const inventar = (ziel) => anfrage({ ...ziel, fp: g.fp, token: g.token, geraet: this.id, pfad: '/sync/inventar' });
    let ziel = { adresse: g.adresse, port: g.port };
    let r;
    try {
      r = await inventar(ziel);
    } catch (e) {
      if (e.message !== 'offline') throw e;
      // Neue IP? Im Heimnetz nachfragen, wo das Gerät jetzt ist.
      const neu = await this._suchen({ typ: 'wo', geraet: g.id }, (m) => m.geraet === g.id);
      if (!neu) throw e;
      ziel = neu;
      r = await inventar(ziel);
      this.tresor.schreiben(`sync_geraet_${g.id}`, { adresse: ziel.adresse, port: ziel.port });
    }
    if (r.status === 401) throw new Error('nicht_gekoppelt');
    if (r.status !== 200 || !r.json || !r.json.inventar || typeof r.json.inventar !== 'object') throw new Error(`antwort_${r.status}`);
    const st = this._standLaden();
    const holen = [];
    for (const [key, e] of Object.entries(r.json.inventar)) {
      const t = teilen(key);
      if (!t || !e || !Number.isFinite(e.v)) continue;
      const mein = st[key];
      if (mein && mein.v >= e.v) continue; // meins ist gleich alt oder neuer
      if (e.d) {
        if (mein && !mein.d) { this._loeschen(key); betroffen.add(t.sammlung); }
        st[key] = { v: e.v, d: 1 };
        continue;
      }
      if (mein && !mein.d && mein.h === e.h) { mein.v = e.v; continue; } // gleicher Inhalt
      holen.push(key);
    }
    for (let a = 0; a < holen.length; a += MAX_HOLEN) {
      const teil = holen.slice(a, a + MAX_HOLEN);
      const h = await anfrage({ ...ziel, fp: g.fp, token: g.token, geraet: this.id, methode: 'POST', pfad: '/sync/holen', daten: { schluessel: teil } });
      if (h.status !== 200 || !h.json || !Array.isArray(h.json.eintraege)) throw new Error(`antwort_${h.status}`);
      for (const e of h.json.eintraege) {
        if (!e || !teil.includes(e.schluessel) || !Number.isFinite(e.v)) continue;
        if (this._uebernehmen(e.schluessel, e.daten, e.v)) betroffen.add(teilen(e.schluessel).sammlung);
      }
    }
    this._standSpeichern();
  }
}

module.exports = { Sync, codeErzeugen, codeNormal, adresseTeilen, broadcastAdressen, STANDARD_PORT };
