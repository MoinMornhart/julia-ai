'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Notizen, sichererName, ORDNER_NAME } = require('../src/main/notizen');

function memoOrdner() {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-memo-'));
  return { basis, ordner: path.join(basis, ORDNER_NAME) };
}

test('Ordnername ist versteckt (führender Punkt)', () => {
  assert.ok(ORDNER_NAME.startsWith('.'));
});

test('schreiben und lesen einer Notiz', () => {
  const { ordner } = memoOrdner();
  const n = new Notizen({ ordner });
  const name = n.schreiben('Server IP', 'localhost:25565 gemerkt');
  assert.equal(n.lesen(name), 'localhost:25565 gemerkt');
});

test('anhaengen ergänzt statt zu überschreiben', () => {
  const { ordner } = memoOrdner();
  const n = new Notizen({ ordner });
  n.schreiben('log', 'Zeile 1');
  n.schreiben('log', 'Zeile 2', { anhaengen: true });
  assert.equal(n.lesen('log'), 'Zeile 1\nZeile 2');
});

test('liste zeigt angelegte Notizen', () => {
  const { ordner } = memoOrdner();
  const n = new Notizen({ ordner });
  n.schreiben('a', 'x');
  n.schreiben('b', 'y');
  const namen = n.liste().map((e) => e.name).sort();
  assert.deepEqual(namen, ['a', 'b']);
});

test('loeschen entfernt eine Notiz', () => {
  const { ordner } = memoOrdner();
  const n = new Notizen({ ordner });
  n.schreiben('weg', 'x');
  assert.equal(n.loeschen('weg'), true);
  assert.equal(n.lesen('weg'), null);
});

test('sichererName verhindert Pfad-Trickser', () => {
  assert.equal(sichererName('../../etc/passwd'), 'etc-passwd');
  assert.ok(!sichererName('a/b/c').includes('/'));
  assert.ok(!sichererName('..').includes('..'));
  assert.equal(sichererName(''), 'notiz');
});

test('schreiben landet nie außerhalb des Notiz-Ordners', () => {
  const { basis, ordner } = memoOrdner();
  const n = new Notizen({ ordner });
  n.schreiben('../ausbruch', 'darf nicht raus');
  // Kein Ausbruch: im Basisordner selbst liegt keine Datei
  const imBasis = fs.readdirSync(basis).filter((x) => x !== ORDNER_NAME);
  assert.deepEqual(imBasis, []);
});
