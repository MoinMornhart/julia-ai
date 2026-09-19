'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bedrohWert, gefahrReichweite, mlgNoetig } = require('../src/main/minecraft');

// Einfacher „Entity"-Ersatz mit Position und Abstand.
const pos = (x) => ({ x, y: 0, z: 0, distanceTo: (q) => Math.abs(x - q.x) });
const feind = (name, x) => ({ name, position: pos(x) });
const ich = { x: 0, y: 0, z: 0 };

test('Julia reagiert früher auf Fernkämpfer und Creeper', () => {
  assert.equal(gefahrReichweite('creeper'), 9);
  assert.equal(gefahrReichweite('skeleton'), 12); // Schütze aus der Distanz
  assert.equal(gefahrReichweite('witch'), 12);
  assert.equal(gefahrReichweite('zombie'), 7); // Nahkämpfer erst näher
  assert.ok(gefahrReichweite('skeleton') > gefahrReichweite('zombie'));
});

test('Bedrohung: Creeper vor Schütze vor Nahkämpfer, bei gleicher Art zählt Nähe', () => {
  const p = ich;
  // Creeper (weiter weg) schlägt Zombie (nah)
  assert.ok(bedrohWert(feind('creeper', 8), p) > bedrohWert(feind('zombie', 2), p));
  // Skelett schlägt Zombie bei gleichem Abstand
  assert.ok(bedrohWert(feind('skeleton', 5), p) > bedrohWert(feind('zombie', 5), p));
  // Gleicher Typ: der nähere ist gefährlicher
  assert.ok(bedrohWert(feind('zombie', 2), p) > bedrohWert(feind('zombie', 9), p));
});

test('Water-MLG nur bei schädlichem, schnellem Sturz mit Wassereimer und Boden nah', () => {
  assert.equal(mlgNoetig({ gefallen: 6, geschwindigkeitY: -0.8, bodenNah: true, hatWasser: true }), true);
  assert.equal(mlgNoetig({ gefallen: 6, geschwindigkeitY: -0.8, bodenNah: true, hatWasser: false }), false); // kein Wasser
  assert.equal(mlgNoetig({ gefallen: 2, geschwindigkeitY: -0.8, bodenNah: true, hatWasser: true }), false); // zu niedrig
  assert.equal(mlgNoetig({ gefallen: 6, geschwindigkeitY: -0.1, bodenNah: true, hatWasser: true }), false); // fällt kaum
  assert.equal(mlgNoetig({ gefallen: 6, geschwindigkeitY: -0.8, bodenNah: false, hatWasser: true }), false); // Boden zu weit
});
