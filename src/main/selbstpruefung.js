'use strict';

// Wöchentliche Selbstprüfung: schaut tokenschonend (ohne KI) ins Start-Logbuch,
// ob es zuletzt Abstürze oder Grafikprobleme gab. Findet sie etwas, hält sie es
// fest – und meldet es nur, wenn der Nutzer die opt-in-Diagnose eingeschaltet
// hat (bereinigt, ohne IP/Tokens). So „sucht Julia jede Woche nach Problemen".

const STUFEN = /\[(CRASH|FATAL|GPU)\]/;

// Ist die Prüfung wieder dran? (Standard: alle 7 Tage.)
function faellig(letzteMs, jetztMs, tage = 7) {
  if (!letzteMs) return true;
  return (jetztMs - letzteMs) >= tage * 24 * 3600 * 1000;
}

// Sucht im Logtext nach Absturz-/GPU-Zeilen. Gibt eine kurze Zusammenfassung
// zurück oder null, wenn alles ruhig war.
function probleme(logText, { maxZeilen = 800 } = {}) {
  const zeilen = String(logText || '').split(/\r?\n/).filter(Boolean).slice(-maxZeilen);
  const treffer = zeilen.filter((z) => STUFEN.test(z));
  if (!treffer.length) return null;
  const arten = {};
  for (const z of treffer) {
    const m = STUFEN.exec(z);
    arten[m[1]] = (arten[m[1]] || 0) + 1;
  }
  return { anzahl: treffer.length, arten, letzte: treffer.slice(-5) };
}

module.exports = { faellig, probleme };
