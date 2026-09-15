'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Leistungslog, PC_STEUERUNG } = require('../src/main/leistung');

function tempOrdner() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'julia-leistung-'));
}

test('PC_STEUERUNG enthält die Steuerungs-Werkzeuge, aber keine harmlosen', () => {
  assert.ok(PC_STEUERUNG.has('klick'));
  assert.ok(PC_STEUERUNG.has('tippen'));
  assert.ok(PC_STEUERUNG.has('screenshot'));
  assert.ok(!PC_STEUERUNG.has('gedaechtnis_lesen'));
  assert.ok(!PC_STEUERUNG.has('webseite_abrufen'));
});

test('notieren schreibt sofort auf die Platte und überlebt einen Neustart', () => {
  const ordner = tempOrdner();
  const lg = new Leistungslog({ ordner });
  lg.notieren({ aktion: 'klick', dauerMs: 12, cpuMs: 3, rssMb: 210 });
  lg.notieren({ aktion: 'tippen', dauerMs: 40, cpuMs: 8, rssMb: 212 });
  const nachNeustart = new Leistungslog({ ordner });
  const heute = nachNeustart.lesen();
  assert.equal(heute.length, 2);
  assert.equal(heute[0].aktion, 'klick');
  assert.equal(heute[1].dauerMs, 40);
});

test('notieren speichert KEINE Inhalte – nur technische Felder', () => {
  const ordner = tempOrdner();
  const lg = new Leistungslog({ ordner });
  // Selbst wenn versehentlich Inhalt mitgegeben würde: er landet nicht im Eintrag.
  const e = lg.notieren({ aktion: 'tippen', dauerMs: 5, cpuMs: 1, rssMb: 100, text: 'geheim', x: 42 });
  assert.deepEqual(Object.keys(e).sort(), ['aktion', 'cpuMs', 'dauerMs', 'rssMb', 'zeit']);
  assert.ok(!('text' in e));
  assert.ok(!('x' in e));
});

test('messen misst CPU/Dauer und gibt das Ergebnis der Aktion zurück', async () => {
  const ordner = tempOrdner();
  const lg = new Leistungslog({ ordner });
  const r = await lg.messen('klick', async () => 'ok');
  assert.equal(r, 'ok');
  const eintraege = lg.lesen();
  assert.equal(eintraege.length, 1);
  assert.equal(eintraege[0].aktion, 'klick');
  assert.equal(typeof eintraege[0].cpuMs, 'number');
  assert.ok(eintraege[0].dauerMs >= 0);
});

test('messen markiert Fehler und wirft weiter, schreibt aber trotzdem', async () => {
  const ordner = tempOrdner();
  const lg = new Leistungslog({ ordner });
  await assert.rejects(() => lg.messen('programm_oeffnen', async () => { throw new Error('kaputt'); }), /kaputt/);
  const eintraege = lg.lesen();
  assert.equal(eintraege.length, 1);
  assert.equal(eintraege[0].fehler, true);
});

test('zusammenfassung aggregiert rein technisch', () => {
  const ordner = tempOrdner();
  const lg = new Leistungslog({ ordner });
  lg.notieren({ aktion: 'klick', dauerMs: 10, cpuMs: 2, rssMb: 200 });
  lg.notieren({ aktion: 'klick', dauerMs: 20, cpuMs: 4, rssMb: 205 });
  lg.notieren({ aktion: 'screenshot', dauerMs: 300, cpuMs: 50, rssMb: 260 });
  const z = lg.zusammenfassung();
  assert.equal(z.anzahl, 3);
  assert.equal(z.proAktion.klick.anzahl, 2);
  assert.equal(z.cpuMsGesamt, 56);
  assert.equal(z.teuerste.aktion, 'screenshot');
  assert.equal(z.langsamste.aktion, 'screenshot');
  assert.equal(z.rssMaxMb, 260);
});

test('berichtFuerDev ist bereinigt und enthält keine Inhalte', () => {
  const ordner = tempOrdner();
  const lg = new Leistungslog({ ordner });
  lg.notieren({ aktion: 'screenshot', dauerMs: 300, cpuMs: 50, rssMb: 260 });
  const b = lg.berichtFuerDev();
  assert.match(b, /PC-Steuerung/);
  assert.match(b, /screenshot/);
  // Kein Platzhalter-Leck: keine rohen IPs/Mails (der Scrubber lief drüber).
  assert.ok(!/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(b));
});

test('berichtFuerDev meldet klar, wenn es nichts gibt', () => {
  const ordner = tempOrdner();
  const lg = new Leistungslog({ ordner });
  assert.match(lg.berichtFuerDev(), /keine Aktionen/);
});
