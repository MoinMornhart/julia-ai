'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { minimatch } = require('minimatch');

// Was minecraft-data beim Laden sofort braucht, darf der Installer nicht
// weglassen – sonst stürzt der Minecraft-Beitritt im installierten Programm ab.
const PFLICHT = [
  'node_modules/minecraft-data/minecraft-data/data/bedrock/common/features.json',
  'node_modules/minecraft-data/minecraft-data/data/bedrock/common/protocolVersions.json',
  'node_modules/minecraft-data/minecraft-data/data/bedrock/common/versions.json',
  'node_modules/minecraft-data/minecraft-data/data/bedrock/common/legacy.json',
  'node_modules/minecraft-data/minecraft-data/data/pc/common/features.json',
];

test('Installer: die Minecraft-Pflichtdateien bleiben drin, die großen Bedrock-Daten nicht', () => {
  const muster = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).build.files
    .filter((m) => m.startsWith('!')).map((m) => m.slice(1));
  const ausgeschlossen = (datei) => muster.some((m) => minimatch(datei, m, { dot: true }));
  for (const d of PFLICHT) {
    assert.equal(ausgeschlossen(d), false, `${d} wird ausgeschlossen`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', d)), `${d} fehlt in node_modules`);
  }
  assert.equal(ausgeschlossen('node_modules/minecraft-data/minecraft-data/data/bedrock/1.21.0/blocks.json'), true);
});
