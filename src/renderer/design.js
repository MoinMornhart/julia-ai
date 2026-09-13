'use strict';

// Setzt Theme (dunkel/hell/wie Windows), Akzentfarbe und Leuchteffekte für die
// Seite. Wird vor dem Seitenskript geladen und reagiert live auf Änderungen.

(function () {
  const dunkelAbfrage = window.matchMedia('(prefers-color-scheme: dark)');
  let design = { modus: 'dunkel', akzent: '#FF7A1A', glow: true };

  function luminanz(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const kanal = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * kanal((n >> 16) & 255) + 0.7152 * kanal((n >> 8) & 255) + 0.0722 * kanal(n & 255);
  }

  function anwenden() {
    const wurzel = document.documentElement;
    const modus = design.modus === 'system' ? (dunkelAbfrage.matches ? 'dunkel' : 'hell') : design.modus;
    wurzel.dataset.theme = modus === 'hell' ? 'hell' : 'dunkel';
    wurzel.dataset.glow = design.glow === false ? 'aus' : 'an';
    if (/^#[0-9a-f]{6}$/i.test(design.akzent)) {
      wurzel.style.setProperty('--akzent', design.akzent);
      // Lesbare Schrift auf der Akzentfarbe: dunkel auf hellen, weiß auf dunklen Tönen.
      wurzel.style.setProperty('--akzent-text', luminanz(design.akzent) > 0.28 ? '#140a02' : '#ffffff');
    }
  }

  window.juliaDesign = {
    setzen(neu) {
      if (neu) design = { ...design, ...neu };
      anwenden();
    },
  };

  dunkelAbfrage.addEventListener('change', anwenden);
  anwenden();
  if (window.julia) {
    window.julia.config().then((c) => window.juliaDesign.setzen(c.design));
    window.julia.on('config:geaendert', (c) => window.juliaDesign.setzen(c.design));
  }
}());
