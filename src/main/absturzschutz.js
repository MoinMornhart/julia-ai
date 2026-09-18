'use strict';

// Globaler Absturzschutz für den HAUPTPROZESS (XXL-Robustheit, Issue #3/#7/#54).
//
// „WAS IST WENN?": Ein unbehandelter Fehler im Hauptprozess beendet sonst die
// ganze App WORTLOS – genau das „stürzt einfach ab" auf schwächeren/zickigen PCs.
// Hier spannen wir einen Fangschirm auf: jeder unbehandelte Fehler
// (`uncaughtException` / `unhandledRejection`) landet im Start-Logbuch, und dann
// wird bewusst entschieden:
//   - Passiert er, WÄHREND Julia noch hochfährt → tödlich: die App kann nicht
//     sauber laufen, also eine klare Meldung zeigen und sauber beenden (statt
//     stumm zu verschwinden).
//   - Passiert er NACH dem Start → weiterlaufen: ein einzelner Hintergrundfehler
//     (fremde API, ein Werkzeug, ein Timer) darf den ganzen Assistenten nicht
//     mitreißen. Wir melden ihn einmal und machen weiter.
// Ein Schleifenschutz sorgt dafür, dass derselbe Fehler nicht endlos meldet.

const MAX_GLEICHE = 5; // so oft dieselbe Fehler-Signatur melden, dann still mitlaufen

// Kurze, stabile Kennung eines Fehlers (erste zwei Stack-Zeilen) für den
// Schleifenschutz – gleicher Fehler wieder und wieder soll nicht spammen.
function signatur(fehler) {
  const s = (fehler && (fehler.stack || fehler.message)) || String(fehler);
  return String(s).split('\n').slice(0, 2).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

// Menschlich lesbarer Text eines beliebigen „Fehlers" (Error, String, Objekt).
function textVon(fehler) {
  if (fehler == null) return 'Unbekannter Fehler';
  if (fehler instanceof Error) return fehler.stack || fehler.message || String(fehler);
  if (typeof fehler === 'string') return fehler;
  try { return JSON.stringify(fehler); } catch { return String(fehler); }
}

// Reine Entscheidung, was mit einem unbehandelten Fehler zu tun ist.
//   imStart  – Julia fährt noch hoch (dann ist der Fehler tödlich)
//   gesehen  – wie oft diese Signatur schon kam (1 = erstes Mal)
// Rückgabe: 'toedlich' | 'weiterlaufen' | 'ignorieren'
function entscheiden({ imStart, gesehen, maxGleiche = MAX_GLEICHE }) {
  if (imStart) return 'toedlich';
  if (gesehen > maxGleiche) return 'ignorieren'; // Schleifenschutz: nur noch loggen
  return 'weiterlaufen';
}

// Hängt die Prozess-Fangschirme ein. Alle Rückrufe sind optional und werden
// selbst in try/catch aufgerufen – der Absturzschutz darf nie selbst abstürzen.
//   logbuch   – { schreiben(stufe, text, daten?) }
//   imStart   – () => boolean: fährt Julia noch hoch?
//   fatal     – (text) => void: klare Meldung + sauberes Beenden (nur beim Start)
//   melden    – (fehler) => void: einmalige Notiz „lief weiter" (nach dem Start)
// Gibt eine Funktion zum Aushängen zurück (für Tests).
function installieren({ prozess = process, logbuch, imStart = () => false, fatal, melden, maxGleiche = MAX_GLEICHE } = {}) {
  const zaehler = new Map();
  const log = (stufe, text, daten) => { try { if (logbuch) logbuch.schreiben(stufe, text, daten); } catch { /* egal */ } };

  const behandeln = (fehler, quelle) => {
    const sig = signatur(fehler);
    const n = (zaehler.get(sig) || 0) + 1;
    zaehler.set(sig, n);
    const start = (() => { try { return !!imStart(); } catch { return false; } })();
    const aktion = entscheiden({ imStart: start, gesehen: n, maxGleiche });
    log(aktion === 'toedlich' ? 'FATAL' : 'CRASH', `Unbehandelter Fehler abgefangen (${quelle})`, {
      aktion, mal: n, text: textVon(fehler).slice(0, 800),
    });
    if (aktion === 'toedlich') {
      try { if (fatal) fatal(textVon(fehler)); } catch { /* die Meldung darf nicht selbst crashen */ }
    } else if (aktion === 'weiterlaufen') {
      try { if (melden) melden(fehler); } catch { /* egal */ }
    }
  };

  const aufUncaught = (e) => behandeln(e, 'uncaughtException');
  const aufRejection = (grund) => behandeln(grund, 'unhandledRejection');
  prozess.on('uncaughtException', aufUncaught);
  prozess.on('unhandledRejection', aufRejection);
  return () => {
    try { prozess.removeListener('uncaughtException', aufUncaught); } catch { /* egal */ }
    try { prozess.removeListener('unhandledRejection', aufRejection); } catch { /* egal */ }
  };
}

module.exports = { signatur, textVon, entscheiden, installieren, MAX_GLEICHE };
