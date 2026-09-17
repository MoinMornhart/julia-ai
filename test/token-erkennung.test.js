'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { wieToken, istToken } = require('../src/main/token-erkennung');

// Alle Beispiel-Tokens sind reine Test-Fixtures (keine echten Schlüssel) und
// werden aus Teilen zusammengesetzt, damit im Quelltext kein Token-Muster
// wörtlich steht, das ein Secret-Scanner fälschlich meldet (Issue #42).
test('erkennt bekannte Anbieter-Tokens', () => {
  assert.equal(wieToken('sk-proj-' + 'abc123DEF456ghi789JKL012mno'), 'OpenAI');
  assert.equal(wieToken('ghp_' + 'a'.repeat(36)), 'GitHub');
  assert.equal(wieToken('github_pat_' + 'A1'.repeat(30)), 'GitHub');
  assert.equal(wieToken('glpat-' + 'abcdef1234567890XYZabcd'), 'GitLab');
  assert.equal(wieToken('xoxb-' + '123456789012-abcdefGHIJKL'), 'Slack');
  assert.equal(wieToken('AKIA' + 'ABCDEFGH12345678'), 'AWS');
  assert.equal(wieToken('AIza' + 'a'.repeat(35)), 'Google');
  assert.equal(wieToken('hf_' + 'b'.repeat(30)), 'HuggingFace');
  assert.equal(wieToken('vw_' + 'abcdefgh12345'), 'VibeWorks');
  assert.equal(wieToken('eyJhbGciOi.' + 'eyJzdWIiOi.' + 'SflKxwRJSM'), 'JWT');
});

test('erkennt generische, lange, zufällige Schlüssel (unbekannte Anbieter)', () => {
  assert.equal(wieToken('Xy7Kd93Lm' + 'Q2p8Rt4Vn6' + 'Bz1Cw5Hf0Jg'), 'generisch');
  assert.equal(wieToken('super_' + 'secret_' + 'key_9f8e7d6c5b4a3210XYZ'), 'generisch');
  assert.ok(istToken('a1B2c3D4e5' + 'F6g7H8i9J0' + 'k1L2m3N4o5P6'));
});

test('flaggt harmlose Namen und Bezeichnungen NICHT', () => {
  assert.equal(wieToken('GitHub'), null);
  assert.equal(wieToken('GitHub Token'), null);           // Leerzeichen → kein Token
  assert.equal(wieToken('openai_key'), null);              // kurz, keine Ziffern
  assert.equal(wieToken('mein_langer_geheimnis_name'), null); // lang, aber keine Ziffern
  assert.equal(wieToken('Server-Passwort'), null);
  assert.equal(wieToken(''), null);
  assert.equal(wieToken(null), null);
  assert.equal(wieToken('Kalender 2026'), null);
});

test('Leerzeichen im String schließen einen Token aus', () => {
  assert.equal(wieToken('sk-proj-' + 'abc123 und noch text'), null);
});
