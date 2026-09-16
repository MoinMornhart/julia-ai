'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { md, istTrenner, esc } = require('../src/renderer/markdown');

test('fett, kursiv und Inline-Code', () => {
  assert.match(md('**fett** und *kursiv* und `code`'), /<strong>fett<\/strong>/);
  assert.match(md('*kursiv*'), /<em>kursiv<\/em>/);
  assert.match(md('`x`'), /<code>x<\/code>/);
});

test('HTML wird escaped (kein Einschleusen)', () => {
  assert.match(md('<script>alert(1)</script>'), /&lt;script&gt;/);
  assert.equal(esc('<a>'), '&lt;a&gt;');
});

test('Listen und Überschriften', () => {
  assert.match(md('- eins\n- zwei'), /<ul><li>eins<\/li><li>zwei<\/li><\/ul>/);
  assert.match(md('# Titel'), /<h4>Titel<\/h4>/);
});

test('Codeblock bleibt unangetastet', () => {
  const out = md('```js\nconst a = 1;\n```');
  assert.match(out, /<pre><code>const a = 1;<\/code><\/pre>/);
});

test('istTrenner erkennt Tabellen-Trennlinien', () => {
  assert.equal(istTrenner('| --- | --- |'), true);
  assert.equal(istTrenner('|:--|--:|:-:|'), true);
  assert.equal(istTrenner('| a | b |'), false);
  assert.equal(istTrenner('nur text'), false);
});

test('GitHub-Tabelle wird zu <table>', () => {
  const t = '| Name | Wert |\n| --- | --- |\n| a | 1 |\n| b | 2 |';
  const out = md(t);
  assert.match(out, /<table>/);
  assert.match(out, /<th>Name<\/th><th>Wert<\/th>/);
  assert.match(out, /<td>a<\/td><td>1<\/td>/);
  assert.match(out, /<td>b<\/td><td>2<\/td>/);
});

test('Tabellen-Ausrichtung über Doppelpunkte', () => {
  const t = '| L | M | R |\n|:--|:-:|--:|\n| a | b | c |';
  const out = md(t);
  assert.match(out, /text-align:center/);
  assert.match(out, /text-align:right/);
  assert.match(out, /text-align:left/);
});

test('Zellen können Inline-Markdown enthalten', () => {
  const t = '| A | B |\n|---|---|\n| **fett** | `code` |';
  const out = md(t);
  assert.match(out, /<td><strong>fett<\/strong><\/td>/);
  assert.match(out, /<td><code>code<\/code><\/td>/);
});

test('Text ohne Tabelle bleibt normaler Absatz', () => {
  assert.match(md('einfach nur text'), /<p>einfach nur text<\/p>/);
});
