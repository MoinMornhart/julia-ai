'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mime = require('./mime');

// Google-Konto: Gmail, Kalender, Kontakte über die offiziellen REST-APIs.
// Anmeldung per OAuth 2.0 für Desktop-Apps (Loopback + PKCE): Der Browser
// öffnet sich, der Nutzer meldet sich dort selbst an. Julia sieht nie ein
// Passwort, nur das Token, und das liegt verschlüsselt im Tresor.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_UPLOAD = 'https://gmail.googleapis.com/upload/gmail/v1/users/me';
const KALENDER = 'https://www.googleapis.com/calendar/v3';
const PEOPLE = 'https://people.googleapis.com/v1';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
];

const DIENST = 'google';
const ANMELDE_ZEIT_MS = 5 * 60 * 1000;
const RAW_GRENZE = 4.5 * 1024 * 1024;

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function antwortSeite(titel, text) {
  return `<!doctype html><meta charset="utf-8"><title>Julia</title>
<body style="font-family:Segoe UI,system-ui,sans-serif;background:#15151c;color:#ececf3;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px"><div style="width:72px;height:72px;border-radius:50%;margin:0 auto 18px;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.5),transparent 42%),linear-gradient(135deg,#6b5cff,#35e0c8)"></div>
<h2 style="margin:0 0 8px">${titel}</h2><p style="color:#a9a9b8">${text}</p></div></body>`;
}

class GoogleFehler extends Error {}

class GoogleKonto {
  // oeffnen: Funktion, die eine URL im Standardbrowser öffnet.
  // abruf: fetch-kompatibel (für Tests austauschbar).
  constructor({ tresor, oeffnen, abruf = globalThis.fetch, zeitzone }) {
    this.tresor = tresor;
    this.oeffnen = oeffnen;
    this.abruf = abruf;
    this.zeitzone = zeitzone || (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    this.zugang = null;
    this.anmeldungLaeuft = null;
  }

  _daten() {
    return this.tresor.lesen(DIENST) || {};
  }

  status() {
    const d = this._daten();
    return {
      verbunden: !!d.refresh_token,
      email: d.email || null,
      clientIdGesetzt: !!d.client_id,
      clientId: d.client_id || '',
      scopes: d.scopes || [],
    };
  }

  get verbunden() {
    return !!this._daten().refresh_token;
  }

  // --- Anmeldung ---

  async verbinden({ clientId, clientSecret }) {
    if (this.anmeldungLaeuft) throw new GoogleFehler('Eine Anmeldung läuft schon. Bitte im Browser abschließen.');
    const alt = this._daten();
    const id = String(clientId || alt.client_id || '').trim();
    const secret = String(clientSecret || alt.client_secret || '').trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) throw new GoogleFehler('Die Client-ID sieht nicht richtig aus. Sie endet auf .apps.googleusercontent.com.');
    if (!secret) throw new GoogleFehler('Das Client-Secret fehlt.');

    const verifier = base64url(crypto.randomBytes(48));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const state = base64url(crypto.randomBytes(24));

    this.anmeldungLaeuft = true;
    try {
      const { code, redirect } = await this._aufRueckrufWarten(state, (redirectUri) => {
        const url = new URL(AUTH_URL);
        url.search = new URLSearchParams({
          client_id: id,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: SCOPES.join(' '),
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true',
        }).toString();
        this.oeffnen(url.toString());
      });

      const token = await this._tokenAnfrage({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      });
      if (!token.refresh_token) throw new GoogleFehler('Google hat kein dauerhaftes Token geliefert. Bitte unter myaccount.google.com/permissions den Zugriff für Julia entfernen und neu verbinden.');

      this.zugang = { token: token.access_token, bis: Date.now() + (token.expires_in - 60) * 1000 };
      this.tresor.schreiben(DIENST, {
        client_id: id,
        client_secret: secret,
        refresh_token: token.refresh_token,
        scopes: String(token.scope || '').split(' ').filter(Boolean),
      });
      const profil = await this.api(`${GMAIL}/profile`).catch(() => null);
      if (profil && profil.emailAddress) this.tresor.schreiben(DIENST, { email: profil.emailAddress });
      return this.status();
    } finally {
      this.anmeldungLaeuft = null;
    }
  }

