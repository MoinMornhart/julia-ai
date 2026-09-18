'use strict';

// Reine Hilfe zum Füllen der Oberflächen-Beschriftungen (`[data-nav]`/`[data-t]`)
// aus einem Text-Satz. Kein Electron, kein Framework – arbeitet über eine
// einfache „querySelectorAll"-Funktion, damit es testbar ist und sowohl im
// Renderer als auch im PRELOAD als Not-Füllung genutzt werden kann.
//
// Hintergrund (Issue #3/#54): Auf manchen PCs blieb das Fenster leer, obwohl
// Body und CSS da waren – nur die per Skript gefüllten Beschriftungen fehlten.
// Kommt der synchrone Text-Satz im Renderer (über die contextBridge) leer an,
// füllt das Preload die Labels mit genau dieser Hilfe direkt aus den
// mitgelieferten Texten – unabhängig von der (fragilen) Renderer-Kette.

// Sprache aus einem Locale/Sprachcode ableiten: beginnt es mit „en" → en, sonst de.
function spracheWaehlen(locale) {
  return String(locale || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';
}

// Text zu einem Schlüssel holen; fehlt er, kommt der Schlüssel selbst zurück
// (besser ein sichtbarer Schlüssel als eine leere Oberfläche).
function textZu(satz, schluessel) {
  const t = satz && satz[schluessel];
  return (typeof t === 'string' && t) ? t : schluessel;
}

// Den passenden Text-Satz aus { de:{…}, en:{…} } wählen (fällt auf de zurück,
// wenn die gewünschte Sprache leer ist).
function satzWaehlen(texte, locale) {
  if (!texte) return null;
  const sc = spracheWaehlen(locale);
  const gewuenscht = texte[sc];
  if (gewuenscht && Object.keys(gewuenscht).length) return gewuenscht;
  return (texte.de && Object.keys(texte.de).length) ? texte.de : null;
}

// Füllt alle `[data-nav]`/`[data-t]`-Elemente, die noch LEER sind, aus dem Satz.
// qsa(sel) liefert eine iterierbare Liste von Elementen mit .dataset/.textContent.
// Gibt zurück, wie viele Elemente gefüllt wurden. Bereits gefüllte bleiben
// unangetastet (der Renderer darf mit dem echten Satz überschreiben).
function fuellen(qsa, satz, { nurLeere = true } = {}) {
  if (typeof qsa !== 'function' || !satz) return 0;
  let gefuellt = 0;
  const eine = (sel, attr) => {
    let liste;
    try { liste = qsa(sel); } catch { return; }
    for (const el of liste || []) {
      if (!el || !el.dataset) continue;
      const schluessel = el.dataset[attr];
      if (!schluessel) continue;
      if (nurLeere && el.textContent && el.textContent.trim()) continue;
      el.textContent = textZu(satz, schluessel);
      gefuellt += 1;
    }
  };
  eine('[data-nav]', 'nav');
  eine('[data-t]', 't');
  return gefuellt;
}

module.exports = { spracheWaehlen, textZu, satzWaehlen, fuellen };
