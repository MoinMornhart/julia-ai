'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const mcp = require('../src/main/mcp');
const { GRUEN, GELB } = require('../src/main/ampel');

// Ein kleiner MCP-Server (stdio, eine JSON-Nachricht je Zeile). Er wird zur
// Laufzeit in einen Temp-Ordner geschrieben – unter test/ würde node --test
// ihn selbst als Test starten.
const PROBE_CODE = `
const readline = require('readline');
const aus = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
process.stdout.write('Probe-Server startet …\\n');
readline.createInterface({ input: process.stdin }).on('line', (z) => {
  const m = JSON.parse(z);
  if (m.id == null) return;
  const ok = (result) => aus({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') ok({ protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'probe', version: '1' } });
  else if (m.method === 'tools/list') ok({ tools: [
    { name: 'echo', description: 'Gibt Text zurück', inputSchema: { type: 'object', properties: { text: { type: 'string' } } }, annotations: { readOnlyHint: true } },
    { name: 'loeschen', description: 'Löscht etwas', inputSchema: { type: 'object', properties: {} } },
    { name: 'geheim', description: 'Zeigt eine Umgebungsvariable', inputSchema: { type: 'object', properties: {} } },
  ] });
  else if (m.method === 'tools/call') {
    const n = m.params.name;
    if (n === 'echo') ok({ content: [{ type: 'text', text: 'Echo: ' + m.params.arguments.text }] });
    else if (n === 'geheim') ok({ content: [{ type: 'text', text: 'Token: ' + (process.env.PROBE_TOKEN || 'fehlt') }] });
    else ok({ content: [{ type: 'text', text: 'geht nicht' }], isError: true });
  } else aus({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'unbekannt' } });
});
`;
const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-mcp-'));
const PROBE = path.join(ORDNER, 'mcp probe server.js'); // mit Leerzeichen: Anführungszeichen müssen stimmen
fs.writeFileSync(PROBE, PROBE_CODE);

function verwaltung(server, tresorInhalt = {}) {
  const tresor = { d: { mcp: tresorInhalt }, lesen(k) { return this.d[k]; }, schreiben(k, v) { this.d[k] = v; } };
  const config = { get: (k) => (k === 'mcp.server' ? server : undefined) };
  return { v: new mcp.McpVerwaltung({ config, tresor, version: 'test' }), tresor };
}

const bereit = (v) => new Promise((ok, nein) => {
  const bis = setTimeout(() => nein(new Error(`kein Start: ${JSON.stringify(v.status())}`)), 20000);
  const pruefen = () => {
    if (v.status().every((s) => s.zustand === 'bereit' || s.zustand === 'fehler')) { clearTimeout(bis); ok(v.status()); }
  };
  v.on('status', pruefen);
  pruefen();
});

test('MCP: Einträge aus den Einstellungen werden geprüft', () => {
  const s = mcp.eintragPruefen({ name: 'Git<Hub>', befehl: 'npx -y @modelcontextprotocol/server-github' });
  assert.equal(s.name, 'GitHub');
  assert.equal(s.art, 'stdio');
  assert.equal(s.an, true);
  assert.equal(s.vertraut, false);
  assert.match(s.id, /^[0-9a-f-]{36}$/);
  assert.equal(mcp.eintragPruefen({ name: 'Lokal', art: 'http', url: 'http://localhost:3000/mcp' }).url, 'http://localhost:3000/mcp');
  assert.equal(mcp.eintragPruefen({ name: 'Fern', art: 'http', url: 'https://mcp.example.com/mcp' }).art, 'http');
  assert.throws(() => mcp.eintragPruefen({ name: 'Fern', art: 'http', url: 'http://mcp.example.com/mcp' }), /https/);
  assert.throws(() => mcp.eintragPruefen({ name: 'Fern', art: 'http', url: 'https://ich:geheim@mcp.example.com/' }), /Kopfzeile/);
  assert.throws(() => mcp.eintragPruefen({ befehl: 'npx x' }), /Namen/);
  assert.throws(() => mcp.eintragPruefen({ name: 'Leer' }), /Befehl/);
});

test('MCP: Befehlszeile, Werkzeugnamen und NAME=Wert-Zeilen', () => {
  assert.deepEqual(mcp.befehlTeilen('npx -y "@a/b" "C:\\Mit Leer\\x"'), ['npx', '-y', '@a/b', 'C:\\Mit Leer\\x']);
  assert.equal(mcp.werkzeugName('Mein GitHub!', 'create_issue'), 'mcp_mein_github_create_issue');
  assert.ok(mcp.werkzeugName('x'.repeat(40), 'y'.repeat(80)).length <= 64);
  assert.deepEqual(mcp.umgebungLesen('GITHUB_TOKEN=abc=def\n\n# kommentar\nAuthorization= Bearer xyz'), { GITHUB_TOKEN: 'abc=def', Authorization: 'Bearer xyz' });
  assert.throws(() => mcp.umgebungLesen('1ABC=x'), /gültiger Name/);
  assert.equal(mcp.inhaltText({ content: [{ type: 'text', text: 'a' }, { type: 'image', mimeType: 'image/png' }, { type: 'resource', resource: { text: 'b' } }] }), 'a\n[Bild: image/png]\nb');
});

