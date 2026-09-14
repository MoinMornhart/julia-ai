'use strict';

// Code-Reiter: Projekte links, rechts Git-Stand, Änderungen mit Diff,
// letzte Commits und Knöpfe, die Julia im Chat einen Auftrag geben.

(() => {
  if (imOverlay) return;

  const FRAGEN = ['erklaeren', 'pruefen', 'tests', 'beheben', 'commit'];
  let projekte = [];
  let auswahl = null;
  let details = null;
  let editorDa = false;
  const lang = () => document.documentElement.lang || 'de';
  const zeit = (ms) => new Date(ms).toLocaleString(lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function listeMalen() {
    const box = $('cdProjekte');
    if (!projekte.length) {
      box.innerHTML = `<p class="vl-hinweis">${esc(tx('code.leer'))}</p>`;
      return;
    }
    box.innerHTML = projekte.map((p) => `<button class="vl-eintrag${p.pfad === auswahl ? ' aktiv' : ''}" data-pfad="${esc(p.pfad)}">
      <span class="vl-e-kopf"><b>${esc(p.name)}</b>${p.geaendert ? `<span class="cd-zahl">${p.geaendert}</span>` : ''}</span>
      <span class="vl-e-text">${esc(!p.da ? tx('code.fehlt') : p.git ? `⎇ ${p.zweig}` : tx('code.ohne_git'))}</span>
    </button>`).join('');
    box.querySelectorAll('.vl-eintrag').forEach((b) => { b.onclick = () => oeffnen(b.dataset.pfad); });
  }

  function dateienMalen(g) {
    if (!g) return `<p class="leer-hinweis">${esc(tx('code.kein_git'))}</p>`;
    if (!g.dateien.length) return `<p class="leer-hinweis">${esc(tx('code.keine_aenderungen'))}</p>`;
    return `<ul class="cd-dateien">${g.dateien.slice(0, 60).map((d) => `<li><button data-datei="${esc(d.datei)}"><span class="cd-art ${d.art}">${esc(tx(`code.art_${d.art}`))}</span><span class="cd-datei">${esc(d.datei)}</span></button></li>`).join('')}</ul>`;
  }

  function commitsMalen(g) {
    if (!g || !g.commits.length) return `<p class="leer-hinweis">${esc(tx('code.keine_commits'))}</p>`;
    return `<ul class="eintraege">${g.commits.map((c) => `<li><span class="zeit">${esc(c.hash)}</span><span><span class="titel">${esc(c.text)}</span><span class="klein">${esc(zeit(c.zeit))}</span></span></li>`).join('')}</ul>`;
  }

  async function oeffnen(pfad) {
    auswahl = pfad;
    listeMalen();
    $('cdDiffRahmen').hidden = true;
    const d = await julia.codeDetails(pfad);
    if (auswahl !== pfad) return;
    if (d.fehler) { leer(d.fehler); return; }
    details = d;
    $('cdLeer').hidden = true;
    $('cdInhalt').hidden = false;
    $('cdName').textContent = d.name;
    $('cdPfad').textContent = d.pfad;
    $('cdEditor').hidden = !editorDa;
    const chips = [];
    if (!d.da) chips.push(`<span class="cd-chip warn">${esc(tx('code.fehlt'))}</span>`);
    if (d.git) {
      chips.push(`<span class="cd-chip akzent">⎇ ${esc(d.git.zweig || '?')}</span>`);
      if (d.git.voraus) chips.push(`<span class="cd-chip">↑ ${esc(tx('code.voraus', { n: d.git.voraus }))}</span>`);
      if (d.git.zurueck) chips.push(`<span class="cd-chip">↓ ${esc(tx('code.zurueck', { n: d.git.zurueck }))}</span>`);
    }
    for (const s of (d.info && d.info.sprachen) || []) chips.push(`<span class="cd-chip">${esc(s)}</span>`);
    for (const s of (d.info && d.info.skripte) || []) chips.push(`<code class="cd-chip mono">${esc(s)}</code>`);
    $('cdChips').innerHTML = chips.join('');
    $('cdFragen').innerHTML = `<span class="sa-titel">${esc(tx('code.fragen'))}</span>${FRAGEN.map((f) => `<button class="vorschlag" data-f="${f}">${esc(tx(`code.a_${f}`))}</button>`).join('')}`;
    $('cdFragen').querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => window.juliaFragen(tx(`code.f_${b.dataset.f}`, { pfad: d.pfad })); });
    $('cdDateien').innerHTML = dateienMalen(d.git);
    $('cdDateien').querySelectorAll('[data-datei]').forEach((b) => { b.onclick = () => diffZeigen(b.dataset.datei); });
    $('cdCommits').innerHTML = commitsMalen(d.git);
  }

  async function diffZeigen(datei) {
    const r = await julia.codeDiff(auswahl, datei);
    $('cdDiffDatei').textContent = datei;
    const text = r.fehler || r.text || '';
    $('cdDiff').innerHTML = text.split('\n').map((z) => {
      const art = /^(\+\+\+|---|diff |index )/.test(z) ? 'kopf' : z.startsWith('@@') ? 'abschnitt' : z.startsWith('+') ? 'plus' : z.startsWith('-') ? 'minus' : '';
      return `<span class="${art}">${esc(z)}</span>`;
    }).join('\n');
    $('cdDiffRahmen').hidden = false;
    $('cdDiffRahmen').scrollIntoView({ block: 'nearest' });
  }

  function leer(text) {
    details = null;
    $('cdInhalt').hidden = true;
    $('cdLeer').hidden = false;
    $('cdLeer').textContent = text;
  }

  async function laden() {
    const r = await julia.codeUebersicht();
    projekte = r.projekte || [];
    editorDa = !!r.editor;
    listeMalen();
    if (auswahl && projekte.some((p) => p.pfad === auswahl)) oeffnen(auswahl);
    else if (projekte.length) oeffnen(projekte[0].pfad);
    else leer(tx('code.leer'));
  }

  $('cdHinzu').onclick = async () => {
    const p = await julia.codeHinzufuegen();
    if (p) { auswahl = p; laden(); }
  };
  $('cdEditor').onclick = () => { if (details) julia.codeOeffnen(details.pfad, 'editor'); };
  $('cdOrdner').onclick = () => { if (details) julia.codeOeffnen(details.pfad, 'ordner'); };
  $('cdEntfernen').onclick = async () => {
    if (!details) return;
    await julia.codeEntfernen(details.pfad);
    auswahl = null;
    laden();
  };
  $('cdDiffZu').onclick = () => { $('cdDiffRahmen').hidden = true; };

  function texte() {
    document.querySelectorAll('#ansichtCode [data-nav]').forEach((el) => { el.textContent = tx(el.dataset.nav); });
  }

  window.juliaAnsichtBeimOeffnen.code = () => { texte(); laden(); };
  julia.on('agent:fertig', () => { if (document.body.dataset.ansicht === 'code' && auswahl) oeffnen(auswahl); });
  julia.on('texte:geaendert', () => setTimeout(texte, 0));
  bereit.then(() => { if (window.juliaIcons) window.juliaIcons(document.getElementById('ansichtCode')); texte(); });
})();
