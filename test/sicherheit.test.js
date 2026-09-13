'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const s = require('../src/main/sicherheit');

const RENDERER = path.join(__dirname, '..', 'src', 'renderer');

test('Nur Seiten aus dem renderer-Ordner gelten als vertrauenswürdig', () => {
  assert.equal(s.vertrauenswuerdig(pathToFileURL(path.join(RENDERER, 'chat.html')).href, RENDERER), true);
  assert.equal(s.vertrauenswuerdig(pathToFileURL(path.join(RENDERER, 'einstellungen.html')).href + '?einrichtung=1', RENDERER), true);
  assert.equal(s.vertrauenswuerdig(pathToFileURL(path.join(RENDERER, '..', 'main', 'main.js')).href, RENDERER), false);
  assert.equal(s.vertrauenswuerdig(pathToFileURL(RENDERER + 'x\\fake.html').href, RENDERER), false, 'Nachbarordner mit gleichem Präfix');
  assert.equal(s.vertrauenswuerdig('https://example.com', RENDERER), false);
  assert.equal(s.vertrauenswuerdig('', RENDERER), false);
  assert.equal(s.vertrauenswuerdig(undefined, RENDERER), false);
});

test('Nach außen gehen nur https, http und mailto', () => {
  assert.equal(s.externErlaubt('https://github.com'), true);
  assert.equal(s.externErlaubt('mailto:anna@example.com'), true);
  for (const boese of ['file:///C:/Windows/System32/cmd.exe', 'javascript:alert(1)', 'ms-msdt:/id PCWDiagnostic', 'search-ms:query=x', 'ms-settings:privacy', 'vbscript:x', 'kaputt']) {
    assert.equal(s.externErlaubt(boese), false, boese);
  }
});

test('IPC von fremden Seiten wird abgelehnt und gemeldet', async () => {
  const handler = {};
  const falschesIpc = { handle: (k, fn) => { handler[k] = fn; }, on: (k, fn) => { handler[k] = fn; } };
  const abgelehnt = [];
  const ipc = s.ipcAbsichern(falschesIpc, RENDERER, (kanal, url) => abgelehnt.push([kanal, url]));
  let aufgerufen = 0;
  ipc.handle('config:lesen', () => { aufgerufen++; return 'ok'; });
  ipc.on('chat:neu', () => { aufgerufen++; });

  const eigen = { senderFrame: { url: pathToFileURL(path.join(RENDERER, 'chat.html')).href } };
  const fremd = { senderFrame: { url: 'https://boese.example' } };
  assert.equal(await handler['config:lesen'](eigen), 'ok');
  assert.throws(() => handler['config:lesen'](fremd), /Unbekannter Absender/);
  handler['chat:neu'](fremd);
  handler['chat:neu']({ senderFrame: null });
  assert.equal(aufgerufen, 1);
  assert.equal(abgelehnt.length, 3);
});
