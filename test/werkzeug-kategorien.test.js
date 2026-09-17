'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const wz = require('../src/main/werkzeuge');

const namen = (ctx) => wz.alle(ctx).map((w) => w.name);

test('ohne Abschaltung sind alle Kern-Werkzeuge da', () => {
  const n = namen({});
  assert.ok(n.includes('datei_lesen'));
  assert.ok(n.includes('klick'));
  assert.ok(n.includes('gedaechtnis_lesen'));
});

test('abgeschaltete Kategorie fällt komplett weg', () => {
  const n = namen({ kategorienAus: () => ['dateien'] });
  assert.ok(!n.includes('datei_lesen'));
  assert.ok(!n.includes('datei_schreiben'));
  assert.ok(!n.includes('ordner_auflisten'));
  // andere Kategorien bleiben
  assert.ok(n.includes('klick'));
});

test('mehrere Kategorien abschaltbar; Kern bleibt', () => {
  const n = namen({ kategorienAus: () => ['steuerung', 'gedaechtnis'] });
  assert.ok(!n.includes('klick'));
  assert.ok(!n.includes('gedaechtnis_schreiben'));
  // Kern-Werkzeuge ohne Kategorie bleiben immer (z. B. Einstellungen, Auftrag)
  assert.ok(n.includes('einstellung_setzen'));
  assert.ok(n.includes('auftrag_vorlegen'));
});

test('einzeln abgeschaltetes Werkzeug geht nicht mehr ans Modell (der eigentliche Fix)', () => {
  const n = namen({ werkzeugeAus: () => ['shell', 'screenshot'] });
  assert.ok(!n.includes('shell'));
  assert.ok(!n.includes('screenshot'));
  assert.ok(n.includes('klick')); // Rest bleibt
});

test('unbekannte Kategorie ändert nichts', () => {
  const mit = namen({ kategorienAus: () => ['gibtsnicht'] });
  const ohne = namen({});
  assert.deepEqual(mit, ohne);
});

test('kategorieVon bildet Namen auf Kategorien ab, Kern ist null', () => {
  assert.equal(wz.kategorieVon('datei_lesen'), 'dateien');
  assert.equal(wz.kategorieVon('klick'), 'steuerung');
  assert.equal(wz.kategorieVon('einstellung_setzen'), null); // Kern
});

test('jede Kategorie-Zuordnung zeigt auf ein echtes Werkzeug', () => {
  const echte = new Set(wz.WERKZEUGE.map((w) => w.name));
  echte.add(wz.WEBSEITE.name); // webseite_abrufen ist ein eigenständiges Werkzeug
  for (const k of wz.KATEGORIEN) {
    for (const n of k.werkzeuge) {
      assert.ok(echte.has(n), `Kategorie ${k.id}: „${n}" ist kein echtes Werkzeug`);
    }
  }
});
