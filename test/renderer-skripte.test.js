'use strict';

// Regressions-Wächter (Issue #70): Die Renderer-Skripte einer HTML-Seite teilen
// sich EINEN globalen Scope (klassische <script>-Tags). Deklariert eine Datei ein
// `const`/`let`/`class` mit demselben Namen wie eine andere Datei derselben Seite
// (oder eine Funktion, die mit einem `const` kollidiert), wirft der Browser einen
// SyntaxError ("Identifier '…' has already been declared") – und die ganze Datei
// lädt nicht, was die Oberfläche lahmlegt (genau der #70-Absturz mit
// `mitZeitlimit`). Dieser Test fängt so etwas ab, bevor es ausgeliefert wird:
//   1. jede eingebundene Skriptdatei muss für sich kompilieren (Syntax ok),
//   2. keine zwei Skripte einer Seite dürfen denselben Top-Level-Namen lexikalisch
//      deklarieren (const/let/class, bzw. Funktion + const/let/class).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RENDERER = path.join(__dirname, '..', 'src', 'renderer');

function htmlSeiten() {
  return fs.readdirSync(RENDERER).filter((f) => f.endsWith('.html'));
}

// Lokale <script src="…js">-Einbindungen in Reihenfolge.
function skripteVon(html) {
  const inhalt = fs.readFileSync(path.join(RENDERER, html), 'utf8');
  const treffer = [...inhalt.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  return treffer.filter((s) => !/^https?:/i.test(s) && s.endsWith('.js'));
}

// Top-Level-Deklarationen (Zeilenanfang, wie im Projektstil) mit ihrer Art.
function deklarationen(quelltext) {
  const aus = [];
  for (const zeile of quelltext.split('\n')) {
    const m = /^(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/.exec(zeile);
    if (m) aus.push({ art: m[1], name: m[2] });
  }
  return aus;
}

test('jede eingebundene Renderer-Skriptdatei kompiliert für sich', () => {
  for (const html of htmlSeiten()) {
    for (const src of skripteVon(html)) {
      const datei = path.join(RENDERER, src);
      if (!fs.existsSync(datei)) continue; // fehlende Dateien fängt ein anderer Check ab
      const code = fs.readFileSync(datei, 'utf8');
      assert.doesNotThrow(() => new vm.Script(code, { filename: src }), `Syntaxfehler in ${src} (eingebunden in ${html})`);
    }
  }
});

test('keine kollidierenden Top-Level-Deklarationen je HTML-Seite (#70)', () => {
  const lexikalisch = new Set(['const', 'let', 'class']);
  for (const html of htmlSeiten()) {
    // name -> Liste von { skript, art }
    const gesehen = new Map();
    for (const src of skripteVon(html)) {
      const datei = path.join(RENDERER, src);
      if (!fs.existsSync(datei)) continue;
      for (const d of deklarationen(fs.readFileSync(datei, 'utf8'))) {
        if (!gesehen.has(d.name)) gesehen.set(d.name, []);
        gesehen.get(d.name).push({ skript: src, art: d.art });
      }
    }
    for (const [name, vork] of gesehen) {
      const skripte = new Set(vork.map((v) => v.skript));
      if (skripte.size < 2) continue; // nur in einer Datei → kein seitenweiter Konflikt
      const kollision = vork.some((v) => lexikalisch.has(v.art));
      assert.ok(
        !kollision,
        `Seite ${html}: „${name}" wird in mehreren Skripten top-level deklariert `
        + `(${vork.map((v) => `${v.skript}:${v.art}`).join(', ')}) – das wirft im Browser `
        + `"already been declared" und legt die Skripte lahm (siehe #70).`,
      );
    }
  }
});
