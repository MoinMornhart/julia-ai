'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { treiberQuelle } = require('../src/main/treiber');

test('erkennt NVIDIA/AMD/Intel an der Vendor-ID', () => {
  assert.equal(treiberQuelle(4318).vendor, 'NVIDIA'); // 0x10DE
  assert.equal(treiberQuelle(0x10de).vendor, 'NVIDIA');
  assert.equal(treiberQuelle(0x1002).vendor, 'AMD');
  assert.equal(treiberQuelle(0x8086).vendor, 'Intel');
  assert.match(treiberQuelle(4318).url, /^https:\/\/www\.nvidia\.com/);
});

test('unbekannte oder ungültige Vendor-ID → null', () => {
  assert.equal(treiberQuelle(0x1414), null); // Microsoft Basic-Adapter: kein Hersteller-Treiber
  assert.equal(treiberQuelle(0), null);
  assert.equal(treiberQuelle(null), null);
  assert.equal(treiberQuelle('abc'), null);
});
