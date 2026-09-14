'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { Piper, STIMMEN, PROGRAMM, laenge } = require('../src/main/piper');
const { umrechnen, huellkurve } = require('../src/main/sprache');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function aufbau({ falscheStimme = false } = {}) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-piper-'));
  const zip = Buffer.from('ZIP mit piper.exe');
  const onnx = Buffer.from('ein neuronales Stimmmodell');
  const json = Buffer.from('{"audio":{"sample_rate":22050}}');
  const programm = { url: 'https://github.com/rhasspy/piper/releases/download/x/piper_windows_amd64.zip', groesse: zip.length, sha256: sha(zip) };
  const stimmen = {
    probe: {
      name: 'Probe', sprache: 'de', geschlecht: 'w', pfad: 'de/de_DE/probe/low/de_DE-probe-low',
      onnx: { groesse: onnx.length, sha256: falscheStimme ? '0'.repeat(64) : sha(onnx) },
      json: { groesse: json.length, sha256: sha(json) },
    },
  };
  const inhalte = { [programm.url]: zip, 'de_DE-probe-low.onnx': onnx, 'de_DE-probe-low.onnx.json': json };
  const geholt = [];
  const holen = async (url) => {
    geholt.push(url);
    const d = inhalte[url] || inhalte[path.basename(url)];
    if (!d) return { ok: false, status: 404 };
    return { ok: true, status: 200, body: (async function* () { yield new Uint8Array(d); })() };
  };
  // Entpacken wie Expand-Archive: legt piper\piper.exe an.
  const entpacken = async (_zip, ziel) => {
    fs.mkdirSync(path.join(ziel, 'piper'), { recursive: true });
    fs.writeFileSync(path.join(ziel, 'piper', 'piper.exe'), 'MZ');
  };
  const p = new Piper({ ordner, holen, entpacken, stimmen, programm });
  return { p, ordner, geholt };
}

test('Piper: Sprechtempo wie bei Windows (-10 bis 10)', () => {
  assert.equal(laenge(0), '1.00');
  assert.equal(laenge(5), '0.80');
  assert.equal(laenge(-5), '1.20');
  assert.equal(laenge(10), '0.60');
  assert.equal(laenge(-20), '1.50');
});

test('Piper: Programm und Stimmen sind fest mit Größe und SHA-256 hinterlegt', () => {
  assert.match(PROGRAMM.url, /^https:\/\/github\.com\/rhasspy\/piper\/releases\/download\//);
  assert.match(PROGRAMM.sha256, /^[0-9a-f]{64}$/);
  for (const s of Object.values(STIMMEN)) {
    for (const d of [s.onnx, s.json]) {
      assert.match(d.sha256, /^[0-9a-f]{64}$/);
      assert.ok(d.groesse > 0);
    }
    assert.match(s.pfad, /^de\/de_DE\/[a-z_]+\/(low|medium|high)\/de_DE-[a-z_]+-(low|medium|high)$/);
  }
});

test('Piper: lädt Programm und Stimme geprüft, dann ist sie bereit', async () => {
  const { p, geholt } = aufbau();
  assert.equal(p.bereit('probe'), false);
  assert.equal(p.status().stimmen[0].bereit, false);
  await p.herunterladen('probe');
  assert.equal(p.bereit('probe'), true);
  assert.equal(geholt[0], PROGRAMM.url.replace(/download\/.*$/, 'download/x/piper_windows_amd64.zip'));
  assert.ok(geholt.some((u) => u === 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/probe/low/de_DE-probe-low.onnx'));
  assert.equal(fs.existsSync(path.join(p.ordner, 'piper.zip')), false, 'die ZIP-Datei wird aufgeräumt');
  assert.deepEqual(p.status().stimmen[0], { id: 'probe', name: 'Probe', sprache: 'de', geschlecht: 'w', bereit: true, mb: 0 });
});

test('Piper: falsche Prüfsumme – die Stimme wird nicht benutzt', async () => {
  const { p } = aufbau({ falscheStimme: true });
  await assert.rejects(p.herunterladen('probe'), /Prüfsumme/);
  assert.equal(p.bereit('probe'), false);
  assert.equal(p.programmBereit(), true, 'das geprüfte Programm bleibt');
  assert.match(p.status().fehler, /Prüfsumme/);
});

test('Piper: ruft piper.exe richtig auf und schickt den Text als UTF-8', async () => {
  const { p } = aufbau();
  await p.herunterladen('probe');
  let aufruf;
  let eingabe = Buffer.alloc(0);
  p.starten = (exe, args, opts) => {
    aufruf = { exe, args, opts };
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => {};
    proc.stdin = new EventEmitter();
    proc.stdin.end = (b) => {
      eingabe = b;
      fs.writeFileSync(args[args.indexOf('-f') + 1], 'RIFF');
      setImmediate(() => proc.emit('close', 0));
    };
    return proc;
  };
  const ziel = path.join(p.ordner, 'aus.wav');
  await p.erzeugen('Grüße aus Köln!', 'probe', { tempo: 5, ziel });
  assert.equal(aufruf.exe, p.exe);
  assert.equal(aufruf.args[aufruf.args.indexOf('-m') + 1], p.stimmPfad('probe'));
  assert.equal(aufruf.args[aufruf.args.indexOf('--length_scale') + 1], '0.80');
  assert.equal(eingabe.toString('utf8'), 'Grüße aus Köln!\n');
  assert.equal(aufruf.opts.windowsHide, true);
  await assert.rejects(p.erzeugen('x', 'gibtsnicht', { ziel }), /nicht geladen/);
});

test('Sprache: Abtastrate umrechnen und Lautstärke-Kurve für die Blase', () => {
  const pcm = Buffer.alloc(8);
  [0, 1000, 2000, 3000].forEach((v, i) => pcm.writeInt16LE(v, i * 2));
  const hoch = umrechnen(pcm, 16000, 48000);
  assert.equal(hoch.length, 24);
  assert.equal(hoch.readInt16LE(0), 0);
  assert.equal(hoch.readInt16LE(6), 1000);
  assert.equal(hoch.readInt16LE(2), 333);
  assert.equal(umrechnen(pcm, 16000, 16000), pcm);

  const rate = 1000;
  const laut = Buffer.alloc(rate * 2 * 2); // 1 s Stille, 1 s laut
  for (let i = rate; i < rate * 2; i++) laut.writeInt16LE(i % 2 ? 16000 : -16000, i * 2);
  const k = huellkurve(laut, rate, 100);
  assert.equal(k.length, 20);
  assert.equal(k[0], 0);
  assert.equal(k[19], 1);
});
