'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Protokoll } = require('../src/main/protokoll');
const { argumente } = require('../scripts/release');

function neu() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-prot-'));
  const p = new Protokoll(dir);
  return { p, dir, datei: path.join(dir, 'protokoll.jsonl') };
}

function zeilen(datei) {
  return fs.readFileSync(datei, 'utf8').split('\n').filter(Boolean);
}

test('Eine unberührte Kette ist intakt, auch über einen Neustart hinweg', () => {
  const { p, dir } = neu();
  p.eintragen({ werkzeug: 'shell', stufe: 'GELB', ergebnis: 'winget install Git.Git' });
  p.eintragen({ werkzeug: 'mail_senden', stufe: 'GELB', ergebnis: 'gesendet' });
  const p2 = new Protokoll(dir);
  p2.eintragen({ werkzeug: 'handy', stufe: 'INFO', ergebnis: 'Auftrag vom Handy' });
  assert.deepEqual(p2.pruefen(), { ok: true, geprueft: 3, ungeprueft: 0 });
});

test('Nachträglich geänderter Eintrag fällt auf', () => {
  const { p, datei } = neu();
  p.eintragen({ werkzeug: 'shell', ergebnis: 'winget install Evil.Tool' });
  p.eintragen({ werkzeug: 'shell', ergebnis: 'danach' });
  const z = zeilen(datei);
  z[0] = z[0].replace('Evil.Tool', 'Git.Git');
  fs.writeFileSync(datei, z.join('\n') + '\n');
  const r = p.pruefen();
  assert.equal(r.ok, false);
  assert.equal(r.zeile, 1);
  assert.match(r.grund, /geändert/);
});

test('Gelöschter Eintrag in der Mitte fällt auf', () => {
  const { p, datei } = neu();
  for (const x of ['a', 'b', 'c']) p.eintragen({ werkzeug: 'shell', ergebnis: x });
  const z = zeilen(datei);
  fs.writeFileSync(datei, [z[0], z[2]].join('\n') + '\n');
  const r = p.pruefen();
  assert.equal(r.ok, false);
  assert.equal(r.zeile, 2);
  assert.match(r.grund, /unterbrochen/);
});

test('Alte Einträge ohne Prüfsumme davor stören nicht, dazwischen schon', () => {
  const { dir, datei } = neu();
  fs.writeFileSync(datei, `${JSON.stringify({ zeit: '2026-09-13T10:00:00Z', werkzeug: 'alt' })}\n`);
  const p = new Protokoll(dir);
  p.eintragen({ werkzeug: 'neu' });
  assert.deepEqual(p.pruefen(), { ok: true, geprueft: 1, ungeprueft: 1 });
  fs.appendFileSync(datei, `${JSON.stringify({ zeit: 'x', werkzeug: 'eingeschmuggelt' })}\n`);
  assert.equal(p.pruefen().ok, false);
});

test('Release-Skript: Tests und Audit sind Standard und nur bewusst abschaltbar', () => {
  const a = argumente(['korrektur', 'Ein', 'Satz']);
  assert.equal(a.tests, true);
  assert.equal(a.audit, true);
  assert.equal(a.text, 'Ein Satz');
  const b = argumente(['funktion', 'X', '--ohne-audit', '--ohne-tests', '--kein-push']);
  assert.equal(b.audit, false);
  assert.equal(b.tests, false);
  assert.equal(b.push, false);
});
