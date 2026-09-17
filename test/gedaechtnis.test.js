'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Gedaechtnis } = require('../src/main/gedaechtnis');

const neu = () => new Gedaechtnis(fs.mkdtempSync(path.join(os.tmpdir(), 'julia-gd-')));

test('Merken, lesen, löschen', () => {
  const g = neu();
  g.schreiben('commits', 'Commits auf Deutsch');
  assert.match(g.alsText(), /commits: Commits auf Deutsch/);
  assert.equal(g.loeschen('commits'), true);
  assert.equal(g.loeschen('commits'), false);
  assert.equal(g.alsText(), '(noch leer)');
});

test('anhaengen ergänzt statt zu ersetzen (Issue #75/#76)', () => {
  const g = neu();
  g.schreiben('notiz', 'Zeile 1');
  g.schreiben('notiz', 'Zeile 2', { anhaengen: true });
  assert.match(g.alle().notiz.inhalt, /Zeile 1\nZeile 2/);
  g.schreiben('notiz', 'ersetzt'); // ohne anhaengen überschreibt
  assert.equal(g.alle().notiz.inhalt, 'ersetzt');
});

test('Kaputte gedaechtnis.json: Lesen meldet es, Schreiben überschreibt nichts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-gd-'));
  const datei = path.join(dir, 'gedaechtnis.json');
  fs.writeFileSync(datei, '{ halb geschrieben');
  const g = new Gedaechtnis(dir);
  assert.match(g.alsText(), /nicht lesbar/);
  assert.throws(() => g.schreiben('projekt', 'Julia'));
  assert.equal(fs.readFileSync(datei, 'utf8'), '{ halb geschrieben');
});

test('gedaechtnis.json mit BOM wird gelesen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-gd-'));
  fs.writeFileSync(path.join(dir, 'gedaechtnis.json'), '﻿{"eintraege":{"a":{"inhalt":"b"}}}', 'utf8');
  assert.match(new Gedaechtnis(dir).alsText(), /a: b/);
});

test('Zugangsdaten werden nie gemerkt', () => {
  const g = neu();
  assert.throws(() => g.schreiben('wlan_passwort', 'geheim123'), /Zugangsdaten/);
  assert.throws(() => g.schreiben('anthropic', 'sk-ant-api03-abcdef'), /Zugangsdaten/);
  assert.throws(() => g.schreiben('bank', 'Meine PIN ist 1234'), /Zugangsdaten/);
  assert.equal(Object.keys(g.alle()).length, 0);
});
