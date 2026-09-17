'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WERKZEUGE, definitionen } = require('../src/main/werkzeuge');

const werkzeug = WERKZEUGE.find((w) => w.name === 'mit_pruefer');
const ROLLEN = [{ name: 'Autor', anweisung: 'schreibe' }, { name: 'Kritiker', anweisung: 'prüfe' }];

// unter: Funktion, die je nach Rolle antwortet. Zählt die Aufrufe mit.
function ctxMit(unter, { an = true, rollen = ROLLEN } = {}) {
  return { agentenAn: () => an, config: { get: (k) => (k === 'rollen' ? rollen : undefined) }, unterAgent: unter };
}

test('nur angeboten bei eingeschalteten BETA-Agenten', () => {
  assert.equal(definitionen(ctxMit(async () => '', { an: false })).some((w) => w.name === 'mit_pruefer'), false);
  assert.equal(definitionen(ctxMit(async () => '', { an: true })).some((w) => w.name === 'mit_pruefer'), true);
});

test('bricht ab, sobald der Prüfer BESTANDEN sagt', async () => {
  const rufe = [];
  const unter = async (rolle) => {
    rufe.push(rolle.name);
    if (rolle.name === 'Kritiker') return 'BESTANDEN, alles gut.';
    return 'Entwurf v1';
  };
  const antwort = await werkzeug.ausfuehren({ ersteller: 'Autor', pruefer: 'Kritiker', aufgabe: 'Schreib X', runden: 3 }, ctxMit(unter));
  // Autor (Entwurf) → Kritiker (BESTANDEN) → Stopp. Kein zweiter Autor-Aufruf.
  assert.deepEqual(rufe, ['Autor', 'Kritiker']);
  assert.match(antwort, /Entwurf v1/);
  assert.match(antwort, /1 Prüfrunde/);
});

test('bessert nach und respektiert die Rundenobergrenze', async () => {
  let autor = 0;
  const unter = async (rolle) => {
    if (rolle.name === 'Kritiker') return 'NACHBESSERN: mehr Details.';
    autor += 1; return `Entwurf v${autor}`;
  };
  const antwort = await werkzeug.ausfuehren({ ersteller: 'Autor', pruefer: 'Kritiker', aufgabe: 'X', runden: 2 }, ctxMit(unter));
  // Autor(v1) → Kritik→Autor(v2) → Kritik→Autor(v3), dann Ende (2 Runden).
  assert.equal(autor, 3);
  assert.match(antwort, /Entwurf v3/);
  assert.match(antwort, /2 Prüfrunden/);
});

test('runden wird auf 1..3 begrenzt', async () => {
  let autor = 0;
  const unter = async (rolle) => { if (rolle.name === 'Kritiker') return 'NACHBESSERN'; autor += 1; return 'e' + autor; };
  await werkzeug.ausfuehren({ ersteller: 'Autor', pruefer: 'Kritiker', aufgabe: 'X', runden: 99 }, ctxMit(unter));
  assert.equal(autor, 4); // 1 Entwurf + 3 Nachbesserungen (max 3 Runden)
});

test('Fehler, wenn Agenten aus oder Rollen fehlen', async () => {
  await assert.rejects(() => werkzeug.ausfuehren({ ersteller: 'A', pruefer: 'B', aufgabe: 'x' }, ctxMit(async () => '', { an: false })), /aus/i);
  await assert.rejects(() => werkzeug.ausfuehren({ ersteller: 'Fehlt', pruefer: 'Kritiker', aufgabe: 'x' }, ctxMit(async () => '')), /angelegt/i);
});
