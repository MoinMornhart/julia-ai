'use strict';

// Video-Tab (Nutzerwunsch): ein eigener Schneide-Bereich – Datei wählen,
// Von–Bis setzen, schneiden, Thumbnail ziehen, Ergebnisse als Liste. Läuft
// komplett lokal über ffmpeg (kein Upload). Keine KI nötig; direkte Nutzeraktion.

(() => {
  if (imOverlay) return;

  let eingabe = ''; // gewählte Videodatei
  let arbeitet = false;
  const lang = () => document.documentElement.lang || 'de';

  const status = (schluessel) => {
    const el = $('vidStatus');
    if (!el) return;
    el.hidden = !schluessel;
    if (schluessel) el.textContent = tx(schluessel);
  };
  const fehler = (text) => {
    const el = $('vidFehler');
    if (!el) return;
    el.hidden = !text;
    if (text) el.textContent = text;
  };

  function ergebnisZeigen(pfad, art) {
    const liste = $('vidErgebnisse');
    if (!liste) return;
    const zeile = document.createElement('div');
    zeile.className = 'vid-ergebnis';
    const name = String(pfad).split(/[\\/]/).pop();
    zeile.innerHTML = `<span class="vid-ok">✓</span><span class="vid-name"></span>`
      + `<button class="knopf klein vid-oeffnen" data-nav="video.im_ordner"></button>`;
    zeile.querySelector('.vid-name').textContent = `${art === 'thumb' ? '🖼 ' : '✂ '}${name}`;
    zeile.querySelector('.vid-oeffnen').textContent = tx('video.im_ordner');
    zeile.querySelector('.vid-oeffnen').onclick = () => julia.videoZeigen(pfad);
    liste.prepend(zeile);
  }

  function knoepfeSperren(an) {
    arbeitet = an;
    for (const id of ['vidWaehlen', 'vidSchneiden', 'vidThumbnail']) {
      const b = $(id);
      if (b) b.disabled = an;
    }
  }

  async function waehlen() {
    fehler('');
    const r = await julia.videoWaehlen();
    if (r && r.pfad) {
      eingabe = r.pfad;
      $('vidDatei').value = r.pfad;
    }
  }

  async function schneiden() {
    if (arbeitet) return;
    fehler('');
    if (!eingabe) { fehler(tx('video.erst_datei')); return; }
    knoepfeSperren(true);
    status('video.arbeitet');
    try {
      const r = await julia.videoSchneiden({ eingabe, von: $('vidVon').value.trim(), bis: $('vidBis').value.trim(), genau: $('vidGenau').checked });
      if (r && r.ok) ergebnisZeigen(r.ausgabe, 'schnitt');
      else fehler((r && r.fehler) || tx('video.fehlgeschlagen'));
    } catch (e) {
      fehler(e.message);
    } finally {
      status('');
      knoepfeSperren(false);
    }
  }

  async function thumbnail() {
    if (arbeitet) return;
    fehler('');
    if (!eingabe) { fehler(tx('video.erst_datei')); return; }
    knoepfeSperren(true);
    status('video.arbeitet');
    try {
      const r = await julia.videoThumbnail({ eingabe, zeit: $('vidTzeit').value.trim() || '0' });
      if (r && r.ok) ergebnisZeigen(r.ausgabe, 'thumb');
      else fehler((r && r.fehler) || tx('video.fehlgeschlagen'));
    } catch (e) {
      fehler(e.message);
    } finally {
      status('');
      knoepfeSperren(false);
    }
  }

  async function ffmpegPruefen() {
    try {
      const r = await julia.videoBereit();
      const w = $('vidWarnung');
      if (w) w.hidden = !!(r && r.bereit);
    } catch { /* egal */ }
  }

  function texte() {
    document.querySelectorAll('#ansichtVideo [data-nav]').forEach((el) => { el.textContent = tx(el.dataset.nav); });
  }

  if ($('vidWaehlen')) $('vidWaehlen').onclick = waehlen;
  if ($('vidSchneiden')) $('vidSchneiden').onclick = schneiden;
  if ($('vidThumbnail')) $('vidThumbnail').onclick = thumbnail;

  window.juliaAnsichtBeimOeffnen.video = () => { texte(); ffmpegPruefen(); };
  julia.on('texte:geaendert', () => setTimeout(texte, 0));
  bereit.then(() => { if (window.juliaIcons) window.juliaIcons(document.getElementById('ansichtVideo')); texte(); });
})();
