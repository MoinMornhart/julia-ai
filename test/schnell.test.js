'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/main/schnell');

test('Schnell: rechnen mit Grundrechenarten, Prozent und Potenz', () => {
  assert.equal(s.rechnen('3*(4+5)'), 27);
  assert.equal(s.rechnen('2^10'), 1024);
  assert.equal(s.rechnen('200*15%'), 30);
  assert.equal(s.rechnen('10 / 4'), 2.5);
  assert.equal(s.rechnen('1,5 + 2,5'), 4); // deutsches Komma
  assert.throws(() => s.rechnen('los()'), /erlaubt/);
  assert.throws(() => s.rechnen('1/0'), /gültige Zahl/);
  assert.throws(() => s.rechnen('(1+2'), /Klammern/);
});

test('Schnell: Einheiten umrechnen inkl. Temperatur', () => {
  assert.equal(s.umrechnen(1, 'km', 'm'), 1000);
  assert.equal(s.umrechnen(1, 'kg', 'g'), 1000);
  assert.equal(s.umrechnen(0, '°C', '°F'), 32);
  assert.equal(s.umrechnen(100, 'celsius', 'kelvin'), 373.15);
  assert.equal(s.umrechnen(1, 'GiB', 'MiB'), 1024);
  assert.equal(Math.round(s.umrechnen(1, 'meile', 'km') * 1000) / 1000, 1.609);
  assert.throws(() => s.umrechnen(1, 'km', 'kg'), /nicht ineinander/);
  assert.throws(() => s.umrechnen('x', 'km', 'm'), /keine Zahl/);
});

test('Schnell: Text umwandeln', () => {
  assert.equal(s.textWandeln('hallo welt', 'titel'), 'Hallo Welt');
  assert.equal(s.textWandeln('Hallo', 'gross'), 'HALLO');
  assert.equal(s.textWandeln('Hi', 'base64'), 'SGk=');
  assert.equal(s.textWandeln('SGk=', 'base64_dekodieren'), 'Hi');
  assert.equal(s.textWandeln('a b', 'url'), 'a%20b');
  assert.equal(s.textWandeln('{"a":1}', 'json'), '{\n  "a": 1\n}');
  assert.equal(s.textWandeln('eins zwei\ndrei', 'zaehlen'), '14 Zeichen, 3 Wörter, 2 Zeilen');
  assert.throws(() => s.textWandeln('x', 'quatsch'), /kenne ich nicht/);
});

test('Schnell: QR-Code als scanbare Block-Grafik', () => {
  const qr = s.qrText('https://example.org');
  const zeilen = qr.split('\n');
  assert.ok(zeilen.length > 8);
  assert.ok(zeilen.every((z) => /^[█▀▄ ]+$/u.test(z)));
  assert.ok(qr.includes('█'));
  assert.throws(() => s.qrText(''), /Kein Text/);
});

test('Schnell: das Werkzeug reicht die Aktionen durch', async () => {
  const { finden } = require('../src/main/werkzeuge');
  const w = finden('schnell', {});
  assert.equal(w.einstufen().stufe, require('../src/main/ampel').GRUEN);
  assert.equal(await w.ausfuehren({ aktion: 'rechnen', ausdruck: '6*7' }), '6*7 = 42');
  assert.match(await w.ausfuehren({ aktion: 'umrechnen', wert: 1, von: 'km', nach: 'm' }), /1000 m/);
  assert.equal(await w.ausfuehren({ aktion: 'text', text: 'Hi', art: 'klein' }), 'hi');
});
