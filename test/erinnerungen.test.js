'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Erinnerungen, zeitLesen } = require('../src/main/erinnerungen');

function neu(start = new Date(2026, 8, 14, 10, 0, 0).getTime()) {
  let jetzt = start;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-er-'));
  const e = new Erinnerungen(dir, { jetzt: () => jetzt });
  return { e, dir, vor: (ms) => { jetzt += ms; }, jetzt: () => jetzt };
}

test('Zeiten: lokal, nur Datum, mit Zone, nur Uhrzeit', () => {
  const jetzt = new Date(2026, 8, 14, 10, 0, 0).getTime();
  assert.equal(zeitLesen('2026-09-14T15:00', jetzt), new Date(2026, 8, 14, 15, 0, 0).getTime());
  assert.equal(zeitLesen('2026-09-15', jetzt), new Date(2026, 8, 15, 9, 0, 0).getTime());
  assert.equal(zeitLesen('2026-09-14T15:00:00+02:00', jetzt), Date.parse('2026-09-14T13:00:00Z'));
  assert.equal(zeitLesen('15:30', jetzt), new Date(2026, 8, 14, 15, 30, 0).getTime(), 'heute');
  assert.equal(zeitLesen('08:15', jetzt), new Date(2026, 8, 15, 8, 15, 0).getTime(), 'schon vorbei → morgen');
  assert.equal(zeitLesen('7.45 Uhr', jetzt), new Date(2026, 8, 15, 7, 45, 0).getTime());
  assert.throws(() => zeitLesen('morgen irgendwann', jetzt), /keine Zeitangabe/);
  assert.throws(() => zeitLesen('25:00', jetzt), /keine Zeitangabe/);
});

test('Stellen, anzeigen, löschen', () => {
  const { e } = neu();
  const a = e.hinzufuegen({ text: 'Anruf bei Anna', zeitpunkt: '2026-09-14T15:00' });
  e.hinzufuegen({ text: 'Pizza raus', in_minuten: 20 });
  const l = e.alle();
  assert.deepEqual(l.map((x) => x.text), ['Pizza raus', 'Anruf bei Anna'], 'sortiert nach Zeit');
  assert.equal(e.loeschen(a.id), true);
  assert.equal(e.loeschen(a.id), false);
  assert.equal(e.alle().length, 1);
});

test('Ungültiges wird abgelehnt', () => {
  const { e } = neu();
  assert.throws(() => e.hinzufuegen({ text: '', in_minuten: 5 }), /Worum/);
  assert.throws(() => e.hinzufuegen({ text: 'x'.repeat(301), in_minuten: 5 }), /300 Zeichen/);
  assert.throws(() => e.hinzufuegen({ text: 'x', in_minuten: -3 }), /positive Zahl/);
  assert.throws(() => e.hinzufuegen({ text: 'x', zeitpunkt: '2026-09-13T10:00' }), /Vergangenheit/);
  assert.throws(() => e.hinzufuegen({ text: 'x', zeitpunkt: '2028-01-01T10:00' }), /ein Jahr/);
  const t = e.hinzufuegen({ text: 'Zeile1\nZeile2', in_minuten: 1 }).text;
  assert.equal(t, 'Zeile1 Zeile2', 'Steuerzeichen und Zeilenumbrüche fliegen raus');
});

test('Fällig wird genau einmal gemeldet, verpasste als verspätet', () => {
  const { e, vor } = neu();
  const gemeldet = [];
  e.on('faellig', (x) => gemeldet.push(x));
  e.hinzufuegen({ text: 'gleich', in_minuten: 1 });
  e.hinzufuegen({ text: 'später', in_minuten: 60 });
  assert.equal(e.pruefen().length, 0);
  vor(61 * 1000);
  e.pruefen();
  e.pruefen();
  assert.deepEqual(gemeldet.map((x) => [x.text, x.verspaetet]), [['gleich', false]]);
  vor(3 * 3600 * 1000);
  e.pruefen();
  assert.deepEqual(gemeldet.map((x) => [x.text, x.verspaetet]), [['gleich', false], ['später', true]]);
  assert.equal(e.alle().length, 0);
});

test('Erinnerungen überleben einen Neustart', () => {
  const { e, dir, jetzt } = neu();
  e.hinzufuegen({ text: 'Zahnarzt', zeitpunkt: '2026-09-20T09:00' });
  const e2 = new Erinnerungen(dir, { jetzt });
  assert.equal(e2.alle()[0].text, 'Zahnarzt');
});

test('Höchstens 200 offene Erinnerungen', () => {
  const { e } = neu();
  for (let i = 0; i < 200; i++) e.hinzufuegen({ text: `E${i}`, in_minuten: i + 1 });
  assert.throws(() => e.hinzufuegen({ text: 'eine zu viel', in_minuten: 5 }), /200 offene/);
});