  _aufRueckrufWarten(state, oeffneAnmeldung) {
    return new Promise((resolve, reject) => {
      let redirect = '';
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, redirect);
        if (url.pathname !== '/') { res.writeHead(404); res.end(); return; }
        const fehler = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (fehler || !code || url.searchParams.get('state') !== state) {
          // access_denied kommt in ZWEI Fällen: (a) du hast im Browser abgelehnt,
          // oder (b) dein Google-Konto ist kein „Testnutzer" der OAuth-App (App im
          // Status „Testing" → Fehler 403 „access_denied", Bildschirm „Zugriff
          // blockiert: … nicht abgeschlossen"). Deshalb beide Fälle nennen.
          res.end(antwortSeite('Nicht verbunden', fehler === 'access_denied' ? 'Zugriff nicht möglich. Das Fenster kann zu.' : 'Die Anmeldung hat nicht geklappt. Das Fenster kann zu.'));
          fertig(new GoogleFehler(fehler === 'access_denied'
            ? 'Google-Anmeldung abgelehnt (403 access_denied). Falls du nicht selbst abgebrochen hast: Deine OAuth-App steht auf „Testing" und dein Konto ist noch kein Testnutzer. In der Google Cloud Console → „APIs & Dienste" → „OAuth-Zustimmungsbildschirm" → „Testnutzer" deine E-Mail hinzufügen (oder die App veröffentlichen). Danach erneut verbinden.'
            : `Anmeldung fehlgeschlagen${fehler ? `: ${fehler}` : ''}.`));
          return;
        }
        res.end(antwortSeite('Julia ist verbunden', 'Du kannst dieses Fenster schließen und zu Julia zurückgehen.'));
        fertig(null, { code, redirect });
      });
      const timer = setTimeout(() => fertig(new GoogleFehler('Nach fünf Minuten keine Anmeldung im Browser, abgebrochen.')), ANMELDE_ZEIT_MS);
      function fertig(err, wert) {
        clearTimeout(timer);
        server.close();
        if (err) reject(err); else resolve(wert);
      }
      server.on('error', (e) => fertig(e));
      server.listen(0, '127.0.0.1', () => {
        redirect = `http://127.0.0.1:${server.address().port}`;
        try { oeffneAnmeldung(redirect); } catch (e) { fertig(e); }
      });
    });
  }

  async _tokenAnfrage(felder) {
    const r = await this.abruf(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(felder).toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.error === 'invalid_grant') {
        this.tresor.schreiben(DIENST, { refresh_token: null });
        throw new GoogleFehler('Die Google-Verbindung ist abgelaufen oder wurde widerrufen. Bitte in den Einstellungen unter Verbindungen neu verbinden.');
      }
      if (j.error === 'invalid_client') throw new GoogleFehler('Google kennt diese Client-ID oder dieses Secret nicht. Bitte in der Cloud Console prüfen.');
      throw new GoogleFehler(`Google-Anmeldung: ${j.error_description || j.error || r.status}`);
    }
    return j;
  }

  async _token() {
    if (this.zugang && Date.now() < this.zugang.bis) return this.zugang.token;
    const d = this._daten();
    if (!d.refresh_token) throw new GoogleFehler('Kein Google-Konto verbunden. Das geht in den Einstellungen unter Verbindungen.');
    const t = await this._tokenAnfrage({
      client_id: d.client_id,
      client_secret: d.client_secret,
      refresh_token: d.refresh_token,
      grant_type: 'refresh_token',
    });
    this.zugang = { token: t.access_token, bis: Date.now() + (t.expires_in - 60) * 1000 };
    return this.zugang.token;
  }

  async trennen() {
    const d = this._daten();
    if (d.refresh_token) {
      await this.abruf(`${REVOKE_URL}?token=${encodeURIComponent(d.refresh_token)}`, { method: 'POST' }).catch(() => {});
    }
    this.zugang = null;
    // Client-ID und Secret bleiben, damit ein erneutes Verbinden ein Klick ist.
    this.tresor.schreiben(DIENST, { refresh_token: null, email: null, scopes: null });
    return this.status();
  }

  async api(url, { methode = 'GET', query, json, roh, typ } = {}) {
    const u = new URL(url);
    if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    const headers = { Authorization: `Bearer ${await this._token()}` };
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (roh !== undefined) { headers['Content-Type'] = typ; body = roh; }
    const r = await this.abruf(u.toString(), { method: methode, headers, body });
    if (r.status === 204) return {};
    const text = await r.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { roh: text }; }
    if (!r.ok) {
      const grund = j.error && (j.error.message || j.error.status || j.error);
      if (r.status === 401) this.zugang = null;
      if (r.status === 403 && /insufficient|scope/i.test(String(grund))) {
        throw new GoogleFehler('Für diese Funktion fehlt eine Berechtigung. In den Einstellungen Google trennen und neu verbinden, dabei alle Häkchen setzen.');
      }
      if (r.status === 403 && /has not been used|disabled/i.test(String(grund))) {
        throw new GoogleFehler(`Die nötige API ist im Google-Cloud-Projekt nicht aktiviert: ${grund}`);
      }
      throw new GoogleFehler(`Google ${r.status}: ${grund || 'unbekannter Fehler'}`);
    }
    return j;
  }

  // --- Gmail ---

  async mailSuchen({ suche = 'in:inbox', anzahl = 10 } = {}) {
    const liste = await this.api(`${GMAIL}/messages`, { query: { q: suche, maxResults: Math.min(25, Math.max(1, anzahl)) } });
    const ids = (liste.messages || []).map((m) => m.id);
    const mails = await Promise.all(ids.map((id) => this._kopf(id)));
    return { gesamt_geschaetzt: liste.resultSizeEstimate || 0, mails };
  }

  async _kopf(id) {
    const u = new URL(`${GMAIL}/messages/${id}`);
    u.searchParams.set('format', 'metadata');
    for (const h of ['From', 'To', 'Subject', 'Date']) u.searchParams.append('metadataHeaders', h);
    const m = await this.api(u.toString());
    const kopf = Object.fromEntries((m.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
    return {
      id: m.id,
      thread: m.threadId,
      von: kopf.from || '',
      an: kopf.to || '',
      betreff: kopf.subject || '',
      datum: kopf.date || '',
      ungelesen: (m.labelIds || []).includes('UNREAD'),
      vorschau: m.snippet || '',
    };
  }

  async mailLesen(id) {
    const m = await this.api(`${GMAIL}/messages/${encodeURIComponent(id)}`, { query: { format: 'full' } });
    const kopf = Object.fromEntries((m.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
    const teile = { text: [], html: [], anhaenge: [] };
    (function sammeln(p) {
      if (!p) return;
      if (p.filename && p.body && p.body.attachmentId) {
        teile.anhaenge.push({ name: p.filename, groesse: p.body.size, typ: p.mimeType, anhang_id: p.body.attachmentId });
      } else if (p.mimeType === 'text/plain' && p.body?.data) {
        teile.text.push(Buffer.from(p.body.data, 'base64url').toString('utf8'));
      } else if (p.mimeType === 'text/html' && p.body?.data) {
        teile.html.push(Buffer.from(p.body.data, 'base64url').toString('utf8'));
      }
      for (const k of p.parts || []) sammeln(k);
    }(m.payload));
    const text = teile.text.length ? teile.text.join('\n\n') : mime.htmlZuText(teile.html.join('\n'));
    return {
      id: m.id,
      thread: m.threadId,
      von: kopf.from || '',
      an: kopf.to || '',
      cc: kopf.cc || '',
      betreff: kopf.subject || '',
      datum: kopf.date || '',
      message_id: kopf['message-id'] || '',
      text,
      anhaenge: teile.anhaenge,
    };
  }

  async anhangSpeichern({ id, anhangId, name, ziel }) {
    const a = await this.api(`${GMAIL}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(anhangId)}`);
    const sicher = path.basename(String(name || 'anhang')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    const datei = path.join(ziel, sicher);
    if (fs.existsSync(datei)) throw new GoogleFehler(`${datei} existiert schon. Ich überschreibe nichts.`);
    fs.mkdirSync(ziel, { recursive: true });
    fs.writeFileSync(datei, Buffer.from(a.data, 'base64url'));
    return datei;
  }

  async _antwortKopf(antwortAufId) {
    if (!antwortAufId) return {};
    const u = new URL(`${GMAIL}/messages/${encodeURIComponent(antwortAufId)}`);
    u.searchParams.set('format', 'metadata');
    for (const h of ['Message-ID', 'References', 'Subject']) u.searchParams.append('metadataHeaders', h);
    const m = await this.api(u.toString());
    const kopf = Object.fromEntries((m.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
    const mid = kopf['message-id'];
    return {
      threadId: m.threadId,
      inReplyTo: mid,
      references: [kopf.references, mid].filter(Boolean).join(' '),
      betreff: kopf.subject || '',
    };
  }

  async _nachricht(m) {
    const bezug = await this._antwortKopf(m.antwort_auf_id);
    let betreff = m.betreff;
    if (!betreff && bezug.betreff) betreff = /^re:/i.test(bezug.betreff) ? bezug.betreff : `Re: ${bezug.betreff}`;
    const roh = mime.bauen({
      an: m.an, cc: m.cc, bcc: m.bcc, betreff, text: m.text,
      inReplyTo: bezug.inReplyTo, references: bezug.references, anhaenge: m.anhaenge,
    });
    return { roh, threadId: bezug.threadId };
  }

  async mailEntwurf(m) {
    const { roh, threadId } = await this._nachricht(m);
    if (Buffer.byteLength(roh) > RAW_GRENZE) {
      const d = await this.api(`${GMAIL_UPLOAD}/drafts`, { methode: 'POST', query: { uploadType: 'media' }, roh, typ: 'message/rfc822' });
      return d.id;
    }
    const d = await this.api(`${GMAIL}/drafts`, { methode: 'POST', json: { message: { raw: base64url(roh), ...(threadId ? { threadId } : {}) } } });
    return d.id;
  }

  async mailSenden(m) {
    const { roh, threadId } = await this._nachricht(m);
    if (Buffer.byteLength(roh) > RAW_GRENZE) {
      const r = await this.api(`${GMAIL_UPLOAD}/messages/send`, { methode: 'POST', query: { uploadType: 'media' }, roh, typ: 'message/rfc822' });
      return r.id;
    }
    const r = await this.api(`${GMAIL}/messages/send`, { methode: 'POST', json: { raw: base64url(roh), ...(threadId ? { threadId } : {}) } });
    return r.id;
  }

  // --- Kalender ---

  async kalenderListe() {
    const r = await this.api(`${KALENDER}/users/me/calendarList`, { query: { maxResults: 50 } });
    return (r.items || []).map((k) => ({ id: k.id, name: k.summaryOverride || k.summary, haupt: !!k.primary, schreibbar: ['owner', 'writer'].includes(k.accessRole) }));
  }

  async termine({ von, bis, suche, anzahl = 25, kalender = 'primary' } = {}) {
    const start = von ? zeitGrenze(von, false) : new Date().toISOString();
    const ende = bis ? zeitGrenze(bis, true) : new Date(Date.parse(start) + 7 * 86400000).toISOString();
    const r = await this.api(`${KALENDER}/calendars/${encodeURIComponent(kalender)}/events`, {
      query: { timeMin: start, timeMax: ende, singleEvents: 'true', orderBy: 'startTime', q: suche, maxResults: Math.min(100, anzahl), timeZone: this.zeitzone() },
    });
    return (r.items || []).map((e) => ({
      id: e.id,
      titel: e.summary || '(ohne Titel)',
      start: e.start?.dateTime || e.start?.date,
      ende: e.end?.dateTime || e.end?.date,
      ganztaegig: !!e.start?.date,
      ort: e.location || undefined,
      beschreibung: e.description ? String(e.description).slice(0, 500) : undefined,
      teilnehmer: (e.attendees || []).map((a) => a.email),
      meeting: e.hangoutLink || undefined,
      status: e.status,
    }));
  }

  async terminAnlegen(t) {
    const zone = this.zeitzone();
    const start = zeitpunkt(t.start, zone);
    let ende;
    if (t.ende) ende = zeitpunkt(t.ende, zone);
    else if (start.date) ende = { date: naechsterTag(start.date) };
    else ende = { dateTime: plusMinuten(start.dateTime, t.dauer_minuten || 60), timeZone: start.timeZone };
    const teilnehmer = mime.adressliste(t.teilnehmer).map((a) => ({ email: /<([^>]+)>/.exec(a)?.[1] || a }));
    const body = {
      summary: String(t.titel || '').trim() || '(ohne Titel)',
      location: t.ort || undefined,
      description: t.beschreibung || undefined,
      start,
      end: ende,
      ...(teilnehmer.length ? { attendees: teilnehmer } : {}),
    };
    const r = await this.api(`${KALENDER}/calendars/${encodeURIComponent(t.kalender || 'primary')}/events`, {
      methode: 'POST',
      query: { sendUpdates: teilnehmer.length ? 'all' : 'none' },
      json: body,
    });
    return { id: r.id, link: r.htmlLink, start: r.start, ende: r.end };
  }

  // --- Kontakte ---

  async kontakteSuchen(name) {
    const q = String(name || '').trim();
    if (!q) throw new GoogleFehler('Bitte einen Namen oder eine Adresse angeben.');
    // Google empfiehlt eine leere Anfrage vorab, um den Suchindex aufzuwärmen.
    await this.api(`${PEOPLE}/people:searchContacts`, { query: { query: '', readMask: 'names' } }).catch(() => {});
    const [eigene, andere] = await Promise.all([
      this.api(`${PEOPLE}/people:searchContacts`, { query: { query: q, readMask: 'names,emailAddresses,phoneNumbers', pageSize: 10 } }).catch(() => ({})),
      this.api(`${PEOPLE}/otherContacts:search`, { query: { query: q, readMask: 'names,emailAddresses', pageSize: 10 } }).catch(() => ({})),
    ]);
    const form = (r, quelle) => (r.results || []).map((x) => ({
      name: x.person?.names?.[0]?.displayName || '',
      emails: (x.person?.emailAddresses || []).map((e) => e.value),
      telefon: (x.person?.phoneNumbers || []).map((p) => p.value),
      quelle,
    }));
    return [...form(eigene, 'Kontakte'), ...form(andere, 'bisher angeschrieben')];
  }
}

// --- Zeit-Helfer (lokale Zeitangaben ohne Zeitzone gelten in der Zeitzone des Nutzers) ---

const LOKAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const MIT_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([zZ]|[+-]\d{2}:?\d{2})$/;
const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

function zweistellig(n) {
  return String(n).padStart(2, '0');
}

function zeitpunkt(s, zone) {
  const t = String(s || '').trim();
  if (DATUM.test(t)) return { date: t };
  if (MIT_ZONE.test(t)) return { dateTime: t };
  const m = LOKAL.exec(t);
  if (m) return { dateTime: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`, timeZone: zone };
  throw new GoogleFehler(`"${s}" ist keine Zeitangabe. Erwartet wird z. B. 2026-09-15T14:00 oder 2026-09-15 für ganztägig.`);
}

function plusMinuten(dateTime, minuten) {
  if (MIT_ZONE.test(dateTime)) return new Date(Date.parse(dateTime) + minuten * 60000).toISOString();
  const m = LOKAL.exec(dateTime);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + minuten, +(m[6] || 0)));
  return `${d.getUTCFullYear()}-${zweistellig(d.getUTCMonth() + 1)}-${zweistellig(d.getUTCDate())}T${zweistellig(d.getUTCHours())}:${zweistellig(d.getUTCMinutes())}:${zweistellig(d.getUTCSeconds())}`;
}

function naechsterTag(datum) {
  const [y, m, d] = datum.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + 1));
  return `${x.getUTCFullYear()}-${zweistellig(x.getUTCMonth() + 1)}-${zweistellig(x.getUTCDate())}`;
}

// "2026-09-15" als Grenze: Tagesanfang bzw. Tagesende in lokaler Zeit.
function zeitGrenze(s, ende) {
  const t = String(s).trim();
  const d = DATUM.exec(t);
  if (d) return new Date(+d[1], +d[2] - 1, +d[3] + (ende ? 1 : 0)).toISOString();
  const l = LOKAL.exec(t);
  if (l) return new Date(+l[1], +l[2] - 1, +l[3], +l[4], +l[5], +(l[6] || 0)).toISOString();
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) throw new GoogleFehler(`"${s}" ist keine Zeitangabe.`);
  return new Date(ms).toISOString();
}

module.exports = { GoogleKonto, GoogleFehler, SCOPES, zeitpunkt, plusMinuten, naechsterTag, zeitGrenze, antwortSeite };
