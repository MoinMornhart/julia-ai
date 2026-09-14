'use strict';

// Verlauf: gespeicherte Gespräche durchsuchen, ansehen, fortsetzen, löschen.
// Läuft nach chat.js und start.js und nutzt deren Helfer ($, tx, esc, md).

(() => {
  if (imOverlay) return;

  let auswahl = null;
  let suchTimer = null;
  let sicherTimer = null;
  const lang = () => document.documentElement.lang || 'de';

  function datumLang(ms) {
    return new Date(ms).toLocaleString(lang(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  }

  function zeitKurz(ms) {
    const d = new Date(ms);
    const heute = new Date(); heute.setHours(0, 0, 0, 0);
    if (ms >= heute.getTime()) return d.toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(lang(), { day: 'numeric', month: 'short' });
  }

  function gruppe(ms) {
    const heute = new Date(); heute.setHours(0, 0, 0, 0);
    const t = heute.getTime();
    if (ms >= t) return 'vl.heute';
    if (ms >= t - 86400000) return 'vl.gestern';
    if (ms >= t - 6 * 86400000) return 'vl.woche';
    return 'vl.aelter';
  }

  // Zeichnet ein Gespräch nur zum Lesen – dieselben Bausteine wie im Chat.
  function eintragHtml(e) {
    switch (e.typ) {
      case 'nutzer':
        return `<div class="nachricht nutzer"><div class="blase">${esc(e.text).replace(/\n/g, '<br>')}</div>${e.handy ? `<div class="meta">📱 ${esc(tx('chat.handy'))}</div>` : ''}</div>`;
      case 'julia':
        return `<div class="nachricht julia"><div class="blase">${md(e.text)}</div></div>`;
      case 'werkzeug':
        return `<div class="werkzeug ${e.stand === 'ok' ? 'ok' : e.stand === 'rot' ? 'rot' : 'fehler'}"><span class="ico"></span><span class="wname">${esc(e.name)}</span><span class="weingabe">${esc(e.eingabe || '')}</span></div>`;
      case 'freigabe':
        return `<div class="karte erledigt"><div class="k-titel">⚠ ${esc(tx(e.art === 'auftrag' ? 'chat.auftrag' : 'chat.freigabe'))}</div><div class="k-text"><pre class="k-pre">${esc(e.beschreibung)}</pre></div>${e.grund ? `<div class="k-grund">${esc(e.grund)}</div>` : ''}<div class="k-ergebnis ${e.ja ? 'ja-text' : 'nein-text'}">${e.ja ? `✓ ${esc(tx('chat.freigegeben'))}` : `✕ ${esc(tx('chat.abgelehnt'))}`}</div></div>`;
      case 'system':
        return `<div class="systemzeile${e.fehler ? ' fehler' : ''}">${esc(e.text)}</div>`;
      default:
        return '';
    }
  }

  function vorschauLeeren(text) {
    auswahl = null;
    $('vlKopf').hidden = true;
    $('vlInhalt').innerHTML = '';
    $('vlLeer').hidden = false;
    $('vlLeer').textContent = text;
    document.querySelectorAll('.vl-eintrag').forEach((b) => b.classList.remove('aktiv'));
  }

  async function oeffnen(id) {
    const g = await julia.verlaufLesen(id);
    if (!g) { liste(); return; }
    auswahl = id;
    document.querySelectorAll('.vl-eintrag').forEach((b) => b.classList.toggle('aktiv', b.dataset.id === id));
    $('vlKopf').hidden = false;
    $('vlLeer').hidden = true;
    $('vlTitel').textContent = g.titel || tx('vl.ohne_titel');
    $('vlDatum').textContent = datumLang(g.geaendert);
    $('vlInhalt').innerHTML = (g.anzeige || []).map(eintragHtml).join('');
    $('vlInhalt').scrollTop = 0;
    loeschenKnopf($('vlLoeschen'), 'vl.loeschen', 'vl.sicher');
  }

  async function liste() {
    const suche = $('vlSuche').value.trim();
    const [eintraege, cfg] = await Promise.all([julia.verlaufListe(suche), julia.config()]);
    $('vlAus').hidden = cfg.verlauf && cfg.verlauf.speichern !== false;
    $('vlAus').textContent = tx('vl.aus');
    const box = $('vlEintraege');
    if (!eintraege.length) {
      box.innerHTML = `<p class="vl-hinweis">${esc(suche ? tx('vl.keine_treffer', { suche }) : tx('vl.leer'))}</p>`;
      vorschauLeeren(tx('vl.waehlen'));
      return;
    }
    let letzte = null;
    const teile = [];
    for (const e of eintraege) {
      const g = gruppe(e.geaendert);
      if (g !== letzte) { teile.push(`<div class="vl-gruppe">${esc(tx(g))}</div>`); letzte = g; }
      teile.push(`<button class="vl-eintrag" data-id="${esc(e.id)}"><span class="vl-e-kopf"><b>${esc(e.titel || tx('vl.ohne_titel'))}</b><time>${esc(zeitKurz(e.geaendert))}</time></span><span class="vl-e-text">${esc(e.vorschau || '')}</span></button>`);
    }
    box.innerHTML = teile.join('');
    box.querySelectorAll('.vl-eintrag').forEach((b) => { b.onclick = () => oeffnen(b.dataset.id); });
    if (auswahl && eintraege.some((e) => e.id === auswahl)) oeffnen(auswahl);
    else if (window.innerWidth > 900) oeffnen(eintraege[0].id); // breit genug: gleich das neueste zeigen
    else vorschauLeeren(tx('vl.waehlen'));
  }

  // Löschen braucht einen zweiten Klick innerhalb von vier Sekunden.
  function loeschenKnopf(b, text, sicher) {
    b.textContent = tx(text);
    b.classList.remove('gefahr');
    b.dataset.sicher = '';
    b.dataset.text = text;
    b.dataset.frage = sicher;
  }

  async function loeschenKlick(b, aktion) {
    if (!b.dataset.sicher) {
      b.dataset.sicher = '1';
      b.textContent = tx(b.dataset.frage);
      b.classList.add('gefahr');
      clearTimeout(sicherTimer);
      sicherTimer = setTimeout(() => loeschenKnopf(b, b.dataset.text, b.dataset.frage), 4000);
      return;
    }
    clearTimeout(sicherTimer);
    loeschenKnopf(b, b.dataset.text, b.dataset.frage);
    await aktion();
    liste();
  }

  function texte() {
    $('vlSuche').placeholder = tx('vl.suche');
    loeschenKnopf($('vlAlleLoeschen'), 'vl.alle_loeschen', 'vl.alle_sicher');
    loeschenKnopf($('vlLoeschen'), 'vl.loeschen', 'vl.sicher');
    document.querySelectorAll('#ansichtVerlauf [data-nav]').forEach((el) => { el.textContent = tx(el.dataset.nav); });
  }

  $('vlSuche').addEventListener('input', () => {
    clearTimeout(suchTimer);
    suchTimer = setTimeout(liste, 200);
  });
  $('vlAlleLoeschen').onclick = () => loeschenKlick($('vlAlleLoeschen'), () => julia.verlaufAlleLoeschen());
  $('vlLoeschen').onclick = () => loeschenKlick($('vlLoeschen'), async () => { if (auswahl) await julia.verlaufLoeschen(auswahl); auswahl = null; });
  $('vlFortsetzen').onclick = async () => {
    if (!auswahl) return;
    const r = await julia.verlaufFortsetzen(auswahl);
    if (r && r.fehler) { $('vlLeer').hidden = false; $('vlLeer').textContent = r.fehler; return; }
    window.juliaAnsicht('chat');
  };

  window.juliaAnsichtBeimOeffnen.verlauf = () => { texte(); liste(); setTimeout(() => $('vlSuche').focus(), 0); };
  julia.on('verlauf:geaendert', () => { if (document.body.dataset.ansicht === 'verlauf') liste(); });
  julia.on('texte:geaendert', () => setTimeout(texte, 0));
  bereit.then(() => { if (window.juliaIcons) window.juliaIcons(document.getElementById('ansichtVerlauf')); texte(); });
})();
