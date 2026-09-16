'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Geheimnisse } = require('../src/main/geheimnisse');

// Fake-Krypto: markiert verschlüsselte Werte, damit der Test sieht, dass nichts
// im Klartext gespeichert wird.
const krypto = {
  verschluesseln: (t) => `ENC(${Buffer.from(String(t)).toString('base64')})`,
  entschluesseln: (b) => Buffer.from(String(b).replace(/^ENC\(|\)$/g, ''), 'base64').toString('utf8'),
};

function neu() {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-geheim-'));
  return { ordner, g: new Geheimnisse(ordner, krypto) };
}

test('setzen und holen (Round-Trip)', () => {
  const { g } = neu();
  g.setzen('GitHub Token', 'ghp_supersecret');
  assert.equal(g.holen('GitHub Token'), 'ghp_supersecret');
});

test('namen listet nur Namen, keine Werte', () => {
  const { g } = neu();
  g.setzen('a', '1'); g.setzen('b', '2');
  assert.deepEqual(g.namen(), ['a', 'b']);
});

test('Werte liegen verschlüsselt auf der Platte (kein Klartext)', () => {
  const { ordner, g } = neu();
  g.setzen('pw', 'streng-geheim-123');
  const roh = fs.readFileSync(path.join(ordner, 'geheimnisse.json'), 'utf8');
  assert.ok(!roh.includes('streng-geheim-123'), 'Klartext darf nicht auf der Platte stehen');
  assert.ok(roh.includes('ENC('), 'Wert ist verschlüsselt');
});

test('überschreiben ersetzt den Wert', () => {
  const { g } = neu();
  g.setzen('k', 'alt');
  g.setzen('k', 'neu');
  assert.equal(g.holen('k'), 'neu');
  assert.equal(g.namen().length, 1);
});

test('loeschen entfernt das Geheimnis', () => {
  const { g } = neu();
  g.setzen('weg', 'x');
  assert.equal(g.loeschen('weg'), true);
  assert.equal(g.holen('weg'), null);
  assert.equal(g.loeschen('gibtsnicht'), false);
});

test('leerer Name wirft', () => {
  const { g } = neu();
  assert.throws(() => g.setzen('', 'x'), /Name/);
});

test('holen eines unbekannten Namens gibt null', () => {
  const { g } = neu();
  assert.equal(g.holen('nix'), null);
});
