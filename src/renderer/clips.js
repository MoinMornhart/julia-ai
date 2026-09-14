'use strict';

// Clips: alle Gaming-Clips mit Vorschau beim Überfahren, Player,
// Umbenennen, Im Ordner zeigen und Löschen (in den Papierkorb).

(() => {
  if (imOverlay) return;

  let liste = [];
  let status = null;
  let offen = null;
  let sicherTimer = null;
  const lang = () => document.documentElement.lang || 'de';

  const mb = (b) => `${(b / 1024 / 1024).toLocaleString(lang(), { maximumFractionDigits: b > 100 * 1024 * 1024 ? 0 : 1 })} MB`;
  const datum = (ms) => new Date(ms).toLocaleString(lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const dauer = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

  function hotkeyText() {
    return (window.juliaHotkeyClip || 'Control+Alt+C').replace(/Control/g, lang() === 'de' ? 'Strg' : 'Ctrl');
  }

  function kopf() {
    if (!status) return;
    $('clHinweis').textContent = tx('clip.hinweis', { hotkey: hotkeyText(), methode: tx(`clip.m_${status.methode}`) });
    $('clAufnehmenText').textContent = tx('clip.jetzt');
    $('clWarnung').hidden = status.hintergrund !== false;
    $('clWarnText').textContent = tx('clip.aus');
  }

  function karte(c, i) {
    const bild = c.url
      ? `<video src="${esc(c.url)}#t=1" preload="metadata" muted playsinline></video>`
      : `<span class="cl-platz" data-ico="film"></span>`;
    const unter = [c.spiel, datum(c.zeit), c.groesse ? mb(c.groesse) : ''].filter(Boolean).map(esc).join(' · ');
    return `<button class="cl-karte" data-i="${i}"><span class="cl-bild">${bild}<span class="cl-play"></span><span class="cl-dauer"></span></span><span class="cl-text"><b>${esc(c.name)}</b><small>${unter}</small></span></button>`;
  }

  async function laden() {
    const r = await julia.clipsListe();
    status = r.status;
    liste = r.clips || [];
    kopf();
    const raster = $('clRaster');
    raster.innerHTML = liste.length ? liste.map(karte).join('') : `<p class="rt-leer">${esc(tx('clip.leer', { ordner: status.ordner }))}</p>`;
    if (window.juliaIcons) window.juliaIcons(raster);
    raster.querySelectorAll('.cl-karte').forEach((k) => {
      const c = liste[Number(k.dataset.i)];
      const v = k.querySelector('video');
      if (v) {
        v.addEventListener('loadedmetadata', () => { k.querySelector('.cl-dauer').textContent = dauer(v.duration); });
        k.addEventListener('mouseenter', () => { v.currentTime = 0; v.play().catch(() => {}); });
        k.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 1; });
      }
      k.onclick = () => { if (c.url) oeffnen(c); };
    });
  }

  function oeffnen(c) {
    offen = c;
    $('clVideo').src = c.url;
    $('clName').value = c.name;
    $('clFehler').hidden = true;
    loeschenKnopf();
    $('clPlayer').hidden = false;
    $('clVideo').play().catch(() => {});
  }

  function schliessen() {
    $('clVideo').pause();
    $('clVideo').removeAttribute('src');
    $('clVideo').load();
    $('clPlayer').hidden = true;
    offen = null;
  }

  function fehler(text) {
    $('clFehler').textContent = text;
    $('clFehler').hidden = !text;
  }

  function loeschenKnopf() {
    const b = $('clLoeschen');
    b.textContent = tx('clip.loeschen');
    b.classList.remove('gefahr');
    b.dataset.sicher = '';
  }

  $('clAufnehmen').onclick = async () => {
    const b = $('clAufnehmen');
    b.disabled = true;
    $('clAufnehmenText').textContent = tx('clip.speichert');
    await julia.clipAufnehmen();
    b.disabled = false;
    kopf();
    laden();
  };
  $('clOrdner').onclick = () => julia.clipsOrdner();
  $('clWindows').onclick = () => julia.clipsWindows();
  $('clSchliessen').onclick = schliessen;
  $('clPlayer').addEventListener('click', (e) => { if (e.target === $('clPlayer')) schliessen(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('clPlayer').hidden) { e.stopPropagation(); schliessen(); } }, true);
  $('clZeigen').onclick = async () => { if (offen) { const r = await julia.clipZeigen(offen.pfad); if (r.fehler) fehler(r.fehler); } };
  $('clUmbenennen').onclick = async () => {
    if (!offen) return;
    const r = await julia.clipUmbenennen(offen.pfad, $('clName').value);
    if (r.fehler) { fehler(r.fehler); return; }
    offen = { ...offen, pfad: r.pfad, url: r.url, name: $('clName').value.trim() };
    fehler('');
  };
  $('clLoeschen').onclick = async () => {
    const b = $('clLoeschen');
    if (!offen) return;
    if (!b.dataset.sicher) {
      b.dataset.sicher = '1';
      b.textContent = tx('clip.sicher');
      b.classList.add('gefahr');
      clearTimeout(sicherTimer);
      sicherTimer = setTimeout(loeschenKnopf, 4000);
      return;
    }
    clearTimeout(sicherTimer);
    const pfad = offen.pfad;
    schliessen();
    const r = await julia.clipLoeschen(pfad);
    if (r.fehler) systemzeile(r.fehler, 'fehler');
  };

  function texte() {
    document.querySelectorAll('#ansichtClips [data-nav]').forEach((el) => { el.textContent = tx(el.dataset.nav); });
    kopf();
  }

  julia.config().then((c) => { window.juliaHotkeyClip = c.hotkey && c.hotkey.clip; });
  julia.on('config:geaendert', (c) => { window.juliaHotkeyClip = c.hotkey && c.hotkey.clip; if (document.body.dataset.ansicht === 'clips') laden(); });
  window.juliaAnsichtBeimOeffnen.clips = () => { texte(); laden(); };
  julia.on('clips:geaendert', () => { if (document.body.dataset.ansicht === 'clips') laden(); });
  julia.on('texte:geaendert', () => setTimeout(texte, 0));
  bereit.then(() => { if (window.juliaIcons) window.juliaIcons(document.getElementById('ansichtClips')); texte(); });
})();
