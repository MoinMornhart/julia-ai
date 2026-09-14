'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');
const { Whisper, MODELLE, textAufbereiten, threads, tonFenster, wavSekunden } = require('../src/main/whisper');

const VENDOR = path.join(__dirname, '..', 'vendor', 'whisper');

function aufbau({ inhalt = Buffer.from('ein kleines Modell'), summe, groesse, stuecke } = {}) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-whisper-'));
  const programmOrdner = path.join(ordner, 'bin');
  fs.mkdirSync(programmOrdner);
  fs.writeFileSync(path.join(programmOrdner, 'whisper-cli.exe'), 'MZ');
  const modelle = { klein: { datei: 'klein.bin', groesse: groesse ?? inhalt.length, sha256: summe || crypto.createHash('sha256').update(inhalt).digest('hex') } };
  const geholt = [];
  const holen = async (url) => {
    geholt.push(url);
    const teile = stuecke || [inhalt.subarray(0, 5), inhalt.subarray(5)];
    return { ok: true, status: 200, body: (async function* () { for (const t of teile) yield new Uint8Array(t); })() };
  };
  const w = new Whisper({ ordner: path.join(ordner, 'modelle'), programmOrdner, holen, modelle });
  return { w, ordner, geholt };
}

test('Whisper: Stille, Geräusche und erfundene Untertitel zählen als nichts', () => {
  assert.equal(textAufbereiten('\n Hallo Julia, wie spät ist es?\n'), 'Hallo Julia, wie spät ist es?');
  assert.equal(textAufbereiten(' [BLANK_AUDIO]\n'), '');
  assert.equal(textAufbereiten('(Musik)'), '');
  assert.equal(textAufbereiten('*Musik* Mach das Licht an'), 'Mach das Licht an');
  assert.equal(textAufbereiten('Untertitel der Amara.org-Community'), '');
  assert.equal(textAufbereiten('Vielen Dank fürs Zuschauen!'), '');
  assert.equal(textAufbereiten('Öffne (bitte) den Browser'), 'Öffne (bitte) den Browser', 'normale Klammern bleiben');
  assert.equal(textAufbereiten(' ... '), '');
});

test('Whisper: kurzes Tonfenster passend zur Aufnahme', () => {
  assert.equal(tonFenster(0), 0, 'unbekannte Länge: volles Fenster');
  assert.equal(tonFenster(1), 256, 'nie kleiner als 256');
  assert.equal(tonFenster(6.8), 415);
  assert.equal(tonFenster(40), 1500, 'höchstens das volle Fenster');
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'julia-wav-'));
  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0); kopf.write('WAVE', 8); kopf.write('fmt ', 12); kopf.writeUInt32LE(16, 16);
  kopf.writeUInt16LE(1, 20); kopf.writeUInt16LE(1, 22); kopf.writeUInt32LE(16000, 24); kopf.writeUInt32LE(32000, 28);
  kopf.writeUInt16LE(2, 32); kopf.writeUInt16LE(16, 34); kopf.write('data', 36); kopf.writeUInt32LE(32000 * 3, 40);
  const datei = path.join(ordner, 'drei.wav');
  fs.writeFileSync(datei, Buffer.concat([kopf, Buffer.alloc(32000 * 3)]));
  assert.equal(wavSekunden(datei), 3);
  assert.equal(wavSekunden(path.join(ordner, 'fehlt.wav')), 0);
});

test('Whisper: lässt dem Spiel Luft', () => {
  assert.equal(threads(4), 2);
  assert.equal(threads(8), 6);
  assert.equal(threads(32), 8);
});

test('Whisper: die Modelle sind fest mit Größe und SHA-256 hinterlegt', () => {
  for (const m of Object.values(MODELLE)) {
    assert.match(m.sha256, /^[0-9a-f]{64}$/);
    assert.ok(m.groesse > 1e7);
    assert.match(m.datei, /^ggml-[a-z0-9_-]+\.bin$/);
  }
});

test('Whisper: Modell wird geladen, geprüft und erst dann benutzt', async () => {
  const { w, geholt } = aufbau();
  assert.equal(w.bereit('klein'), false);
  await w.herunterladen('klein');
  assert.equal(w.bereit('klein'), true);
  assert.match(geholt[0], /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\/klein\.bin$/);
  assert.equal(fs.existsSync(`${w.modellPfad('klein')}.teil`), false);
  assert.equal(w.status().laedt, null);
});

test('Whisper: falsche Prüfsumme oder zu groß – nichts wird benutzt', async () => {
  const falsch = aufbau({ summe: '0'.repeat(64) });
  await assert.rejects(falsch.w.herunterladen('klein'), /Prüfsumme/);
  assert.equal(falsch.w.bereit('klein'), false);
  assert.equal(fs.existsSync(`${falsch.w.modellPfad('klein')}.teil`), false);
  assert.match(falsch.w.status().fehler, /Prüfsumme/);

  const gross = aufbau({ groesse: 4 });
  await assert.rejects(gross.w.herunterladen('klein'), /größer/);
  assert.equal(gross.w.bereit('klein'), false);
});

test('Whisper: ruft whisper-cli richtig auf und liest den Text', async () => {
  const { w } = aufbau();
  await w.herunterladen('klein');
  let aufruf;
  w.starten = (programm, args, opts) => {
    aufruf = { programm, args, opts };
    const p = new EventEmitter();
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.kill = () => {};
    setImmediate(() => {
      p.stdout.emit('data', Buffer.from('\n Hallo Julia, wie spät ist es?\n'));
      p.emit('close', 0);
    });
    return p;
  };
  assert.equal(await w.erkennen('C:\\tmp\\a.wav', { sprachcode: 'de', stufe: 'klein' }), 'Hallo Julia, wie spät ist es?');
  const a = aufruf.args;
  assert.equal(a[a.indexOf('-l') + 1], 'de');
  assert.equal(a[a.indexOf('-f') + 1], 'C:\\tmp\\a.wav');
  assert.equal(a[a.indexOf('-m') + 1], w.modellPfad('klein'));
  for (const f of ['-nt', '-np', '-sns']) assert.ok(a.includes(f), f);
  assert.equal(a[a.indexOf('-bs') + 1], '1', 'einfache Suche – schneller');
  assert.equal(aufruf.opts.windowsHide, true);
  await assert.rejects(w.erkennen('x.wav', { stufe: 'gibtsnicht' }), /nicht bereit/);
});

test('Whisper: das mitgelieferte Programm startet und liegt im Installer', { skip: process.platform !== 'win32' }, () => {
  for (const d of ['whisper-cli.exe', 'whisper.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu-x64.dll', 'ggml-cpu-haswell.dll', 'msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'LICENSE-whisper.cpp.txt']) {
    assert.ok(fs.existsSync(path.join(VENDOR, d)), `${d} fehlt in vendor/whisper`);
  }
  const r = spawnSync(path.join(VENDOR, 'whisper-cli.exe'), ['--help'], { cwd: VENDOR, windowsHide: true, encoding: 'utf8', timeout: 30000 });
  assert.equal(r.error, undefined);
  assert.match(`${r.stdout}${r.stderr}`, /--no-timestamps/);
  const bau = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).build;
  assert.ok(bau.extraResources.some((e) => e.from === 'vendor/whisper' && e.to === 'whisper'), 'Whisper kommt in den Installer');
});
