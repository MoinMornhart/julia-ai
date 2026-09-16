'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { finden } = require('../src/main/doppelte');

function baum() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-dopp-'));
  fs.writeFileSync(path.join(o, 'a.txt'), 'gleicher inhalt hier');
  fs.writeFileSync(path.join(o, 'b.txt'), 'gleicher inhalt hier'); // Dublette von a
  fs.mkdirSync(path.join(o, 'unter'));
  fs.writeFileSync(path.join(o, 'unter', 'c.txt'), 'gleicher inhalt hier'); // auch Dublette
  fs.writeFileSync(path.join(o, 'anders.txt'), 'voellig anderer text!!');
  fs.mkdirSync(path.join(o, 'node_modules'));
  fs.writeFileSync(path.join(o, 'node_modules', 'd.txt'), 'gleicher inhalt hier'); // ausgeschlossen
  return o;
}

test('findet inhaltsgleiche Dateien über Unterordner', () => {
  const o = baum();
  const r = finden(o);
  assert.equal(r.gruppen.length, 1);
  const namen = r.gruppen[0].dateien.map((p) => path.basename(p)).sort();
  assert.deepEqual(namen, ['a.txt', 'b.txt', 'c.txt']);
});

test('überspringt node_modules', () => {
  const o = baum();
  const r = finden(o);
  assert.ok(!r.gruppen.some((g) => g.dateien.some((p) => p.includes('node_modules'))));
});

test('verschwendeter Platz = überzählige Kopien', () => {
  const o = baum();
  const r = finden(o);
  const groesse = Buffer.byteLength('gleicher inhalt hier');
  assert.equal(r.verschwendet, groesse * 2); // 3 gleiche → 2 überzählig
});

test('verschiedene Inhalte gleicher Länge sind keine Dublette', () => {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-dopp2-'));
  fs.writeFileSync(path.join(o, 'x.txt'), 'AAAA');
  fs.writeFileSync(path.join(o, 'y.txt'), 'BBBB'); // gleiche Größe, anderer Inhalt
  const r = finden(o);
  assert.equal(r.gruppen.length, 0);
});

test('keine Dubletten → leere Gruppen', () => {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-dopp3-'));
  fs.writeFileSync(path.join(o, 'nur-eine.txt'), 'einzig');
  const r = finden(o);
  assert.deepEqual(r.gruppen, []);
  assert.equal(r.verschwendet, 0);
});
