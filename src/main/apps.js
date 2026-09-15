'use strict';

// Zusammenarbeit mit den eigenen Apps des Nutzers: ToDoch (Aufgaben), Streamo
// (Filme/Serien-Liste) und VibeWork (Projekte/Commits). Alle drei sprechen ihre
// eigene REST-API an; du hinterlegst je App eine Basis-URL und einen Token in den
// Einstellungen. Auth immer per Bearer-Token im Header, JSON als Inhalt.
//
// Verträge (so baust du die APIs; alternative Feldnamen werden mitgelesen):
//
//   ToDoch
//     • Aufgabe anlegen   POST {basis}/tasks            { "text": "…", "due": "…"? }
//         → { "id": "…", "text": "…" }
//
//   Streamo
//     • Suchen            GET  {basis}/search?q=…        → { "results": [ { "id","title","type","year" } ] }
//     • Zur Liste         POST {basis}/list             { "title": "…", "type": "film|serie"? }
//         → { "title": "…" }
//
//   VibeWork
//     • Projekt anlegen   POST {basis}/projects          { "name": "…" }        → { "id","name" }
//     • Person einladen   POST {basis}/projects/{id}/invites  { "email": "…" }  → 2xx = ok
//     • Letzter Commit    GET  {basis}/projects/{id}/commits/latest
//         → { "sha","message","author","date" }
//
// Reine Logik: HTTP über ein eingereichtes fetch, Zugangsdaten aus dem Tresor
// (verschlüsselt). Julia selbst sieht die Token nie im Gespräch.

// Deine Apps. „oeffnen" öffnet die hinterlegte Basis-URL (oder den Web-Link).
//
// Verträge der weiteren Apps (Auth wie oben, Bearer-Token):
//   Patchfeld / Codewerk (Lern-Apps)
//     • Session starten  POST {basis}/sessions          { "kurs": "…"? }   → { "id","titel"? }
//     • Fortschritt      GET  {basis}/progress                              → { "level"?,"offen"?,"heute"? }
//   Content-Helper
//     • Beitrag planen   POST {basis}/posts   { "text":"…","date":"…"?,"platform":"…"? } → { "id" }
//     • Ideen holen      GET  {basis}/ideas?thema=…                          → { "ideas":[ "…" ] }
const APPS = {
  todoist: { name: 'ToDoch', zweck: 'Aufgaben', aktionen: ['oeffnen', 'aufgabe', 'status'] },
  stremio: { name: 'Streamo', zweck: 'Streaming', aktionen: ['oeffnen', 'liste_hinzufuegen', 'suchen', 'status'] },
  vibework: { name: 'VibeWork', zweck: 'Projekte', aktionen: ['oeffnen', 'projekt_anlegen', 'einladen', 'letzter_commit', 'status'] },
  patchfeld: { name: 'Patchfeld', zweck: 'Lernen (IHK)', aktionen: ['oeffnen', 'session', 'fortschritt', 'status'] },
  codewerk: { name: 'Codewerk', zweck: 'Lernen (Code)', aktionen: ['oeffnen', 'session', 'fortschritt', 'status'] },
  content: { name: 'Content-Helper', zweck: 'Creator', aktionen: ['oeffnen', 'beitrag_planen', 'ideen', 'status'] },
};

function appInfo(app) {
  const info = APPS[String(app || '').toLowerCase()];
  if (!info) throw new Error(`Unbekannte App "${app}". Bekannt: ${Object.keys(APPS).join(', ')}.`);
  return info;
}

class Apps {
  // deps: { fetch, tresor }
  //   fetch  – wie das globale fetch (url, optionen) -> Response
  //   tresor – konten-Tresor: lesen(dienst)/schreiben(dienst, werte)
  constructor({ fetch, tresor }) {
    this._fetch = fetch;
    this.tresor = tresor;
  }

  // Eine App verbinden: Basis-URL (Pflicht) und Token (optional, je nach API).
  verbindenApp(id, { basisUrl, token } = {}) {
    appInfo(id);
    const url = String(basisUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/.+/i.test(url)) throw new Error(`Bitte eine gültige ${appInfo(id).name}-API-Adresse angeben (mit https://).`);
    this.tresor.schreiben(id, { basisUrl: url, token: String(token || '').trim() });
  }

