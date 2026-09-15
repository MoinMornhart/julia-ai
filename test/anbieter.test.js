'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const liste = require('../src/main/anbieter/liste');
const openai = require('../src/main/anbieter/openai');
const cc = require('../src/main/anbieter/claude-code');
const webseite = require('../src/main/webseite');
const { Konfiguration } = require('../src/main/config');

// SSE-Antwort wie von einer OpenAI-kompatiblen Schnittstelle.
function sse(ereignisse) {
  const text = ereignisse.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream({
    start(c) {
      // in kleinen Stücken, damit auch zerteilte Zeilen geprüft werden
      for (let i = 0; i < bytes.length; i += 17) c.enqueue(bytes.slice(i, i + 17));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function postJson(url, daten, kopf = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(daten);
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...kopf } }, (res) => {
      let t = '';
      res.on('data', (d) => { t += d; });
      res.on('end', () => resolve({ code: res.statusCode, json: t ? JSON.parse(t) : null }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('Anbieter-Liste: Abo nur, wenn Claude Code da ist; Schlüssel nur wo nötig', () => {
  assert.ok(!liste.fuerOberflaeche().some((a) => a.id === 'claude-abo'));
  assert.ok(liste.fuerOberflaeche({ claudeCode: true }).some((a) => a.id === 'claude-abo'));
  assert.equal(liste.brauchtSchluessel('openai'), true);
  assert.equal(liste.brauchtSchluessel('ollama'), false);
  assert.equal(liste.brauchtSchluessel('eigen'), false);
  assert.equal(liste.brauchtSchluessel('claude-abo'), false);
});

test('Eigene Adresse: HTTPS überall, HTTP nur lokal, nie mit Zugangsdaten', () => {
  assert.equal(liste.urlPruefen('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(liste.urlPruefen('http://localhost:8080/v1'), 'http://localhost:8080/v1');
  assert.equal(liste.urlPruefen('http://192.168.178.30:11434/v1'), 'http://192.168.178.30:11434/v1');
  assert.throws(() => liste.urlPruefen('http://api.example.com/v1'), /HTTPS/);
  assert.throws(() => liste.urlPruefen('https://nutzer:geheim@api.example.com'), /Zugangsdaten/);
  assert.throws(() => liste.urlPruefen('ftp://x'), /http/);
  assert.throws(() => liste.urlPruefen('kein link'), /gültige/);
});

test('Eigene Adresse: voller Endpunkt wird auf die Basis gekürzt (kein doppeltes /chat/completions)', () => {
  // Issue #10: Nutzer gibt die volle Endpunkt-URL ein – Julia hängt selbst
  // /chat/completions an, also darf es hier nicht schon dranstehen.
  assert.equal(liste.urlPruefen('https://api.b.ai/v1/chat/completions'), 'https://api.b.ai/v1');
  assert.equal(liste.urlPruefen('https://api.b.ai/v1/chat/completions/'), 'https://api.b.ai/v1');
  assert.equal(liste.urlPruefen('https://api.example.com/completions'), 'https://api.example.com');
  // Die Basis-Adresse bleibt unangetastet.
  assert.equal(liste.urlPruefen('https://api.b.ai/v1'), 'https://api.b.ai/v1');
});

test('Konfiguration: Anbieter geprüft, Schlüssel je Anbieter überleben einen Neustart', () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-anb-'));
  const c = new Konfiguration(ordner);
  c.laden();
  assert.equal(c.get('anbieter'), 'anthropic');
  assert.throws(() => c.set('anbieter', 'erfunden'), /Unbekannter Anbieter/);
  c.set('anbieter', 'gemini');
  c.set('api.je_anbieter', { gemini: 'VERSCHLUESSELT', erfunden: 'x' });
  c.set('anbieter_url', 'https://llm.example.com/v1/');
  const neu = new Konfiguration(ordner);
  neu.laden();
  assert.equal(neu.get('anbieter'), 'gemini');
  assert.deepEqual(neu.get('api.je_anbieter'), { gemini: 'VERSCHLUESSELT' });
  assert.equal(neu.get('anbieter_url'), 'https://llm.example.com/v1');
});

test('OpenAI-Format: Verlauf, Werkzeuge und Bilder aus Werkzeug-Ergebnissen', () => {
  const bild = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } };
  const verlauf = [
    { role: 'user', content: [{ type: 'text', text: 'Was siehst du?' }] },
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'Moment.' }, { type: 'tool_use', id: 'call_1', name: 'screenshot', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: [{ type: 'text', text: 'Monitor 0' }, bild] }] },
  ];
  const m = openai.verlaufUmwandeln('SYSTEM', verlauf);
  assert.deepEqual(m.map((x) => x.role), ['system', 'user', 'assistant', 'tool', 'user']);
  assert.equal(m[2].tool_calls[0].function.name, 'screenshot');
  assert.equal(m[3].content, 'Monitor 0');
  assert.equal(m[4].content[1].image_url.url, 'data:image/jpeg;base64,QUJD');
  const mistral = openai.verlaufUmwandeln('S', verlauf, { zwischenAntwort: true });
  assert.deepEqual(mistral.slice(3).map((x) => x.role), ['tool', 'assistant', 'user'], 'bei Mistral keine Nutzer-Nachricht direkt nach tool');

  const { tools, ohneTyp } = openai.werkzeugeUmwandeln([{ name: 'einstellung_setzen', description: 'd', input_schema: { type: 'object', properties: { schluessel: { type: 'string' }, wert: { description: 'Neuer Wert' } } } }]);
  assert.equal(tools[0].function.parameters.properties.wert.type, 'string');
  assert.ok(ohneTyp.get('einstellung_setzen').has('wert'));
});

test('OpenAI-Runde: Text wird gestreamt, zerteilte Werkzeugaufrufe richtig zusammengesetzt', async () => {
  let anfrage = null;
  const holen = async (url, o) => {
    anfrage = { url, o, body: JSON.parse(o.body) };
    return sse([
      { model: 'gpt-5-2026', choices: [{ index: 0, delta: { content: 'Hal' } }] },
      { choices: [{ index: 0, delta: { content: 'lo' } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'einstellung_setzen', arguments: '{"schluessel":"blase.an",' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"wert":"true"}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } },
      '[DONE]',
    ]);
  };
  const stuecke = [];
  const msg = await openai.runde({
    url: 'https://api.openai.com/v1', schluessel: 'sk-test', modell: 'gpt-5', system: 'SYS',
    werkzeuge: [{ name: 'einstellung_setzen', input_schema: { type: 'object', properties: { schluessel: { type: 'string' }, wert: { description: 'x' } } } }],
    verlauf: [{ role: 'user', content: [{ type: 'text', text: 'Blase an' }] }],
    beiText: (t) => stuecke.push(t), holen, optionen: { nutzung: true },
  });
  assert.equal(anfrage.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(anfrage.o.headers.Authorization, 'Bearer sk-test');
  assert.equal(anfrage.body.stream_options.include_usage, true);
  assert.equal(anfrage.body.messages[0].content, 'SYS');
  assert.equal(stuecke.join(''), 'Hallo');
  assert.equal(msg.stop_reason, 'tool_use');
  assert.deepEqual(msg.content[1], { type: 'tool_use', id: 'call_a', name: 'einstellung_setzen', input: { schluessel: 'blase.an', wert: true } });
  assert.deepEqual(msg.usage, { input_tokens: 120, output_tokens: 30 });
  assert.equal(msg.model, 'gpt-5-2026');
});

test('OpenAI-Runde: Fehler des Anbieters mit Status, Modelle laden', async () => {
  const abgelehnt = async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 });
  await assert.rejects(openai.runde({ url: 'https://x.example/v1', modell: 'm', system: 's', werkzeuge: [], verlauf: [], holen: abgelehnt }), (e) => e.status === 401 && /Incorrect API key/.test(e.message));
  const modelle = await openai.modelleLaden({ url: 'https://x.example/v1', holen: async () => new Response(JSON.stringify({ data: [{ id: 'b' }, { id: 'models/a' }, { id: 'b' }] })) });
  assert.deepEqual(modelle, ['a', 'b']);
});

test('Claude Code: eigene Werkzeuge aus, nur Julias MCP, ohne API-Schlüssel', () => {
  const a = cc.argumente({ modell: 'opus', aufwand: 'high', systemDatei: 's.md', mcpDatei: 'm.json', sitzung: 'abc' });
  const nach = (flag) => a[a.indexOf(flag) + 1];
  assert.equal(nach('--tools'), '', 'alle eingebauten Werkzeuge abgeschaltet');
  assert.ok(a.includes('--strict-mcp-config'));
  assert.equal(nach('--allowedTools'), 'mcp__julia');
  assert.equal(nach('--permission-prompts'), 'none');
  assert.equal(nach('--mcp-config'), 'm.json');
  assert.equal(nach('--resume'), 'abc');
  assert.ok(!a.includes('--dangerously-skip-permissions'));
  const env = cc.umgebung({ ANTHROPIC_API_KEY: 'sk-ant-x', PATH: 'C:\\x' });
  assert.equal(env.ANTHROPIC_API_KEY, undefined, 'sonst würde der API-Schlüssel statt des Abos genutzt');
  assert.equal(env.PATH, 'C:\\x');
  assert.match(cc.fehlerUebersetzen('Invalid API key · Please run /login'), /nicht angemeldet/);
});

test('Claude Code: Ausgabe lesen, fremde Werkzeuge melden', () => {
  const texte = [];
  let fremd = null;
  const l = new cc.AusgabeLeser({ beiText: (t) => texte.push(t), beiFremdenWerkzeugen: (f) => { fremd = f; } });
  l.zeile(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1', tools: ['mcp__julia__screenshot', 'Bash'] }));
  l.zeile(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } } }));
  l.zeile(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi' }] } }));
  l.zeile('kein json');
  l.zeile(JSON.stringify({ type: 'result', subtype: 'success', result: 'Hi', session_id: 's1' }));
  assert.deepEqual(fremd, ['Bash']);
  assert.deepEqual(texte, ['Hi'], 'gestreamter Text nicht doppelt');
  assert.equal(l.sitzung, 's1');
  assert.equal(l.ergebnis.result, 'Hi');
});

