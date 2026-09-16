'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { suchen, dateienFinden, globRegex, istBinaer } = require('../src/main/projektsuche');

function baum() {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-suche-'));
  fs.writeFileSync(path.join(ordner, 'a.js'), 'const hallo = 1;\nfunction welt() {}\n');
  fs.writeFileSync(path.join(ordner, 'b.txt'), 'HALLO Welt\nnichts hier\n');
  fs.mkdirSync(path.join(ordner, 'unter'));
  fs.writeFileSync(path.join(ordner, 'unter', 'c.js'), 'hallo aus dem Unterordner\n');
  fs.mkdirSync(path.join(ordner, 'node_modules'));
  fs.writeFileSync(path.join(ordner, 'node_modules', 'd.js'), 'hallo aus node_modules\n');
  return ordner;
}

test('findet Text über Unterordner hinweg, Groß/Klein egal', () => {
  const o = baum();
  const r = suchen(o, 'hallo');
  const dateien = r.treffer.map((t) => path.basename(t.datei)).sort();
  assert.deepEqual(dateien, ['a.js', 'b.txt', 'c.js']);
  assert.ok(r.treffer.every((t) => t.zeile >= 1));
});

test('überspringt node_modules', () => {
  const o = baum();
  const r = suchen(o, 'hallo');
  assert.ok(!r.treffer.some((t) => t.datei.includes('node_modules')));
});

test('Endungsfilter grenzt auf Dateitypen ein', () => {
  const o = baum();
  const r = suchen(o, 'hallo', { endungen: ['js'] });
  assert.ok(r.treffer.every((t) => t.datei.endsWith('.js')));
  assert.equal(r.treffer.length, 2);
});

test('grossKlein=true beachtet die Schreibweise', () => {
  const o = baum();
  assert.equal(suchen(o, 'HALLO', { grossKlein: true }).treffer.length, 1); // nur b.txt
});

test('regex-Suche funktioniert', () => {
  const o = baum();
  const r = suchen(o, 'function\\s+\\w+', { regex: true });
  assert.equal(r.treffer.length, 1);
  assert.match(r.treffer[0].text, /function welt/);
});

test('ungültiger regulärer Ausdruck gibt klare Meldung', () => {
  const o = baum();
  assert.throws(() => suchen(o, '(', { regex: true }), /Ungültiger regulärer Ausdruck/);
});

test('leerer Suchtext wirft', () => {
  const o = baum();
  assert.throws(() => suchen(o, ''), /Suchtext fehlt/);
});

test('maxTreffer begrenzt und meldet abgeschnitten', () => {
  const o = baum();
  const r = suchen(o, 'hallo', { maxTreffer: 1 });
  assert.equal(r.treffer.length, 1);
  assert.equal(r.abgeschnitten, true);
});

test('istBinaer erkennt Nullbytes', () => {
  assert.equal(istBinaer(Buffer.from([65, 0, 66])), true);
  assert.equal(istBinaer(Buffer.from('nur text')), false);
});

test('dateienFinden: Teiltext findet passende Dateinamen', () => {
  const o = baum();
  const namen = dateienFinden(o, 'a.js').treffer.map((p) => path.basename(p));
  assert.deepEqual(namen, ['a.js']);
});

test('dateienFinden: Glob *.js findet alle JS-Dateien (ohne node_modules)', () => {
  const o = baum();
  const r = dateienFinden(o, '*.js');
  const namen = r.treffer.map((p) => path.basename(p)).sort();
  assert.deepEqual(namen, ['a.js', 'c.js']);
  assert.ok(!r.treffer.some((p) => p.includes('node_modules')));
});

test('dateienFinden: Glob ? passt auf genau ein Zeichen', () => {
  const o = baum();
  assert.equal(dateienFinden(o, '?.txt').treffer.length, 1); // b.txt
  assert.equal(dateienFinden(o, '??.txt').treffer.length, 0);
});

test('dateienFinden: leeres Muster wirft', () => {
  const o = baum();
  assert.throws(() => dateienFinden(o, ''), /Suchmuster fehlt/);
});

test('globRegex übersetzt * und ? und verankert', () => {
  assert.ok(globRegex('*.js').test('a.js'));
  assert.ok(!globRegex('*.js').test('a.ts'));
  assert.ok(globRegex('a?c').test('abc'));
  assert.ok(!globRegex('a?c').test('ac'));
});
