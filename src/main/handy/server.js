'use strict';

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const qrcode = require('qrcode-generator');
const zertifikat = require('./zertifikat');
const anzeige = require('../anzeige');

// Handy im WLAN: Julia als kleine Web-App im Handy-Browser. Ein HTTPS-Server im
// Hauptprozess, nur aus privaten Netzen erreichbar, mit genau einem gekoppelten
// Gerät. Gekoppelt wird per QR-Code am PC (Einmal-Code, fünf Minuten gültig);
// danach weist sich das Handy mit einem zufälligen Schlüssel aus, von dem der
// PC nur den SHA-256-Wert kennt. Die Ampel gilt unverändert – ROT bleibt ROT.

const WEB = path.join(__dirname, '..', '..', 'handy-web');
const DATEIEN = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
};
const KOPPELN_MS = 5 * 60 * 1000;
const WARTEN_MS = 25 * 1000;
const MAX_KOERPER = 16 * 1024;
const MAX_TEXT = 4000;
const MAX_VERLAUF = 120;
const SPERRE_NACH = 10;
const SPERRE_MS = 10 * 60 * 1000;

const SICHERHEIT = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const ipNormal = (ip) => String(ip || '').replace(/^::ffff:/i, '');

// VPN-Adressen aus 100.64.0.0/10 (Tailscale und andere VPNs mit CGNAT-Bereich).
function vpnAdresse(roh) {
  const ip = ipNormal(roh);
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

// Nur Heimnetz oder eigenes VPN: private IPv4-Bereiche, Link-Local, Loopback,
// private IPv6 und VPN-Adressen. Aus dem offenen Internet kommt niemand rein.
function privateAdresse(roh) {
  const ip = ipNormal(roh);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || vpnAdresse(ip);
  }
  if (net.isIPv6(ip)) {
    const k = ip.toLowerCase();
    return k === '::1' || /^f[cd]/.test(k) || /^fe[89ab]/.test(k);
  }
  return false;
}

// Gegen DNS-Rebinding: Die Seite wird nur über eine IP-Adresse aufgerufen.
function hostErlaubt(host) {
  const m = /^(\[[0-9a-f:.]+\]|[0-9.]+|localhost)(:\d{1,5})?$/.exec(String(host || '').toLowerCase());
  if (!m) return false;
  const name = m[1].replace(/^\[|\]$/g, '');
  return name === 'localhost' || net.isIP(name) !== 0;
}

// Adressen dieses PCs im Heimnetz; echte Netzwerkkarten vor virtuellen.
function lanAdressen(karten = os.networkInterfaces()) {
  const liste = [];
  for (const [karte, eintraege] of Object.entries(karten)) {
    for (const e of eintraege || []) {
      if (e.family !== 'IPv4' || e.internal || !privateAdresse(e.address) || vpnAdresse(e.address) || e.address.startsWith('169.254.')) continue;
      const virtuell = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|bluetooth|tailscale|zerotier/i.test(karte);
      liste.push({ adresse: e.address, virtuell });
    }
  }
  liste.sort((x, y) => x.virtuell - y.virtuell);
  return liste.map((x) => x.adresse);
}

// Adressen dieses PCs im VPN (z. B. Tailscale): Darüber erreicht das Handy
// Julia auch unterwegs – ohne offenen Port am Router.
function unterwegsAdressen(karten = os.networkInterfaces()) {
  const liste = [];
  for (const eintraege of Object.values(karten)) {
    for (const e of eintraege || []) if (e.family === 'IPv4' && !e.internal && vpnAdresse(e.address)) liste.push(e.address);
  }
  return liste;
}

function geraetName(ua) {
  const s = String(ua || '');
  const system = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'Mac' : 'Handy';
  const browser = /SamsungBrowser/.test(s) ? 'Samsung Internet' : /Firefox|FxiOS/.test(s) ? 'Firefox' : /Edg/.test(s) ? 'Edge' : /Chrome|CriOS/.test(s) ? 'Chrome' : /Safari/.test(s) ? 'Safari' : '';
  return browser ? `${system} · ${browser}` : system;
}

