'use strict';

const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { GRUEN, GELB } = require('./ampel');
const { fremd } = require('./hilfen');

// MCP-Server anschließen (Model Context Protocol): Julia bekommt die Werkzeuge
// eines Servers dazu – etwa für GitHub, Notion, eine Datenbank oder bestimmte
// Ordner. Ein Server ist ein Programm auf diesem PC (stdio, eine JSON-Nachricht
// je Zeile) oder eine Adresse (Streamable HTTP). Jeder Aufruf läuft durch die
// Ampel und fragt vorher; was ein Server zurückgibt, gilt als fremder Inhalt.
// Tokens und Kopfzeilen liegen verschlüsselt im Tresor, nie in der config.json.

const PROTOKOLL = '2025-06-18';
const START_MS = 30 * 1000;
const AUFRUF_MS = 120 * 1000;
const MAX_SERVER = 20;
const MAX_WERKZEUGE = 64;
const MAX_TEXT = 200 * 1024;

// "npx -y @a/b "C:\Mit Leerzeichen"" → ['npx', '-y', '@a/b', 'C:\Mit Leerzeichen']
function befehlTeilen(zeile) {
  const teile = [];
  let aktuell = '';
  let inAnf = false;
  let hat = false;
  for (const z of String(zeile || '').trim()) {
    if (z === '"') { inAnf = !inAnf; hat = true; continue; }
    if (/\s/.test(z) && !inAnf) {
      if (hat) { teile.push(aktuell); aktuell = ''; hat = false; }
      continue;
    }
    aktuell += z;
    hat = true;
  }
  if (hat) teile.push(aktuell);
  return teile;
}

