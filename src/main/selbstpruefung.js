'use strict';

// Wöchentliche Selbstprüfung: schaut tokenschonend (ohne KI) ins Start-Logbuch,
// ob es zuletzt Abstürze oder Grafikprobleme gab. Findet sie etwas, hält sie es
// fest – und meldet es nur, wenn der Nutzer die opt-in-Diagnose eingeschaltet
// hat (bereinigt, ohne IP/Tokens). So „sucht Julia jede Woche nach Problemen".

const STUFEN = /\[(CRASH|FATAL|GPU|RENDERER-FEHLER)\]/;
// Auch eine degradierte GPU (Treiber-Infos fehlen / GPU-Info nicht abrufbar) gilt
// als Grafikproblem – das war die Ursache des leeren Fensters (Issue #3/#54/#55),
// obwohl kein Absturz gemeldet wurde. Diese Zeilen tragen den Tag [GPU-INFO].
const GPU_DEGRADIERT = /KEINE Treiber-Infos|GPU-Info nicht abrufbar/i;

// Ist die Prüfung wieder dran? (Standard: alle 7 Tage.)
function faellig(letzteMs, jetztMs, tage = 7) {
  if (!letzteMs) return true;
  return (jetztMs - letzteMs) >= tage * 24 * 3600 * 1000;
}

// Sucht im Logtext nach Absturz-, GPU-, Renderer- und Grafik-Problemen. Gibt eine
// kurze Zusammenfassung zurück oder null, wenn alles ruhig war.
function probleme(logText, { maxZeilen = 800 } = {}) {
  const zeilen = String(logText || '').split(/\r?\n/).filter(Boolean).slice(-maxZeilen);
  const treffer = zeilen.filter((z) => STUFEN.test(z) || GPU_DEGRADIERT.test(z));
  if (!treffer.length) return null;
  const arten = {};
  for (const z of treffer) {
    const m = STUFEN.exec(z);
    const art = m ? m[1] : 'GPU-DEGRADIERT';
    arten[art] = (arten[art] || 0) + 1;
  }
  return { anzahl: treffer.length, arten, letzte: treffer.slice(-5) };
}

module.exports = { faellig, probleme };
