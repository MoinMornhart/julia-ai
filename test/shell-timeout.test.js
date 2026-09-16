'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shellTimeout } = require('../src/main/werkzeuge');

test('ohne Angabe gilt das Standard-Limit', () => {
  assert.equal(shellTimeout(undefined, 60, 600), 60);
  assert.equal(shellTimeout(null, 90, 600), 90);
  assert.equal(shellTimeout('', 45, 600), 45);
});

test('das Maximum begrenzt immer, auch wenn die KI mehr will', () => {
  assert.equal(shellTimeout(1800, 60, 600), 600);
  assert.equal(shellTimeout(5000, 60, 300), 300);
});

test('ein sinnvoller Wunsch unter dem Maximum wird genommen', () => {
  assert.equal(shellTimeout(120, 60, 600), 120);
});

test('zu kleine oder unsinnige Werte werden abgefangen', () => {
  assert.equal(shellTimeout(0, 60, 600), 60); // 0 → Standard (gedeckelt auf max)
  assert.equal(shellTimeout(-5, 60, 600), 60);
  assert.equal(shellTimeout(2, 60, 600), 5); // Minimum 5 s
});

test('Standard wird selbst vom Maximum gedeckelt', () => {
  assert.equal(shellTimeout(undefined, 600, 120), 120);
});
