'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const win = require('../src/main/win/win');

// Issue #19/#26: Ein CPU-Fresser darf entlastet werden, System-/Julia-Prozesse
// niemals. darfBremsen ist die reine Sperrlisten-Prüfung.

test('gewöhnliche Programme dürfen entlastet werden', () => {
  assert.equal(win.darfBremsen('chrome'), true);
  assert.equal(win.darfBremsen('Code'), true);
  assert.equal(win.darfBremsen('javaw'), true);
  assert.equal(win.darfBremsen('SomeGame.exe'), true);
});

test('System-Kernprozesse sind gesperrt', () => {
  for (const n of ['System', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'explorer', 'dwm']) {
    assert.equal(win.darfBremsen(n), false, `${n} muss geschützt sein`);
  }
});

test('Julia selbst und ihre Prozesse sind gesperrt', () => {
  assert.equal(win.darfBremsen('Julia AI'), false);
  assert.equal(win.darfBremsen('julia'), false);
  assert.equal(win.darfBremsen('electron'), false);
});

test('Groß/Kleinschreibung und .exe-Endung spielen keine Rolle', () => {
  assert.equal(win.darfBremsen('EXPLORER.EXE'), false);
  assert.equal(win.darfBremsen('  SvcHost.exe '), false);
});

test('leerer Name wird nicht entlastet', () => {
  assert.equal(win.darfBremsen(''), false);
  assert.equal(win.darfBremsen(null), false);
});
