'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { eimerPlan, Minecraft } = require('../src/main/minecraft');

test('eimerPlan: Aktionen und Aliasse werden richtig zugeordnet', () => {
  assert.deepEqual(eimerPlan('wasser_aufnehmen'), { aktion: 'wasser_aufnehmen', hand: 'bucket', quelle: 'water', ergebnis: 'water_bucket' });
  assert.equal(eimerPlan('wasser').aktion, 'wasser_aufnehmen'); // Alias
  assert.equal(eimerPlan('LAVA').aktion, 'lava_aufnehmen'); // Groß/klein egal
  assert.equal(eimerPlan('wasser setzen').aktion, 'wasser_setzen'); // Leerzeichen → _
  assert.equal(eimerPlan('milch').trinken, true);
  assert.equal(eimerPlan('milch').hand, 'milk_bucket');
});

test('eimerPlan: unbekannte Aktion wird klar abgelehnt', () => {
  assert.throws(() => eimerPlan('quatsch'), /wasser_aufnehmen/);
});

test('Verlassen: kein automatisches Wiederverbinden', () => {
  const m = new Minecraft({ laden: () => ({}) });
  m.trennung = { versuch: 0, naechsterVersuch: null };
  m.letzteOptionen = { adresse: 'x' };
  m.absichtlichWeg = true; // wie nach trennen()
  let neu = false;
  m.verbinden = async () => { neu = true; };
  m._wiederVerbinden();
  assert.equal(neu, false);
  assert.equal(m.trennung.naechsterVersuch, null); // nichts geplant
});

test('Crash/Kick: Wiederverbinden wird geplant', () => {
  const m = new Minecraft({ laden: () => ({}), wiederPausen: [50] });
  m.trennung = { versuch: 0, naechsterVersuch: null };
  m.letzteOptionen = { adresse: 'x' };
  m.absichtlichWeg = false;
  m._wiederVerbinden();
  assert.ok(m.trennung.naechsterVersuch, 'ein Wiederverbindungs-Versuch sollte geplant sein');
  clearTimeout(m.wiederTimer); // Test nicht hängen lassen
});
