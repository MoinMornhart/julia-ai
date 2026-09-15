'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../src/main/minecraft-plan');

test('Spielplan: leeres Inventar steht ganz am Anfang', () => {
  const f = plan.fortschritt({ items: {}, dimension: 'overworld' });
  assert.equal(f.erreicht.length, 0);
  assert.equal(f.aktuell.id, 'holz');
  assert.equal(f.prozent, 0);
  assert.equal(f.fertig, false);
});

test('Spielplan: Holz erfüllt die erste Etappe, nächste ist die Werkbank', () => {
  const f = plan.fortschritt({ items: { oak_log: 4 }, dimension: 'overworld' });
  assert.ok(f.erreicht.includes('holz'));
  assert.equal(f.aktuell.id, 'werkbank');
});

test('Spielplan: Eisenbarren ziehen frühere Etappen mit und der Stand wächst', () => {
  const wenig = plan.fortschritt({ items: { oak_log: 4 }, dimension: 'overworld' });
  const mehr = plan.fortschritt({ items: { iron_ingot: 5, cobblestone: 20, furnace: 1, wooden_pickaxe: 1, stone_pickaxe: 1, crafting_table: 1, oak_log: 2 }, dimension: 'overworld' });
  assert.ok(mehr.erreicht.includes('eisen'));
  assert.ok(mehr.prozent > wenig.prozent);
});

test('Spielplan: Nether-Dimension erfüllt die Nether-Etappe', () => {
  const f = plan.fortschritt({ items: {}, dimension: 'nether' });
  assert.ok(f.erreicht.includes('nether'));
});

test('Spielplan: besiegter Drache schließt die letzte Etappe ab', () => {
  const f = plan.fortschritt({ items: {}, dimension: 'end', dracheBesiegt: true });
  assert.ok(f.erreicht.includes('drache'), 'Drachen-Etappe erreicht');
  // „fertig“ ist erst, wenn wirklich alle Etappen erfüllt sind – dafür ein volles Inventar.
  const alles = {
    oak_log: 4, crafting_table: 1, wooden_pickaxe: 1, cobblestone: 20, stone_pickaxe: 1,
    furnace: 1, torch: 8, cooked_beef: 5, raw_iron: 5, iron_ingot: 5, iron_pickaxe: 1,
    iron_chestplate: 1, diamond: 3, diamond_pickaxe: 1, obsidian: 12, flint_and_steel: 1,
    blaze_rod: 3, ender_pearl: 4, ender_eye: 12,
  };
  const voll = plan.fortschritt({ items: alles, dimension: 'end', dracheBesiegt: true });
  assert.equal(voll.fertig, true);
  assert.match(plan.fortschrittText({ items: alles, dimension: 'end', dracheBesiegt: true }), /besiegt/i);
});

test('Spielplan: fortschrittText nennt Etappe und nächsten Schritt', () => {
  const t = plan.fortschrittText({ items: { oak_log: 4 }, dimension: 'overworld' });
  assert.match(t, /Etappe 2\/\d+/);
  assert.match(t, /Werkbank/);
});