// QR-Code als Zeilen aus "0" und "1" – gemalt wird in den Einstellungen.
function qrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const zeilen = [];
  for (let r = 0; r < n; r++) {
    let z = '';
    for (let c = 0; c < n; c++) z += qr.isDark(r, c) ? '1' : '0';
    zeilen.push(z);
  }
  return zeilen;
}

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const gleich = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
const zufall = () => crypto.randomBytes(32).toString('base64url');
const fehler = (code, text) => Object.assign(new Error(text), { status: code });

class HandyServer extends EventEmitter {
  // tresor: Speicher für Zertifikat und Geräteschlüssel (Dienst "handy")
  // texte(): { sprachcode, name, akzent, texte } für die Handy-Seite
  // beiNachricht(text): Promise<{ ok } | { fehler }>
  constructor({ tresor, texte, beiNachricht, protokoll = () => {}, adressen = lanAdressen, unterwegs = unterwegsAdressen }) {
    super();
    this.tresor = tresor;
    this.texte = texte;
    this.beiNachricht = beiNachricht;
    this.protokoll = protokoll;
    this.adressenFinden = adressen;
    this.unterwegsFinden = unterwegs;
    this.server = null;
    this.startet = null;
    this.port = null;
    this.fehler = null;
    this.kopplung = null;
    this.seq = 0;
    this.verlauf = [];
    this.zustand = 'idle';
    this.beschaeftigt = false;
    this.wartende = new Set();
    this.fehlversuche = new Map();
    this.weckTimer = null;
    this.dateien = null;
    this.geraetHash = (this.tresor.lesen('handy') || {}).geraet_hash || null;
  }

  get laeuft() { return !!this.server; }

  status() {
    const e = this.tresor.lesen('handy') || {};
    let fingerabdruck = null;
    if (e.zertifikat) {
      try { fingerabdruck = zertifikat.info(e.zertifikat).fingerabdruck; } catch { /* wird beim Start neu erzeugt */ }
    }
    return {
      laeuft: this.laeuft,
      port: this.port,
      adressen: this.laeuft ? this.adressenFinden().map((a) => `https://${a}:${this.port}`) : [],
      unterwegs: this.unterwegsFinden(),
      gekoppelt: !!this.geraetHash,
      geraet: e.geraet_name || null,
      seit: e.geraet_seit || null,
      fingerabdruck,
      koppelnBis: this.kopplung ? this.kopplung.bis : null,
      fehler: this.fehler,
    };
  }

  // Zertifikat aus dem Tresor; neu, wenn es fehlt, bald abläuft oder eine
  // VPN-Adresse dazukam, die es noch nicht kennt.
  _zertifikat() {
    const e = this.tresor.lesen('handy') || {};
    const vpn = this.unterwegsFinden();
    const bekannt = Array.isArray(e.zertifikat_adressen) ? e.zertifikat_adressen : [];
    const vpnNeu = vpn.some((a) => !bekannt.includes(a));
    if (e.zertifikat && e.privat_schluessel && !vpnNeu) {
      try {
        if (zertifikat.info(e.zertifikat).gueltigBis.getTime() - Date.now() > 14 * 24 * 3600 * 1000) {
          return { cert: e.zertifikat, key: e.privat_schluessel };
        }
      } catch { /* neu erzeugen */ }
    }
    const adressen = [...this.adressenFinden(), ...vpn];
    const neu = zertifikat.erzeugen({ adressen });
    this.tresor.schreiben('handy', { zertifikat: neu.zertifikat, privat_schluessel: neu.schluessel, zertifikat_adressen: adressen });
    return { cert: neu.zertifikat, key: neu.schluessel };
  }

  _dateienLaden() {
    if (this.dateien) return;
    const d = {};
    for (const [pfad, [datei, typ]] of Object.entries(DATEIEN)) d[pfad] = { inhalt: fs.readFileSync(path.join(WEB, datei)), typ };
    this.dateien = d;
  }

  async starten(port) {
    if (this.startet) await this.startet.catch(() => {});
    if (this.server && this.port === port) return this.status();
    this.stoppen();
    this.fehler = null;
    this.startet = this._starten(port);
    try { return await this.startet; } finally { this.startet = null; }
  }

