'use strict';

// Routinen: Karten zum Starten, Bearbeiten und Löschen, dazu ein kleiner
// Editor. Die Freigabe holt Julia beim Start einmal für den ganzen Ablauf.

(() => {
  if (imOverlay) return;

  const SYMBOLE = ['🌙', '🎯', '🎮', '☕', '🧹', '🚀', '📬', '🎧', '💼', '🏠'];
  let liste = [];
  let bearbeitet = null; // null = Editor zu, '' = neu, sonst id
  let symbol = SYMBOLE[0];
  let sicherTimer = null;

  function symboleMalen() {
    $('rtSymbole').innerHTML = SYMBOLE.map((s) => `<button type="button" class="rt-sym${s === symbol ? ' aktiv' : ''}" data-s="${s}" aria-pressed="${s === symbol}">${s}</button>`).join('');
    $('rtSymbole').querySelectorAll('.rt-sym').forEach((b) => { b.onclick = () => { symbol = b.dataset.s; symboleMalen(); }; });
  }

  function editorOeffnen(r) {
    bearbeitet = r ? r.id : '';
    symbol = r ? r.symbol : SYMBOLE[0];
    $('rtName').value = r ? r.name : '';
    $('rtSchritte').value = r ? r.schritte.join('\n') : '';
    $('rtSchritte').placeholder = tx('rt.platzhalter_schritte');
    $('rtFehler').hidden = true;
    $('rtEditor').hidden = false;
    symboleMalen();
    setTimeout(() => $('rtName').focus(), 0);
  }

  function editorZu() {
    bearbeitet = null;
    $('rtEditor').hidden = true;
  }

  function karteHtml(r) {
    const schritte = r.schritte.slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join('');
    const mehr = r.schritte.length > 3 ? `<li class="rt-mehr">+ ${r.schritte.length - 3}</li>` : '';
    return `<article class="rt-karte" data-id="${esc(r.id)}">
      <div class="rt-karte-kopf"><span class="rt-symbol">${esc(r.symbol)}</span><div><h3>${esc(r.name)}</h3><p>${esc(tx('rt.anzahl', { n: r.schritte.length }))}</p></div></div>
      <ol class="rt-schritte">${schritte}${mehr}</ol>
      <div class="rt-aktionen">
        <button class="knopf primaer klein" data-a="start"><span data-ico="play"></span>${esc(tx('rt.starten'))}</button>
        <button class="knopf klein" data-a="edit">${esc(tx('rt.bearbeiten'))}</button>
        <button class="knopf klein" data-a="del">${esc(tx('rt.loeschen'))}</button>
      </div>
    </article>`;
  }

  async function laden() {
    liste = await julia.routinenListe();
    const raster = $('rtRaster');
    raster.innerHTML = liste.length ? liste.map(karteHtml).join('') : `<p class="rt-leer">${esc(tx('rt.leer'))}</p>`;
    if (window.juliaIcons) window.juliaIcons(raster);
    raster.querySelectorAll('.rt-karte').forEach((k) => {
      const r = liste.find((x) => x.id === k.dataset.id);
      k.querySelector('[data-a="start"]').onclick = async () => {
        const e = await julia.routineStarten(r.id);
        if (e && e.fehler) systemzeile(e.fehler, 'fehler');
      };
      k.querySelector('[data-a="edit"]').onclick = () => editorOeffnen(r);
      const del = k.querySelector('[data-a="del"]');
      del.onclick = async () => {
        if (!del.dataset.sicher) {
          del.dataset.sicher = '1';
          del.textContent = tx('rt.sicher');
          del.classList.add('gefahr');
          clearTimeout(sicherTimer);
          sicherTimer = setTimeout(laden, 4000);
          return;
        }
        clearTimeout(sicherTimer);
        await julia.routineLoeschen(r.id);
        if (bearbeitet === r.id) editorZu();
      };
    });
  }

  $('rtNeu').onclick = () => editorOeffnen(null);
  $('rtAbbrechen').onclick = editorZu;
  $('rtEditor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await julia.routineSpeichern({ id: bearbeitet || undefined, name: $('rtName').value, symbol, schritte: $('rtSchritte').value });
    if (r.fehler) {
      $('rtFehler').textContent = r.fehler;
      $('rtFehler').hidden = false;
      return;
    }
    editorZu();
  });

  function texte() {
    document.querySelectorAll('#ansichtRoutinen [data-nav]').forEach((el) => { el.textContent = tx(el.dataset.nav); });
    $('rtSchritte').placeholder = tx('rt.platzhalter_schritte');
  }

  window.juliaAnsichtBeimOeffnen.routinen = () => { texte(); laden(); };
  julia.on('routinen:geaendert', () => { if (document.body.dataset.ansicht === 'routinen') laden(); });
  julia.on('texte:geaendert', () => setTimeout(() => { texte(); if (document.body.dataset.ansicht === 'routinen') laden(); }, 0));
  bereit.then(() => { if (window.juliaIcons) window.juliaIcons(document.getElementById('ansichtRoutinen')); texte(); });
})();
