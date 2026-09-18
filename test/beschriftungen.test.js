'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spracheWaehlen, textZu, satzWaehlen, fuellen } = require('../src/shared/beschriftungen');

test('spracheWaehlen: en-Locale → en, sonst de', () => {
  assert.equal(spracheWaehlen('en-US'), 'en');
  assert.equal(spracheWaehlen('EN'), 'en');
  assert.equal(spracheWaehlen('de-DE'), 'de');
  assert.equal(spracheWaehlen(''), 'de');
  assert.equal(spracheWaehlen(undefined), 'de');
});

test('textZu: vorhandener Text, sonst der Schlüssel selbst', () => {
  assert.equal(textZu({ a: 'Hallo' }, 'a'), 'Hallo');
  assert.equal(textZu({ a: 'Hallo' }, 'b'), 'b'); // fehlt → Schlüssel als Notnagel
  assert.equal(textZu(null, 'x'), 'x');
});

test('satzWaehlen: gewünschte Sprache, Fallback auf de', () => {
  const texte = { de: { a: 'DE' }, en: { a: 'EN' } };
  assert.equal(satzWaehlen(texte, 'en').a, 'EN');
  assert.equal(satzWaehlen(texte, 'de').a, 'DE');
  assert.equal(satzWaehlen({ de: { a: 'DE' }, en: {} }, 'en').a, 'DE'); // en leer → de
  assert.equal(satzWaehlen(null, 'de'), null);
  assert.equal(satzWaehlen({ de: {}, en: {} }, 'de'), null); // gar nichts
});

// Fake-DOM: qsa liefert Elemente mit dataset/textContent.
function fakeDom(elemente) {
  return (sel) => {
    const attr = sel === '[data-nav]' ? 'nav' : 't';
    return elemente.filter((el) => el.dataset[attr] != null);
  };
}
const el = (attr, schluessel, text = '') => ({ dataset: { [attr]: schluessel }, textContent: text });

test('fuellen setzt leere [data-nav]/[data-t] aus dem Satz', () => {
  const nav = el('nav', 'nav.chat');
  const label = el('t', 'chat.senden');
  const qsa = fakeDom([nav, label]);
  const n = fuellen(qsa, { 'nav.chat': 'Chat', 'chat.senden': 'Senden' });
  assert.equal(n, 2);
  assert.equal(nav.textContent, 'Chat');
  assert.equal(label.textContent, 'Senden');
});

test('fuellen lässt bereits gefüllte Beschriftungen in Ruhe', () => {
  const schon = el('t', 'chat.senden', 'Schon da');
  const leer = el('t', 'chat.neu');
  const qsa = fakeDom([schon, leer]);
  const n = fuellen(qsa, { 'chat.senden': 'Senden', 'chat.neu': 'Neu' });
  assert.equal(n, 1); // nur das leere
  assert.equal(schon.textContent, 'Schon da');
  assert.equal(leer.textContent, 'Neu');
});

test('fuellen: fehlt ein Text, kommt der Schlüssel (nie leer)', () => {
  const leer = el('t', 'chat.unbekannt');
  const n = fuellen(fakeDom([leer]), { anderes: 'X' });
  assert.equal(n, 1);
  assert.equal(leer.textContent, 'chat.unbekannt');
});

test('fuellen ist robust gegen fehlenden Satz/kein qsa', () => {
  assert.equal(fuellen(null, { a: 'b' }), 0);
  assert.equal(fuellen(fakeDom([]), null), 0);
});
