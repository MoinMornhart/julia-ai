'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ueberblick, absender } = require('../src/main/ueberblick');

const config = (werte = {}) => ({ get: (k) => ({ anbieter: 'anthropic', modell: 'claude-opus-5', 'nutzer.name': 'Philip', 'kosten.tageslimit_usd': 10, ...werte })[k] });
const kosten = { heute: () => ({ usd: 0.42, anfragen: 3, tag: '2026-09-14' }) };
const erinnerungen = { alle: () => [1, 2, 3, 4, 5, 6].map((i) => ({ id: String(i), text: `E${i}`, zeit: i, angelegt: 0 })) };

test('Absender ohne Mailadresse', () => {
  assert.equal(absender('Anna Schmidt <anna@example.com>'), 'Anna Schmidt');
  assert.equal(absender('"Telekom Kundenservice" <rechnung@telekom.de>'), 'Telekom Kundenservice');
  assert.equal(absender('<nur@adresse.de>'), 'nur@adresse.de');
});

test('Ohne Google: Kacheln sagen "aus", der Rest ist da', async () => {
  const u = await ueberblick({ config: config(), erinnerungen, kosten, konten: { google: { verbunden: false } }, systemStatus: async () => ({ ram_gesamt_gb: 16, ram_frei_gb: 8 }) });
  assert.deepEqual(u.termine, { aus: true });
  assert.deepEqual(u.mails, { aus: true });
  assert.equal(u.pc.daten.ram_gesamt_gb, 16);
  assert.equal(u.erinnerungen.length, 5);
  assert.deepEqual(u.kosten, { usd: 0.42, anfragen: 3, tag: '2026-09-14', limit: 10, lokal: false });
  assert.equal(u.nutzer, 'Philip');
  assert.equal(u.anbieter, 'Anthropic (Claude)');
});

test('Mit Google: nur Absender und Betreff, ein kaputter Teil reißt den Rest nicht mit', async () => {
  const google = {
    verbunden: true,
    termine: async () => [{ id: 'x', titel: 'Zahnarzt', start: '2026-09-14T09:00:00+02:00', ende: '2026-09-14T10:00:00+02:00', ganztaegig: false, beschreibung: 'geheim', teilnehmer: ['a@b.de'] }],
    mailSuchen: async () => ({ gesamt_geschaetzt: 7, mails: [{ id: '1', von: 'Anna <anna@x.de>', betreff: 'Freitag?', vorschau: 'Privater Inhalt der Mail' }] }),
  };
  const u = await ueberblick({ config: config(), erinnerungen, kosten, konten: { google }, systemStatus: async () => { throw new Error('PowerShell hängt'); } });
  assert.deepEqual(u.termine.daten, [{ titel: 'Zahnarzt', start: '2026-09-14T09:00:00+02:00', ende: '2026-09-14T10:00:00+02:00', ganztaegig: false, ort: '' }]);
  assert.deepEqual(u.mails.daten, { anzahl: 7, mails: [{ von: 'Anna', betreff: 'Freitag?' }] });
  assert.doesNotMatch(JSON.stringify(u), /Privater Inhalt|geheim|a@b\.de/, 'kein Mailinhalt, keine Beschreibung, keine Teilnehmer');
  assert.equal(u.pc.fehler, 'PowerShell hängt');
});

test('Lokale Anbieter kosten nichts', async () => {
  const u = await ueberblick({ config: config({ anbieter: 'ollama' }), erinnerungen, kosten, konten: null, systemStatus: null });
  assert.equal(u.kosten.lokal, true);
  assert.deepEqual(u.pc, { aus: true });
});
