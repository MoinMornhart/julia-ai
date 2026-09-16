'use strict';

// Ein Versprechen mit Zeitlimit. WAS IST WENN der Hauptprozess bei einem IPC nie
// antwortet? Dann darf die Oberfläche nicht ewig ohne Text/Bedienung hängen
// bleiben (für den Nutzer „keine Elemente", ohne dass ein Fehler geloggt wird –
// ein Hänger wirft nichts). Läuft die Zeit ab, wird abgelehnt, und der Aufrufer
// macht mit Ersatz weiter statt zu blockieren.
function mitZeitlimit(versprechen, ms, was) {
  let t;
  const wecker = new Promise((_, ab) => {
    t = setTimeout(() => ab(new Error(`Zeitüberschreitung beim Laden (${was})`)), ms);
  });
  return Promise.race([versprechen, wecker]).finally(() => { clearTimeout(t); });
}

// Dual-use: als Modul (Tests) und als Skript im Fenster (window.mitZeitlimit).
if (typeof module !== 'undefined' && module.exports) module.exports = { mitZeitlimit };
if (typeof window !== 'undefined') window.mitZeitlimit = mitZeitlimit;