test('Claude Code finden: PATH, sonst neueste Editor-Erweiterung', () => {
  const home = 'C:\\Users\\x';
  const erw = path.join(home, '.vscode', 'extensions');
  const da = new Set([
    path.join(erw, 'anthropic.claude-code-2.1.9-win32-x64', 'resources', 'native-binary', 'claude.exe'),
    path.join(erw, 'anthropic.claude-code-2.1.270-win32-x64', 'resources', 'native-binary', 'claude.exe'),
  ]);
  const gefunden = cc.claudeFinden({
    env: { USERPROFILE: home, PATH: 'C:\\Windows' },
    existiert: (p) => da.has(p),
    lesen: (d) => (d === erw ? ['anthropic.claude-code-2.1.9-win32-x64', 'anthropic.claude-code-2.1.270-win32-x64', 'ms-python.python'] : []),
  });
  assert.match(gefunden, /2\.1\.270/);
  assert.equal(cc.claudeFinden({ env: { USERPROFILE: home, PATH: '' }, existiert: () => false, lesen: () => [] }), null);
});

test('MCP-Zugang: nur mit Schlüssel, liefert Julias Werkzeuge samt Bildern', async () => {
  const aufrufe = [];
  const mcp = new cc.McpZugang({
    werkzeuge: () => [{ name: 'screenshot', description: 'Bild', input_schema: { type: 'object', properties: {} } }],
    aufrufen: async (name, e) => {
      aufrufe.push([name, e]);
      return { content: [{ type: 'text', text: 'Monitor 0' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }] };
    },
  });
  const url = await mcp.starten();
  try {
    assert.equal((await postJson(url, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).code, 401);
    const kopf = mcp.konfiguration().mcpServers.julia.headers;
    const init = await postJson(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, kopf);
    assert.equal(init.json.result.serverInfo.name, 'julia');
    assert.equal((await postJson(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, kopf)).code, 202);
    const l = await postJson(url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, kopf);
    assert.deepEqual(l.json.result.tools.map((t) => t.name), ['screenshot']);
    const r = await postJson(url, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'screenshot', arguments: { monitor: 0 } } }, kopf);
    assert.deepEqual(aufrufe, [['screenshot', { monitor: 0 }]]);
    assert.deepEqual(r.json.result.content[1], { type: 'image', data: 'QUJD', mimeType: 'image/jpeg' });
  } finally {
    mcp.stoppen();
  }
});

