'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Gespraeche, ohneBilder, titelAus } = require('../src/main/gespraeche');
const anzeige = require('../src/main/anzeige');

// Stellvertreter für DPAPI: umkehrbar, aber kein Klartext auf der Platte.
const krypto = {
  verschluesseln: (t) => Buffer.from(t, 'utf8').map((b) => b ^ 0x5a).toString('base64'),
  entschluesseln: (b) => Buffer.from(Buffer.from(b, 'base64').map((x) => x ^ 0x5a)).toString('utf8'),
};

function gespraech(...texte) {
  const v = [];
  for (const [i, t] of texte.entries()) {
    anzeige.anwenden(v, 'nutzer', { text: t });
    anzeige.anwenden(v, 'werkzeug', { id: `w${i}`, name: 'screenshot', eingabe: '{}' });
    anzeige.anwenden(v, 'werkzeugFertig', { id: `w${i}`, ok: true });
    anzeige.anwenden(v, 'text', { text: 'Antwort ' });
    anzeige.anwenden(v, 'text', { text: `auf ${t}` });
    anzeige.anwenden(v, 'fertig');
  }
  return v;
}

test('Anzeige: Textstücke zusammen, Werkzeuge mit Ergebnis, Freigaben erledigt', () => {
  const v = gespraech('Wie voll ist die Platte?');
  assert.deepEqual(v.map((e) => e.typ), ['nutzer', 'werkzeug', 'julia']);
  assert.equal(v[2].text, 'Antwort auf Wie voll ist die Platte?');
  assert.equal(v[1].stand, 'ok');
  anzeige.anwenden(v, 'freigabe', { id: 3, art: 'einzeln', beschreibung: 'x' });
  anzeige.anwenden(v, 'freigabeErledigt', { id: 3, ja: false });
  assert.equal(v[3].offen, false);
  anzeige.anwenden(v, 'geleert');
  assert.equal(v.length, 0);
});

test('Gespräche: verschlüsselt gespeichert, ohne Bilder, neueste zuerst', async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-gesp-'));
  const s = new Gespraeche(ordner, krypto);
  const a = s.neueId();
  const verlauf = [
    { role: 'user', content: [{ type: 'text', text: 'Zahnarzt eintragen' }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: 'Monitor 0' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'GEHEIMESBILD' } }] }] },
  ];
  s.speichern({ id: a, anzeige: gespraech('Zahnarzt Freitag eintragen'), verlauf, anbieter: 'anthropic', modell: 'claude-opus-5' });
  const roh = fs.readFileSync(path.join(ordner, 'gespraeche', `${a}.julia`), 'utf8');
  assert.doesNotMatch(roh, /Zahnarzt/, 'kein Klartext auf der Platte');
  const g = s.lesen(a);
  assert.equal(g.titel, 'Zahnarzt Freitag eintragen');
  assert.doesNotMatch(JSON.stringify(g), /GEHEIMESBILD/, 'Screenshots werden nie gespeichert');
  assert.match(JSON.stringify(g.verlauf), /Bild nicht gespeichert/);

  await new Promise((r) => setTimeout(r, 20));
  const b = s.neueId();
  s.speichern({ id: b, anzeige: gespraech('Downloads aufräumen'), verlauf: [] });
  assert.deepEqual(s.liste().map((x) => x.id), [b, a]);
  assert.equal(s.liste()[1].anzahl, 1);
  assert.match(s.liste()[1].vorschau, /Antwort auf Zahnarzt/);
});

test('Gespräche: Suche über Titel und Antworten, Löschen, nichts ohne Nutzertext', () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-gesp-'));
  const s = new Gespraeche(ordner, krypto);
  const a = s.neueId();
  const b = s.neueId();
  s.speichern({ id: a, anzeige: gespraech('Rechnung Telekom suchen'), verlauf: [] });
  s.speichern({ id: b, anzeige: gespraech('Wetter morgen'), verlauf: [] });
  assert.deepEqual(s.liste({ suche: 'telekom' }).map((x) => x.id), [a]);
  assert.match(s.liste({ suche: 'telekom' })[0].vorschau, /Telekom/);
  assert.deepEqual(s.liste({ suche: 'auf Wetter' }).map((x) => x.id), [b], 'auch in Antworten');
  assert.equal(s.liste({ suche: 'gibtsnicht' }).length, 0);
  assert.equal(s.speichern({ id: s.neueId(), anzeige: [{ typ: 'system', text: 'x' }], verlauf: [] }), null);
  assert.equal(s.loeschen(a), true);
  assert.deepEqual(s.liste().map((x) => x.id), [b]);
  s.alleLoeschen();
  assert.equal(s.liste().length, 0);
  assert.throws(() => s._datei('../../konten'), /Ungültige/);
});

test('Hilfen: Titel aus der ersten Zeile, Bilder raus', () => {
  assert.equal(titelAus('\n  Hallo Welt\nzweite Zeile'), 'Hallo Welt');
  assert.equal(titelAus('x'.repeat(100)).length, 70);
  const v = ohneBilder([{ role: 'user', content: [{ type: 'image', source: {} }, { type: 'text', text: 'hi' }] }, { role: 'assistant', content: 'nur text' }]);
  assert.equal(v[0].content[0].type, 'text');
  assert.equal(v[1].content, 'nur text');
});
