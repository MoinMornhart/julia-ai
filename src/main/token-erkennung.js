'use strict';

// Erkennt, ob eine Zeichenkette wie ein echter Zugangs-Token/Schlüssel aussieht
// (Issue #51). Zweck: Wo die KI nur Namen sehen darf (Geheimnisse), darf im Namen
// kein echter Token landen; und beim Diagnose-Versand ist es eine zweite Sperre.
// Bewusst konservativ – lieber einen echten Token als solchen erkennen als
// harmlose Namen fälschlich sperren.
//
// Zwei Wege: bekannte Anbieter-Präfixe (sehr treffsicher) und eine generische
// Heuristik für „sehr lange, zufällig aussehende" Schlüssel (auch unbekannte
// Anbieter). Tokens haben nie Leerzeichen und sind lang.

// Bekannte Muster: [Anbietername, Regex]. Anker auf den Wortanfang; die Länge
// hält harmlose Kürzel draußen.
const MUSTER = [
  ['OpenAI', /^sk-(proj-|ant-|svcacct-)?[A-Za-z0-9_-]{20,}$/],
  ['GitHub', /^gh[posru]_[A-Za-z0-9]{30,}$/],
  ['GitHub', /^github_pat_[A-Za-z0-9_]{40,}$/],
  ['GitLab', /^glpat-[A-Za-z0-9_-]{20,}$/],
  ['Slack', /^xox[baprs]-[A-Za-z0-9-]{10,}$/],
  ['AWS', /^(AKIA|ASIA)[A-Z0-9]{16}$/],
  ['Google', /^AIza[A-Za-z0-9_-]{35}$/],
  ['Google-OAuth', /^ya29\.[A-Za-z0-9_-]{20,}$/],
  ['Stripe', /^(sk|rk|pk)_(live|test)_[A-Za-z0-9]{20,}$/],
  ['HuggingFace', /^hf_[A-Za-z0-9]{20,}$/],
  ['DigitalOcean', /^dop_v1_[a-f0-9]{40,}$/],
  ['SendGrid', /^SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/],
  ['npm', /^npm_[A-Za-z0-9]{30,}$/],
  ['VibeWorks', /^vw_[A-Za-z0-9._-]{8,}$/],
  ['JWT', /^eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}$/],
];

// Wie viele verschiedene Zeichen kommen vor? (grobes Entropie-Maß)
function verschiedene(s) {
  return new Set(s).size;
}

// Generische Heuristik: sieht aus wie ein zufälliger, langer Schlüssel.
function generisch(s) {
  if (s.length < 28) return false;                 // kurze Namen sind keine Tokens
  if (!/^[A-Za-z0-9_\-.=+/]+$/.test(s)) return false; // nur token-typische Zeichen
  if (!/[0-9]/.test(s) || !/[A-Za-z]/.test(s)) return false; // Ziffern UND Buchstaben
  const gemischt = /[a-z]/.test(s) && /[A-Z]/.test(s);
  const trenner = /[_\-.]/.test(s);
  // Zufälligkeit grob: viele verschiedene Zeichen, und entweder gemischte Groß/
  // Kleinschreibung oder Unterstrich/Bindestrich-Segmente (typisch für Tokens).
  return verschiedene(s) >= 14 && (gemischt || trenner);
}

// Liefert den erkannten Anbieter (oder 'generisch'), sonst null.
function wieToken(roh) {
  const s = String(roh == null ? '' : roh).trim();
  if (!s || /\s/.test(s)) return null; // echte Tokens haben keine Leerzeichen
  for (const [name, re] of MUSTER) if (re.test(s)) return name;
  if (generisch(s)) return 'generisch';
  return null;
}

// Kurzform: Ist das ein Token?
function istToken(roh) {
  return wieToken(roh) !== null;
}

module.exports = { wieToken, istToken, MUSTER };
