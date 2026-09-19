'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bedrohWert, gefahrReichweite, mlgNoetig, schwimmHoch, essenPlan } = require('../src/main/minecraft');

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

test('Schwimmen: hochschwimmen nur mit Kopf unter Wasser und wenig Luft oder beim Sinken', () => {
  assert.equal(schwimmHoch({ kopfImWasser: true, luft: 12, sinkt: false }), true); // Luft geht aus
  assert.equal(schwimmHoch({ kopfImWasser: true, luft: 20, sinkt: true }), true); // sinkt
  assert.equal(schwimmHoch({ kopfImWasser: true, luft: 20, sinkt: false }), false); // volle Luft, darf kurz tauchen
  assert.equal(schwimmHoch({ kopfImWasser: false, luft: 0, sinkt: true }), false); // gar nicht im Wasser
});

test('Essen: Goldapfel bei wenig Leben, sonst Sättigung hochhalten (Regeneration)', () => {
  // Wenig Leben + Goldapfel da → Goldapfel
  assert.equal(essenPlan({ food: 20, health: 8, hatEssen: true, hatHeilung: true }), 'heilung');
  // Wenig Leben, aber kein Goldapfel → normales Essen (falls Hunger)
  assert.equal(essenPlan({ food: 12, health: 8, hatEssen: true, hatHeilung: false }), 'essen');
  // Volles Leben, Hunger unter 18 → essen (Regeneration am Laufen halten)
  assert.equal(essenPlan({ food: 17, health: 20, hatEssen: true, hatHeilung: true }), 'essen');
  // Satt und gesund → nichts
  assert.equal(essenPlan({ food: 20, health: 20, hatEssen: true, hatHeilung: true }), null);
  // Nichts dabei → nichts (kein Log-Spam)
  assert.equal(essenPlan({ food: 4, health: 4, hatEssen: false, hatHeilung: false }), null);
});
