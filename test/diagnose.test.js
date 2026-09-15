'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bereinigen, bericht } = require('../src/main/diagnose');

test('Diagnose: IP-Adressen werden entfernt', () => {
  const s = bereinigen('Verbindung zu 192.168.1.20 und fe80::1ff:fe23:4567:890a fehlgeschlagen');
  assert.doesNotMatch(s, /192\.168\.1\.20/);
  assert.doesNotMatch(s, /fe80::/);
  assert.match(s, /\[ip\]/);
});

test('Diagnose: E-Mail, Token und lange Schlüssel werden maskiert', () => {
  const s = bereinigen('User max@example.com Authorization: Bearer abcDEF123456 key sk-ABCDEF0123456789ABCDEF');
  assert.doesNotMatch(s, /max@example\.com/);
  assert.doesNotMatch(s, /abcDEF123456/);
  assert.doesNotMatch(s, /sk-ABCDEF0123456789ABCDEF/);
  assert.match(s, /\[email\]/);
});

test('Diagnose: Windows-Benutzerpfad behält Struktur, aber nicht den Namen', () => {
  const s = bereinigen('Fehler in C:\\Users\\Morni\\AppData\\Roaming\\Julia\\start.log');
  assert.doesNotMatch(s, /Morni/);
  assert.match(s, /C:\\Users\\\[nutzer\]\\AppData/);
});

test('Diagnose: der konkrete Benutzername wird ersetzt', () => {
  assert.doesNotMatch(bereinigen('angemeldet als Morni_Julia', { nutzer: 'Morni_Julia' }), /Morni_Julia/);
});

test('Diagnose: Bericht ist rein technisch und enthält keine Geheimnisse', () => {
  const b = bericht({
    version: '1.2.2', windows: 'Windows_NT 10.0.26200', electron: '44.3.0',
    gpu: { renderer: 'NVIDIA GeForce RTX 4070', treiber: '552.22' }, software: true,
    grund: 'GPU-Absturz beim Start',
    logZeilen: ['START Julia startet', 'CRASH GPU weg 192.168.0.5 token=ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'],
  });
  assert.match(b.titel, /1\.2\.2/);
  assert.match(b.text, /RTX 4070/);
  assert.match(b.text, /Software-Rendering: ja/);
  assert.doesNotMatch(b.text, /192\.168\.0\.5/);
  assert.doesNotMatch(b.text, /ABCDEFGHIJKLMNOPQRSTUVWXYZ012345/);
});
