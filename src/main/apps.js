'use strict';

// Zusammenarbeit mit anderen Apps. Julia kann sie öffnen und – wenn du sie
// einmal verbunden hast – auch direkt etwas hineinlegen:
//   • Todoist   – Aufgaben anlegen (offizielle REST-API v2).
//   • Stremio   – Filme/Serien in deine Bibliothek ("Liste") aufnehmen und suchen.
//   • VibeWork  – der Fokus-Timer; auf dem PC lässt er sich öffnen.
// Reine Logik: HTTP läuft über ein eingereichtes fetch, Zugangsdaten kommen aus
// dem Tresor (verschlüsselt). Julia selbst sieht die Token nie im Gespräch.

const TODOIST_API = 'https://api.todoist.com/rest/v2';
const STREMIO_API = 'https://api.strem.io/api';
const CINEMETA = 'https://v3-cinemeta.strem.io';

// Bekannte Apps: Anzeigename, wie man sie öffnet (Deep-Link zuerst, Web als
// Rückfall) und was sie kann. Der Deep-Link öffnet die installierte App, der
// Web-Link tut es zur Not im Browser.
const APPS = {
  todoist: {
    name: 'Todoist',
    zweck: 'Aufgaben',
    oeffnen: 'todoist://',
    web: 'https://app.todoist.com',
    aktionen: ['oeffnen', 'aufgabe', 'status'],
  },
  stremio: {
    name: 'Streamo',
    zweck: 'Streaming',
    oeffnen: 'stremio://',
    web: 'https://web.stremio.com',
    aktionen: ['oeffnen', 'liste_hinzufuegen', 'suchen', 'status'],
  },
  vibework: {
    name: 'VibeWork',
    zweck: 'Fokus',
    oeffnen: 'https://www.vibework.it/',
    web: 'https://www.vibework.it/',
    aktionen: ['oeffnen', 'status'],
  },
};

function appInfo(app) {
  const info = APPS[String(app || '').toLowerCase()];
  if (!info) throw new Error(`Unbekannte App "${app}". Bekannt: ${Object.keys(APPS).join(', ')}.`);
  return info;
}

// Öffnet die App: bevorzugt den Deep-Link (installierte App), sonst den Web-Link.
function zielZumOeffnen(app) {
  const info = appInfo(app);
  return info.oeffnen || info.web;
}

class Apps {
  // deps: { fetch, tresor }
  //   fetch  – wie das globale fetch (url, optionen) -> Response
  //   tresor – konten-Tresor: lesen(dienst)/schreiben(dienst, werte)
  constructor({ fetch, tresor }) {
    this._fetch = fetch;
    this.tresor = tresor;
  }

  // Für die Einstellungen: welche Dienste sind verbunden (Zugangsdaten da)?
  verbunden() {
    return {
      todoist: !!(this.tresor.lesen('todoist') || {}).token,
      stremio: !!(this.tresor.lesen('stremio') || {}).token,
      stremioMail: (this.tresor.lesen('stremio') || {}).email || '',
    };
  }

  // Welche Apps sind verbunden (Zugangsdaten hinterlegt)?
  status() {
    const zeilen = [];
    for (const [id, info] of Object.entries(APPS)) {
      let verbunden = false;
      if (id === 'todoist') verbunden = !!(this.tresor.lesen('todoist') || {}).token;
      else if (id === 'stremio') verbunden = !!(this.tresor.lesen('stremio') || {}).token;
      else verbunden = null; // braucht keine Verbindung
      const wie = verbunden === null ? 'zum Öffnen bereit' : verbunden ? 'verbunden' : 'noch nicht verbunden';
      zeilen.push(`${info.name} (${info.zweck}): ${wie}.`);
    }
    return zeilen.join('\n');
  }

