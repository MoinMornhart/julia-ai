'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ffmpegZiel, heruntergeladen, aufgeloest, bereit, FFMPEG } = require('../src/main/video-ffmpeg');

const DATEN = 'C:\\Julia';
const ZIEL = path.join(DATEN, 'ffmpeg', 'ffmpeg.exe');
// fsx, das nur bestimmte Pfade als vorhanden meldet.
const fakeFs = (vorhanden) => ({ existsSync: (p) => vorhanden.includes(p) });

test('ffmpegZiel liegt im Datenordner', () => {
  assert.equal(ffmpegZiel(DATEN), ZIEL);
});

test('heruntergeladen erkennt die geladene Binary', () => {
  assert.equal(heruntergeladen(DATEN, { fsx: fakeFs([ZIEL]) }), ZIEL);
  assert.equal(heruntergeladen(DATEN, { fsx: fakeFs([]) }), '');
});

test('aufgeloest: gesetzt > heruntergeladen > PATH', () => {
  const gesetzt = 'D:\\tools\\ffmpeg.exe';
  // 1) gesetzter, existierender Pfad hat Vorrang
  assert.equal(aufgeloest(DATEN, gesetzt, { fsx: fakeFs([gesetzt, ZIEL]) }), gesetzt);
  // 2) gesetzt fehlt auf der Platte → heruntergeladenes ffmpeg
  assert.equal(aufgeloest(DATEN, gesetzt, { fsx: fakeFs([ZIEL]) }), ZIEL);
  // 3) nichts da → PATH-Fallback
  assert.equal(aufgeloest(DATEN, '', { fsx: fakeFs([]) }), 'ffmpeg');
});

test('bereit ist nur true bei gesetztem oder geladenem ffmpeg (nicht bei PATH)', () => {
  assert.equal(bereit(DATEN, '', { fsx: fakeFs([ZIEL]) }), true);
  assert.equal(bereit(DATEN, 'D:\\f.exe', { fsx: fakeFs(['D:\\f.exe']) }), true);
  assert.equal(bereit(DATEN, '', { fsx: fakeFs([]) }), false); // nur PATH → nicht „bereit"
});

test('die gepinnten Download-Daten sind plausibel', () => {
  assert.match(FFMPEG.url, /^https:\/\/github\.com\/.*ffmpeg-win32-x64$/);
  assert.ok(FFMPEG.groesse > 10 * 1024 * 1024);
  assert.match(FFMPEG.sha256, /^[0-9a-f]{64}$/);
});