test('MCP: stdio-Server starten, Werkzeuge durch die Ampel aufrufen, Tokens aus dem Tresor', async () => {
  const eintrag = mcp.eintragPruefen({ name: 'Probe', befehl: `"${process.execPath}" "${PROBE}"` });
  const { v } = verwaltung([eintrag], { [eintrag.id]: { PROBE_TOKEN: 'geheim-123' } });
  v.anwenden();
  try {
    const [s] = await bereit(v);
    assert.equal(s.zustand, 'bereit', s.fehler);
    assert.equal(s.werkzeuge, 3);
    const w = v.werkzeuge();
    assert.deepEqual(w.map((x) => x.name), ['mcp_probe_echo', 'mcp_probe_loeschen', 'mcp_probe_geheim']);
    const echo = w[0];
    assert.equal(echo.fremd, true, 'Ergebnisse sind fremder Inhalt');
    assert.equal(echo.einstufen({ text: 'x' }).stufe, GELB, 'ohne Vertrauen wird immer gefragt');
    assert.equal(echo.einstufen({ text: 'x' }).kategorie, 'mcp');
    assert.match(await echo.ausfuehren({ text: 'hallo' }), /Echo: hallo/);
    await assert.rejects(w[1].ausfuehren({}), /geht nicht/);
    assert.match(await w[2].ausfuehren({}), /Token: geheim-123/);
  } finally {
    v.stoppenAlle();
  }
});

test('MCP: vertrauenswürdiger Server – nur Lese-Werkzeuge ohne Rückfrage', async () => {
  const eintrag = mcp.eintragPruefen({ name: 'Probe', befehl: `"${process.execPath}" "${PROBE}"`, vertraut: true });
  const { v } = verwaltung([eintrag]);
  v.anwenden();
  try {
    await bereit(v);
    const [echo, loeschen] = v.werkzeuge();
    assert.equal(echo.einstufen({}).stufe, GRUEN);
    assert.equal(loeschen.einstufen({}).stufe, GELB);
  } finally {
    v.stoppenAlle();
  }
});

test('MCP: kaputter Befehl endet als Fehler, nicht als Absturz', async () => {
  const eintrag = mcp.eintragPruefen({ name: 'Kaputt', befehl: `"${process.execPath}" -e "process.exit(5)"` });
  const { v } = verwaltung([eintrag]);
  v.anwenden();
  const [s] = await bereit(v);
  assert.equal(s.zustand, 'fehler');
  assert.match(s.fehler, /beendet|antwortet/);
  assert.deepEqual(v.werkzeuge(), []);
});

test('MCP: Streamable HTTP mit Sitzung, Kopfzeile aus dem Tresor und SSE-Antwort', async () => {
  const gesehen = [];
  const server = http.createServer((req, res) => {
    let roh = '';
    req.on('data', (d) => { roh += d; });
    req.on('end', () => {
      const m = JSON.parse(roh);
      gesehen.push({ method: m.method, sitzung: req.headers['mcp-session-id'] || null, auth: req.headers.authorization || null });
      if (m.id == null) { res.writeHead(202); res.end(); return; }
      const antwort = (result) => ({ jsonrpc: '2.0', id: m.id, result });
      if (m.method === 'initialize') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'sitzung-1' });
        res.end(JSON.stringify(antwort({ protocolVersion: mcp.PROTOKOLL, capabilities: { tools: {} }, serverInfo: { name: 'web', version: '1' } })));
      } else if (m.method === 'tools/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(antwort({ tools: [{ name: 'zeit', inputSchema: { type: 'object', properties: {} } }] })));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: {} })}\n\ndata: ${JSON.stringify(antwort({ content: [{ type: 'text', text: '12:00' }] }))}\n\n`);
      }
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const eintrag = mcp.eintragPruefen({ name: 'Web', art: 'http', url: `http://localhost:${server.address().port}/mcp` });
  const { v } = verwaltung([eintrag], { [eintrag.id]: { Authorization: 'Bearer abc' } });
  v.anwenden();
  try {
    const [s] = await bereit(v);
    assert.equal(s.zustand, 'bereit', s.fehler);
    assert.match(await v.werkzeuge()[0].ausfuehren({}), /12:00/);
    assert.deepEqual(gesehen.map((g) => g.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
    assert.equal(gesehen[0].sitzung, null);
    assert.ok(gesehen.slice(1).every((g) => g.sitzung === 'sitzung-1'), 'Sitzung wird mitgeschickt');
    assert.ok(gesehen.every((g) => g.auth === 'Bearer abc'), 'Kopfzeile aus dem Tresor');
  } finally {
    v.stoppenAlle();
    server.close();
  }
});