test('Claude Code: ein ganzer Durchlauf mit Werkzeugaufruf über MCP', async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-cc-'));
  const aufrufe = [];
  const gestartet = [];
  // Ein falsches "claude.exe": ruft ein Werkzeug über MCP auf und antwortet.
  const starten = (exe, args) => {
    gestartet.push(args);
    const kind = new EventEmitter();
    kind.pid = 1;
    kind.stdout = new PassThrough();
    kind.stderr = new PassThrough();
    kind.stdin = new PassThrough();
    const mcp = JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config') + 1], 'utf8')).mcpServers.julia;
    setImmediate(async () => {
      const zeile = (o) => kind.stdout.write(`${JSON.stringify(o)}\n`);
      zeile({ type: 'system', subtype: 'init', session_id: 'sitzung-1', tools: ['mcp__julia__systemstatus'] });
      const r = await postJson(mcp.url, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'systemstatus', arguments: {} } }, mcp.headers);
      zeile({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: `Akku ${r.json.result.content[0].text}` } } });
      zeile({ type: 'result', subtype: 'success', is_error: false, result: 'Akku 80 %', session_id: 'sitzung-1' });
      kind.stdout.end();
      setImmediate(() => kind.emit('close', 0));
    });
    return kind;
  };
  const c = new cc.ClaudeCode({
    exe: 'claude.exe', ordner, starten,
    werkzeuge: () => [{ name: 'systemstatus', input_schema: { type: 'object', properties: {} } }],
    aufrufen: async (name) => { aufrufe.push(name); return { content: '80 %' }; },
  });
  try {
    const texte = [];
    const r = await c.senden({ text: 'Wie ist der Akku?', system: 'SYS', modell: 'opus', beiText: (t) => texte.push(t) });
    assert.equal(r.text, 'Akku 80 %');
    assert.deepEqual(aufrufe, ['systemstatus']);
    assert.deepEqual(texte, ['Akku 80 %']);
    assert.equal(fs.readFileSync(path.join(ordner, 'system.md'), 'utf8'), 'SYS');
    await c.senden({ text: 'Und jetzt?', system: 'SYS', beiText: () => {} });
    assert.equal(gestartet[1][gestartet[1].indexOf('--resume') + 1], 'sitzung-1', 'das Gespräch geht in derselben Sitzung weiter');
    c.neu();
    await c.senden({ text: 'Neu', system: 'SYS', beiText: () => {} });
    assert.ok(!gestartet[2].includes('--resume'));
  } finally {
    c.stoppen();
  }
});

