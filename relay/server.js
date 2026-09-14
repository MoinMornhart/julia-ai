'use strict';

// Julia-Relay: macht Julia von überall erreichbar, solange dein PC läuft.
//  - Anmeldung nur per Passkey (WebAuthn) – keine Passwörter, nichts zu erraten.
//  - Der PC verbindet sich von sich aus hierher (WebSocket); am PC ist kein
//    Port offen. Gekoppelt wird einmal mit einem Code aus Julias Einstellungen.
//  - Hinter der Anmeldung reicht das Relay Julias Handy-Seite durch – aber nur
//    die Adressen, die die Handy-Seite wirklich braucht.
// Läuft hinter Caddy (HTTPS mit Let's Encrypt) und hört nur auf 127.0.0.1.
//
//   JULIA_RELAY_DOMAIN=julia.example.org node server.js            Server
//   JULIA_RELAY_DOMAIN=julia.example.org node server.js einrichten  Einrichtungslink

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const wa = require('./webauthn');

const OEFFENTLICH = path.join(__dirname, 'public');
const DATEIEN = {
  '/_relay/': ['index.html', 'text/html; charset=utf-8'],
  '/_relay/relay.js': ['relay.js', 'text/javascript; charset=utf-8'],
  '/_relay/relay.css': ['relay.css', 'text/css; charset=utf-8'],
};
const SITZUNG_MS = 30 * 24 * 3600 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const EINRICHTEN_MS = 24 * 3600 * 1000;
const KOPPELN_MS = 10 * 60 * 1000;
const HALLO_MS = 10 * 1000;
const ANFRAGE_MS = 40 * 1000;
const PING_MS = 25 * 1000;
const MAX_KOERPER = 64 * 1024;
const MAX_ANTWORT = 4 * 1024 * 1024;
const MAX_WARTEND = 5;
const MAX_PASSKEYS = 10;
const SPERRE_NACH = 10;
const SPERRE_MS = 15 * 60 * 1000;
const COOKIE = '__Host-julia';

// Nur diese Adressen der Handy-Seite gehen an den PC.
const DURCHREICHEN = new Set([
  'GET /', 'GET /app.js', 'GET /app.css', 'GET /api/texte', 'GET /api/stand',
  'POST /api/senden', 'POST /api/freigabe', 'POST /api/stopp', 'POST /api/neu',
]);
const TYPEN = /^(text\/html|text\/javascript|text\/css|application\/json)(; ?charset=utf-8)?$/i;

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

const zufall = (n = 32) => crypto.randomBytes(n).toString('base64url');
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const fehler = (status, text) => Object.assign(new Error(text), { status });
const nameSauber = (s, max) => String(s || '').replace(/[^\p{L}\p{N} ._'()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);

// Kopplungscode wie in Julia: 12 Zeichen Crockford, Tippfehler verziehen.
function codeNormal(roh) {
  const s = String(roh || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

function domainPruefen(roh) {
  const s = String(roh || '').trim().toLowerCase();
  if (s.length > 253 || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(:\d{1,5})?$/.test(s)) {
    throw new Error(`Das ist keine gültige Domain: "${roh}" (Beispiel: julia.meinname.duckdns.org).`);
  }
  return s;
}

function geraetName(ua) {
  const s = String(ua || '');
  const system = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'Mac' : 'Gerät';
  const browser = /SamsungBrowser/.test(s) ? 'Samsung Internet' : /Firefox|FxiOS/.test(s) ? 'Firefox' : /Edg/.test(s) ? 'Edge' : /Chrome|CriOS/.test(s) ? 'Chrome' : /Safari/.test(s) ? 'Safari' : '';
  return browser ? `${system} · ${browser}` : system;
}

// Daten auf der Platte: Passkeys (nur öffentliche Schlüssel) und der Hash des
// PC-Schlüssels. Nur für den Dienst lesbar (0600).
function speicherOeffnen(datei) {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(datei, 'utf8')) || {}; } catch { d = {}; }
  const daten = { passkeys: Array.isArray(d.passkeys) ? d.passkeys : [], pc: d.pc || null, nutzerId: d.nutzerId || zufall(16) };
  const sichern = () => {
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    const neu = `${datei}.neu`;
    fs.writeFileSync(neu, JSON.stringify(daten, null, 2), { mode: 0o600 });
    fs.renameSync(neu, datei);
  };
  if (!d.nutzerId) sichern();
  return { daten, sichern };
}

// Der Einrichtungslink kommt aus der Konsole des Servers – wer ihn hat, hat
// Zugriff auf den Server selbst. Er gilt 24 Stunden und nur einmal.
function einrichtungsLink({ domain, ordner, jetzt = Date.now }) {
  const host = domainPruefen(domain);
  const t = zufall(32);
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'einrichtung.json'), JSON.stringify({ hash: hash(t), bis: jetzt() + EINRICHTEN_MS }), { mode: 0o600 });
  return `https://${host}/_relay/#einrichten=${t}`;
}

