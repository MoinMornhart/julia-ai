'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mime = require('./mime');
const { zeitpunkt, plusMinuten, naechsterTag, zeitGrenze, antwortSeite } = require('./google');
const { EINGEBAUTE_ID } = require('./outlook-app');

// Outlook bzw. Microsoft-Konto (Outlook.com, Hotmail, Microsoft 365): Mail,
// Kalender und Kontakte über Microsoft Graph. Anmeldung wie bei Google per
// OAuth 2.0 für Desktop-Apps (Loopback + PKCE): Der Browser öffnet sich, der
// Nutzer meldet sich dort selbst an. Julia sieht nie ein Passwort, nur das
// Token, und das liegt verschlüsselt im Tresor. Nötig ist nur die
// Anwendungs-ID einer eigenen, kostenlosen App-Registrierung – kein Secret.

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite', 'People.Read'];

const DIENST = 'outlook';
const ANMELDE_ZEIT_MS = 5 * 60 * 1000;
const ANHANG_GRENZE = 3 * 1024 * 1024; // größere Anhänge bräuchten eine Upload-Sitzung
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bekannte Microsoft-EIGENE App-IDs, die Nutzer leicht versehentlich eintragen
// (z. B. aus der Adresszeile des Azure-Portals). Diese gehören Microsoft, nicht
// dir – mit ihnen scheitert die Anmeldung (u. a. AADSTS90072). Julia weist sie
// vorab mit einer klaren Erklärung ab, statt den kryptischen Fehler zu zeigen.
const MICROSOFT_APPS = {
  'c44b4083-3bb0-49c1-b47d-974e53cbdf3c': 'Azure-Portal',
  '00000003-0000-0000-c000-000000000000': 'Microsoft Graph',
  '04b07795-8ddb-461a-bbee-02f9e1bf7b46': 'Azure CLI',
  '1950a258-227b-4e31-a9cf-717495945fc2': 'Azure PowerShell',
  '1fec8e78-bce4-4aaf-ab1b-5451cc387264': 'Microsoft Teams',
};
const ORDNER = new Set(['inbox', 'sentitems', 'drafts', 'archive', 'junkemail', 'deleteditems']);

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

class OutlookFehler extends Error {}

// "Anna Müller <anna@example.com>" aus einem Graph-Empfänger.
function adresse(r) {
  const e = r && r.emailAddress;
  if (!e) return '';
  return e.name && e.name !== e.address ? `${e.name} <${e.address}>` : e.address || '';
}

// mime.adressliste prüft die Adressen; die Namen braucht Graph aber im
// Klartext, nicht MIME-kodiert – deshalb selbst zerlegen.
function empfaenger(liste) {
  const roh = (Array.isArray(liste) ? liste : String(liste || '').split(/[,;]/)).map((x) => String(x).trim()).filter(Boolean);
  mime.adressliste(roh);
  return roh.map((a) => {
    const m = /^(.*?)\s*<([^>]+)>$/.exec(a);
    const name = m ? m[1].trim().replace(/^"|"$/g, '') : '';
    const address = m ? m[2].trim() : a;
    return { emailAddress: name ? { name, address } : { address } };
  });
}

// Anhänge vorab lesen und prüfen – so entsteht kein halber Entwurf.
function anhaengeLesen(pfade) {
  return (pfade || []).map((p) => {
    const s = fs.statSync(p);
    if (!s.isFile()) throw new OutlookFehler(`${p} ist keine Datei.`);
    if (s.size > ANHANG_GRENZE) throw new OutlookFehler(`${path.basename(p)} ist größer als 3 MB. Größere Anhänge gehen über Outlook nicht direkt – lieber einen Link schicken.`);
    return { '@odata.type': '#microsoft.graph.fileAttachment', name: path.basename(p), contentBytes: fs.readFileSync(p).toString('base64') };
  });
}

