'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const prompt = require('../src/main/prompt');
const { TEXTE } = require('../src/shared/texte');

const PROMPTS = path.join(__dirname, '..', 'prompt');

function platzhalter(text) {
  return [...new Set(text.match(/\{\{\w+\}\}/g) || [])].sort();
}

test('Deutsche und englische Prompt-Fassung nutzen dieselben Platzhalter', () => {
  const de = fs.readFileSync(path.join(PROMPTS, 'julia.de.md'), 'utf8');
  const en = fs.readFileSync(path.join(PROMPTS, 'julia.en.md'), 'utf8');
  assert.deepEqual(platzhalter(de), platzhalter(en));
});

test('Nach dem Ausfüllen bleibt kein Platzhalter übrig', () => {
  for (const sprachcode of ['de', 'en']) {
    const text = prompt.systemPrompt({ sprachcode, name: 'Philip', arbeitsverzeichnisse: ['C:\\Projekte'] });
    assert.deepEqual(platzhalter(text), [], sprachcode);
    assert.match(text, /Philip/);
    assert.match(text, /C:\\Projekte/);
  }
});

test('Ohne Namen und Ordner entsteht trotzdem ein lesbarer Prompt', () => {
  const text = prompt.systemPrompt({ sprachcode: 'de', name: '', arbeitsverzeichnisse: [] });
  assert.match(text, /noch keine festgelegt/);
});

test('Beide Sprachen haben dieselben Oberflächentexte', () => {
  assert.deepEqual(Object.keys(TEXTE.en).sort(), Object.keys(TEXTE.de).sort());
});

test('Der Laufzeitblock nennt Kanal, Version und Gedächtnis', () => {
  const t = prompt.laufzeitKontext({
    sprachcode: 'de', kanal: 'desktop', version: '0.0.1',
    monitore: [{ index: 0, haupt: true, breite: 2560, hoehe: 1440 }],
    gedaechtnis: '- commits: Deutsch', vorgemerkt: [{ zeit: '2026-09-13T08:00:00Z', beschreibung: 'Shell: winget upgrade --all' }],
  });
  assert.match(t, /desktop/);
  assert.match(t, /0\.0\.1/);
  assert.match(t, /commits: Deutsch/);
  assert.match(t, /winget upgrade/);
});