function relayErstellen({ domain, ordner, jetzt = Date.now, protokoll = () => {} }) {
  const host = domainPruefen(domain);
  const origin = `https://${host}`;
  const rpId = host.replace(/:\d+$/, '');
  const { daten, sichern } = speicherOeffnen(path.join(ordner, 'daten.json'));
  const einrichtungsDatei = path.join(ordner, 'einrichtung.json');
  const sitzungen = new Map(); // Hash des Cookies -> { bis, passkey }
  const challenges = new Map(); // Challenge -> { art, bis, ... } – gilt nur einmal
  const wartende = new Map(); // Hash des Kopplungscodes -> { ws, name, bis, ablauf }
  const offen = new Map(); // Anfrage-Nr. -> { res, timer, pc }
  const fehlversuche = new Map();
  let pc = null; // { ws, name }
  let anfrageNr = 0;
  const dateien = {};
  for (const [pfad, [datei, typ]] of Object.entries(DATEIEN)) dateien[pfad] = { inhalt: fs.readFileSync(path.join(OEFFENTLICH, datei)), typ };
  const iso = () => new Date(jetzt()).toISOString();

  // Hinter Caddy steht die echte Adresse in X-Forwarded-For (Caddy setzt sie selbst).
  function ipVon(req) {
    const direkt = String(req.socket.remoteAddress || '');
    if (/^(::ffff:)?127\.0\.0\.1$|^::1$/.test(direkt)) {
      const liste = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (liste.length) return liste[liste.length - 1].slice(0, 64);
    }
    return direkt;
  }

  const gesperrt = (ip) => { const f = fehlversuche.get(ip); return !!(f && f.bis > jetzt()); };
  function fehlschlag(ip) {
    if (fehlversuche.size > 5000) fehlversuche.clear();
    const f = fehlversuche.get(ip) || { n: 0, bis: 0 };
    f.n += 1;
    if (f.n >= SPERRE_NACH) {
      f.n = 0;
      f.bis = jetzt() + SPERRE_MS;
      protokoll(`Zu viele Fehlversuche von ${ip} – 15 Minuten gesperrt`);
    }
    fehlversuche.set(ip, f);
  }

  function json(res, code, d) {
    const body = JSON.stringify(d);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function umleiten(res, ziel) {
    res.writeHead(302, { Location: ziel, 'Content-Length': 0 });
    res.end();
  }

  async function koerperLesen(req) {
    const teile = [];
    let n = 0;
    for await (const t of req) {
      n += t.length;
      if (n > MAX_KOERPER) throw fehler(413, 'zu_gross');
      teile.push(t);
    }
    return Buffer.concat(teile);
  }

  async function jsonLesen(req) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw fehler(415, 'json_erwartet');
    let d;
    try { d = JSON.parse((await koerperLesen(req)).toString('utf8') || '{}'); } catch (e) { if (e.status) throw e; throw fehler(400, 'json_kaputt'); }
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw fehler(400, 'json_kaputt');
    return d;
  }

  // --- Sitzungen und Challenges ---

  function sitzung(req) {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{43})(?:;|$)`).exec(req.headers.cookie || '');
    if (!m) return null;
    const schluessel = hash(m[1]);
    const s = sitzungen.get(schluessel);
    if (!s || s.bis < jetzt() || !daten.passkeys.some((p) => p.id === s.passkey)) return null;
    return { ...s, schluessel };
  }

  function sitzungStarten(res, passkey) {
    const t = zufall(32);
    sitzungen.set(hash(t), { bis: jetzt() + SITZUNG_MS, passkey });
    res.setHeader('Set-Cookie', `${COOKIE}=${t}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SITZUNG_MS / 1000}`);
  }

  function challengeNeu(art, extra = {}) {
    if (challenges.size > 1000) challenges.clear();
    const c = zufall(32);
    challenges.set(c, { art, bis: jetzt() + CHALLENGE_MS, ...extra });
    return c;
  }

  // Die Challenge steht in clientDataJSON – sie gilt nur einmal.
  function challengeEinloesen(antwort, art) {
    let c;
    try { c = JSON.parse(wa.vonB64u(antwort && antwort.clientDataJSON).toString('utf8')).challenge; } catch { throw new Error('Die Antwort des Passkeys ist kaputt.'); }
    const e = typeof c === 'string' ? challenges.get(c) : null;
    if (!e || e.art !== art || e.bis < jetzt()) throw new Error('Die Anfrage ist abgelaufen – bitte noch einmal.');
    challenges.delete(c);
    return { ...e, challenge: c };
  }

  function einrichtungGueltig(t) {
    if (typeof t !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(t)) return false;
    try {
      const e = JSON.parse(fs.readFileSync(einrichtungsDatei, 'utf8'));
      return e.bis > jetzt() && wa.gleich(hash(t), e.hash);
    } catch {
      return false;
    }
  }

  function erstellenOptionen(challenge) {
    return {
      rp: { id: rpId, name: 'Julia-Relay' },
      user: { id: daten.nutzerId, name: 'julia', displayName: 'Julia' },
      challenge,
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -8 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      attestation: 'none',
      excludeCredentials: daten.passkeys.map((p) => ({ type: 'public-key', id: p.id })),
      timeout: CHALLENGE_MS,
    };
  }

  function statusFuer(s) {
    const r = { angemeldet: !!s, eingerichtet: daten.passkeys.length > 0 };
    if (!s) return r;
    return {
      ...r,
      pc: daten.pc ? { name: daten.pc.name, seit: daten.pc.seit, verbunden: !!pc } : null,
      koppelnWartet: wartende.size > 0,
      passkeys: daten.passkeys.map((p) => ({ id: p.id, name: p.name, seit: p.seit, zuletzt: p.zuletzt || null, dieser: p.id === s.passkey })),
    };
  }

  // --- Relay-Seite ---

  async function relayApi(req, res, weg, s, ip) {
    if (weg === 'GET /_relay/api/status') { json(res, 200, statusFuer(s)); return; }
    if (req.method !== 'POST') { json(res, 404, { fehler: 'nicht_gefunden' }); return; }
    if (gesperrt(ip)) { json(res, 429, { fehler: 'gesperrt' }); return; }
    const d = await jsonLesen(req);

    if (weg === 'POST /_relay/api/anmelden/beginn') {
      json(res, 200, { challenge: challengeNeu('anmelden'), rpId, userVerification: 'required', timeout: CHALLENGE_MS });
      return;
    }
    if (weg === 'POST /_relay/api/anmelden/fertig') {
      const a = d.antwort || {};
      const pk = daten.passkeys.find((p) => p.id === a.id);
      try {
        const c = challengeEinloesen(a, 'anmelden');
        if (!pk) throw new Error('Diesen Passkey kenne ich nicht.');
        const r = wa.anmeldungPruefen({ antwort: a, challenge: c.challenge, origin, rpId, passkey: pk });
        pk.zaehler = r.zaehler;
        pk.zuletzt = iso();
        sichern();
      } catch (e) {
        fehlschlag(ip);
        protokoll(`Anmeldung abgelehnt (${ip}): ${e.message}`);
        json(res, 401, { fehler: 'passkey', text: e.message });
        return;
      }
      fehlversuche.delete(ip);
      sitzungStarten(res, pk.id);
      protokoll(`Angemeldet mit Passkey „${pk.name}“ (${ip})`);
      json(res, 200, { ok: true });
      return;
    }
    // Neuer Passkey: angemeldet – oder mit dem Einrichtungslink aus der Konsole.
    if (weg === 'POST /_relay/api/passkey/beginn') {
      if (!s && !einrichtungGueltig(d.token)) { fehlschlag(ip); json(res, 403, { fehler: 'einrichten' }); return; }
      if (daten.passkeys.length >= MAX_PASSKEYS) { json(res, 409, { fehler: 'zu_viele' }); return; }
      json(res, 200, erstellenOptionen(challengeNeu('erstellen', { sitzung: s ? s.schluessel : null, token: s ? null : hash(d.token) })));
      return;
    }
    if (weg === 'POST /_relay/api/passkey/fertig') {
      let pk;
      let c;
      try {
        c = challengeEinloesen(d.antwort, 'erstellen');
        const erlaubt = c.sitzung ? !!(s && s.schluessel === c.sitzung) : einrichtungGueltig(d.token) && hash(d.token) === c.token;
        if (!erlaubt) throw Object.assign(new Error('Nicht erlaubt.'), { status: 403 });
        pk = wa.registrierungPruefen({ antwort: d.antwort, challenge: c.challenge, origin, rpId });
      } catch (e) {
        fehlschlag(ip);
        json(res, e.status || 400, { fehler: 'passkey', text: e.message });
        return;
      }
      if (daten.passkeys.some((p) => p.id === pk.id)) { json(res, 409, { fehler: 'doppelt' }); return; }
      if (daten.passkeys.length >= MAX_PASSKEYS) { json(res, 409, { fehler: 'zu_viele' }); return; }
      const name = nameSauber(d.name, 40) || geraetName(req.headers['user-agent']);
      daten.passkeys.push({ ...pk, name, seit: iso(), zuletzt: null });
      sichern();
      if (!c.sitzung) fs.rmSync(einrichtungsDatei, { force: true }); // Link gilt nur einmal
      if (!s) sitzungStarten(res, pk.id);
      protokoll(`Passkey „${name}“ angelegt (${ip})`);
      json(res, 200, { ok: true });
      return;
    }

    if (!s) { json(res, 401, { fehler: 'anmelden' }); return; }
    switch (weg) {
      case 'POST /_relay/api/abmelden':
        sitzungen.delete(s.schluessel);
        res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);
        json(res, 200, { ok: true });
        return;
      case 'POST /_relay/api/passkey/loeschen': {
        const i = daten.passkeys.findIndex((p) => p.id === d.id);
        if (i < 0) { json(res, 404, { fehler: 'nicht_gefunden' }); return; }
        if (daten.passkeys.length <= 1) { json(res, 409, { fehler: 'letzter' }); return; }
        const [weg1] = daten.passkeys.splice(i, 1);
        sichern();
        for (const [k, v] of sitzungen) if (v.passkey === weg1.id) sitzungen.delete(k);
        protokoll(`Passkey „${weg1.name}“ entfernt (${ip})`);
        json(res, 200, { ok: true });
        return;
      }
      case 'POST /_relay/api/pc/koppeln': {
        const code = codeNormal(d.code);
        const w = code ? wartende.get(hash(code)) : null;
        if (!w || w.bis < jetzt()) { fehlschlag(ip); json(res, 400, { fehler: 'code' }); return; }
        wartende.delete(hash(code));
        clearTimeout(w.ablauf);
        const token = zufall(32);
        daten.pc = { tokenHash: hash(token), name: w.name, seit: iso() };
        sichern();
        w.ws.send(JSON.stringify({ art: 'gekoppelt', token }));
        aktivieren(w.ws, w.name);
        protokoll(`PC „${w.name}“ gekoppelt (${ip})`);
        json(res, 200, { ok: true, name: w.name });
        return;
      }
      case 'POST /_relay/api/pc/trennen':
        daten.pc = null;
        sichern();
        if (pc) pc.ws.close(4011, 'getrennt');
        pc = null;
        protokoll(`PC getrennt (${ip})`);
        json(res, 200, { ok: true });
        return;
      default:
        json(res, 404, { fehler: 'nicht_gefunden' });
    }
  }

  // --- Durchreichen an den PC ---

  function weiterreichen(req, res, url, koerper) {
    const id = ++anfrageNr;
    const meins = pc;
    const kopf = {};
    if (req.headers['content-type']) kopf['content-type'] = String(req.headers['content-type']).slice(0, 100);
    if (req.headers['user-agent']) kopf['user-agent'] = String(req.headers['user-agent']).slice(0, 300);
    const timer = setTimeout(() => {
      if (offen.delete(id) && !res.writableEnded) json(res, 504, { fehler: 'zeit' });
    }, ANFRAGE_MS);
    offen.set(id, { res, timer, pc: meins });
    res.on('close', () => { if (offen.has(id)) { clearTimeout(timer); offen.delete(id); } });
    meins.ws.send(JSON.stringify({ art: 'anfrage', id, methode: req.method, pfad: url.pathname + url.search, kopf, koerper: koerper.toString('base64') }));
  }

  function antwortVomPc(meins, roh) {
    let m;
    try { m = JSON.parse(roh); } catch { return; }
    if (!m || m.art !== 'antwort') return;
    const o = offen.get(m.id);
    if (!o || o.pc !== meins) return;
    offen.delete(m.id);
    clearTimeout(o.timer);
    if (o.res.writableEnded) return;
    const code = Number.isInteger(m.code) && m.code >= 200 && m.code <= 599 ? m.code : 502;
    const typ = typeof m.typ === 'string' && TYPEN.test(m.typ) ? m.typ : 'application/json; charset=utf-8';
    const body = typeof m.koerper === 'string' ? Buffer.from(m.koerper, 'base64') : Buffer.alloc(0);
    if (body.length > MAX_ANTWORT) { json(o.res, 502, { fehler: 'zu_gross' }); return; }
    o.res.writeHead(code, { 'Content-Type': typ, 'Content-Length': body.length });
    o.res.end(body);
  }

  function aktivieren(ws, name) {
    if (pc && pc.ws !== ws) pc.ws.close(4010, 'ersetzt');
    const meins = { ws, name, lebt: true };
    pc = meins;
    ws.on('pong', () => { meins.lebt = true; });
    const takt = setInterval(() => {
      if (!meins.lebt) { ws.terminate(); return; }
      meins.lebt = false;
      ws.ping();
    }, PING_MS);
    ws.on('message', (roh) => antwortVomPc(meins, roh));
    ws.on('close', () => {
      clearInterval(takt);
      if (pc !== meins) return;
      pc = null;
      for (const [id, o] of offen) {
        if (o.pc !== meins) continue;
        offen.delete(id);
        clearTimeout(o.timer);
        if (!o.res.writableEnded) json(o.res, 503, { fehler: 'pc_offline' });
      }
    });
    ws.send(JSON.stringify({ art: 'bereit' }));
  }

  // Der PC meldet sich: mit seinem Schlüssel – oder zum Koppeln mit dem Hash
  // des Codes, den du dann hier eingibst.
  function pcAnmelden(ws, ip) {
    ws.on('error', () => { /* Verbindung weg */ });
    const zeit = setTimeout(() => ws.close(4000, 'hallo'), HALLO_MS);
    ws.once('message', (roh) => {
      clearTimeout(zeit);
      let m;
      try { m = JSON.parse(roh); } catch { ws.close(4001, 'kaputt'); return; }
      const name = nameSauber(m && m.name, 60) || 'PC';
      if (m && m.art === 'hallo' && typeof m.token === 'string') {
        if (!daten.pc || !wa.gleich(hash(m.token), daten.pc.tokenHash)) {
          fehlschlag(ip);
          ws.send(JSON.stringify({ art: 'fehler', grund: 'unbekannt' }));
          ws.close(4003, 'unbekannt');
          return;
        }
        aktivieren(ws, name);
        return;
      }
      if (m && m.art === 'koppeln' && typeof m.code_hash === 'string' && /^[0-9a-f]{64}$/.test(m.code_hash)) {
        if (wartende.size >= MAX_WARTEND) { ws.close(4029, 'voll'); return; }
        const eintrag = { ws, name, bis: jetzt() + KOPPELN_MS };
        eintrag.ablauf = setTimeout(() => ws.close(4008, 'abgelaufen'), KOPPELN_MS);
        wartende.set(m.code_hash, eintrag);
        ws.on('close', () => {
          clearTimeout(eintrag.ablauf);
          if (wartende.get(m.code_hash) === eintrag) wartende.delete(m.code_hash);
        });
        ws.send(JSON.stringify({ art: 'wartet' }));
        return;
      }
      ws.close(4001, 'kaputt');
    });
  }

  // --- HTTP ---

  async function anfrage(req, res) {
    for (const [k, v] of Object.entries(SICHERHEIT)) res.setHeader(k, v);
    if (String(req.headers.host || '').toLowerCase() !== host) { json(res, 421, { fehler: 'host' }); return; }
    if (String(req.url || '').length > 1024) { json(res, 414, { fehler: 'zu_lang' }); return; }
    const url = new URL(req.url, origin);
    // Gegen fremde Seiten, die im Namen des Browsers etwas abschicken wollen.
    if (req.method === 'POST' && req.headers.origin !== origin) { json(res, 403, { fehler: 'herkunft' }); return; }
    if (req.method === 'GET' && url.pathname === '/_relay') { umleiten(res, '/_relay/'); return; }
    const datei = req.method === 'GET' ? dateien[url.pathname] : null;
    if (datei) {
      res.writeHead(200, { 'Content-Type': datei.typ, 'Content-Length': datei.inhalt.length });
      res.end(datei.inhalt);
      return;
    }
    const ip = ipVon(req);
    const s = sitzung(req);
    const weg = `${req.method} ${url.pathname}`;
    if (url.pathname.startsWith('/_relay/api/')) { await relayApi(req, res, weg, s, ip); return; }

    // Julias Handy-Seite
    if (!s) {
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) umleiten(res, '/_relay/');
      else json(res, 401, { fehler: 'anmelden' });
      return;
    }
    if (!DURCHREICHEN.has(weg)) { json(res, 404, { fehler: 'nicht_gefunden' }); return; }
    if (!pc) {
      if (weg === 'GET /') umleiten(res, '/_relay/');
      else json(res, 503, { fehler: 'pc_offline' });
      return;
    }
    const koerper = req.method === 'POST' ? await koerperLesen(req) : Buffer.alloc(0);
    weiterreichen(req, res, url, koerper);
  }

  const server = http.createServer((req, res) => {
    anfrage(req, res).catch((e) => {
      if (res.headersSent) { res.destroy(); return; }
      json(res, e.status || 500, { fehler: e.status ? e.message : 'intern' });
    });
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 60000;

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_ANTWORT * 2 });
  server.on('upgrade', (req, sock, head) => {
    const ip = ipVon(req);
    let pfad = '';
    try { pfad = new URL(req.url, origin).pathname; } catch { /* kaputt */ }
    if (pfad !== '/_relay/tunnel' || String(req.headers.host || '').toLowerCase() !== host || gesperrt(ip)) { sock.destroy(); return; }
    wss.handleUpgrade(req, sock, head, (ws) => pcAnmelden(ws, ip));
  });

  const aufraeumen = setInterval(() => {
    const t = jetzt();
    for (const [k, v] of sitzungen) if (v.bis < t) sitzungen.delete(k);
    for (const [k, v] of challenges) if (v.bis < t) challenges.delete(k);
  }, 60 * 1000);
  aufraeumen.unref();
  server.on('close', () => {
    clearInterval(aufraeumen);
    for (const c of wss.clients) c.terminate();
  });

  return { server, origin, rpId, status: () => ({ pcVerbunden: !!pc, passkeys: daten.passkeys.length, wartend: wartende.size }) };
}

module.exports = { relayErstellen, einrichtungsLink, codeNormal, domainPruefen, DURCHREICHEN };

if (require.main === module) {
  const domain = process.env.JULIA_RELAY_DOMAIN;
  const ordner = process.env.JULIA_RELAY_DATEN || '/var/lib/julia-relay';
  try {
    if (process.argv[2] === 'einrichten') {
      console.log(einrichtungsLink({ domain, ordner }));
      process.exit(0);
    }
    const port = Number(process.env.JULIA_RELAY_PORT || 8780);
    const { server } = relayErstellen({ domain, ordner, protokoll: (t) => console.log(t) });
    server.listen(port, '127.0.0.1', () => console.log(`Julia-Relay für ${domain} läuft auf 127.0.0.1:${port}`));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