  _starten(port) {
    this._dateienLaden();
    const { cert, key } = this._zertifikat();
    const server = https.createServer({ cert, key, minVersion: 'TLSv1.2' }, (req, res) => {
      this._anfrage(req, res).catch((e) => {
        if (res.headersSent) { res.destroy(); return; }
        this._antwort(res, e.status || 500, { fehler: e.status ? e.message : 'intern' });
      });
    });
    server.headersTimeout = 10000;
    server.requestTimeout = 15000;
    server.maxConnections = 32;
    // Verbindungen von außerhalb des Heimnetzes schon vor TLS kappen.
    server.on('connection', (s) => { if (!privateAdresse(s.remoteAddress)) s.destroy(); });
    server.on('tlsClientError', () => { /* z. B. Zertifikat im Browser noch nicht bestätigt */ });
    return new Promise((resolve) => {
      server.once('error', (e) => {
        this.fehler = e.code === 'EADDRINUSE' ? 'port_belegt' : e.message;
        this.emit('status');
        resolve(this.status());
      });
      server.listen(port, '0.0.0.0', () => {
        this.server = server;
        this.port = server.address().port;
        this.emit('status');
        resolve(this.status());
      });
    });
  }

  stoppen() {
    this.kopplung = null;
    for (const w of [...this.wartende]) w.fertig();
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    s.close();
    if (s.closeAllConnections) s.closeAllConnections();
    this.emit('status');
  }

  koppelnStarten() {
    if (!this.laeuft) throw new Error('Der Handy-Server läuft nicht.');
    // Mit VPN über dessen Adresse koppeln: Die gilt zu Hause und unterwegs.
    const adresse = this.unterwegsFinden()[0] || this.adressenFinden()[0];
    if (!adresse) throw new Error('kein_netz');
    const code = zufall();
    this.kopplung = { hash: hash(code), bis: Date.now() + KOPPELN_MS };
    this.emit('status');
    return { url: `https://${adresse}:${this.port}/#k=${code}`, bis: this.kopplung.bis };
  }

  trennen() {
    this.geraetHash = null;
    this.kopplung = null;
    this.tresor.schreiben('handy', { geraet_hash: null, geraet_name: null, geraet_seit: null });
    for (const w of [...this.wartende]) w.fertig();
    this.protokoll({ stufe: 'INFO', ergebnis: 'Handy getrennt' });
    this.emit('status');
  }

  // --- Gesprächsstand, den das Handy anzeigt ---

  ereignis(art, daten = {}) {
    this._anwenden(art, daten);
    this.seq++;
    if (this.weckTimer) return;
    // Kurz sammeln, damit nicht jedes Textstück eine eigene Antwort auslöst.
    this.weckTimer = setTimeout(() => {
      this.weckTimer = null;
      for (const w of [...this.wartende]) w.fertig();
    }, 120);
    this.weckTimer.unref();
  }

  _anwenden(art, d) {
    if (art === 'start') this.beschaeftigt = true;
    if (art === 'fertig') this.beschaeftigt = false;
    if (art === 'zustand') this.zustand = String(d.zustand || 'idle');
    anzeige.anwenden(this.verlauf, art, d, MAX_VERLAUF);
  }

  // --- HTTP ---

  _antwort(res, code, daten) {
    const body = JSON.stringify(daten);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  async _koerper(req) {
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
      this.protokoll({ stufe: 'ROT', ergebnis: 'gesperrt', grund: `Zu viele Fehlversuche von ${ip} – zehn Minuten gesperrt` });
    }
    this.fehlversuche.set(ip, f);
  }

  _angemeldet(req) {
    const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
    return !!(m && this.geraetHash && gleich(hash(m[1]), Buffer.from(this.geraetHash, 'hex')));
  }

  async _anfrage(req, res) {
    const ip = ipNormal(req.socket.remoteAddress);
    if (!privateAdresse(ip)) { req.socket.destroy(); return; }
    for (const [k, v] of Object.entries(SICHERHEIT)) res.setHeader(k, v);
    if (!hostErlaubt(req.headers.host)) { this._antwort(res, 421, { fehler: 'host' }); return; }
    const url = new URL(req.url, 'https://julia.invalid');

    const datei = req.method === 'GET' && this.dateien[url.pathname];
    if (datei) {
      res.writeHead(200, { 'Content-Type': datei.typ, 'Content-Length': datei.inhalt.length });
      res.end(datei.inhalt);
      return;
    }
    if (!url.pathname.startsWith('/api/')) { this._antwort(res, 404, { fehler: 'nicht_gefunden' }); return; }
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `https://${req.headers.host}`) {
      this._antwort(res, 403, { fehler: 'herkunft' });
      return;
    }
    if (this._gesperrt(ip)) { this._antwort(res, 429, { fehler: 'gesperrt' }); return; }