// Für cmd.exe: Argumente mit Leer- oder Sonderzeichen in Anführungszeichen.
function fuerCmd(a) {
  const s = String(a);
  return s && !/[\s"&|<>^()]/.test(s) ? s : `"${s.replace(/"/g, '""')}"`;
}

// Werkzeugnamen fürs Modell: mcp_<server>_<werkzeug>, nur a–z, 0–9, _ und -.
function werkzeugName(server, name) {
  const s = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `mcp_${s(server).slice(0, 16) || 'server'}_${s(name) || 'werkzeug'}`.slice(0, 64);
}

// "NAME=Wert" je Zeile → { NAME: 'Wert' } (Umgebungsvariablen oder HTTP-Kopfzeilen).
function umgebungLesen(text) {
  const aus = {};
  for (const zeile of String(text || '').split(/\r?\n/)) {
    const i = zeile.indexOf('=');
    if (i < 1) continue;
    const name = zeile.slice(0, i).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(name)) throw new Error(`„${name.slice(0, 40)}“ ist kein gültiger Name (Buchstaben, Ziffern, _ und -).`);
    aus[name] = zeile.slice(i + 1).trim();
    if (Object.keys(aus).length > 30) throw new Error('Höchstens 30 Einträge.');
  }
  return aus;
}

// Aus einer MCP-JSON Server-Einträge im Julia-Format ableiten (Issue #75, Drag-and-Drop).
// Erkennt den verbreiteten `{ "mcpServers": { name: {...} } }`-Stil (auch `servers`),
// eine reine name→Server-Map oder einen einzelnen Server. stdio (command+args) und
// http/sse (url) werden unterschieden; env/headers werden zu „K=V"-Zeilen (umgebung).
// vertraut ist immer false → jeder Aufruf läuft über die Ampel. Wirft eine klare
// deutsche Meldung, wenn die JSON ungültig ist oder keinen Server enthält.
function mcpAusJson(text) {
  let obj;
  try { obj = JSON.parse(String(text || '')); } catch { throw new Error('Das ist keine gültige JSON-Datei.'); }
  if (!obj || typeof obj !== 'object') throw new Error('Die JSON enthält keine MCP-Server.');
  const map = (obj.mcpServers && typeof obj.mcpServers === 'object') ? obj.mcpServers
    : (obj.servers && typeof obj.servers === 'object') ? obj.servers : obj;

  const befehlAus = (s) => [s.command, ...(Array.isArray(s.args) ? s.args : [])]
    .map(String)
    .map((t) => (/\s/.test(t) ? `"${t.replace(/"/g, '\\"')}"` : t))
    .join(' ').trim();
  const umgebungAus = (o) => (o && typeof o === 'object'
    ? Object.entries(o).filter(([k]) => /^[A-Za-z_]/.test(k)).map(([k, v]) => `${k}=${String(v)}`).join('\n')
    : '');

  const eintraege = [];
  const einer = (name, s) => {
    if (!s || typeof s !== 'object') return;
    const basis = { name: String(name || s.name || 'MCP').slice(0, 40), vertraut: false, an: true };
    if (s.url || s.type === 'http' || s.type === 'sse') {
      eintraege.push({ ...basis, art: 'http', url: String(s.url || ''), umgebung: umgebungAus(s.headers || s.env) });
    } else if (s.command) {
      eintraege.push({ ...basis, art: 'stdio', befehl: befehlAus(s), umgebung: umgebungAus(s.env) });
    }
  };

  if (map.command || map.url) einer(map.name || 'MCP', map);
  else for (const [name, s] of Object.entries(map)) einer(name, s);

  if (!eintraege.length) throw new Error('In der JSON wurde kein MCP-Server gefunden (erwartet z. B. „mcpServers": { … }).');
  return eintraege;
}

// Doppelte MCP-Server aus einer Liste entfernen (Issue #86: VibeWorks stand
// doppelt in den Einstellungen). Zwei Einträge gelten als derselbe Server, wenn
// sie dieselbe Adresse (http/sse), denselben Befehl (stdio) oder dieselbe Id
// haben. Der ERSTE Treffer bleibt (samt seinem „an"/„vertraut"-Zustand); spätere
// Doppel fallen weg. Reihenfolge bleibt erhalten.
function ohneDoppelte(liste) {
  const gesehen = new Set();
  const aus = [];
  for (const s of Array.isArray(liste) ? liste : []) {
    if (!s || typeof s !== 'object') continue;
    const schluessel = s.url ? `url:${String(s.url).trim().toLowerCase()}`
      : s.befehl ? `cmd:${String(s.befehl).trim().toLowerCase()}`
        : s.id ? `id:${s.id}` : null;
    if (schluessel && gesehen.has(schluessel)) continue;
    if (schluessel) gesehen.add(schluessel);
    aus.push(s);
  }
  return aus;
}

// Eintrag aus den Einstellungen prüfen: Name, Art, Befehl oder Adresse.
function eintragPruefen(roh) {
  const e = roh && typeof roh === 'object' ? roh : {};
  const name = String(e.name || '').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new Error('Gib dem MCP-Server einen Namen, z. B. GitHub.');
  const art = e.art === 'http' ? 'http' : 'stdio';
  const id = /^[a-z0-9-]{8,40}$/.test(String(e.id || '')) ? String(e.id) : crypto.randomUUID();
  const aus = { id, name, art, an: e.an !== false, vertraut: e.vertraut === true };
  if (art === 'stdio') {
    const befehl = String(e.befehl || '').replace(/[\r\n]+/g, ' ').trim();
    if (!befehl) throw new Error('Gib den Befehl an, der den Server startet – z. B. npx -y @modelcontextprotocol/server-filesystem C:\\Users\\du\\Dokumente');
    if (befehl.length > 1000) throw new Error('Der Befehl ist zu lang.');
    aus.befehl = befehl;
  } else {
    let u;
    try { u = new URL(String(e.url || '').trim()); } catch { throw new Error('Das ist keine gültige Adresse, z. B. https://mcp.example.com/mcp'); }
    const lokal = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (!(u.protocol === 'https:' || (u.protocol === 'http:' && lokal))) throw new Error('Nur Adressen mit https:// – unverschlüsselt (http://) nur auf diesem PC.');
    if (u.username || u.password) throw new Error('Zugangsdaten gehören nicht in die Adresse – trag sie als Kopfzeile ein.');
    aus.url = u.toString();
  }
  return aus;
}

// Ergebnis eines Werkzeugs als Text: Texte, eingebettete Ressourcen, Hinweise auf Bilder.
function inhaltText(r) {
  const teile = [];
  for (const c of Array.isArray(r && r.content) ? r.content : []) {
    if (!c || typeof c !== 'object') continue;
    if (c.type === 'text') teile.push(String(c.text ?? ''));
    else if (c.type === 'image' || c.type === 'audio') teile.push(`[${c.type === 'image' ? 'Bild' : 'Ton'}: ${c.mimeType || 'unbekannt'}]`);
    else if (c.type === 'resource' && c.resource) teile.push(c.resource.text != null ? String(c.resource.text) : `[Datei: ${c.resource.uri || ''}]`);
    else if (c.type === 'resource_link') teile.push(`[Verweis: ${c.name || ''} ${c.uri || ''}]`.trim());
  }
  if (!teile.length && r && r.structuredContent) teile.push(JSON.stringify(r.structuredContent));
  const text = teile.join('\n');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…(gekürzt)` : text;
}

// Eine Verbindung zu einem MCP-Server.
class McpServer extends EventEmitter {
  constructor(eintrag, { umgebung = {}, version = '1', starten = spawn, holen = (u, o) => globalThis.fetch(u, o) } = {}) {
    super();
    this.e = eintrag;
    this.umgebung = umgebung;
    this.version = version;
    this.spawnen = starten;
    this.holen = holen;
    this.zustand = 'aus';
    this.fehler = null;
    this.tools = [];
    this.offen = new Map();
    this.nr = 0;
    this.proc = null;
    this.sitzung = null;
    this.laeuft = null;
  }

  status() {
    const { id, name, art, an, vertraut, befehl, url } = this.e;
    return {
      id, name, art, an, vertraut, befehl: befehl || '', url: url || '',
      zustand: this.zustand, fehler: this.fehler, werkzeuge: this.tools.length,
      namen: this.tools.slice(0, 40).map((t) => t.name),
    };
  }

  _setzen(zustand, fehler = null) {
    this.zustand = zustand;
    this.fehler = fehler;
    this.emit('status');
  }

  // Startet (oder startet neu) und lädt die Werkzeugliste.
  starten() {
    if (this.laeuft) return this.laeuft;
    this.laeuft = (async () => {
      this._aufraeumen();
      this._setzen('startet');
      try {
        if (this.e.art === 'stdio') this._prozessStarten();
        const r = await this._anfrage('initialize', { protocolVersion: PROTOKOLL, capabilities: {}, clientInfo: { name: 'julia', version: this.version } }, START_MS);
        this.info = r && r.serverInfo ? r.serverInfo : null;
        await this._mitteilung('notifications/initialized');
        await this._werkzeugeLaden();
        this._setzen('bereit');
      } catch (e) {
        this._aufraeumen();
        this._setzen('fehler', e.message);
      } finally {
        this.laeuft = null;
      }
    })();
    return this.laeuft;
  }

  stoppen() {
    this._aufraeumen();
    this.tools = [];
    this._setzen('aus');
  }

  async aufrufen(name, args) {
    if (this.zustand !== 'bereit') await this.starten(); // nach einem Absturz einmal neu versuchen
    if (this.zustand !== 'bereit') throw new Error(`Der MCP-Server „${this.e.name}“ läuft nicht: ${this.fehler || 'unbekannt'}`);
    const r = await this._anfrage('tools/call', { name, arguments: args && typeof args === 'object' ? args : {} });
    return { text: inhaltText(r), fehler: !!(r && r.isError) };
  }

  async _werkzeugeLaden() {
    const tools = [];
    let cursor;
    for (let i = 0; i < 10; i++) {
      const r = await this._anfrage('tools/list', cursor ? { cursor } : {});
      tools.push(...(Array.isArray(r && r.tools) ? r.tools : []));
      cursor = r && r.nextCursor;
      if (!cursor || tools.length >= MAX_WERKZEUGE) break;
    }
    this.tools = tools.filter((t) => t && typeof t.name === 'string' && t.name).slice(0, MAX_WERKZEUGE);
  }

  _aufraeumen() {
    for (const [, o] of this.offen) { clearTimeout(o.timer); o.nein(new Error('Die Verbindung zum MCP-Server wurde beendet.')); }
    this.offen.clear();
    this.sitzung = null;
    const p = this.proc;
    this.proc = null;
    if (p) {
      p.removeAllListeners('exit');
      try { p.stdin.end(); } catch { /* schon weg */ }
      try { p.kill(); } catch { /* schon weg */ }
    }
  }

  // --- stdio ---

  _prozessStarten() {
    const teile = befehlTeilen(this.e.befehl);
    if (!teile.length) throw new Error('Kein Befehl angegeben.');
    const optionen = { env: { ...process.env, ...this.umgebung }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] };
    // npx, npm & Co. sind unter Windows .cmd-Dateien – die startet nur cmd.exe.
    const p = process.platform === 'win32'
      ? this.spawnen('cmd.exe', ['/d', '/s', '/c', `"${teile.map(fuerCmd).join(' ')}"`], { ...optionen, windowsVerbatimArguments: true })
      : this.spawnen(teile[0], teile.slice(1), optionen);
    this.proc = p;
    let fehlerText = '';
    p.stderr.on('data', (d) => { fehlerText = (fehlerText + d).slice(-2000); });
    readline.createInterface({ input: p.stdout }).on('line', (z) => this._zeile(z));
    p.stdin.on('error', () => { /* Prozess beendet */ });
    p.on('error', (e) => this._prozessWeg(p, e.message));
    p.on('exit', (code) => {
      const letzte = fehlerText.trim().split(/\r?\n/).pop() || '';
      this._prozessWeg(p, `Der Server hat sich beendet (${code})${letzte ? `: ${letzte.slice(0, 300)}` : ''}`);
    });
  }

  _prozessWeg(p, text) {
    if (this.proc !== p) return;
    this.proc = null;
    for (const [, o] of this.offen) { clearTimeout(o.timer); o.nein(new Error(text)); }
    this.offen.clear();
    if (this.zustand === 'bereit') this._setzen('fehler', text);
  }

  _zeile(zeile) {
    let m;
    try { m = JSON.parse(zeile); } catch { return; } // Logausgaben des Servers
    if (!m || typeof m !== 'object') return;
    if (m.id != null && (m.result !== undefined || m.error) && this.offen.has(m.id)) {
      const o = this.offen.get(m.id);
      this.offen.delete(m.id);
      clearTimeout(o.timer);
      if (m.error) o.nein(new Error(m.error.message || 'Fehler vom MCP-Server'));
      else o.ja(m.result);
      return;
    }
    // Fragen des Servers höflich beantworten – außer ping kann Julia keine.
    if (m.id != null && typeof m.method === 'string') {
      this._schreiben(m.method === 'ping' ? { jsonrpc: '2.0', id: m.id, result: {} } : { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Nicht unterstützt' } });
      return;
    }
    if (m.method === 'notifications/tools/list_changed') this._werkzeugeLaden().then(() => this.emit('status'), () => {});
  }

  _schreiben(m) {
    if (this.proc) this.proc.stdin.write(`${JSON.stringify(m)}\n`);
  }

  // --- Anfragen ---

  _anfrage(method, params, ms = AUFRUF_MS) {
    if (this.e.art === 'http') return this._http(method, params, ms, false);
    return new Promise((ja, nein) => {
      if (!this.proc) { nein(new Error('Der MCP-Server läuft nicht.')); return; }
      const id = ++this.nr;
      const timer = setTimeout(() => { this.offen.delete(id); nein(new Error('Der MCP-Server antwortet nicht.')); }, ms);
      this.offen.set(id, { ja, nein, timer });
      this._schreiben({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    });
  }

  async _mitteilung(method, params) {
    if (this.e.art === 'http') { await this._http(method, params, START_MS, true); return; }
    this._schreiben({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });
  }

  async _http(method, params, ms, mitteilung) {
    const id = mitteilung ? undefined : ++this.nr;
    const kopf = { ...this.umgebung, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOKOLL };
    if (this.sitzung) kopf['Mcp-Session-Id'] = this.sitzung;
    const abbruch = new AbortController();
    const timer = setTimeout(() => abbruch.abort(), ms);
    try {
      const r = await this.holen(this.e.url, {
        method: 'POST', headers: kopf, signal: abbruch.signal, redirect: 'error',
        body: JSON.stringify({ jsonrpc: '2.0', ...(mitteilung ? {} : { id }), method, ...(params ? { params } : {}) }),
      });
      const sitzung = r.headers.get('mcp-session-id');
      if (sitzung) this.sitzung = sitzung;
      if (mitteilung) return null;
      if (r.status === 401 || r.status === 403) throw new Error('Der MCP-Server verlangt eine Anmeldung – trag den Zugang als Kopfzeile ein (z. B. Authorization=Bearer …).');
      if (!r.ok) throw new Error(`Der MCP-Server antwortet mit ${r.status}.`);
      const text = await r.text();
      let m = null;
      if (/text\/event-stream/i.test(r.headers.get('content-type') || '')) {
        for (const block of text.split(/\r?\n\r?\n/)) {
          const daten = block.split(/\r?\n/).filter((z) => z.startsWith('data:')).map((z) => z.slice(5).trimStart()).join('\n');
          if (!daten) continue;
          try {
            const x = JSON.parse(daten);
            if (x && x.id === id) { m = x; break; }
          } catch { /* weiter */ }
        }
      } else {
        try { m = JSON.parse(text); } catch { throw new Error('Der MCP-Server hat keine gültige Antwort geschickt.'); }
      }
      if (!m || m.id !== id) throw new Error('Keine Antwort vom MCP-Server.');
      if (m.error) throw new Error(m.error.message || 'Fehler vom MCP-Server');
      return m.result;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Der MCP-Server antwortet nicht.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Alle Server aus den Einstellungen – und ihre Werkzeuge für Julia.
class McpVerwaltung extends EventEmitter {
  constructor({ config, tresor, version = '1', starten, holen }) {
    super();
    this.config = config;
    this.tresor = tresor;
    this.optionen = { version, starten, holen };
    this.server = new Map();
  }

  _umgebung(id) {
    const alles = (this.tresor && this.tresor.lesen('mcp')) || {};
    const u = alles[id];
    return u && typeof u === 'object' ? u : {};
  }

  // NAME=Wert-Zeilen verschlüsselt ablegen (null löscht).
  umgebungSetzen(id, text) {
    if (!this.tresor) return;
    const alles = { ...((this.tresor.lesen('mcp')) || {}) };
    if (text == null || !String(text).trim()) delete alles[id];
    else alles[id] = umgebungLesen(text);
    this.tresor.schreiben('mcp', alles);
  }

  // An die Einstellungen angleichen: neue starten, entfernte und ausgeschaltete stoppen.
  anwenden() {
    const liste = (this.config.get('mcp.server') || []).slice(0, MAX_SERVER);
    const ids = new Set(liste.map((e) => e.id));
    for (const [id, s] of this.server) {
      if (!ids.has(id)) { s.stoppen(); this.server.delete(id); }
    }
    for (const e of liste) {
      let s = this.server.get(e.id);
      const geaendert = s && JSON.stringify({ ...s.e, an: e.an, vertraut: e.vertraut }) !== JSON.stringify(e);
      if (!s || geaendert) {
        if (s) s.stoppen();
        s = new McpServer(e, { ...this.optionen, umgebung: this._umgebung(e.id) });
        s.on('status', () => this.emit('status'));
        this.server.set(e.id, s);
      }
      s.e = e;
      if (e.an && (s.zustand === 'aus' || s.zustand === 'fehler') && !s.laeuft) s.starten();
      if (!e.an && s.zustand !== 'aus') s.stoppen();
    }
    this.emit('status');
  }

  async neuStarten(id) {
    const s = this.server.get(id);
    if (!s) return;
    s.umgebung = this._umgebung(id);
    s.stoppen();
    if (s.e.an) await s.starten();
  }

  stoppenAlle() {
    for (const s of this.server.values()) s.stoppen();
  }

  status() {
    return [...this.server.values()].map((s) => s.status());
  }

  // Werkzeuge aller bereiten Server – im Format von Julias Werkzeugen.
  werkzeuge() {
    const liste = [];
    const vergeben = new Set();
    for (const s of this.server.values()) {
      if (s.zustand !== 'bereit') continue;
      for (const t of s.tools) {
        let name = werkzeugName(s.e.name, t.name);
        for (let n = 2; vergeben.has(name); n++) name = `${name.slice(0, 60)}_${n}`;
        vergeben.add(name);
        const schema = t.inputSchema && typeof t.inputSchema === 'object' && t.inputSchema.type === 'object' ? t.inputSchema : { type: 'object', properties: {} };
        const nurLesen = !!(t.annotations && t.annotations.readOnlyHint === true);
        const server = s.e.name;
        liste.push({
          name,
          fremd: true,
          description: `[MCP-Server „${server}“] ${String(t.description || t.title || t.name).slice(0, 1500)}`,
          input_schema: schema,
          einstufen: (e) => (s.e.vertraut && nurLesen
            ? { stufe: GRUEN, kategorie: null, grund: '' }
            : { stufe: GELB, kategorie: 'mcp', grund: `Werkzeug „${t.name}“ vom MCP-Server „${server}“`, beschreibung: `${server} → ${t.name}\n${JSON.stringify(e || {}, null, 2)}` }),
          async ausfuehren(e) {
            const r = await s.aufrufen(t.name, e);
            if (r.fehler) throw new Error(`${server}: ${r.text || 'Fehler'}`);
            return fremd(`dem MCP-Server ${server}`, r.text || '(keine Ausgabe)');
          },
        });
      }
    }
    return liste;
  }
}

module.exports = { McpVerwaltung, McpServer, eintragPruefen, ohneDoppelte, mcpAusJson, befehlTeilen, werkzeugName, umgebungLesen, inhaltText, PROTOKOLL };
