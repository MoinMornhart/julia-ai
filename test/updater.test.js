'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { changelogZwischen, hoechsterTag } = require('../src/main/updater');
const { changelogEinfuegen } = require('../scripts/release');

const CHANGELOG = `# Changelog

## 0.2.0 – 2026-10-01
- Julia liest jetzt Termine vor

## 0.1.1 – 2026-09-20
- Blase reagiert stärker auf die Stimme

## 0.1.0 – 2026-09-15
- Neue Einstellungsseite

## 0.0.1 – 2026-09-13
- Erste Version
`;

test('Changelog: nur die Versionen zwischen installiert und neu', () => {
  const z = changelogZwischen(CHANGELOG, '0.1.0', 'v0.2.0');
  assert.deepEqual(z, [
    '0.2.0 – 2026-10-01',
    '- Julia liest jetzt Termine vor',
    '0.1.1 – 2026-09-20',
    '- Blase reagiert stärker auf die Stimme',
  ]);
});

test('Höchster Tag: stabil ignoriert Vorabversionen, test nimmt sie mit', () => {
  const tags = ['v0.0.1', 'v0.1.0', 'v0.0.9', 'v0.2.0-test.1', 'irgendwas', 'v0.1.1'];
  assert.equal(hoechsterTag(tags, 'stabil'), 'v0.1.1');
  assert.equal(hoechsterTag(tags, 'test'), 'v0.2.0-test.1');
  assert.equal(hoechsterTag([], 'stabil'), null);
});

test('Release: neuer Eintrag landet über dem letzten', () => {
  const neu = changelogEinfuegen(CHANGELOG, '## 0.2.1 – 2026-10-02\n- Kleinigkeit\n');
  const zeilen = neu.split('\n');
  assert.equal(zeilen[2], '## 0.2.1 – 2026-10-02');
  assert.equal(zeilen[3], '- Kleinigkeit');
  assert.equal(zeilen[5], '## 0.2.0 – 2026-10-01');
});
