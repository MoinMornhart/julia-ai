'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sp = require('../src/main/startpruefung');

function ordner() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'julia-start-'));
}

test('Start: Flags – Unbekanntes und Widersprüchliches werden nur bemängelt', () => {
  const r = sp.flaggenPruefen(['electron.exe', '--versteckt', '--irgendwas', 'C:/pfad']);
  assert.deepEqual(r.unbekannt, ['--irgendwas']);
  assert.equal(r.konflikt, false);
  assert.equal(r.warnungen.length, 1);

  const k = sp.flaggenPruefen(['electron.exe', '--use-gl=swiftshader', '--disable-software-rasterizer']);
  assert.equal(k.konflikt, true);
  assert.match(k.warnungen.join(' '), /Software-Rendering/);

  assert.deepEqual(sp.flaggenPruefen(['electron.exe']).unbekannt, []);
});

test('Start: Logbuch dreht sich bei Überlänge und verliert nie den Start', () => {
  const o = ordner();
  try {
    const datei = path.join(o, 'start.log');
    const buch = new sp.Logbuch(datei);
    // Über die Grenze schreiben, dann muss ein .1 entstehen.
    const brocken = 'x'.repeat(20000);
    for (let i = 0; i < Math.ceil(sp.LOG_MAX / 20000) + 2; i++) buch.schreiben('INFO', brocken);
    assert.ok(fs.existsSync(`${datei}.1`), 'altes Logbuch als .1 vorhanden');
    assert.ok(fs.statSync(datei).size < sp.LOG_MAX + 40000);
  } finally {
    fs.rmSync(o, { recursive: true, force: true });
  }
});

test('Start: kaputter Logbuch-Pfad stürzt nicht ab', () => {
  const buch = sp.logbuchOeffnen('\0:/geht/nicht');
  assert.doesNotThrow(() => buch.schreiben('INFO', 'egal'));
});

test('Start: Schreibrechte – geht und geht nicht', () => {
  const o = ordner();
  try {
    assert.doesNotThrow(() => sp.schreibbarPruefen(path.join(o, 'unterordner')));
    assert.throws(() => sp.schreibbarPruefen('\0ungueltig'), /schreiben/);
  } finally {
    fs.rmSync(o, { recursive: true, force: true });
  }
});

test('Start: Software-Rendering wird gemerkt und wieder vergessen', () => {
  const o = ordner();
  try {
    assert.equal(sp.softwareRendering(o), false);
    sp.softwareRenderingSetzen(o, true);
    assert.equal(sp.softwareRendering(o), true);
    sp.softwareRenderingSetzen(o, false);
    assert.equal(sp.softwareRendering(o), false);
  } finally {
    fs.rmSync(o, { recursive: true, force: true });
  }
});

test('Start: erst nach mehreren GPU-Abstürzen der Rückfall, und nur einmal', () => {
  const o = ordner();
  try {
    const zeilen = [];
    const buch = { schreiben: (s, t) => zeilen.push(`${s} ${t}`) };
    let gemeldet = 0;
    let neugestartet = 0;
    const app = {
      _h: {},
      on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
      removeListener() {},
      feuern(ev, ...a) { for (const fn of this._h[ev] || []) fn({}, ...a); },
    };
    sp.gpuUeberwachen({ app, logbuch: buch, datenOrdner: o, melden: () => gemeldet++, neustart: () => neugestartet++, schwelle: 2 });

    // Ein sauberer Renderer-Abgang zählt nicht als Absturz.
    app.feuern('render-process-gone', {}, { reason: 'clean-exit' });
    app.feuern('child-process-gone', { type: 'GPU', reason: 'crashed', exitCode: -2147483645 });
    assert.equal(sp.softwareRendering(o), false, 'ein Absturz reicht noch nicht');
    app.feuern('child-process-gone', { type: 'GPU', reason: 'crashed', exitCode: -2147483645 });
    assert.equal(sp.softwareRendering(o), true, 'ab dem zweiten Absturz Software-Rendering');
    assert.equal(gemeldet, 1);
    assert.equal(neugestartet, 1);

    // Weitere Abstürze melden nicht noch einmal.
    app.feuern('child-process-gone', { type: 'GPU', reason: 'crashed', exitCode: -1 });
    assert.equal(gemeldet, 1);
  } finally {
    fs.rmSync(o, { recursive: true, force: true });
  }
});

test('Start: ein sauberer GPU-Neustart löst keinen Rückfall aus', () => {
  const o = ordner();
  try {
    const app = { _h: {}, on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }, removeListener() {}, feuern(ev, ...a) { for (const fn of this._h[ev] || []) fn({}, ...a); } };
    sp.gpuUeberwachen({ app, logbuch: { schreiben() {} }, datenOrdner: o, schwelle: 2 });
    app.feuern('child-process-gone', { type: 'GPU', reason: 'clean-exit', exitCode: 0 });
    app.feuern('child-process-gone', { type: 'GPU', reason: 'clean-exit', exitCode: 0 });
    assert.equal(sp.softwareRendering(o), false);
  } finally {
    fs.rmSync(o, { recursive: true, force: true });
  }
});