  async _json(url, optionen, was) {
    let antwort;
    try {
      antwort = await this._fetch(url, optionen);
    } catch (e) {
      throw new Error(`${was} nicht erreichbar (${e.message}).`);
    }
    const text = await antwort.text();
    let daten = null;
    try { daten = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
    if (!antwort.ok) {
      const grund = (daten && (daten.error || daten.message)) || text.slice(0, 200) || `HTTP ${antwort.status}`;
      throw new Error(`${was}: ${grund}`);
    }
    return daten;
  }

  // ---- Todoist -----------------------------------------------------------
  todoistVerbinden(token) {
    const t = String(token || '').trim();
    if (!/^[A-Za-z0-9]{20,80}$/.test(t)) throw new Error('Das sieht nicht nach einem Todoist-API-Token aus (in Todoist unter Einstellungen → Integrationen → Entwickler).');
    this.tresor.schreiben('todoist', { token: t });
  }

  _todoistToken() {
    const token = (this.tresor.lesen('todoist') || {}).token;
    if (!token) throw new Error('Todoist ist noch nicht verbunden. In den Einstellungen unter „Apps“ dein Todoist-API-Token hinterlegen.');
    return token;
  }

  // Legt eine Aufgabe an. faellig: natürliche Sprache wie "morgen 9 Uhr",
  // "jeden Montag" – Todoist versteht das selbst (deutsch geht auch).
  async todoistAufgabe(inhalt, { faellig } = {}) {
    const text = String(inhalt || '').trim();
    if (!text) throw new Error('Was soll auf die Liste? Der Aufgabentext fehlt.');
    const koerper = { content: text.slice(0, 500) };
    if (faellig) koerper.due_string = String(faellig).slice(0, 100);
    const t = await this._json(`${TODOIST_API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._todoistToken()}` },
      body: JSON.stringify(koerper),
    }, 'Todoist');
    return { id: t && t.id, inhalt: (t && t.content) || text, faellig: t && t.due && t.due.string };
  }

  // ---- Stremio -----------------------------------------------------------
  // Zwei Wege sich zu verbinden: entweder E-Mail + Passwort (Julia holt den
  // authKey und merkt sich nur diesen, nicht das Passwort), oder den authKey
  // direkt (aus web.stremio.com). Das Passwort wird nie gespeichert.
  async stremioAnmelden({ email, passwort, authKey } = {}) {
    if (authKey) {
      const key = String(authKey).trim();
      if (key.length < 20) throw new Error('Der Streamo-authKey ist zu kurz.');
      this.tresor.schreiben('stremio', { token: key, email: String(email || '').trim() });
      return { email: String(email || '').trim() };
    }
    const mail = String(email || '').trim();
    const pw = String(passwort || '');
    if (!mail || !pw) throw new Error('Für Streamo brauche ich deine E-Mail und dein Passwort (oder alternativ einen authKey).');
    const daten = await this._json(`${STREMIO_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Login', email: mail, password: pw, facebook: false }),
    }, 'Streamo-Anmeldung');
    const key = daten && daten.result && daten.result.authKey;
    if (!key) throw new Error('Streamo hat keinen authKey zurückgegeben – E-Mail oder Passwort falsch?');
    this.tresor.schreiben('stremio', { token: key, email: mail });
    return { email: mail };
  }

  _stremioKey() {
    const key = (this.tresor.lesen('stremio') || {}).token;
    if (!key) throw new Error('Streamo ist noch nicht verbunden. In den Einstellungen unter „Apps“ mit E-Mail und Passwort anmelden.');
    return key;
  }

  // Sucht bei Cinemeta (Stremios Standard-Katalog) nach Filmen und Serien.
  async stremioSuchen(titel, { typ } = {}) {
    const q = String(titel || '').trim();
    if (!q) throw new Error('Wonach soll ich suchen? Der Titel fehlt.');
    const typen = typ === 'film' ? ['movie'] : typ === 'serie' ? ['series'] : ['movie', 'series'];
    const treffer = [];
    for (const t of typen) {
      const daten = await this._json(`${CINEMETA}/catalog/${t}/top/search=${encodeURIComponent(q)}.json`, {}, 'Streamo-Suche').catch(() => null);
      for (const m of (daten && daten.metas) || []) {
        treffer.push({ id: m.id, name: m.name, typ: m.type || t, jahr: m.releaseInfo || m.year || '', poster: m.poster || '' });
      }
    }
    return treffer.slice(0, 10);
  }

  // Nimmt einen Titel in die Bibliothek ("Meine Liste") auf. Sucht erst den
  // besten Treffer und legt ihn dann über datastorePut ab.
  async stremioHinzufuegen(titel, { typ } = {}) {
    const key = this._stremioKey();
    const treffer = await this.stremioSuchen(titel, { typ });
    if (!treffer.length) throw new Error(`In Streamo nichts zu „${titel}“ gefunden.`);
    const m = treffer[0];
    const jetzt = new Date().toISOString();
    const eintrag = {
      _id: m.id,
      name: m.name,
      type: m.typ,
      poster: m.poster || '',
      removed: false,
      temp: false,
      _ctime: jetzt,
      _mtime: jetzt,
      state: {
        lastWatched: '', timeWatched: 0, timeOffset: 0, overallTimeWatched: 0,
        timesWatched: 0, flaggedWatched: 0, duration: 0, video_id: '',
        watched: '', noNotif: false, season: 0, episode: 0,
      },
      behaviorHints: {},
    };
    await this._json(`${STREMIO_API}/datastorePut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: key, collection: 'libraryItem', changes: [eintrag] }),
    }, 'Streamo-Bibliothek');
    return { name: m.name, typ: m.typ, jahr: m.jahr, id: m.id };
  }
}

module.exports = { Apps, APPS, appInfo, zielZumOeffnen };
