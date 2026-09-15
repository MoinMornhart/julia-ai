'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Logbuch, tagesStempel } = require('../src/main/minecraft-logbuch');

function tempOrdner() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'julia-mc-log-'));
}

test('Logbuch: Eintrag wird sofort auf die Platte geschrieben', () => {
  const ordner = tempOrdner();
  const lb = new Logbuch({ ordner });
  lb.eintrag('start', 'Auf dem Server eingeloggt.');
  lb.eintrag('ziel', 'Holz gesammelt.');
  // Neues Logbuch-Objekt (wie nach einem Neustart) – die Einträge sind noch da.
  const nachNeustart = new Logbuch({ ordner });
  const heute = nachNeustart.lesen();
  assert.equal(heute.length, 2);
  assert.equal(heute[0].art, 'start');
  assert.equal(heute[1].text, 'Holz gesammelt.');
});

test('Logbuch: jeder Tag hat eine eigene Datei', () => {
  const ordner = tempOrdner();
  const lb = new Logbuch({ ordner });
  lb.eintrag('info', 'heute');
  const dateien = fs.readdirSync(ordner);
  assert.equal(dateien.length, 1);
  assert.match(dateien[0], new RegExp(`minecraft-${tagesStempel()}\\.jsonl`));
});

test('Logbuch: Zusammenfassung zählt Ziele, Tode und Fehler', () => {
  const ordner = tempOrdner();
  const lb = new Logbuch({ ordner });
  lb.eintrag('ziel', 'Werkbank gebaut.');
  lb.eintrag('tod', 'Von einem Creeper erwischt.');
  lb.eintrag('fehler', 'Kein Weg zum Erz.');
  lb.eintrag('fortschritt', 'Etappe 5/22: Ofen', { aktuell: 'Ofen', prozent: 22 });
  const z = lb.zusammenfassung();
  assert.match(z, /Werkbank gebaut/);
  assert.match(z, /Gestorben: 1×/);
  assert.match(z, /Ofen \(22%\)/);
});

test('Logbuch: ohne Ordner bleibt der Eintrag wenigstens im Speicher, kein Absturz', () => {
  const lb = new Logbuch({});
  assert.doesNotThrow(() => lb.eintrag('info', 'kein Ordner'));
  assert.equal(lb.jüngste.length, 1);
});

test('Logbuch: leerer Tag meldet, dass es noch nichts gibt', () => {
  const lb = new Logbuch({ ordner: tempOrdner() });
  assert.match(lb.zusammenfassung('2000-01-01'), /kein Logbuch/);
});