    const weg = `${req.method} ${url.pathname}`;
    if (weg === 'GET /api/texte') { this._antwort(res, 200, this.texte()); return; }
    if (weg === 'POST /api/koppeln') { await this._koppeln(req, res, ip); return; }
    if (!this._angemeldet(req)) {
      this._fehlschlag(ip);
      this._antwort(res, 401, { fehler: 'nicht_gekoppelt' });
      return;
    }
    this.fehlversuche.delete(ip);

    switch (weg) {
      case 'GET /api/stand':
        this._stand(req, res, url);
        return;
      case 'POST /api/senden': {
        const d = await this._koerper(req);
        const text = String(d.text || '').trim();
        if (!text || text.length > MAX_TEXT) { this._antwort(res, 400, { fehler: 'text' }); return; }
        const r = (await this.beiNachricht(text)) || { fehler: 'unbekannt' };
        this._antwort(res, r.ok ? 200 : 409, r);
        return;
      }
      case 'POST /api/freigabe': {
        const d = await this._koerper(req);
        if (!Number.isInteger(d.id) || typeof d.ja !== 'boolean') { this._antwort(res, 400, { fehler: 'freigabe' }); return; }
        this.emit('freigabe', { id: d.id, ja: d.ja });
        this._antwort(res, 200, { ok: true });
        return;
      }
      case 'POST /api/stopp':
        this.emit('stopp');
        this._antwort(res, 200, { ok: true });
        return;
      case 'POST /api/neu':
        this.emit('neu');
        this._antwort(res, 200, { ok: true });
        return;
      default:
        this._antwort(res, 404, { fehler: 'nicht_gefunden' });
    }
  }

  async _koppeln(req, res, ip) {
    const d = await this._koerper(req);
    const code = String(d.code || '');
    const k = this.kopplung;
    if (!k || Date.now() > k.bis || !/^[A-Za-z0-9_-]{43}$/.test(code) || !gleich(hash(code), k.hash)) {
      this._fehlschlag(ip);
      this._antwort(res, 401, { fehler: 'code' });
      return;
    }
    this.kopplung = null; // gilt nur einmal
    const schluessel = zufall();
    const name = geraetName(req.headers['user-agent']);
    this.geraetHash = hash(schluessel).toString('hex');
    this.tresor.schreiben('handy', { geraet_hash: this.geraetHash, geraet_name: name, geraet_seit: new Date().toISOString() });
    this.fehlversuche.delete(ip);
    this.protokoll({ stufe: 'GELB', ergebnis: 'gekoppelt', grund: `Handy gekoppelt: ${name} (${ip})` });
    this.emit('status');
    this._antwort(res, 200, { schluessel });
  }

  // Liefert den Gesprächsstand – auf Wunsch erst, wenn sich etwas ändert
  // (lange Anfrage, höchstens 25 Sekunden).
  _stand(req, res, url) {
    const ab = Number(url.searchParams.get('ab'));
    const senden = () => {
      if (res.writableEnded) return;
      if (!this._angemeldet(req)) { this._antwort(res, 401, { fehler: 'nicht_gekoppelt' }); return; }
      this._antwort(res, 200, { seq: this.seq, verlauf: this.verlauf, beschaeftigt: this.beschaeftigt, zustand: this.zustand, ...this.texte() });
    };
    if (url.searchParams.get('warten') !== '1' || !Number.isFinite(ab) || ab < this.seq || !this.laeuft) { senden(); return; }
    const w = {
      fertig: () => {
        clearTimeout(w.timer);
        this.wartende.delete(w);
        senden();
      },
    };
    w.timer = setTimeout(w.fertig, WARTEN_MS);
    w.timer.unref();
    this.wartende.add(w);
    res.on('close', () => { clearTimeout(w.timer); this.wartende.delete(w); });
  }
}

module.exports = { HandyServer, privateAdresse, vpnAdresse, hostErlaubt, lanAdressen, unterwegsAdressen, geraetName, qrMatrix };
