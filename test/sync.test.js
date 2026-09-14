'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sync, codeErzeugen, codeNormal, adresseTeilen } = require('../src/main/sync');
const { Tresor } = require('../src/main/konten/tresor');
const { Gespraeche } = require('../src/main/gespraeche');
const { Gedaechtnis } = require('../src/main/gedaechtnis');
const { Routinen } = require('../src/main/routinen');
const { Erinnerungen } = require('../src/main/erinnerungen');

// Test-"Verschlüsselung": umkehrbar, aber nicht im Klartext.
const krypto = {
  verschluesseln: (t) => Buffer.from(t, 'utf8').toString('base64').split('').reverse().join(''),
  entschluesseln: (b) => Buffer.from(b.split('').reverse().join(''), 'base64').toString('utf8'),
};

function geraet(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-sync-'));
  const m = { gespraeche: new Gespraeche(dir, krypto), gedaechtnis: new Gedaechtnis(dir), routinen: new Routinen(dir), erinnerungen: new Erinnerungen(dir) };
  const s = new Sync({ tresor: new Tresor(dir, krypto), datenOrdner: dir, module: m, name, adressen: () => ['127.0.0.1'], suchPort: 0 });
  return { s, ...m };
}

async function paar() {
  const a = geraet('PC-Wohnzimmer');
  const b = geraet('Laptop');
  await a.s.starten(0, { takt: false });
  await b.s.starten(0, { takt: false });
  return { a, b, zu: () => { a.s.stoppen(); b.s.stoppen(); } };
}

async function koppeln(a, b, code = a.s.codeAnbieten().code) {
  const r = await b.s.beitreten({ code, adresse: `127.0.0.1:${a.s.port}` });
  await b.s.abgleichen(); // der erste Abgleich nach dem Koppeln
  return r;
}

test('Sync: Code tippfreundlich, Adresse mit Port', () => {
  assert.match(codeErzeugen(), /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(codeNormal(' k7qf 3m9p xr2d '), 'K7QF-3M9P-XR2D');
  assert.equal(codeNormal('K7QF-3M9P-XR2O'), 'K7QF-3M9P-XR20');
  assert.equal(codeNormal('zu kurz'), null);
  assert.deepEqual(adresseTeilen('192.168.1.20:9000'), { adresse: '192.168.1.20', port: 9000 });
  assert.deepEqual(adresseTeilen('192.168.1.20'), { adresse: '192.168.1.20', port: 8766 });
});

test('Sync: per Code koppeln, dann wandern Gespräche, Gedächtnis, Routinen und Erinnerungen', async () => {
  const { a, b, zu } = await paar();
  try {
    const { code } = a.s.codeAnbieten();
    const r = await koppeln(a, b, code.toLowerCase().replace(/-/g, ' '));
    assert.equal(r.name, 'PC-Wohnzimmer');
    assert.equal(a.s.geraete()[0].name, 'Laptop');
    assert.equal(b.s.geraete()[0].name, 'PC-Wohnzimmer');
    assert.equal(a.s.status().code, null, 'der Code gilt nur einmal');

    const id = a.gespraeche.neueId();
    a.gespraeche.speichern({ id, anzeige: [{ typ: 'nutzer', text: 'Hallo von A' }, { typ: 'julia', text: 'Hi!' }], verlauf: [{ role: 'user', content: 'Hallo von A' }] });
    a.gedaechtnis.schreiben('lieblingsspiel', 'Minecraft');
    a.routinen.speichern({ name: 'Nur auf A', symbol: '☕', schritte: ['Kaffee-Timer auf 4 Minuten'] });
    a.erinnerungen.hinzufuegen({ text: 'Pause machen', in_minuten: 30 });

    await b.s.abgleichen();
    assert.equal(b.gespraeche.lesen(id).titel, 'Hallo von A');
    assert.equal(b.gedaechtnis.alle().lieblingsspiel.inhalt, 'Minecraft');
    assert.ok(b.routinen.alle().some((x) => x.name === 'Nur auf A'));
    assert.ok(b.erinnerungen.alle().some((x) => x.text === 'Pause machen'));
    const namen = b.routinen.alle().map((x) => x.name);
    assert.equal(namen.length, new Set(namen).size, 'die Beispiel-Routinen gibt es nicht doppelt');

    // Löschen wandert mit, Neueres gewinnt.
    b.gedaechtnis.loeschen('lieblingsspiel');
    b.gedaechtnis.schreiben('stadt', 'Köln');
    await a.s.abgleichen();
    assert.equal(a.gedaechtnis.alle().lieblingsspiel, undefined);
    assert.equal(a.gedaechtnis.alle().stadt.inhalt, 'Köln');
    a.gedaechtnis.schreiben('stadt', 'Berlin');
    await b.s.abgleichen();
    assert.equal(b.gedaechtnis.alle().stadt.inhalt, 'Berlin');

    // Danach Ruhe: nichts wandert erneut hin und her.
    assert.deepEqual((await a.s.abgleichen()).betroffen, []);
    assert.deepEqual((await b.s.abgleichen()).betroffen, []);
  } finally {
    zu();
  }
});

test('Sync: Zugangsdaten landen auch über den Abgleich nie im Gedächtnis', async () => {
  const { a, b, zu } = await paar();
  try {
    await koppeln(a, b);
    // Direkt in die Datei geschrieben – so, als hätte ein altes Gerät es gespeichert.
    const datei = a.gedaechtnis.datei;
    fs.writeFileSync(datei, JSON.stringify({ eintraege: { wlan_passwort: { inhalt: 'geheim123', geaendert: '2026-09-14' } } }));
    await b.s.abgleichen();
    assert.equal(b.gedaechtnis.alle().wlan_passwort, undefined);
  } finally {
    zu();
  }
});

test('Sync: falscher Code koppelt nicht; ein fremdes Zertifikat bekommt keinen Schlüssel', async () => {
  const { a, b, zu } = await paar();
  try {
    a.s.codeAnbieten();
    await assert.rejects(b.s.beitreten({ code: 'AAAA-BBBB-CCCC', adresse: `127.0.0.1:${a.s.port}` }), /code/);
    assert.equal(a.s.geraete().length, 0);
    assert.equal(b.s.geraete().length, 0);

    await koppeln(a, b);
    b.s.tresor.schreiben(`sync_geraet_${a.s.id}`, { fp: 'AA:BB:CC' });
    await b.s.abgleichen();
    assert.equal(b.s.status().geraete[0].fehler, 'fremdes_zertifikat');

    // Adressen aus dem offenen Internet werden gar nicht erst angefragt.
    const { code } = a.s.codeAnbieten();
    await assert.rejects(b.s.beitreten({ code, adresse: '8.8.8.8:8766' }), /adresse/);
  } finally {
    zu();
  }
});

test('Sync: Entfernen trennt beide Richtungen', async () => {
  const { a, b, zu } = await paar();
  try {
    await koppeln(a, b);
    a.s.entfernen(b.s.id);
    assert.equal(a.s.geraete().length, 0);
    await b.s.abgleichen();
    assert.equal(b.s.status().geraete[0].fehler, 'nicht_gekoppelt');
  } finally {
    zu();
  }
});
