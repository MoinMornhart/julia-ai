'use strict';

// Kleine, testbare Suchhilfe für die Einstellungs-Suche. Findet Text unabhängig
// von Groß-/Kleinschreibung und von Umlauten/Akzenten (ä=a, ö=o, ü=u, é=e …),
// damit man z. B. „uberblick" ohne Umlaut tippen kann. Mehrere Wörter werden als
// UND-Suche behandelt (alle müssen vorkommen).
//
// Die Datei läuft in zwei Welten: im Renderer als globales `window.Suche`
// (per <script src>) und im Test über `require` (module.exports).

function normalisieren(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function passt(text, suche) {
  const q = normalisieren(suche).trim();
  if (!q) return true;
  const heu = normalisieren(text);
  return q.split(/\s+/).every((wort) => heu.includes(wort));
}

const API = { normalisieren, passt };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Suche = API;