test('Webseiten lesen: nie ins Heimnetz, auch nicht über Weiterleitungen', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.178.1', '169.254.169.254', '::1', '::ffff:192.168.0.1', 'fd00::1', '100.64.0.1']) assert.equal(webseite.intern(ip), true, ip);
  for (const ip of ['93.184.216.34', '2606:4700::1111']) assert.equal(webseite.intern(ip), false, ip);
  const aufloesen = async (h) => (h === 'router.example' ? [{ address: '192.168.178.1' }] : [{ address: '93.184.216.34' }]);
  await assert.rejects(webseite.adresseErlaubt('http://router.example/', aufloesen), /Heimnetz/);
  await assert.rejects(webseite.adresseErlaubt('file:///C:/Windows/win.ini', aufloesen), /http/);
  await assert.rejects(webseite.adresseErlaubt('http://localhost:8765/', aufloesen), /Heimnetz/);
  const weiter = async () => new Response(null, { status: 302, headers: { location: 'http://192.168.178.1/admin' } });
  await assert.rejects(webseite.webseiteLesen('https://kurz.example/x', { holen: weiter, aufloesen }), /Heimnetz/);
  const seite = async () => new Response('<html><head><title>Titel &amp; mehr</title><script>boese()</script></head><body><h1>Hallo</h1><p>Welt&nbsp;&#x21;</p></body></html>', { headers: { 'content-type': 'text/html' } });
  const text = await webseite.webseiteLesen('https://example.com/', { holen: seite, aufloesen });
  assert.match(text, /Titel & mehr/);
  assert.match(text, /Hallo\nWelt !/);
  assert.doesNotMatch(text, /boese/);
});

