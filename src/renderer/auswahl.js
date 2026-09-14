'use strict';

// Menü für markierten Text: Aktion wählen oder eigene Frage stellen.
// Den Text selbst hält der Hauptprozess; hier wird er nur angezeigt.

(() => {
  const $ = (id) => document.getElementById(id);
  const AKTIONEN = ['uebersetzen', 'zusammenfassen', 'umformulieren', 'erklaeren', 'korrigieren', 'antworten'];
  let T = {};
  const tx = (k) => T[k] ?? k;

  function schliessen() { julia.schliessen(); }

  function aktion(a, frage = '') {
    julia.auswahlAktion(a, frage);
  }

  function malen() {
    $('awTitel').textContent = tx('aw.titel');
    $('awFrage').placeholder = tx('aw.frage');
    $('awAktionen').innerHTML = AKTIONEN.map((a, i) => `<button class="aw-aktion" type="button" data-a="${a}">${tx(`aw.a_${a}`)}<kbd>${i + 1}</kbd></button>`).join('');
    $('awAktionen').querySelectorAll('.aw-aktion').forEach((b) => { b.onclick = () => aktion(b.dataset.a); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { schliessen(); return; }
    if (document.activeElement === $('awFrage')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= AKTIONEN.length) aktion(AKTIONEN[n - 1]);
  });
  $('awZu').onclick = schliessen;
  $('awForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = $('awFrage').value.trim();
    if (f) aktion('frage', f);
  });

  julia.on('auswahl:text', (text) => {
    $('awText').textContent = String(text || '').slice(0, 600);
  });

  julia.texte().then((d) => {
    T = d.texte;
    document.documentElement.lang = d.sprachcode;
    malen();
    $('awFrage').focus();
  });
})();
