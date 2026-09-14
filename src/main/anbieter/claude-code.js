'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');

// Claude-Abo über das lokal installierte Claude Code – nur für den eigenen
// Gebrauch. Claude Code läuft im Druckmodus mit dem Login des Nutzers, ganz
// ohne API-Schlüssel.
//
// Sicherheit: Claude Codes eigene Werkzeuge (Bash, Dateien, Web …) sind
// komplett abgeschaltet (--tools ""), fremde MCP-Server ausgeschlossen
// (--strict-mcp-config), und alles, was fragen würde, wird abgelehnt. Claude
// Code bekommt nur Julias Werkzeuge über einen lokalen MCP-Zugang mit
// Zufallsschlüssel – und jeder Aufruf läuft dort durch dieselbe Ampel und
// Freigabe wie bei jedem anderen Anbieter. Meldet Claude Code beim Start doch
// eigene Werkzeuge, bricht Julia ab.

const PRAEFIX = 'mcp__julia__';

function versionAus(name) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(name);
  return m ? m.slice(1).map(Number) : [0, 0, 0];
}

function neuesteZuerst(a, b) {
  const x = versionAus(a);
  const y = versionAus(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
  return 0;
}

// Sucht claude.exe: im PATH, beim nativen Installer und in den
// Editor-Erweiterungen (VS Code, Cursor, Windsurf).
function claudeFinden({ env = process.env, existiert = fs.existsSync, lesen = (d) => fs.readdirSync(d) } = {}) {
  const kandidaten = [];
  for (const ordner of String(env.PATH || env.Path || '').split(';')) {
    if (ordner.trim()) kandidaten.push(path.join(ordner.trim(), 'claude.exe'));
  }
  const home = env.USERPROFILE || os.homedir();
  kandidaten.push(path.join(home, '.local', 'bin', 'claude.exe'));
  if (env.LOCALAPPDATA) kandidaten.push(path.join(env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'));
  for (const editor of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf']) {
    const basis = path.join(home, editor, 'extensions');
    let namen = [];
    try { namen = lesen(basis).filter((n) => /^anthropic\.claude-code-/.test(n)); } catch { /* Editor nicht da */ }
    for (const n of namen.sort(neuesteZuerst)) kandidaten.push(path.join(basis, n, 'resources', 'native-binary', 'claude.exe'));
  }
  return kandidaten.find((k) => { try { return existiert(k); } catch { return false; } }) || null;
}

function inhaltUmwandeln(c) {
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return (c || []).map((b) => (b.type === 'image' && b.source
    ? { type: 'image', data: b.source.data, mimeType: b.source.media_type }
    : { type: 'text', text: String(b.text ?? '') }));
}

// Minimaler MCP-Server (Streamable HTTP, nur JSON-Antworten) auf 127.0.0.1.
class McpZugang {
  // werkzeuge(): [{ name, description, input_schema }]
  // aufrufen(name, eingabe): Promise<{ content, is_error }>
  constructor({ werkzeuge, aufrufen }) {
    this.werkzeuge = werkzeuge;
    this.aufrufen = aufrufen;
    this.server = null;
    this.schluessel = crypto.randomBytes(32).toString('base64url');
    this.url = null;
  }

  starten() {
    if (this.server) return Promise.resolve(this.url);
    const server = http.createServer((req, res) => {
      this._anfrage(req, res).catch((e) => {
        if (!res.headersSent) this._json(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: e.message } });
      });
    });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        this.server = server;
        this.url = `http://127.0.0.1:${server.address().port}/mcp`;
        resolve(this.url);
      });
    });
  }

  stoppen() {
    if (!this.server) return;
    this.server.close();
    if (this.server.closeAllConnections) this.server.closeAllConnections();
    this.server = null;
  }

  konfiguration() {
    return { mcpServers: { julia: { type: 'http', url: this.url, headers: { Authorization: `Bearer ${this.schluessel}` } } } };
  }

  _json(res, code, daten) {
    const body = JSON.stringify(daten);
    res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  async _anfrage(req, res) {
    const soll = Buffer.from(`Bearer ${this.schluessel}`);
    const ist = Buffer.from(String(req.headers.authorization || ''));
    if (ist.length !== soll.length || !crypto.timingSafeEqual(ist, soll)) { res.writeHead(401).end(); return; }
    if (!/^127\.0\.0\.1(:\d+)?$/.test(String(req.headers.host || ''))) { res.writeHead(421).end(); return; }
    if (req.method !== 'POST' || new URL(req.url, 'http://x').pathname !== '/mcp') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    const teile = [];
    let n = 0;
    for await (const t of req) {
      n += t.length;
      if (n > 4 * 1024 * 1024) { res.writeHead(413).end(); return; }
      teile.push(t);
    }
    let nachricht;
    try { nachricht = JSON.parse(Buffer.concat(teile).toString('utf8')); } catch {
      this._json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    const liste = Array.isArray(nachricht) ? nachricht : [nachricht];
    const antworten = [];
    for (const m of liste) {
      const a = await this._bearbeiten(m);
      if (a) antworten.push(a);
    }
    if (!antworten.length) { res.writeHead(202).end(); return; }
    this._json(res, 200, Array.isArray(nachricht) ? antworten : antworten[0]);
  }

  async _bearbeiten(m) {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return m && m.id != null ? { jsonrpc: '2.0', id: m.id, error: { code: -32600, message: 'Invalid request' } } : null;
    if (m.id == null) return null; // Benachrichtigung
    const ok = (result) => ({ jsonrpc: '2.0', id: m.id, result });
    const p = m.params || {};
    switch (m.method) {
      case 'initialize':
        return ok({ protocolVersion: p.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'julia', version: '1.0.0' } });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: this.werkzeuge().map((w) => ({ name: w.name, description: w.description || '', inputSchema: w.input_schema || { type: 'object', properties: {} } })) });
      case 'tools/call': {
        const r = await this.aufrufen(String(p.name || ''), p.arguments && typeof p.arguments === 'object' ? p.arguments : {});
        return ok({ content: inhaltUmwandeln(r.content), isError: !!r.is_error });
      }
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Unbekannte Methode ${m.method}` } };
    }
  }
}

function argumente({ modell, aufwand, systemDatei, mcpDatei, sitzung }) {
  const a = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--tools', '',
    '--strict-mcp-config',
    '--mcp-config', mcpDatei,
    '--allowedTools', 'mcp__julia',
    '--permission-prompts', 'none',
    '--system-prompt-file', systemDatei,
    '--system-prompt-snapshot', 'off',
  ];
  if (modell) a.push('--model', modell);
  if (aufwand) a.push('--effort', aufwand);
  if (sitzung) a.push('--resume', sitzung);
  return a;
}

// Umgebung für Claude Code: ohne API-Schlüssel, damit das Abo genutzt wird,
// und mit langer Wartezeit für Werkzeuge – eine Freigabe kann dauern.
function umgebung(env = process.env) {
  const e = { ...env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'ELECTRON_RUN_AS_NODE']) delete e[k];
  e.MCP_TOOL_TIMEOUT = String(30 * 60 * 1000);
  return e;
}

function fehlerUebersetzen(text) {
  const t = String(text || '').trim();
  if (/log ?in|not logged|invalid api key|authenticat|oauth|credentials/i.test(t)) {
    return 'Claude Code ist nicht angemeldet. Öffne Claude Code einmal, melde dich mit deinem Claude-Abo an (/login) und versuch es dann noch mal.';
  }
  if (/usage limit|rate limit|limit reached|quota/i.test(t)) return `Dein Claude-Abo-Kontingent ist gerade aufgebraucht: ${t.slice(0, 200)}`;
  return t.slice(-400) || 'Claude Code hat ohne Ergebnis beendet.';
}

// Liest die stream-json-Ausgabe von Claude Code.
class AusgabeLeser {
  constructor({ beiText = () => {}, beiFremdenWerkzeugen = () => {} }) {
    this.beiText = beiText;
    this.beiFremdenWerkzeugen = beiFremdenWerkzeugen;
    this.sitzung = null;
    this.ergebnis = null;
    this.gestreamt = false;
  }

  zeile(z) {
    let j;
    try { j = JSON.parse(z); } catch { return; }
    if (j.session_id) this.sitzung = j.session_id;
    if (j.type === 'system' && j.subtype === 'init') {
      const fremd = (j.tools || []).map(String).filter((t) => !t.startsWith(PRAEFIX));
      if (fremd.length) this.beiFremdenWerkzeugen(fremd);
    } else if (j.type === 'stream_event') {
      const e = j.event || {};
      if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta' && e.delta.text) {
        this.gestreamt = true;
        this.beiText(e.delta.text);
      }
    } else if (j.type === 'assistant' && !this.gestreamt) {
      for (const b of (j.message && j.message.content) || []) if (b.type === 'text' && b.text) this.beiText(b.text);
    } else if (j.type === 'result') {
      this.ergebnis = j;
    }
  }
}

class ClaudeCode {
  // exe: Pfad zu claude.exe; ordner: Arbeitsordner für Claude Code (leer, in Julias Datenordner)
  constructor({ exe, ordner, werkzeuge, aufrufen, starten = spawn }) {
    this.exe = exe;
    this.ordner = ordner;
    this.mcp = new McpZugang({ werkzeuge, aufrufen });
    this.starten = starten;
    this.sitzung = null;
  }

  neu() { this.sitzung = null; }

  stoppen() { this.mcp.stoppen(); }

  async senden({ text, system, modell, aufwand, signal, beiText }) {
    await this.mcp.starten();
    fs.mkdirSync(this.ordner, { recursive: true });
    const systemDatei = path.join(this.ordner, 'system.md');
    const mcpDatei = path.join(this.ordner, 'mcp.json');
    fs.writeFileSync(systemDatei, system, 'utf8');
    fs.writeFileSync(mcpDatei, JSON.stringify(this.mcp.konfiguration()), 'utf8');

    let fehler = null;
    const kind = this.starten(this.exe, argumente({ modell, aufwand, systemDatei, mcpDatei, sitzung: this.sitzung }), {
      cwd: this.ordner, env: umgebung(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const beenden = () => {
      try { spawn('taskkill', ['/pid', String(kind.pid), '/T', '/F'], { windowsHide: true }); } catch { /* schon weg */ }
    };
    const leser = new AusgabeLeser({
      beiText,
      beiFremdenWerkzeugen: (fremd) => {
        fehler = `Claude Code hat eigene Werkzeuge angeboten (${fremd.slice(0, 5).join(', ')}). Aus Sicherheitsgründen abgebrochen – Julia arbeitet nur mit ihren eigenen Werkzeugen.`;
        beenden();
      },
    });
    const abbruch = () => beenden();
    if (signal) signal.addEventListener('abort', abbruch, { once: true });
    let fehlerAusgabe = '';
    kind.stderr.on('data', (d) => { fehlerAusgabe = (fehlerAusgabe + d).slice(-4000); });
    readline.createInterface({ input: kind.stdout }).on('line', (z) => leser.zeile(z));
    kind.stdin.on('error', () => {});
    kind.stdin.end(text);
    try {
      await new Promise((resolve, reject) => {
        kind.on('error', (e) => reject(new Error(`Claude Code ließ sich nicht starten: ${e.message}`)));
        kind.on('close', resolve);
      });
    } finally {
      if (signal) signal.removeEventListener('abort', abbruch);
    }
    if (leser.sitzung) this.sitzung = leser.sitzung;
    if (signal && signal.aborted) throw Object.assign(new Error('abgebrochen'), { abgebrochen: true });
    if (fehler) throw new Error(fehler);
    const e = leser.ergebnis;
    if (!e) throw new Error(fehlerUebersetzen(fehlerAusgabe));
    if (e.is_error) throw new Error(fehlerUebersetzen(e.result || (e.errors || []).join(' ') || e.subtype));
    return { text: typeof e.result === 'string' ? e.result : '' };
  }
}

module.exports = { ClaudeCode, McpZugang, AusgabeLeser, claudeFinden, argumente, umgebung, fehlerUebersetzen, PRAEFIX };
