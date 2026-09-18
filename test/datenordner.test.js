'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ordnerBeschreibbar, beschreibbarerOrdner } = require('../src/main/startpruefung');

test('ordnerBeschreibbar erkennt einen echten, beschreibbaren Ordner', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-do-'));
  assert.equal(ordnerBeschreibbar(dir), true);
});

// Ein gefälschtes fs, bei dem nur bestimmte Ordner beschreibbar sind. Pfade
// werden normalisiert, weil path.join unter Windows Backslashes erzeugt.
function fakeFs(erlaubt) {
  const norm = (p) => String(p).replace(/\\/g, '/');
  const ok = (p) => erlaubt.some((e) => norm(p).startsWith(e));
  return {
    mkdirSync: (p) => { if (!ok(p)) throw new Error('EACCES'); },
    writeFileSync: (p) => { if (!ok(p)) throw new Error('EACCES'); },
    rmSync: () => {},
  };
}

test('beschreibbarerOrdner nimmt den ersten beschreibbaren Kandidaten', () => {
  const fsx = fakeFs(['/gut', '/auch-gut']);
  assert.equal(beschreibbarerOrdner(['/gut', '/auch-gut'], { fsx }), '/gut');
});

test('beschreibbarerOrdner überspringt gesperrte Ordner und weicht aus', () => {
  const fsx = fakeFs(['/temp']);
  assert.equal(beschreibbarerOrdner(['/gesperrt', '/temp'], { fsx }), '/temp');
});

test('beschreibbarerOrdner gibt den letzten Kandidaten als Notnagel zurück', () => {
  const fsx = fakeFs([]); // gar keiner beschreibbar
  assert.equal(beschreibbarerOrdner(['/a', '/b', '/c'], { fsx }), '/c');
});

test('beschreibbarerOrdner ignoriert leere Kandidaten', () => {
  const fsx = fakeFs(['/echt']);
  assert.equal(beschreibbarerOrdner([null, undefined, '', '/echt'], { fsx }), '/echt');
});
