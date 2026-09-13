'use strict';

// Julias Nummernschema: Zehnerschritte statt Semver. Mittlere und letzte Stelle
// laufen nur bis 9; springt eine darüber, wird sie 0 und die Stelle davor wächst.

const MUSTER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parse(text) {
  const m = MUSTER.exec(String(text || '').trim());
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), vorab: m[4] || null };
}

function gueltig(text) {
  const v = parse(text);
  return !!v && v.b <= 9 && v.c <= 9;
}

function format(v) {
  return `${v.a}.${v.b}.${v.c}` + (v.vorab ? `-${v.vorab}` : '');
}

// Negativ, wenn x älter ist als y. Eine Vorabversion ist älter als die fertige
// Version mit denselben Nummern.
function vergleichen(x, y) {
  const a = typeof x === 'string' ? parse(x) : x;
  const b = typeof y === 'string' ? parse(y) : y;
  if (!a || !b) throw new Error(`Ungültige Version: ${!a ? x : y}`);
  if (a.a !== b.a) return a.a - b.a;
  if (a.b !== b.b) return a.b - b.b;
  if (a.c !== b.c) return a.c - b.c;
  if (a.vorab === b.vorab) return 0;
  if (!a.vorab) return 1;
  if (!b.vorab) return -1;
  return a.vorab < b.vorab ? -1 : 1;
}

const ARTEN = ['korrektur', 'funktion', 'bruch'];

function naechste(text, art) {
  const v = parse(text);
  if (!v) throw new Error(`Ungültige Version: ${text}`);
  let { a, b, c } = v;
  if (art === 'korrektur') {
    c += 1;
  } else if (art === 'funktion') {
    b += 1;
    c = 0;
  } else if (art === 'bruch') {
    return format({ a: a + 1, b: 0, c: 0 });
  } else {
    throw new Error(`Unbekannte Art "${art}", erlaubt: ${ARTEN.join(', ')}`);
  }
  if (c > 9) { c = 0; b += 1; }
  if (b > 9) { b = 0; a += 1; }
  return format({ a, b, c });
}

module.exports = { parse, gueltig, format, vergleichen, naechste, ARTEN };
