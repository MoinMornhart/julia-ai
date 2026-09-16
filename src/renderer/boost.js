'use strict';

// Boost-Tab (Issue #26): rein lesende System-Übersicht – Systemstatus, die
// größten Ressourcen-Fresser und ein Doppelte-Dateien-Finder. Es wird nichts
// verändert, nichts eingefroren, nichts gelöscht. Läuft im Chat-Fenster; nutzt
// die globalen Helfer tx/$/esc/julia wie die anderen Tabs.

(function boostTab() {
  let sortierung = 'ram';

  function mb(x) { const n = Number(x) || 0; return n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`; }
  function gb(x) { return `${(Number(x) || 0).toFixed(1)} GB`; }

  function texte() {
    document.querySelectorAll('#ansichtBoost [data-nav]').forEach((el) => { el.textContent = tx(el.dataset.nav); });
    document.querySelectorAll('#ansichtBoost [data-t]').forEach((el) => { el.textContent = tx(el.dataset.t); });
  }

  function kachel(titel, wert, extra) {
    return `<div class="boost-kachel"><span class="bk-wert">${esc(wert)}</span><span class="bk-titel">${esc(titel)}</span>${extra ? `<span class="bk-extra">${esc(extra)}</span>` : ''}</div>`;
  }

  async function ladeStatus() {
    const box = $('boostStatus');
    box.innerHTML = `<p class="hinweis">${esc(tx('boost.laedt'))}</p>`;
    try {
      const s = await julia.boostStatus();
      const belegt = Math.max(0, (s.ram_gesamt_gb || 0) - (s.ram_frei_gb || 0));
      const kacheln = [
        kachel(tx('boost.ram'), `${gb(belegt)} / ${gb(s.ram_gesamt_gb)}`, `${gb(s.ram_frei_gb)} ${tx('boost.frei')}`),
        kachel(tx('boost.betriebszeit'), s.betriebszeit || '–'),
      ];
      if (s.akku) kacheln.push(kachel(tx('boost.akku'), `${s.akku.prozent}%`, s.akku.am_netz ? tx('boost.am_netz') : ''));
      for (const d of s.laufwerke || []) kacheln.push(kachel(`${tx('boost.platte')} ${esc(d.laufwerk)}`, `${gb(d.frei_gb)} ${tx('boost.frei')}`, `${d.frei_prozent}% ${tx('boost.von')} ${gb(d.groesse_gb)}`));
      box.innerHTML = kacheln.join('');
    } catch { box.innerHTML = `<p class="hinweis">${esc(tx('boost.fehler'))}</p>`; }
  }

  async function ladeProzesse() {
    const ul = $('boostProzesse');
    ul.innerHTML = `<li class="hinweis">${esc(tx('boost.laedt'))}</li>`;
    try {
      const r = await julia.boostProzesse(sortierung);
      const liste = (r.prozesse || []).map((p) => {
        const wert = sortierung === 'cpu' ? `${Math.round(p.cpu_sekunden || 0)}s CPU` : mb(p.ram_mb);
        return `<li><span class="bp-name">${esc(p.name)}</span><span class="bp-wert">${esc(wert)}</span></li>`;
      });
      const kopf = typeof r.cpu_last_prozent === 'number' ? `<li class="bp-kopf">${esc(tx('boost.cpu_last'))}: ${Math.round(r.cpu_last_prozent)}%</li>` : '';
      ul.innerHTML = kopf + (liste.join('') || `<li class="hinweis">–</li>`);
    } catch { ul.innerHTML = `<li class="hinweis">${esc(tx('boost.fehler'))}</li>`; }
  }

  async function doppelteSuchen() {
    const box = $('boostDoppelte');
    let pfad;
    try { pfad = await julia.ordnerWaehlen(); } catch { pfad = null; }
    if (!pfad) return;
    box.innerHTML = `<p class="hinweis">${esc(tx('boost.laedt'))}</p>`;
    try {
      const r = await julia.boostDoppelte(pfad);
      if (!r.gruppen || !r.gruppen.length) {
        box.innerHTML = `<p class="hinweis">${esc(tx('boost.doppelte_keine'))} (${r.geprueft})</p>`;
        return;
      }
      const kopf = `<p class="boost-dopp-kopf">${esc(tx('boost.doppelte_ergebnis', { anzahl: r.gruppen.length, platz: mb(Math.round((r.verschwendet || 0) / (1024 * 1024))) }))}</p>`;
      const gruppen = r.gruppen.slice(0, 40).map((g) => `<div class="boost-dopp-gruppe"><div class="bdg-kopf">${mb(Math.round(g.groesse / (1024 * 1024)))} ×${g.dateien.length}</div>${g.dateien.map((d) => `<div class="bdg-datei" title="${esc(d)}">${esc(d)}</div>`).join('')}</div>`);
      box.innerHTML = kopf + gruppen.join('') + `<p class="hinweis">${esc(tx('boost.doppelte_nichts_geloescht'))}</p>`;
    } catch { box.innerHTML = `<p class="hinweis">${esc(tx('boost.fehler'))}</p>`; }
  }

  function verbinden() {
    const akt = $('boostAktualisieren');
    if (akt) akt.onclick = () => { ladeStatus(); ladeProzesse(); };
    const sort = $('boostSort');
    if (sort) {
      sort.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          sortierung = b.dataset.wert === 'cpu' ? 'cpu' : 'ram';
          sort.querySelectorAll('button').forEach((x) => x.classList.toggle('aktiv', x === b));
          ladeProzesse();
        };
      });
    }
    const dopp = $('boostDoppelteBtn');
    if (dopp) dopp.onclick = doppelteSuchen;
  }

  verbinden();
  window.juliaAnsichtBeimOeffnen = window.juliaAnsichtBeimOeffnen || {};
  window.juliaAnsichtBeimOeffnen.boost = () => { texte(); ladeStatus(); ladeProzesse(); };
})();
