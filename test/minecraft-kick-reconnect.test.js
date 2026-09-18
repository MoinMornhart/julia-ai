'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { kickWiederverbinden } = require('../src/main/minecraft');

test('nach vorübergehenden Kicks wird neu verbunden', () => {
  // Nutzerfall: periodischer Timeout-/Anti-Bot-Kick
  assert.equal(kickWiederverbinden('Der Server hat keine Antwort mehr bekommen (Zeitüberschreitung).'), true);
  assert.equal(kickWiederverbinden('Der Spam-Schutz des Servers hat die Figur rausgeworfen (zu viele Nachrichten oder Aktionen).'), true);
  assert.equal(kickWiederverbinden('Der Server wurde beendet oder neu gestartet.'), true);
  assert.equal(kickWiederverbinden('Vom Server getrennt: ohne Grund'), true);
});

test('bei dauerhaften/wiederkehrenden Gründen wird NICHT neu verbunden', () => {
  assert.equal(kickWiederverbinden('Die Spielfigur ist auf diesem Server gebannt: foo'), false);
  assert.equal(kickWiederverbinden('Rausgeworfen wegen „Fliegen“ – meist schlägt der Anti-Cheat bei Bots an.'), false);
  assert.equal(kickWiederverbinden('Der Server hat eine Whitelist – trag die Spielfigur dort ein.'), false);
  assert.equal(kickWiederverbinden('Der Server verlangt ein Microsoft-Konto (online-mode=true).'), false);
  assert.equal(kickWiederverbinden('Die Versionen passen nicht zusammen: 1.20 vs 1.21'), false);
  assert.equal(kickWiederverbinden('Mit demselben Konto hat sich jemand anderes angemeldet – Julia braucht ein eigenes Minecraft-Konto.'), false);
});
