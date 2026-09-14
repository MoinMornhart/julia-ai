'use strict';

const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// Proxmox-Relay: Julia verbindet sich von sich aus mit deinem eigenen
// Relay-Server (WebSocket über HTTPS) – am PC öffnet sich kein Port. Das Relay
// reicht die Anfragen der Handy-Seite durch, sobald du dich dort mit deinem
// Passkey angemeldet hast. Gekoppelt wird einmal per Code, den du am Relay
// eingibst; danach weist sich Julia mit einem Schlüssel aus, der verschlüsselt
// im Tresor liegt. Das Relay-Zertifikat prüft Julia wie jeder Browser.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: ohne I, L, O, U
const KOPPELN_MS = 10 * 60 * 1000;
const MAX_KOERPER = 64 * 1024;
const MAX_WARTEN_MS = 60 * 1000;

function codeErzeugen() {
  const b = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[b[i] & 31];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// "https://julia.example.org/" → "julia.example.org"; leer bleibt leer.
function adressePruefen(roh) {
  const s = String(roh || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!s) return '';
  if (s.length > 253 || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(:\d{1,5})?$/.test(s)) {
    throw new Error('Das ist keine gültige Adresse – zum Beispiel julia.meinname.duckdns.org');
  }
  return s;
}

class RelayKlient extends EventEmitter {
  // tresor: verschlüsselter Speicher (Dienst "relay"); handy: der HandyServer
  // (tunnelAnfrage). WebSocketKlasse, url und pause lassen sich für Tests ersetzen.
  constructor({
    tresor, handy, name = os.hostname(), protokoll = () => {},
    WebSocketKlasse = globalThis.WebSocket, url = (a) => `wss://${a}/_relay/tunnel`,
    pause = (versuch) => Math.min(MAX_WARTEN_MS, 2000 * 2 ** versuch),
  }) {
    super();
    this.tresor = tresor;
    this.handy = handy;
    this.name = String(name || 'PC').slice(0, 60);
    this.protokoll = protokoll;
    this.WebSocketKlasse = WebSocketKlasse;
    this.url = url;
    this.pause = pause;
    this.an = false;
    this.adresse = '';
    this.zustand = 'aus';
    this.fehler = null;
    this.code = null;
    this.codeBis = 0;
    this.ws = null;
    this.art = null;
    this.versuch = 0;
    this.timer = null;
  }

  _gespeichert() {
    return (this.tresor && this.tresor.lesen('relay')) || {};
  }

  get gekoppelt() {
    const t = this._gespeichert();
    return !!(t.token && t.adresse && t.adresse === this.adresse);
  }

  status() {
    const t = this._gespeichert();
    return {
      an: this.an,
      adresse: this.adresse,
      gekoppelt: this.gekoppelt,
      seit: this.gekoppelt ? t.seit || null : null,
      zustand: this.zustand,
      fehler: this.fehler,
      code: this.code && Date.now() < this.codeBis ? this.code : null,
      codeBis: this.codeBis,
    };
  }

  _setzen(zustand, fehler = this.fehler) {
    this.zustand = zustand;
    this.fehler = fehler;
    this.emit('status');
  }

  // Einstellungen übernehmen: an/aus und Adresse. Gekoppelt? Dann gleich verbinden.
  anwenden({ an, adresse }) {
    this.an = !!an;
    this.adresse = String(adresse || '');
    this._schliessen();
    this.code = null;
    this.versuch = 0;
    if (!this.an) { this._setzen('aus', null); return; }
    if (!this.adresse) { this._setzen('keine_adresse', null); return; }
    if (!this.gekoppelt) { this._setzen('nicht_gekoppelt', null); return; }
    this._verbinden('hallo');
  }

  // Neuen Code zeigen und am Relay warten, bis du ihn dort eingibst.
  koppelnStarten() {
    if (!this.an) throw new Error('aus');
    if (!this.adresse) throw new Error('adresse');
    if (typeof this.WebSocketKlasse !== 'function') throw new Error('websocket');
    this._schliessen();
    this.code = codeErzeugen();
    this.codeBis = Date.now() + KOPPELN_MS;
    this._verbinden('koppeln');
    return { code: this.code, bis: this.codeBis };
  }

  trennen() {
    this.tresor.schreiben('relay', { token: null, adresse: null, seit: null });
    this.code = null;
    this._schliessen();
    this.protokoll('Vom Proxmox-Relay getrennt');
    this._setzen(this.an ? 'nicht_gekoppelt' : 'aus', null);
  }

  _schliessen() {
    clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(); } catch { /* schon zu */ } }
  }

  _verbinden(art) {
    let ws;
    try {
      ws = new this.WebSocketKlasse(this.url(this.adresse));
    } catch (e) {
      this._setzen('fehler', e.message);
      return;
    }
    this.ws = ws;
    this.art = art;
    this._setzen(art === 'koppeln' ? 'wartet' : 'verbindet', null);
    ws.onopen = () => {
      if (ws !== this.ws) return;
      const hallo = art === 'koppeln'
        ? { art: 'koppeln', code_hash: hash(this.code), name: this.name }
        : { art: 'hallo', token: this._gespeichert().token, name: this.name };
      ws.send(JSON.stringify(hallo));
    };
    ws.onmessage = (ev) => { this._nachricht(ws, ev.data).catch(() => { /* eine Anfrage verloren */ }); };
    ws.onerror = () => { /* kommt als close */ };
    ws.onclose = (ev) => this._zu(ws, ev && ev.code);
  }

  async _nachricht(ws, roh) {
    if (ws !== this.ws) return;
    let m;
    try { m = JSON.parse(typeof roh === 'string' ? roh : Buffer.from(roh).toString('utf8')); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.art === 'gekoppelt' && typeof m.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(m.token)) {
      this.tresor.schreiben('relay', { token: m.token, adresse: this.adresse, seit: new Date().toISOString() });
      this.code = null;
      this.art = 'hallo'; // ab jetzt mit Schlüssel
      this.protokoll(`Mit dem Proxmox-Relay ${this.adresse} gekoppelt`);
      this.emit('status');
    } else if (m.art === 'bereit') {
      this.versuch = 0;
      this._setzen('verbunden', null);
    } else if (m.art === 'wartet') {
      this._setzen('wartet', null);
    } else if (m.art === 'fehler' && m.grund === 'unbekannt') {
      // Das Relay kennt diesen PC nicht mehr (dort getrennt): Schlüssel wegwerfen.
      this.tresor.schreiben('relay', { token: null, adresse: null, seit: null });
    } else if (m.art === 'anfrage') {
      await this._anfrage(ws, m);
    }
  }

  async _anfrage(ws, m) {
    if (!Number.isInteger(m.id)) return;
    let r;
    try {
      const koerper = Buffer.from(String(m.koerper || ''), 'base64');
      const pfad = String(m.pfad || '/');
      if (koerper.length > MAX_KOERPER || !pfad.startsWith('/') || pfad.length > 1024) throw new Error('anfrage');
      const k = m.kopf && typeof m.kopf === 'object' ? m.kopf : {};
      const kopf = {};
      if (typeof k['content-type'] === 'string') kopf['content-type'] = k['content-type'].slice(0, 100);
      if (typeof k['user-agent'] === 'string') kopf['user-agent'] = k['user-agent'].slice(0, 300);
      r = await this.handy.tunnelAnfrage({ methode: String(m.methode || 'GET'), pfad, kopf, koerper });
    } catch {
      r = { code: 400, typ: 'application/json; charset=utf-8', koerper: Buffer.from('{"fehler":"anfrage"}') };
    }
    if (ws === this.ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ art: 'antwort', id: m.id, code: r.code, typ: r.typ, koerper: r.koerper.toString('base64') }));
    }
  }

  _zu(ws, code) {
    if (ws !== this.ws) return;
    this.ws = null;
    if (!this.an) return;
    if (code === 4003 || !this.gekoppelt) {
      // Unbekannt oder nie gekoppelt: nicht endlos neu versuchen.
      const abgelaufen = this.art === 'koppeln' && code === 4008;
      this.code = null;
      this._setzen('nicht_gekoppelt', code === 4003 ? 'unbekannt' : abgelaufen ? 'abgelaufen' : this.art === 'koppeln' ? 'keine_verbindung' : null);
      return;
    }
    const warte = this.pause(this.versuch++);
    this._setzen('getrennt', null);
    this.timer = setTimeout(() => { this.timer = null; if (this.an && this.gekoppelt) this._verbinden('hallo'); }, warte);
    if (this.timer.unref) this.timer.unref();
  }
}

module.exports = { RelayKlient, adressePruefen, codeErzeugen };
