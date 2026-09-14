'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Clips, spielAus } = require('../src/main/clips');

function aufbau(werte = {}) {
  const videos = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-clips-'));
  const captures = path.join(videos, 'Captures');
  fs.mkdirSync(captures);
  const config = { get: (k) => ({ 'clip.methode': 'gamebar', 'clip.taste': '', 'clip.ordner': '', ...werte })[k] };
  const gedrueckt = [];
  let beimDruck = () => {};
  const c = new Clips({ config, videos, taste: async (k) => { gedrueckt.push(k); beimDruck(); }, hintergrund: async () => true, pause: async () => {} });
  return { c, videos, captures, gedrueckt, setzeDruck: (f) => { beimDruck = f; } };
}

test('Spielname aus dem Game-Bar-Dateinamen', () => {
  assert.equal(spielAus('Valorant 2026-09-14 20-15-33'), 'Valorant');
  assert.equal(spielAus('Rocket League 2026-09-14 19-02-10'), 'Rocket League');
  assert.equal(spielAus('mein clip'), '');
});

test('Liste: nur Videos, neueste zuerst, auch in Unterordnern', () => {
  const { c, captures } = aufbau();
  const datei = (n, alter) => { const p = path.join(captures, n); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x'); const t = new Date(Date.now() - alter); fs.utimesSync(p, t, t); return p; };
  datei('Valorant 2026-09-14 20-15-33.mp4', 1000);
  datei('Minecraft 2026-09-13 22-41-05.mp4', 50000);
  datei(path.join('Fortnite', 'clip1.mkv'), 20000);
  datei('notiz.txt', 0);
  const l = c.liste();
  assert.deepEqual(l.map((x) => x.name), ['Valorant 2026-09-14 20-15-33', 'clip1', 'Minecraft 2026-09-13 22-41-05']);
  assert.equal(l[0].spiel, 'Valorant');
  assert.equal(l[1].spiel, 'Fortnite', 'Unterordner als Spiel (NVIDIA)');
});

test('Clip speichern: richtige Taste je Methode, wartet auf die fertige Datei', async () => {
  const { c, captures, gedrueckt, setzeDruck } = aufbau();
  setzeDruck(() => fs.writeFileSync(path.join(captures, 'Valorant 2026-09-14 21-00-00.mp4'), 'clipdaten'));
  const r = await c.aufnehmen();
  assert.deepEqual(gedrueckt, ['win+alt+g']);
  assert.equal(r.clip.spiel, 'Valorant');

  const nv = aufbau({ 'clip.methode': 'nvidia' });
  await nv.c.aufnehmen();
  assert.deepEqual(nv.gedrueckt, ['alt+f10']);
  assert.equal(nv.c.ordner(), nv.videos, 'NVIDIA speichert in Videos\\<Spiel>');

  const ohne = aufbau({ 'clip.methode': 'eigen' });
  await assert.rejects(ohne.c.aufnehmen(), /keine_taste/);
  const leer = aufbau();
  assert.deepEqual(await leer.c.aufnehmen(), { clip: null }, 'ohne neue Datei: nichts gefunden');
});

test('Umbenennen und Löschen nur für Videos im Clip-Ordner', () => {
  const { c, captures, videos } = aufbau();
  const p = path.join(captures, 'alt.mp4');
  fs.writeFileSync(p, 'x');
  const neu = c.umbenennen(p, '  Ace: 1v5 / Clutch  ');
  assert.equal(path.basename(neu), 'Ace 1v5 Clutch.mp4');
  assert.throws(() => c.pruefen(path.join(videos, 'draussen.mp4')), /Clip-Ordner/);
  fs.writeFileSync(path.join(captures, 'liste.txt'), 'x');
  assert.throws(() => c.pruefen(path.join(captures, 'liste.txt')), /Videodateien/);
  assert.throws(() => c.pruefen(path.join(captures, '..', '..', 'x.mp4')), /Clip-Ordner/);
  fs.writeFileSync(path.join(captures, 'b.mp4'), 'x');
  assert.throws(() => c.umbenennen(path.join(captures, 'b.mp4'), 'Ace 1v5 Clutch'), /schon/);
});