test('Agent mit OpenAI-kompatiblem Anbieter: Werkzeug läuft durch die Ampel, Antwort kommt an', async () => {
  const { Agent } = require('../src/main/agent');
  const werte = { anbieter: 'openai', modell: 'gpt-5', sprachcode: 'de', kanal: 'desktop', 'kosten.tageslimit_usd': 0 };
  const config = { get: (k) => werte[k] };
  const anfragen = [];
  const holen = async (url, o) => {
    const body = JSON.parse(o.body);
    anfragen.push(body);
    if (anfragen.length === 1) {
      return sse([{ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'erinnerungen_anzeigen', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }, '[DONE]']);
    }
    return sse([{ choices: [{ index: 0, delta: { content: 'Keine Erinnerungen offen.' }, finish_reason: 'stop' }] }, '[DONE]']);
  };
  const ctx = { erinnerungen: { alle: () => [] }, eigenesWeb: () => true, protokoll: { eintragen() {} } };
  const agent = new Agent({ config, ctx, apiSchluessel: (id) => (id === 'openai' ? 'sk-test' : ''), systemPrompt: () => 'SYS', laufzeitKontext: () => 'LAUF', holen });
  const text = await agent.senden('Welche Erinnerungen habe ich?');
  assert.equal(text, 'Keine Erinnerungen offen.');
  assert.ok(anfragen[0].tools.some((t) => t.function.name === 'webseite_abrufen'), 'ohne eigene Websuche gibt es webseite_abrufen');
  assert.match(anfragen[0].messages[0].content, /Websuche gibt es hier nicht/);
  const werkzeugNachricht = anfragen[1].messages.find((m) => m.role === 'tool');
  assert.equal(werkzeugNachricht.content, 'Keine offenen Erinnerungen.');

  // Ohne Schlüssel: klare Meldung statt Absturz
  const fehler = [];
  const ohne = new Agent({ config, ctx, apiSchluessel: () => '', systemPrompt: () => 'S', laufzeitKontext: () => '', holen });
  ohne.on('fehler', (f) => fehler.push(f));
  await ohne.senden('Hallo');
  assert.deepEqual(fehler, [{ art: 'kein_schluessel' }]);
  // Werkzeuge über MCP nur während eines laufenden Auftrags
  assert.equal((await agent._werkzeugUeberMcp('erinnerungen_anzeigen', {})).is_error, true);
});
