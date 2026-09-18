'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sollBenachrichtigen, MC_WICHTIGE } = require('../src/main/minecraft');

test("Modus 'wichtige' (Standard): Routine pusht nicht, Wichtiges schon", () => {
  // Routine – NICHT pushen (das war der Nutzerärger beim Bauen)
  for (const art of ['fertig', 'essen', 'haenger', 'zurueck', 'sieg']) {
    assert.equal(sollBenachrichtigen(art, 'wichtige'), false, `${art} sollte nicht pushen`);
  }
  // Wichtiges – pushen
  for (const art of ['getrennt', 'gestorben', 'gefahr', 'erreicht', 'rueckzug', 'niederlage']) {
    assert.equal(sollBenachrichtigen(art, 'wichtige'), true, `${art} sollte pushen`);
  }
});

test("Modus 'alle' pusht alles, 'keine' pusht nichts", () => {
  assert.equal(sollBenachrichtigen('fertig', 'alle'), true);
  assert.equal(sollBenachrichtigen('gestorben', 'alle'), true);
  assert.equal(sollBenachrichtigen('gestorben', 'keine'), false);
  assert.equal(sollBenachrichtigen('fertig', 'keine'), false);
});

test('Standard-Modus ist wichtige; unbekannte Art pusht in wichtige nicht', () => {
  assert.equal(sollBenachrichtigen('fertig'), false); // default 'wichtige'
  assert.equal(sollBenachrichtigen('irgendwas_neues', 'wichtige'), false);
});

test('MC_WICHTIGE enthält die wichtigen Arten, aber nicht Bauen-fertig', () => {
  assert.ok(MC_WICHTIGE.has('gestorben'));
  assert.ok(!MC_WICHTIGE.has('fertig'));
});
