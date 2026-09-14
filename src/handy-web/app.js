'use strict';

// Handy-Seite von Julia. Holt den Gesprächsstand vom PC (lange Anfragen),
// schickt Nachrichten, Freigaben und Stopp. Der Geräteschlüssel liegt nur in
// diesem Browser; der PC kennt davon nur den Hash.

(() => {
  const $ = (id) => document.getElementById(id);
  const SPEICHER = 'julia-handy-schluessel';
  const ICON = {
    senden: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12l16-8-6 16-3-7-7-1z" fill="currentColor"/></svg>',
    stopp: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  };

  let T = {};
  let schluessel = null;
  let seq = -1;
  let stand = null;

  const tx = (k) => T[k] || k;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const lesen = () => { try { return localStorage.getItem(SPEICHER); } catch { return null; } };
  const merken = (v) => {
    try {
      if (v) localStorage.setItem(SPEICHER, v);
      else localStorage.removeItem(SPEICHER);
    } catch { /* ohne Speicher muss neu gekoppelt werden */ }
  };

  async function api(pfad, { methode = 'GET', daten } = {}) {
    const kopf = {};
    if (schluessel) kopf.Authorization = `Bearer ${schluessel}`;
    if (daten !== undefined) kopf['Content-Type'] = 'application/json';
    try {
      const r = await fetch(pfad, { method: methode, headers: kopf, body: daten === undefined ? undefined : JSON.stringify(daten), cache: 'no-store' });
      let d = {};
      try { d = await r.json(); } catch { /* leer */ }
      return { code: r.status, d };
    } catch {
      return { code: 0, d: {} };
    }
  }

  // Nur fett und Code – keine Links, keine Bilder.
  function md(s) {
    return esc(s)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  }

  function luminanz(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const k = (x) => { const c = x / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * k((n >> 16) & 255) + 0.7152 * k((n >> 8) & 255) + 0.0722 * k(n & 255);
  }

  function texteUebernehmen(d) {
    if (d.texte) T = d.texte;
    document.documentElement.lang = d.sprachcode || 'de';
    if (d.name) { $('name').textContent = d.name; document.title = d.name; }
    if (/^#[0-9a-f]{6}$/i.test(d.akzent || '')) {
      const s = document.documentElement.style;
      s.setProperty('--akzent', d.akzent);
      s.setProperty('--akzent-auf', luminanz(d.akzent) > 0.28 ? '#160A02' : '#FFFFFF');
    }
    $('text').placeholder = tx('mobil.platzhalter');
    $('textLabel').textContent = tx('mobil.platzhalter');
    $('neu').setAttribute('aria-label', tx('mobil.neu'));
    $('neu').title = tx('mobil.neu');
  }

  function eintrag(e) {
    switch (e.typ) {
      case 'nutzer':
        return `<div class="n nutzer"><div class="blase">${esc(e.text).replace(/\n/g, '<br>')}</div>${e.handy ? '' : `<div class="meta">${esc(tx('mobil.am_pc'))}</div>`}</div>`;
      case 'julia':
        return `<div class="n julia"><div class="blase">${md(e.text)}</div></div>`;
      case 'werkzeug':
        return `<div class="w ${esc(e.stand)}"><i></i><b>${esc(e.name)}</b><span>${esc(e.eingabe || '')}</span></div>`;
      case 'freigabe': {
        const id = Number(e.id);
        const auftrag = e.art === 'auftrag';
        const schritte = auftrag && e.schritte.length ? `<ol>${e.schritte.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '';
        const unten = e.offen
          ? `<div class="k-knoepfe"><button class="ja" data-freigabe="${id}" data-ja="1">${esc(tx('mobil.ja'))}</button><button class="nein" data-freigabe="${id}" data-ja="0">${esc(tx('mobil.nein'))}</button></div>`
          : `<div class="k-ergebnis ${e.ja ? 'ja' : 'nein'}">${e.ja ? `✓ ${esc(tx('mobil.freigegeben'))}` : `✕ ${esc(tx('mobil.abgelehnt'))}`}</div>`;
        return `<div class="karte${e.offen ? '' : ' erledigt'}"><div class="k-titel">⚠ ${esc(tx(auftrag ? 'mobil.auftrag' : 'mobil.freigabe'))}</div><pre>${esc(e.beschreibung)}</pre>${e.grund ? `<div class="k-grund">${esc(e.grund)}</div>` : ''}${schritte}${unten}</div>`;
      }
      case 'system':
        return `<div class="s${e.fehler ? ' fehler' : ''}">${esc(e.text)}</div>`;
      default:
        return '';
    }
  }

  function knopf() {
    const b = $('senden');
    const stopp = !!(stand && stand.beschaeftigt);
    b.classList.toggle('stopp', stopp);
    b.innerHTML = stopp ? ICON.stopp : ICON.senden;
    b.setAttribute('aria-label', tx(stopp ? 'mobil.stopp' : 'mobil.senden'));
  }

  function malen() {
    const v = $('verlauf');
    const unten = v.scrollHeight - v.scrollTop - v.clientHeight < 80;
    v.innerHTML = stand.verlauf.length ? stand.verlauf.map(eintrag).join('') : `<p class="leer">${esc(tx('mobil.leer'))}</p>`;
    v.querySelectorAll('[data-freigabe]').forEach((b) => {
      b.onclick = () => freigeben(Number(b.dataset.freigabe), b.dataset.ja === '1', b);
    });
    if (unten) v.scrollTop = v.scrollHeight;
    $('status').textContent = tx(stand.beschaeftigt ? 'mobil.arbeitet' : 'mobil.wartet');
    document.body.classList.toggle('arbeitet', !!stand.beschaeftigt);
    knopf();
  }

  function hinweis(text, warnung = false) {
    const h = $('hinweis');
    h.hidden = !text;
    h.textContent = text || '';
    h.classList.toggle('fehler', warnung);
  }

  function koppelnZeigen(k) {
    $('koppelnText').textContent = tx(k);
    $('koppeln').hidden = false;
    $('verlauf').hidden = true;
    $('eingabe').hidden = true;
    $('neu').hidden = true;
    hinweis('');
  }

  function getrennt() {
    merken(null);
    schluessel = null;
    koppelnZeigen('mobil.getrennt');
  }

  async function schleife() {
    while (schluessel) {
      const r = await api(`/api/stand?ab=${seq}&warten=1`);
      if (r.code === 401) { getrennt(); return; }
      if (r.code !== 200) {
        hinweis(tx(r.code === 429 ? 'mobil.gesperrt' : 'mobil.offline'), true);
        await pause(3000);
        continue;
      }
      hinweis('');
      stand = r.d;
      seq = r.d.seq;
      texteUebernehmen(r.d);
      malen();
    }
  }

  async function freigeben(id, ja, b) {
    b.closest('.k-knoepfe').querySelectorAll('button').forEach((x) => { x.disabled = true; });
    const r = await api('/api/freigabe', { methode: 'POST', daten: { id, ja } });
    if (r.code === 401) getrennt();
  }

  function hoehe() {
    const t = $('text');
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, window.innerHeight * 0.4)}px`;
  }

  async function absenden(ev) {
    ev.preventDefault();
    if (stand && stand.beschaeftigt) {
      await api('/api/stopp', { methode: 'POST' });
      return;
    }
    const text = $('text').value.trim();
    if (!text) return;
    $('senden').disabled = true;
    const r = await api('/api/senden', { methode: 'POST', daten: { text } });
    $('senden').disabled = false;
    if (r.code === 200) {
      $('text').value = '';
      hoehe();
    } else if (r.code === 401) {
      getrennt();
    } else {
      hinweis(tx(r.d.fehler === 'beschaeftigt' ? 'mobil.beschaeftigt' : 'mobil.offline'), true);
    }
  }

  async function start() {
    const t = await api('/api/texte');
    if (t.code === 200) texteUebernehmen(t.d);

    const m = /^#k=([A-Za-z0-9_-]{43})$/.exec(location.hash);
    if (m) {
      // Den Einmal-Code sofort aus Adresse und Verlauf entfernen.
      history.replaceState(null, '', '/');
      schluessel = null;
      const r = await api('/api/koppeln', { methode: 'POST', daten: { code: m[1] } });
      if (r.code !== 200 || !r.d.schluessel) {
        koppelnZeigen(r.code === 429 ? 'mobil.gesperrt' : 'mobil.code_falsch');
        return;
      }
      schluessel = r.d.schluessel;
      merken(schluessel);
    } else {
      schluessel = lesen();
    }
    if (!schluessel) { koppelnZeigen('mobil.koppeln'); return; }

    $('koppeln').hidden = true;
    $('verlauf').hidden = false;
    $('eingabe').hidden = false;
    $('neu').hidden = false;
    knopf();
    schleife();
  }

  $('eingabe').addEventListener('submit', absenden);
  $('text').addEventListener('input', hoehe);
  $('neu').addEventListener('click', () => { api('/api/neu', { methode: 'POST' }); });
  start();
})();
