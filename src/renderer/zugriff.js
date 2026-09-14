'use strict';

// Hinweis oben in der Mitte jedes Bildschirms, solange Julia hinsieht oder
// Maus und Tastatur steuert. Durchklickbar – nur die Pille selbst reagiert,
// ihr Stopp-Knopf bricht den laufenden Auftrag ab.

(() => {
  const ICON = {
    sieht: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    steuert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 3 7 17 2.5-7.5L21 10Z"/></svg>',
  };
  let T = {};
  let art = null;
  let ueber = false;

  function malen() {
    if (!art) return;
    document.getElementById('ico').innerHTML = ICON[art] || ICON.sieht;
    document.getElementById('text').textContent = T[`zugriff.${art}`] || '';
    document.getElementById('stopp').textContent = T['zugriff.stopp'] || 'Stopp';
  }

  julia.texte().then((d) => { T = d.texte; document.documentElement.lang = d.sprachcode; malen(); });
  julia.on('texte:geaendert', (d) => { T = d.texte; malen(); });
  julia.on('zugriff', (d) => {
    art = d && d.art;
    document.body.classList.toggle('an', !!art);
    malen();
  });

  // Nur über der Pille ist die Maus aktiv, sonst gehen Klicks durch.
  const pille = document.getElementById('pille');
  window.addEventListener('mousemove', (e) => {
    const r = pille.getBoundingClientRect();
    const drin = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (drin !== ueber) { ueber = drin; julia.zugriffMaus(drin); }
  });
  document.addEventListener('mouseleave', () => { if (ueber) { ueber = false; julia.zugriffMaus(false); } });
  document.getElementById('stopp').onclick = () => julia.zugriffStopp();
})();