  _dienst(id) {
    const d = this.tresor.lesen(id) || {};
    if (!d.basisUrl) throw new Error(`${appInfo(id).name} ist noch nicht verbunden. In den Einstellungen unter „Apps“ die API-Adresse und den Token hinterlegen.`);
    return d;
  }

  _kopf(d) {
    const h = { 'Content-Type': 'application/json' };
    if (d.token) h.Authorization = `Bearer ${d.token}`;
    return h;
  }

  // Wohin „oeffnen": die verbundene Basis-URL, sonst nichts Sinnvolles.
  zielZumOeffnen(id) {
    const d = this.tresor.lesen(id) || {};
    if (!d.basisUrl) throw new Error(`${appInfo(id).name} ist noch nicht verbunden – ich kenne keine Adresse zum Öffnen.`);
    return d.basisUrl;
  }

  // Für die Einstellungen: welche Dienste sind verbunden und mit welcher Adresse?
  verbunden() {
    const out = {};
    for (const id of Object.keys(APPS)) {
      const d = this.tresor.lesen(id) || {};
      out[id] = !!d.basisUrl;
      out[`${id}Url`] = d.basisUrl || '';
    }
    return out;
  }

  // Textstatus fürs Werkzeug.
  status() {
    return Object.entries(APPS).map(([id, info]) => {
      const verbunden = !!(this.tresor.lesen(id) || {}).basisUrl;
      return `${info.name} (${info.zweck}): ${verbunden ? 'verbunden' : 'noch nicht verbunden'}.`;
    }).join('\n');
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

  // ---- ToDoch (Aufgaben) -------------------------------------------------
  async todoistAufgabe(inhalt, { faellig } = {}) {
    const d = this._dienst('todoist');
    const text = String(inhalt || '').trim();
    if (!text) throw new Error('Was soll auf die Liste? Der Aufgabentext fehlt.');
    const koerper = { text: text.slice(0, 500) };
    if (faellig) koerper.due = String(faellig).slice(0, 100);
    const r = await this._json(`${d.basisUrl}/tasks`, { method: 'POST', headers: this._kopf(d), body: JSON.stringify(koerper) }, 'ToDoch');
    return { id: r && (r.id || r._id), inhalt: (r && (r.text || r.content || r.title)) || text, faellig: r && (r.due || r.faellig) };
  }

  // ---- Streamo (Filme/Serien) -------------------------------------------
  async stremioSuchen(titel, { typ } = {}) {
    const d = this._dienst('stremio');
    const q = String(titel || '').trim();
    if (!q) throw new Error('Wonach soll ich suchen? Der Titel fehlt.');
    const url = new URL(`${d.basisUrl}/search`);
    url.searchParams.set('q', q);
    if (typ) url.searchParams.set('type', typ);
    const r = await this._json(url.toString(), { headers: this._kopf(d) }, 'Streamo-Suche');
    const liste = (r && (r.results || r.items || r.treffer)) || [];
    return liste.slice(0, 10).map((m) => ({
      id: m.id || m._id,
      name: m.title || m.name,
      typ: m.type || m.typ || '',
      jahr: m.year || m.jahr || m.releaseInfo || '',
    }));
  }

  async stremioHinzufuegen(titel, { typ } = {}) {
    const d = this._dienst('stremio');
    const t = String(titel || '').trim();
    if (!t) throw new Error('Was soll auf die Liste? Der Titel fehlt.');
    const koerper = { title: t };
    if (typ) koerper.type = typ;
    const r = await this._json(`${d.basisUrl}/list`, { method: 'POST', headers: this._kopf(d), body: JSON.stringify(koerper) }, 'Streamo-Liste');
    return { name: (r && (r.title || r.name)) || t, typ: (r && (r.type || r.typ)) || typ || '', jahr: (r && (r.year || r.jahr)) || '' };
  }

  // ---- VibeWork (Projekte/Commits) --------------------------------------
  async vibeworkProjektAnlegen(name) {
    const d = this._dienst('vibework');
    const n = String(name || '').trim();
    if (!n) throw new Error('Wie soll das Projekt heißen?');
    const r = await this._json(`${d.basisUrl}/projects`, { method: 'POST', headers: this._kopf(d), body: JSON.stringify({ name: n }) }, 'VibeWork');
    return { id: r && (r.id || r._id || r.projectId), name: (r && r.name) || n };
  }

  async vibeworkEinladen(projekt, person) {
    const d = this._dienst('vibework');
    const p = String(projekt || '').trim();
    const wer = String(person || '').trim();
    if (!p || !wer) throw new Error('Ich brauche das Projekt und wen ich einladen soll.');
    await this._json(`${d.basisUrl}/projects/${encodeURIComponent(p)}/invites`, { method: 'POST', headers: this._kopf(d), body: JSON.stringify({ email: wer }) }, 'VibeWork');
    return { projekt: p, person: wer };
  }

  // Einen (bereinigten) Bug/Diagnose-Bericht an VibeWork melden.
  //   POST {basis}/bugs   { "title": "…", "body": "…" }   → { "id" }
  async vibeworkBug(titel, text) {
    const d = this._dienst('vibework');
    const r = await this._json(`${d.basisUrl}/bugs`, { method: 'POST', headers: this._kopf(d), body: JSON.stringify({ title: String(titel || '').slice(0, 200), body: String(text || '').slice(0, 8000) }) }, 'VibeWork');
    return { id: r && (r.id || r._id) };
  }

  async vibeworkLetzterCommit(projekt) {
    const d = this._dienst('vibework');
    const p = String(projekt || '').trim();
    if (!p) throw new Error('Von welchem Projekt soll ich den letzten Commit holen?');
    const r = await this._json(`${d.basisUrl}/projects/${encodeURIComponent(p)}/commits/latest`, { headers: this._kopf(d) }, 'VibeWork');
    return {
      sha: r && (r.sha || r.id || r.hash),
      message: r && (r.message || r.nachricht || r.msg),
      author: r && (r.author || r.autor || r.user),
      date: r && (r.date || r.datum || r.timestamp),
    };
  }

  // ---- Patchfeld / Codewerk (Lern-Apps) ---------------------------------
  async lernSession(id, { kurs } = {}) {
    const d = this._dienst(id);
    const koerper = {};
    if (kurs) koerper.kurs = String(kurs).slice(0, 80);
    const r = await this._json(`${d.basisUrl}/sessions`, { method: 'POST', headers: this._kopf(d), body: JSON.stringify(koerper) }, appInfo(id).name);
    return { id: r && (r.id || r._id), titel: r && (r.titel || r.title || r.name) };
  }

  async lernFortschritt(id) {
    const d = this._dienst(id);
    const r = await this._json(`${d.basisUrl}/progress`, { headers: this._kopf(d) }, appInfo(id).name);
    return r || {};
  }

  // ---- Content-Helper (Creator) -----------------------------------------
  async contentBeitragPlanen({ text, datum, plattform } = {}) {
    const d = this._dienst('content');
    const t = String(text || '').trim();
    if (!t) throw new Error('Was soll der Beitrag sein? Der Text fehlt.');
    const koerper = { text: t.slice(0, 2000) };
    if (datum) koerper.date = String(datum).slice(0, 40);
    if (plattform) koerper.platform = String(plattform).slice(0, 40);
    const r = await this._json(`${d.basisUrl}/posts`, { method: 'POST', headers: this._kopf(d), body: JSON.stringify(koerper) }, 'Content-Helper');
    return { id: r && (r.id || r._id), datum: (r && (r.date || r.datum)) || datum, plattform: (r && (r.platform || r.plattform)) || plattform };
  }

  async contentIdeen(thema) {
    const d = this._dienst('content');
    const url = new URL(`${d.basisUrl}/ideas`);
    if (thema) url.searchParams.set('thema', String(thema).slice(0, 120));
    const r = await this._json(url.toString(), { headers: this._kopf(d) }, 'Content-Helper');
    const liste = (r && (r.ideas || r.ideen || r.results)) || [];
    return liste.slice(0, 15).map((x) => (typeof x === 'string' ? x : (x && (x.text || x.title || x.titel)) || String(x)));
  }
}

module.exports = { Apps, APPS, appInfo };
