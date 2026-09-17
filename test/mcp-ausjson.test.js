'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mcpAusJson } = require('../src/main/mcp');

test('erkennt mcpServers-Stil (stdio mit command+args+env)', () => {
  const j = JSON.stringify({
    mcpServers: {
      filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\Users\\du\\Ordner mit Leer'], env: { TOKEN: 'abc' } },
    },
  });
  const [e] = mcpAusJson(j);
  assert.equal(e.name, 'filesystem');
  assert.equal(e.art, 'stdio');
  assert.equal(e.vertraut, false);
  // Argument mit Leerzeichen wird in Anführungszeichen gesetzt
  assert.ok(e.befehl.includes('npx -y @modelcontextprotocol/server-filesystem "C:\\Users\\du\\Ordner mit Leer"'));
  assert.equal(e.umgebung, 'TOKEN=abc');
});

test('erkennt http-Server mit url und headers', () => {
  const j = JSON.stringify({ mcpServers: { remote: { url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer x' } } } });
  const [e] = mcpAusJson(j);
  assert.equal(e.art, 'http');
  assert.equal(e.url, 'https://mcp.example.com/mcp');
  assert.equal(e.umgebung, 'Authorization=Bearer x');
});

test('erkennt einen einzelnen Server ohne Wrapper', () => {
  const [e] = mcpAusJson(JSON.stringify({ name: 'Solo', command: 'node', args: ['server.js'] }));
  assert.equal(e.name, 'Solo');
  assert.equal(e.art, 'stdio');
  assert.equal(e.befehl, 'node server.js');
});

test('mehrere Server werden alle übernommen', () => {
  const j = JSON.stringify({ mcpServers: { a: { command: 'x' }, b: { url: 'https://b.example/mcp' } } });
  const liste = mcpAusJson(j);
  assert.equal(liste.length, 2);
  assert.deepEqual(liste.map((e) => e.name).sort(), ['a', 'b']);
});

test('ungültige JSON und leere Server werfen klare Meldungen', () => {
  assert.throws(() => mcpAusJson('kein json'), /gültige JSON/);
  assert.throws(() => mcpAusJson(JSON.stringify({ mcpServers: {} })), /kein MCP-Server/);
  assert.throws(() => mcpAusJson(JSON.stringify({ foo: 1 })), /kein MCP-Server/);
});
