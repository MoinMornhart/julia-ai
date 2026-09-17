'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/main/video');

test('zeitSekunden: Sekunden, MM:SS und HH:MM:SS', () => {
  assert.equal(v.zeitSekunden('90'), 90);
  assert.equal(v.zeitSekunden('1:30'), 90);
  assert.equal(v.zeitSekunden('00:01:30'), 90);
  assert.equal(v.zeitSekunden('1:00:00'), 3600);
  assert.equal(v.zeitSekunden('12.5'), 12.5);
});

test('zeitSekunden: Unsinn wirft klar', () => {
  assert.throws(() => v.zeitSekunden(''), /Zeitangabe/);
  assert.throws(() => v.zeitSekunden('abc'), /gültige Zeit/);
  assert.throws(() => v.zeitSekunden('1:2:3:4'), /gültige Zeit/);
});

test('argsSchneiden: von/bis werden zu -ss und -t (Dauer)', () => {
  const a = v.argsSchneiden({ eingabe: 'in.mp4', ausgabe: 'out.mp4', von: '10', bis: '25' });
  assert.deepEqual(a, ['-y', '-ss', '10', '-i', 'in.mp4', '-t', '15', '-c', 'copy', 'out.mp4']);
});

test('argsSchneiden: genau=true kodiert neu', () => {
  const a = v.argsSchneiden({ eingabe: 'in.mp4', ausgabe: 'out.mp4', von: '0', bis: '5', genau: true });
  assert.ok(a.includes('libx264') && a.includes('aac'));
  assert.ok(!a.includes('copy'));
});

test('argsSchneiden: bis <= von wirft', () => {
  assert.throws(() => v.argsSchneiden({ eingabe: 'a', ausgabe: 'b', von: '10', bis: '10' }), /„bis" muss nach/);
});

test('argsThumbnail: ein Standbild mit optionaler Breite', () => {
  const a = v.argsThumbnail({ eingabe: 'in.mp4', ausgabe: 'bild.jpg', zeit: '1:00', breite: 640 });
  assert.deepEqual(a, ['-y', '-ss', '60', '-i', 'in.mp4', '-frames:v', '1', '-vf', 'scale=640:-1', 'bild.jpg']);
});

test('argsZusammenfuegen + concatListe', () => {
  assert.deepEqual(v.argsZusammenfuegen({ listeDatei: 'liste.txt', ausgabe: 'out.mp4' }),
    ['-y', '-f', 'concat', '-safe', '0', '-i', 'liste.txt', '-c', 'copy', 'out.mp4']);
  const liste = v.concatListe(['a.mp4', "b's.mp4"]);
  assert.equal(liste, "file 'a.mp4'\nfile 'b'\\''s.mp4'\n");
  assert.throws(() => v.concatListe(['nur eine']), /Mindestens zwei/);
});

test('ffmpegPfad: Reihenfolge gesetzt > statisch > PATH', () => {
  const da = (p) => p === '/bin/ffmpeg' || p === '/opt/static/ffmpeg';
  assert.equal(v.ffmpegPfad({ gesetzt: '/bin/ffmpeg', statisch: '/opt/static/ffmpeg', existiert: da }), '/bin/ffmpeg');
  assert.equal(v.ffmpegPfad({ gesetzt: '/fehlt', statisch: '/opt/static/ffmpeg', existiert: da }), '/opt/static/ffmpeg');
  assert.equal(v.ffmpegPfad({ existiert: () => false }), 'ffmpeg');
});

test('fehlerText: ENOENT gibt klaren Installations-Hinweis', () => {
  assert.match(v.fehlerText({ code: 'ENOENT' }), /ffmpeg wurde nicht gefunden/);
});

test('ausfuehren: Erfolg und Fehler', async () => {
  const okStart = (_p, _a, _o, cb) => cb(null, '', '');
  assert.equal(await v.ausfuehren('ffmpeg', ['-version'], { starten: okStart }), true);
  const failStart = (_p, _a, _o, cb) => cb(Object.assign(new Error('x'), { code: 1 }), '', 'Fehlerzeile');
  await assert.rejects(() => v.ausfuehren('ffmpeg', [], { starten: failStart }), /Fehlerzeile/);
});
