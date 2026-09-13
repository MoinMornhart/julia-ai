'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aufBild, fuellen } = require('../src/main/schwaerzen');

test('Passwortfeld wird von Bildschirm- auf Bildkoordinaten umgerechnet, mit Rand', () => {
  // Monitor 2560x1440, Screenshot verkleinert auf 1280x720 (Faktor 0,5)
  const phys = { x: 0, y: 0, width: 2560, height: 1440 };
  const b = aufBild([{ x: 1000, y: 600, w: 400, h: 60 }], phys, 1280, 720, 0);
  assert.deepEqual(b, [{ x0: 500, y0: 300, x1: 700, y1: 330 }]);
  const mitRand = aufBild([{ x: 1000, y: 600, w: 400, h: 60 }], phys, 1280, 720, 3);
  assert.deepEqual(mitRand, [{ x0: 497, y0: 297, x1: 703, y1: 333 }]);
});

test('Zweiter Monitor: Versatz wird abgezogen, fremde Felder fallen weg', () => {
  const phys = { x: 1920, y: 0, width: 1920, height: 1080 };
  const b = aufBild([
    { x: 2020, y: 100, w: 200, h: 40 }, // auf diesem Monitor
    { x: 100, y: 100, w: 200, h: 40 }, // auf dem Hauptmonitor
  ], phys, 1920, 1080, 0);
  assert.deepEqual(b, [{ x0: 100, y0: 100, x1: 300, y1: 140 }]);
});

test('Felder am Bildrand werden abgeschnitten statt ignoriert', () => {
  const phys = { x: 0, y: 0, width: 1000, height: 500 };
  const b = aufBild([{ x: 950, y: 480, w: 200, h: 100 }], phys, 1000, 500, 0);
  assert.deepEqual(b, [{ x0: 950, y0: 480, x1: 1000, y1: 500 }]);
});

test('Füllen überschreibt genau den Bereich', () => {
  const breite = 10;
  const hoehe = 10;
  const puffer = Buffer.alloc(breite * hoehe * 4, 200);
  fuellen(puffer, breite, [{ x0: 2, y0: 3, x1: 5, y1: 6 }]);
  const pixel = (x, y) => puffer[(y * breite + x) * 4];
  assert.ok(pixel(2, 3) < 50, 'innen dunkel');
  assert.ok(pixel(4, 5) < 50, 'innen dunkel');
  assert.equal(pixel(1, 3), 200, 'links daneben unverändert');
  assert.equal(pixel(5, 5), 200, 'rechts daneben unverändert');
  assert.equal(pixel(3, 6), 200, 'darunter unverändert');
  assert.equal(puffer[(3 * breite + 2) * 4 + 3], 255, 'deckend');
});

test('Keine Felder, kein Eingriff', () => {
  assert.deepEqual(aufBild([], { x: 0, y: 0, width: 100, height: 100 }, 100, 100), []);
  assert.deepEqual(aufBild(undefined, { x: 0, y: 0, width: 100, height: 100 }, 100, 100), []);
});
