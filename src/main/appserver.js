'use strict';

const http = require('http');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { privateAdresse, lanAdressen, unterwegsAdressen } = require('./netz');

// Kleiner lokaler API-Server, über den die Julia-Android-App den PC bedient.
// Bewusst schlicht und sicher gehalten:
//  - lauscht nur auf Anfragen aus dem Heimnetz oder dem eigenen VPN
//    (100.64.0.0/10, z. B. Tailscale/NetBird), nie aus dem offenen Internet;
//  - einmal per Code gekoppelt, danach weist sich die App mit einem Token aus
//    (nur dessen Hash liegt verschlüsselt im Tresor);
//  - jede Nachricht läuft durch die normale Julia inklusive Ampel – Freigaben
//    (GELB/ROT) erscheinen wie immer am PC.
// Klartext-HTTP genügt hier: im Heimnetz vertraut, im VPN ohnehin verschlüsselt;
// so entfällt das Zertifikatsproblem selbstsignierter TLS-Verbindungen in der App.

const KOPPELN_MS = 5 * 60 * 1000;
const MAX_KOERPER = 32 * 1024;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford, ohne I L O U

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const gleich = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

function codeErzeugen() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] & 31];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

const codeNormal = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

class AppServer extends EventEmitter {
  // tresor: verschlüsselter Speicher (Dienst "appserver").
  // beiNachricht(text): Promise<string> – die Antwort der PC-Julia.
  constructor({ tresor, beiNachricht, protokoll = () => {}, adressen = lanAdressen, unterwegs = unterwegsAdressen }) {
    super();
    this.tresor = tresor;
    this.beiNachricht = beiNachricht;
    this.protokoll = protokoll;
    this.adressenFinden = adressen;
    this.unterwegsFinden = unterwegs;
    this.server = null;
    this.port = 0;
    this.fehler = null;
    this.kopplung = null; // { hash, bis }
    this.fehlversuche = new Map();
    this.tokenHash = (this.tresor.lesen('appserver') || {}).token_hash || null;
  }

  get laeuft() { return !!this.server; }

  status() {
    return {
      laeuft: this.laeuft,
      port: this.port,
      gekoppelt: !!this.tokenHash,
      adressen: this.laeuft ? [...this.adressenFinden(), ...this.unterwegsFinden()].map((a) => `${a}:${this.port}`) : [],
      koppelnBis: this.kopplung ? this.kopplung.bis : null,
      fehler: this.fehler,
    };
  }

  koppelnStarten() {
    if (!this.laeuft) throw new Error('aus');
    const code = codeErzeugen();
    this.kopplung = { hash: hash(codeNormal(code)), bis: Date.now() + KOPPELN_MS };
    this.emit('status');
    return { code, bis: this.kopplung.bis };
  }

  trennen() {
    this.tresor.schreiben('appserver', { token: null });
    this.tokenHash = null;
    this.kopplung = null;
    this.emit('status');
  }

  async starten(port) {
    if (this.server && this.port === port) return this.status();
    this.stoppen();
    this.fehler = null;
    const server = http.createServer((req, res) => {
      this._anfrage(req, res).catch(() => { if (!res.headersSent) this._json(res, 500, { fehler: 'intern' }); });
    });
    server.on('connection', (s) => { if (!privateAdresse(s.remoteAddress)) s.destroy(); });
    server.headersTimeout = 10000;
    return new Promise((resolve) => {
      server.once('error', (e) => { this.fehler = e.code === 'EADDRINUSE' ? 'port_belegt' : e.message; this.emit('status'); resolve(this.status()); });
      server.listen(port, '0.0.0.0', () => { this.server = server; this.port = server.address().port; this.emit('status'); resolve(this.status()); });
    });
  }

  stoppen() {
    this.kopplung = null;
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    s.close();
    if (s.closeAllConnections) s.closeAllConnections();
    this.emit('status');
  }

  _json(res, code, obj) {
    const text = JSON.stringify(obj);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(text);
  }

  _gesperrt(ip) {
    const e = this.fehlversuche.get(ip);
    return e && e.bis > Date.now() && e.n >= 10;
  }

  _fehlschlag(ip) {
    const e = this.fehlversuche.get(ip) || { n: 0, bis: 0 };
    e.n += 1;
    e.bis = Date.now() + 15 * 60 * 1000;
    this.fehlversuche.set(ip, e);
  }

  _tokenOk(req) {
    if (!this.tokenHash) return false;
    const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
    if (!m) return false;
    try { return gleich(Buffer.from(this.tokenHash, 'hex'), hash(m[1])); } catch { return false; }
  }

  async _koerper(req) {
    return new Promise((resolve, reject) => {
      let n = 0;
      const teile = [];
      req.on('data', (d) => { n += d.length; if (n > MAX_KOERPER) { reject(new Error('zu groß')); req.destroy(); } else teile.push(d); });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(teile).toString('utf8') || '{}')); } catch { reject(new Error('kein JSON')); } });
      req.on('error', reject);
    });
  }

  async _anfrage(req, res) {
    const ip = String(req.socket.remoteAddress || '');
    if (!privateAdresse(ip)) { res.socket.destroy(); return; }
    const weg = `${req.method} ${(req.url || '').split('?')[0]}`;

    if (weg === 'POST /api/koppeln') {
      if (this._gesperrt(ip)) { this._json(res, 429, { fehler: 'gesperrt' }); return; }
      const d = await this._koerper(req).catch(() => ({}));
      if (!this.kopplung || this.kopplung.bis < Date.now() || !gleich(this.kopplung.hash, hash(codeNormal(d.code)))) {
        this._fehlschlag(ip);
        this._json(res, 401, { fehler: 'code' });
        return;
      }
      const token = crypto.randomBytes(32).toString('base64url');
      this.tokenHash = hash(token).toString('hex');
      this.tresor.schreiben('appserver', { token }); // "token" ist GEHEIM → verschlüsselt
      this.kopplung = null;
      this.fehlversuche.delete(ip);
      this.protokoll({ stufe: 'INFO', ergebnis: 'Android-App gekoppelt' });
      this.emit('status');
      this._json(res, 200, { token, name: this._name() });
      return;
    }

    if (!this._tokenOk(req)) { this._json(res, 401, { fehler: 'anmelden' }); return; }

    if (weg === 'GET /api/status') { this._json(res, 200, { name: this._name() }); return; }

    if (weg === 'POST /api/chat') {
      const d = await this._koerper(req).catch(() => ({}));
      const text = String(d.text || '').slice(0, 4000).trim();
      if (!text) { this._json(res, 400, { fehler: 'leer' }); return; }
      try {
        const antwort = await this.beiNachricht(text);
        this._json(res, 200, { antwort: String(antwort || '') });
      } catch (e) {
        this._json(res, 503, { fehler: e && e.message === 'BESCHAEFTIGT' ? 'beschaeftigt' : 'fehler' });
      }
      return;
    }

    this._json(res, 404, { fehler: 'nicht_gefunden' });
  }

  _name() {
    const e = this.tresor.lesen('appserver') || {};
    return e.name || 'Julia';
  }
}

module.exports = { AppServer, codeErzeugen, codeNormal };