// Graph will Zeiten ohne Versatz plus Zeitzone.
function graphZeit(z, zone) {
  if (z.timeZone) return { dateTime: z.dateTime, timeZone: z.timeZone };
  return { dateTime: new Date(Date.parse(z.dateTime)).toISOString().slice(0, 19), timeZone: 'UTC' };
}

function kurzform(m) {
  return {
    id: m.id,
    von: adresse(m.from),
    an: (m.toRecipients || []).map(adresse).join(', '),
    betreff: m.subject || '',
    datum: m.receivedDateTime || '',
    ungelesen: m.isRead === false,
    vorschau: m.bodyPreview || '',
  };
}

class OutlookKonto {
  // oeffnen: Funktion, die eine URL im Standardbrowser öffnet.
  // abruf: fetch-kompatibel (für Tests austauschbar).
  constructor({ tresor, oeffnen, abruf = globalThis.fetch, zeitzone, eingebauteId = EINGEBAUTE_ID }) {
    this.tresor = tresor;
    this.oeffnen = oeffnen;
    this.abruf = abruf;
    this.zeitzone = zeitzone || (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    this.eingebauteId = String(eingebauteId || '').trim();
    this.zugang = null;
    this.anmeldungLaeuft = null;
  }

  _daten() {
    return this.tresor.lesen(DIENST) || {};
  }

  status() {
    const d = this._daten();
    // Die eingebaute ID zählt nicht als "eigene" – das Feld bleibt dann leer.
    const eigene = d.client_id && d.client_id !== this.eingebauteId ? d.client_id : '';
    return { verbunden: !!d.refresh_token, email: d.email || null, clientId: eigene, clientIdGesetzt: !!eigene, eingebaut: !!this.eingebauteId };
  }

  get verbunden() {
    return !!this._daten().refresh_token;
  }

  // --- Anmeldung ---

  async verbinden({ clientId } = {}) {
    if (this.anmeldungLaeuft) throw new OutlookFehler('Eine Anmeldung läuft schon. Bitte im Browser abschließen.');
    // Eigene ID (eingetragen oder gespeichert) vor der eingebauten.
    const id = String(clientId || this._daten().client_id || this.eingebauteId || '').trim();
    if (!id) throw new OutlookFehler('Trag eine Anwendungs-ID ein – wie du sie bekommst, steht in der Anleitung.');
    if (!GUID.test(id)) throw new OutlookFehler('Die Anwendungs-ID sieht nicht richtig aus. Sie hat die Form 1a2b3c4d-1234-…, zu finden in der App-Registrierung unter „Übersicht“.');
    const microsoftApp = MICROSOFT_APPS[id.toLowerCase()];
    if (microsoftApp) throw new OutlookFehler(`Das ist die Anwendungs-ID von „${microsoftApp}“ – die gehört Microsoft, nicht deiner eigenen App. Mit ihr kann sich dein Konto nicht anmelden. Du brauchst eine EIGENE App-Registrierung: im Azure-Portal unter „App-Registrierungen“ eine neue anlegen (Kontotypen: auch persönliche Microsoft-Konten), dann die „Anwendungs-ID (Client)“ aus der Übersicht hier eintragen (Anleitung, Schritt 1).`);

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
          response_mode: 'query',
          scope: SCOPES.join(' '),
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
          prompt: 'select_account',
        }).toString();
        this.oeffnen(url.toString());
      });

      const token = await this._tokenAnfrage({
        client_id: id,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect,
        code_verifier: verifier,
        scope: SCOPES.join(' '),
      });
      if (!token.refresh_token) throw new OutlookFehler('Microsoft hat kein dauerhaftes Token geliefert. Bitte noch einmal verbinden.');

      this.zugang = { token: token.access_token, bis: Date.now() + (token.expires_in - 60) * 1000 };
      this.tresor.schreiben(DIENST, { client_id: id, refresh_token: token.refresh_token });
      const ich = await this.api(`${GRAPH}/me`, { query: { $select: 'mail,userPrincipalName' } }).catch(() => null);
      if (ich && (ich.mail || ich.userPrincipalName)) this.tresor.schreiben(DIENST, { email: ich.mail || ich.userPrincipalName });
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
          res.end(antwortSeite('Nicht verbunden', fehler === 'access_denied' ? 'Du hast den Zugriff abgelehnt. Das Fenster kann zu.' : 'Die Anmeldung hat nicht geklappt. Das Fenster kann zu.'));
          const text = url.searchParams.get('error_description') || fehler;
          fertig(new OutlookFehler(fehler === 'access_denied' ? 'Zugriff im Browser abgelehnt.' : erklaeren(text) || 'Anmeldung fehlgeschlagen.'));
          return;
        }
        res.end(antwortSeite('Julia ist verbunden', 'Du kannst dieses Fenster schließen und zu Julia zurückgehen.'));
        fertig(null, { code, redirect });
      });
      const timer = setTimeout(() => fertig(new OutlookFehler('Nach fünf Minuten keine Anmeldung im Browser, abgebrochen.')), ANMELDE_ZEIT_MS);
      function fertig(err, wert) {
        clearTimeout(timer);
        server.close();
        if (err) reject(err); else resolve(wert);
      }
      server.on('error', (e) => fertig(e));
      // Microsoft erlaubt für Desktop-Apps http://localhost mit beliebigem Port.
      server.listen(0, '127.0.0.1', () => {
        redirect = `http://localhost:${server.address().port}`;
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
      if (j.error === 'invalid_grant' && felder.grant_type === 'refresh_token') {
        this.tresor.schreiben(DIENST, { refresh_token: null });
        throw new OutlookFehler('Die Outlook-Verbindung ist abgelaufen oder wurde widerrufen. Bitte in den Einstellungen unter Verbindungen neu verbinden.');
      }
      throw new OutlookFehler(erklaeren(j.error_description || j.error) || `Outlook-Anmeldung: ${r.status}`);
    }
    return j;
  }

  async _token() {
    if (this.zugang && Date.now() < this.zugang.bis) return this.zugang.token;
    const d = this._daten();
    if (!d.refresh_token) throw new OutlookFehler('Kein Outlook-Konto verbunden. Das geht in den Einstellungen unter Verbindungen.');
    const t = await this._tokenAnfrage({
      client_id: d.client_id,
      grant_type: 'refresh_token',
      refresh_token: d.refresh_token,
      scope: SCOPES.join(' '),
    });
    // Microsoft tauscht das dauerhafte Token bei jeder Erneuerung aus.
    if (t.refresh_token && t.refresh_token !== d.refresh_token) this.tresor.schreiben(DIENST, { refresh_token: t.refresh_token });
    this.zugang = { token: t.access_token, bis: Date.now() + (t.expires_in - 60) * 1000 };
    return this.zugang.token;
  }

  // Microsoft hat für persönliche Konten keinen Widerruf per Schnittstelle:
  // Julia löscht das Token; ganz entziehen geht unter account.live.com/consent/Manage.
  async trennen() {
    this.zugang = null;
    this.tresor.schreiben(DIENST, { refresh_token: null, email: null });
    return this.status();
  }

  async api(url, { methode = 'GET', query, json, kopf } = {}) {
    // Von Hand kodiert: Graph (OData) versteht "+" nicht als Leerzeichen.
    let ziel = url;
    if (query) {
      const qs = Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) ziel += (url.includes('?') ? '&' : '?') + qs;
    }
    const headers = { Authorization: `Bearer ${await this._token()}`, ...(kopf || {}) };
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    const r = await this.abruf(ziel, { method: methode, headers, body });
    if (r.status === 202 || r.status === 204) return {};
    const text = await r.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { roh: text }; }
    if (!r.ok) {
      const grund = j.error && (j.error.message || j.error.code);
      if (r.status === 401) this.zugang = null;
      if (r.status === 403) throw new OutlookFehler('Für diese Funktion fehlt eine Berechtigung. In den Einstellungen Outlook trennen, neu verbinden und dabei allem zustimmen.');
      throw new OutlookFehler(`Outlook ${r.status}: ${grund || 'unbekannter Fehler'}`);
    }
    return j;
  }

  // --- Mail ---

  async mailSuchen({ suche = '', nur_ungelesen = false, ordner = 'inbox', anzahl = 10 } = {}) {
    const query = { $top: Math.min(25, Math.max(1, anzahl)), $select: 'id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview' };
    let url;
    if (suche) {
      // $search lässt sich nicht mit Filter oder Sortierung kombinieren.
      url = `${GRAPH}/me/messages`;
      query.$search = `"${String(suche).replace(/"/g, '')}"`;
    } else {
      const o = ORDNER.has(String(ordner).toLowerCase()) ? String(ordner).toLowerCase() : 'inbox';
      url = `${GRAPH}/me/mailFolders/${o}/messages`;
      query.$orderby = 'receivedDateTime desc';
      if (nur_ungelesen) query.$filter = 'isRead eq false';
    }
    const r = await this.api(url, { query });
    let mails = (r.value || []).map(kurzform);
    if (suche && nur_ungelesen) mails = mails.filter((m) => m.ungelesen);
    return { mails };
  }

  async mailLesen(id) {
    const m = await this.api(`${GRAPH}/me/messages/${encodeURIComponent(id)}`, {
      query: { $select: 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments' },
      kopf: { Prefer: 'outlook.body-content-type="text"' },
    });
    let anhaenge = [];
    if (m.hasAttachments) {
      const a = await this.api(`${GRAPH}/me/messages/${encodeURIComponent(id)}/attachments`, { query: { $select: 'id,name,size,contentType' } });
      anhaenge = (a.value || []).map((x) => ({ name: x.name, groesse: x.size, typ: x.contentType, anhang_id: x.id }));
    }
    const b = m.body || {};
    return {
      id: m.id,
      von: adresse(m.from),
      an: (m.toRecipients || []).map(adresse).join(', '),
      cc: (m.ccRecipients || []).map(adresse).join(', '),
      betreff: m.subject || '',
      datum: m.receivedDateTime || '',
      text: b.contentType === 'html' ? mime.htmlZuText(b.content || '') : String(b.content || ''),
      anhaenge,
    };
  }

  async anhangSpeichern({ id, anhangId, name, ziel }) {
    const a = await this.api(`${GRAPH}/me/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(anhangId)}`);
    if (!a.contentBytes) throw new OutlookFehler('Dieser Anhang ist keine Datei (etwa eine eingebettete Mail) und lässt sich nicht speichern.');
    const sicher = path.basename(String(name || a.name || 'anhang')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    const datei = path.join(ziel, sicher);
    if (fs.existsSync(datei)) throw new OutlookFehler(`${datei} existiert schon. Ich überschreibe nichts.`);
    fs.mkdirSync(ziel, { recursive: true });
    fs.writeFileSync(datei, Buffer.from(a.contentBytes, 'base64'));
    return datei;
  }

  // Legt einen Entwurf an – neu oder als Antwort im bestehenden Verlauf.
  async _entwurf(m) {
    const an = empfaenger(m.an);
    if (!an.length) throw new OutlookFehler('Kein Empfänger angegeben.');
    const anhaenge = anhaengeLesen(m.anhaenge);
    const felder = {
      body: { contentType: 'Text', content: String(m.text || '') },
      toRecipients: an,
      ...(mime.adressliste(m.cc).length ? { ccRecipients: empfaenger(m.cc) } : {}),
      ...(mime.adressliste(m.bcc).length ? { bccRecipients: empfaenger(m.bcc) } : {}),
      ...(m.betreff ? { subject: String(m.betreff) } : {}),
    };
    let entwurf;
    if (m.antwort_auf_id) {
      entwurf = await this.api(`${GRAPH}/me/messages/${encodeURIComponent(m.antwort_auf_id)}/createReply`, { methode: 'POST', json: {} });
      await this.api(`${GRAPH}/me/messages/${encodeURIComponent(entwurf.id)}`, { methode: 'PATCH', json: felder });
    } else {
      entwurf = await this.api(`${GRAPH}/me/messages`, { methode: 'POST', json: { subject: '', ...felder } });
    }
    for (const a of anhaenge) {
      await this.api(`${GRAPH}/me/messages/${encodeURIComponent(entwurf.id)}/attachments`, { methode: 'POST', json: a });
    }
    return entwurf.id;
  }

  async mailEntwurf(m) {
    return this._entwurf(m);
  }

  async mailSenden(m) {
    const id = await this._entwurf(m);
    await this.api(`${GRAPH}/me/messages/${encodeURIComponent(id)}/send`, { methode: 'POST' });
    return id;
  }

  // --- Kalender ---

  async kalenderListe() {
    const r = await this.api(`${GRAPH}/me/calendars`, { query: { $select: 'id,name,isDefaultCalendar,canEdit', $top: 50 } });
    return (r.value || []).map((k) => ({ id: k.id, name: k.name, haupt: !!k.isDefaultCalendar, schreibbar: !!k.canEdit }));
  }

  async termine({ von, bis, suche, anzahl = 25, kalender } = {}) {
    const start = von ? zeitGrenze(von, false) : new Date().toISOString();
    const ende = bis ? zeitGrenze(bis, true) : new Date(Date.parse(start) + 7 * 86400000).toISOString();
    const basis = kalender ? `${GRAPH}/me/calendars/${encodeURIComponent(kalender)}/calendarView` : `${GRAPH}/me/calendarView`;
    const r = await this.api(basis, {
      query: {
        startDateTime: start,
        endDateTime: ende,
        $top: Math.min(100, anzahl),
        $orderby: 'start/dateTime',
        $select: 'id,subject,start,end,isAllDay,location,bodyPreview,attendees,onlineMeeting,isCancelled',
      },
      kopf: { Prefer: `outlook.timezone="${this.zeitzone()}"` },
    });
    let liste = (r.value || []).map((e) => ({
      id: e.id,
      titel: e.subject || '(ohne Titel)',
      start: e.start && e.start.dateTime,
      ende: e.end && e.end.dateTime,
      ganztaegig: !!e.isAllDay,
      ort: (e.location && e.location.displayName) || undefined,
      beschreibung: e.bodyPreview ? String(e.bodyPreview).slice(0, 500) : undefined,
      teilnehmer: (e.attendees || []).map((a) => a.emailAddress && a.emailAddress.address).filter(Boolean),
      meeting: (e.onlineMeeting && e.onlineMeeting.joinUrl) || undefined,
      abgesagt: e.isCancelled || undefined,
    }));
    if (suche) {
      const s = String(suche).toLowerCase();
      liste = liste.filter((x) => `${x.titel} ${x.ort || ''} ${x.beschreibung || ''}`.toLowerCase().includes(s));
    }
    return liste;
  }

  async terminAnlegen(t) {
    const zone = this.zeitzone();
    const s = zeitpunkt(t.start, zone);
    let start;
    let ende;
    const ganztaegig = !!s.date;
    if (ganztaegig) {
      const e = t.ende ? zeitpunkt(t.ende, zone) : null;
      start = { dateTime: `${s.date}T00:00:00`, timeZone: zone };
      ende = { dateTime: `${e && e.date ? e.date : naechsterTag(s.date)}T00:00:00`, timeZone: zone };
    } else {
      start = graphZeit(s, zone);
      ende = t.ende ? graphZeit(zeitpunkt(t.ende, zone), zone) : { dateTime: plusMinuten(start.dateTime, t.dauer_minuten || 60), timeZone: start.timeZone };
    }
    const teilnehmer = mime.adressliste(t.teilnehmer).map((a) => ({ emailAddress: { address: /<([^>]+)>/.exec(a)?.[1] || a }, type: 'required' }));
    const body = {
      subject: String(t.titel || '').trim() || '(ohne Titel)',
      start,
      end: ende,
      isAllDay: ganztaegig,
      ...(t.ort ? { location: { displayName: String(t.ort) } } : {}),
      ...(t.beschreibung ? { body: { contentType: 'Text', content: String(t.beschreibung) } } : {}),
      ...(teilnehmer.length ? { attendees: teilnehmer } : {}),
    };
    const url = t.kalender ? `${GRAPH}/me/calendars/${encodeURIComponent(t.kalender)}/events` : `${GRAPH}/me/events`;
    const r = await this.api(url, { methode: 'POST', json: body });
    return { id: r.id, link: r.webLink, start: r.start, ende: r.end };
  }

  // --- Kontakte ---

  async kontakteSuchen(name) {
    const q = String(name || '').trim();
    if (!q) throw new OutlookFehler('Bitte einen Namen oder eine Adresse angeben.');
    const r = await this.api(`${GRAPH}/me/people`, { query: { $search: `"${q.replace(/"/g, '')}"`, $top: 10, $select: 'displayName,scoredEmailAddresses,phones' } });
    return (r.value || [])
      .map((p) => ({
        name: p.displayName || '',
        emails: (p.scoredEmailAddresses || []).map((e) => e.address).filter(Boolean),
        telefon: (p.phones || []).map((x) => x.number).filter(Boolean),
      }))
      .filter((p) => p.emails.length || p.telefon.length);
  }
}

// Microsofts Fehlercodes (AADSTS…) in verständliche Hinweise übersetzen.
function erklaeren(text) {
  const s = String(text || '');
  if (!s) return '';
  if (/AADSTS700016|AADSTS700038|unauthorized_client|invalid_client/i.test(s)) return 'Microsoft kennt diese Anwendungs-ID nicht, oder die App erlaubt keine persönlichen Konten. Bitte in der App-Registrierung prüfen (Anleitung, Schritt 1).';
  if (/AADSTS50011|redirect/i.test(s)) return 'In der App-Registrierung fehlt die Umleitungs-URI http://localhost unter „Mobile und Desktopanwendungen“ (Anleitung, Schritt 2).';
  if (/AADSTS7000218|client_assertion|client_secret/i.test(s)) return 'Die App ist nicht als öffentlicher Client eingerichtet: In der App-Registrierung unter „Authentifizierung“ die öffentlichen Clientflows zulassen (Anleitung, Schritt 3).';
  if (/AADSTS65001|AADSTS90094|consent|admin/i.test(s)) return 'Für dieses Konto muss erst die IT (Administrator) zustimmen. Mit einem privaten Outlook.com-Konto geht es ohne.';
  if (/AADSTS90072/i.test(s)) return 'Dein Konto passt nicht zu dieser App-Registrierung: Die App ist auf einen bestimmten Firmen-Tenant (Organisation) beschränkt, dein Konto ist aber ein privates Microsoft-Konto (outlook.com/live.com). Nutze eine EIGENE App-Registrierung, die auch persönliche Microsoft-Konten erlaubt (Kontotyp „Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten“), und trag deren Anwendungs-ID ein. Häufige Ursache: als Anwendungs-ID wurde versehentlich die ID des Azure-Portals eingetragen.';
  return `Outlook-Anmeldung: ${s.split(/\r?\n/)[0].slice(0, 300)}`;
}

module.exports = { OutlookKonto, OutlookFehler, SCOPES, erklaeren };
